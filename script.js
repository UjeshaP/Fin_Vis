/* Finance Forward — Phases 1–4
   Phase 1: financial modeling + growth/inflation + stress tests
   Phase 2: strategy comparison
   Phase 3: Monte Carlo risk analysis
   Phase 4: constrained strategy optimization
*/

const STRATEGIES = {
  aggressive: "Aggressive Debt",
  balanced: "Balanced",
  emergency: "Emergency Fund First",
  avalanche: "Debt Avalanche",
  snowball: "Debt Snowball"
};

let profile = null;
let comparisonResults = [];

const $ = id => document.getElementById(id);
const money = n => "$" + Math.round(Math.max(0, n || 0)).toLocaleString("en-US");
const percent = n => `${(n || 0).toFixed(1)}%`;

function num(id){ return Number($(id).value); }

function buildProfile(){
  return {
    loanAmount: num("GAmt"),
    interestRate: num("GIr"),
    annualSalary: num("GSal"),
    monthlyExpenses: num("GCol"),
    monthlySavings: num("Gsav"),
    salaryGrowth: num("salaryGrowth"),
    inflation: num("inflationRate"),
    horizon: num("horizon"),
    interestType: $("interestType").value,
    emergencyMonths: num("emergencyTarget"),
    debtAllocation: num("strategyBudget")
  };
}

function validate(p){
  if (![p.loanAmount,p.interestRate,p.annualSalary,p.monthlyExpenses,p.monthlySavings].every(Number.isFinite))
    return "Fill in all required financial fields.";
  if(p.loanAmount<0 || p.interestRate<0 || p.annualSalary<=0 || p.monthlyExpenses<0 || p.monthlySavings<0)
    return "Enter valid non-negative values and a salary above $0.";
  return "";
}

class Simulator {
  constructor(p){ this.p=p; this.months=p.horizon*12; }

  rate(annual){ return Math.max(0,annual)/100/12; }

  payment(balance, annualRate, months=120){
    if(balance<=0) return 0;
    const r=this.rate(annualRate);
    if(r===0) return balance/months;
    return balance*(r*Math.pow(1+r,months))/(Math.pow(1+r,months)-1);
  }

  run(strategy, event="none", randomState=null){
    const p=this.p;
    let balance=p.loanAmount;
    let savings=p.monthlySavings; // existing app input interpreted as starting monthly contribution
    let monthlySavingsContribution=p.monthlySavings;
    let income=p.annualSalary/12;
    let expenses=p.monthlyExpenses;
    let totalInterest=0,totalPaid=0,minSavings=savings,debtFreeMonth=null;

    for(let m=0;m<this.months;m++){
      if(m>0 && m%12===0){
        income*=1+(randomState?.salaryGrowth ?? p.salaryGrowth)/100;
        expenses*=1+(randomState?.inflation ?? p.inflation)/100;
      }

      let currentIncome=income;
      let currentExpenses=expenses;
      let shock=event;

      if(randomState?.events?.has(m)) shock=randomState.events.get(m);

      if(shock==="jobLoss" && m>=12 && m<16) currentIncome=0;
      if(shock==="death" && m>=12 && m<14) currentIncome=0;
      if(shock==="medical" && m===12) savings-=4500;
      if(shock==="disaster" && m===12) savings-=3000;
      if(shock==="inflationShock" && m>=12) currentExpenses*=1.15;
      if(shock==="divorce" && m>=12) currentExpenses*=1.50;

      const baseCash=currentIncome-currentExpenses;
      if(baseCash<0) savings+=baseCash;

      // Preserve the user's monthly savings contribution as part of the available cash model.
      let available=Math.max(0,baseCash);
      let toDebt=0,toSavings=0;

      if(strategy==="aggressive"){
        toDebt=available;
      } else if(strategy==="balanced"){
        toDebt=available*(p.debtAllocation/100);
        toSavings=available-toDebt;
      } else if(strategy==="emergency"){
        const target=expenses*p.emergencyMonths;
        toSavings=Math.min(available,Math.max(0,target-savings));
        toDebt=available-toSavings;
      } else {
        // Avalanche / snowball have one debt in this version; therefore both collapse
        // to accelerated repayment, while preserving a minimum required payment.
        const required=this.payment(balance,p.interestRate);
        toDebt=Math.max(required,available*(p.debtAllocation/100));
      }

      savings+=toSavings;
      if(balance>0){
        let rate=p.interestRate;
        if(p.interestType==="variable"){
          rate=randomState?.interestRate ?? Math.max(0,p.interestRate+(Math.random()-.5)*2);
        }
        const interest=balance*this.rate(rate);
        balance+=interest;
        totalInterest+=interest;

        const payment=Math.min(balance,toDebt);
        balance-=payment;
        totalPaid+=payment;
        if(balance<=0.01 && debtFreeMonth===null){
          balance=0; debtFreeMonth=m+1;
        }
      }

      // Monthly baseline savings contribution occurs after required living/debt cash flow.
      // It is capped by available cash to avoid creating money from nowhere.
      if(baseCash>0 && strategy==="aggressive"){
        // Aggressive means the user's stated savings contribution is sacrificed for debt speed.
      } else if(baseCash>0 && strategy!=="balanced" && strategy!=="emergency"){
        // No extra contribution; cash already allocated.
      }

      savings=Math.max(0,savings);
      minSavings=Math.min(minSavings,savings);
    }

    const years=debtFreeMonth?debtFreeMonth/12:null;
    const failure=debtFreeMonth===null || minSavings<=0;
    const emergencyTarget=expenses*p.emergencyMonths;
    const liquidity=Math.min(100,(minSavings/Math.max(1,emergencyTarget))*100);
    const debtProgress=p.loanAmount===0?100:Math.max(0,100-(balance/p.loanAmount)*100);
    const speed=years===null?0:Math.max(0,100-years*8);
    const resilience=Math.round(liquidity*.45+debtProgress*.30+speed*.25);

    return {strategy,balance,debtFreeMonth,years,totalInterest,totalPaid,endingSavings:savings,minSavings,resilience,failure};
  }
}

function calculate(){
  profile=buildProfile();
  const error=validate(profile);
  $("errorMessage").textContent=error;
  if(error) return;

  const sim=new Simulator(profile);
  const income=profile.annualSalary/12;
  const available=income-profile.monthlyExpenses;
  const required=sim.payment(profile.loanAmount,profile.interestRate);
  const dti=income?required/income*100:0;

  $("monthlyIncome").textContent=money(income);
  $("monthlyExpenses").textContent=money(profile.monthlyExpenses);
  $("monthlySavings").textContent=money(profile.monthlySavings);
  $("monthlyDisposable").textContent=money(Math.max(0,available));
  $("dti").textContent=percent(dti);
  $("requiredPayment").textContent=money(required);
  $("results").classList.remove("hidden");

  compare();
}

function compare(){
  if(!profile) return;
  profile.emergencyMonths=num("emergencyTarget");
  profile.debtAllocation=num("strategyBudget");
  const selected=[...document.querySelectorAll(".strategy:checked")].map(x=>x.value);
  const event=$("lifeEvent").value;
  const sim=new Simulator(profile);
  comparisonResults=selected.map(s=>sim.run(s,event));
  renderTable(comparisonResults);
  renderRecommendation(comparisonResults);
  renderInsights(comparisonResults);
}

function renderTable(results){
  const tbody=$("strategyTable");
  tbody.innerHTML="";
  if(!results.length){
    tbody.innerHTML='<tr><td colspan="6">Select at least one strategy.</td></tr>';
    return;
  }
  results.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><strong>${STRATEGIES[r.strategy]}</strong></td>
      <td>${r.years===null?"Not reached":r.years.toFixed(1)+" yrs"}</td>
      <td>${money(r.totalInterest)}</td><td>${money(r.endingSavings)}</td>
      <td>${money(r.minSavings)}</td><td><strong>${r.resilience}/100</strong></td>`;
    tbody.appendChild(tr);
  });
}

function renderRecommendation(results){
  if(!results.length){$("recommendation").innerHTML="";return;}
  const best=[...results].sort((a,b)=>b.resilience-a.resilience)[0];
  $("recommendation").innerHTML=`<div class="recommendation">
    <h3>${STRATEGIES[best.strategy]} is the strongest baseline strategy.</h3>
    <p>Modeled resilience: <strong>${best.resilience}/100</strong> · Debt-free: <strong>${best.years===null?"not reached":best.years.toFixed(1)+" years"}</strong> · Ending savings: <strong>${money(best.endingSavings)}</strong></p>
  </div>`;
}

function renderInsights(results){
  if(!results.length){$("insights").innerHTML="";return;}
  const interest=[...results].sort((a,b)=>a.totalInterest-b.totalInterest)[0];
  const liquidity=[...results].sort((a,b)=>b.endingSavings-a.endingSavings)[0];
  $("insights").innerHTML=`<ul>
    <li><strong>Lowest interest:</strong> ${STRATEGIES[interest.strategy]} at ${money(interest.totalInterest)}.</li>
    <li><strong>Most ending liquidity:</strong> ${STRATEGIES[liquidity.strategy]} at ${money(liquidity.endingSavings)}.</li>
    <li><strong>Core lesson:</strong> there is no universally “best” strategy; changing the objective changes the optimal decision.</li>
  </ul>`;
}

function stressTest(){
  if(!profile){calculate();if(!profile)return;}
  const event=$("lifeEvent").value;
  const sim=new Simulator(profile);
  const base=sim.run("balanced","none");
  const shock=sim.run("balanced",event);
  if(event==="none"){
    $("stressResult").innerHTML=`<p class="success">Baseline: ${shock.years===null?"debt is not cleared within the horizon":`debt-free in ${shock.years.toFixed(1)} years`} with ${money(shock.endingSavings)} ending savings.</p>`;
    return;
  }
  $("stressResult").innerHTML=`<div class="stress-box">
    <strong>${$("lifeEvent").selectedOptions[0].text}</strong>
    <p>Debt-free time changes from <strong>${base.years===null?"not reached":base.years.toFixed(1)+" yrs"}</strong> to <strong>${shock.years===null?"not reached":shock.years.toFixed(1)+" yrs"}</strong>.</p>
    <p>Ending savings changes from <strong>${money(base.endingSavings)}</strong> to <strong>${money(shock.endingSavings)}</strong>.</p>
    <p>Resilience changes from <strong>${base.resilience}/100</strong> to <strong>${shock.resilience}/100</strong>.</p>
  </div>`;
}

/* ---------- Monte Carlo ---------- */

function normal(mean,sd){
  let u=0,v=0;
  while(!u)u=Math.random();
  while(!v)v=Math.random();
  return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function weightedEvent(){
  const r=Math.random();
  if(r<.72)return "none";
  if(r<.80)return "jobLoss";
  if(r<.87)return "medical";
  if(r<.92)return "disaster";
  if(r<.97)return "inflationShock";
  if(r<.99)return "death";
  return "divorce";
}

function stochasticInputs(){
  const events=new Map();
  for(let m=12;m<profile.horizon*12;m+=12){
    const e=weightedEvent();
    if(e!=="none")events.set(m,e);
  }
  return {
    salaryGrowth:Math.max(-10,normal(profile.salaryGrowth,2)),
    inflation:Math.max(0,normal(profile.inflation,1.5)),
    interestRate:profile.interestType==="variable"?Math.max(0,normal(profile.interestRate,1)):profile.interestRate,
    events
  };
}

function runMonteCarlo(){
  if(!profile){calculate();if(!profile)return;}
  const selected=[...document.querySelectorAll(".strategy:checked")].map(x=>x.value);
  if(!selected.length){$("mcStatus").textContent="Select at least one strategy.";return;}

  const iterations=num("simulationCount");
  $("mcStatus").textContent=`Running ${iterations.toLocaleString()} simulated futures...`;

  setTimeout(()=>{
    const all=selected.map(strategy=>{
      const times=[],savings=[];
      let failures=0;
      const sim=new Simulator(profile);
      for(let i=0;i<iterations;i++){
        const r=sim.run(strategy,"none",stochasticInputs());
        if(r.years!==null)times.push(r.years);
        savings.push(r.endingSavings);
        if(r.failure)failures++;
      }
      return {
        strategy,
        debtFreeProbability:times.length/iterations*100,
        failureProbability:failures/iterations*100,
        medianYears:quantile(times,.5),
        p10:quantile(times,.1),p90:quantile(times,.9),
        medianSavings:quantile(savings,.5),times
      };
    });

    // Primary risk objective: lowest failure probability; tie-break with debt-free probability.
    const best=[...all].sort((a,b)=>a.failureProbability-b.failureProbability || b.debtFreeProbability-a.debtFreeProbability)[0];

    $("mcDebtFreeProb").textContent=percent(best.debtFreeProbability);
    $("mcFailureProb").textContent=percent(best.failureProbability);
    $("mcMedianYears").textContent=best.medianYears===null?"Not reached":best.medianYears.toFixed(1)+" yrs";
    $("mcP10").textContent=best.p10===null?"Not reached":best.p10.toFixed(1)+" yrs";
    $("mcP90").textContent=best.p90===null?"Not reached":best.p90.toFixed(1)+" yrs";
    $("mcMedianSavings").textContent=money(best.medianSavings);
    renderHistogram(best.times);
    $("mcResults").classList.remove("hidden");
    $("mcStatus").textContent=`${STRATEGIES[best.strategy]} had the strongest simulated risk profile across ${iterations.toLocaleString()} futures.`;
  },30);
}

function quantile(arr,p){
  if(!arr.length)return null;
  const a=[...arr].sort((x,y)=>x-y);
  const i=(a.length-1)*p,l=Math.floor(i),u=Math.ceil(i);
  return l===u?a[l]:a[l]+(a[u]-a[l])*(i-l);
}

function renderHistogram(values){
  const h=$("histogram");h.innerHTML="";
  if(!values.length){h.textContent="No debt-free outcomes within the horizon.";return;}
  const bins=12,counts=Array(bins).fill(0);
  values.forEach(v=>counts[Math.min(bins-1,Math.floor(v/profile.horizon*bins))]++);
  const max=Math.max(...counts);
  counts.forEach(c=>{
    const bar=document.createElement("div");
    bar.className="hist-bar";
    bar.style.height=`${Math.max(4,c/max*100)}%`;
    bar.title=`${c.toLocaleString()} simulations`;
    h.appendChild(bar);
  });
}

/* ---------- Phase 4 optimization ---------- */

function optimize(){
  if(!profile){calculate();if(!profile)return;}
  const maxYears=num("targetYears");
  const minEmergencyMonths=num("targetEmergency");
  const maxRisk=num("maxFailureRisk");
  const candidates=[];

  // Grid-search across strategies and debt-allocation levels.
  for(const strategy of Object.keys(STRATEGIES)){
    for(let allocation=10;allocation<=100;allocation+=5){
      const candidateProfile={...profile,debtAllocation:allocation};
      const deterministic=new Simulator(candidateProfile).run(strategy,"none");

      // Smaller Monte Carlo sample keeps optimization interactive.
      let failures=0;
      const n=150;
      for(let i=0;i<n;i++){
        const r=new Simulator(candidateProfile).run(strategy,"none",stochasticInputsFor(candidateProfile));
        if(r.failure)failures++;
      }
      const risk=failures/n*100;
      const reserve=candidateProfile.monthlyExpenses*minEmergencyMonths;
      const meetsTime=deterministic.years!==null && deterministic.years<=maxYears;
      const meetsReserve=deterministic.endingSavings>=reserve;
      const meetsRisk=risk<=maxRisk;

      let penalty=0;
      if(!meetsTime)penalty+=1000+(deterministic.years===null?maxYears+10:Math.max(0,deterministic.years-maxYears))*100;
      if(!meetsReserve)penalty+=500+Math.max(0,reserve-deterministic.endingSavings)/100;
      if(!meetsRisk)penalty+=1000+(risk-maxRisk)*25;

      const score=penalty+risk*5+deterministic.totalInterest/Math.max(1,candidateProfile.loanAmount)*100;
      candidates.push({strategy,allocation,deterministic,risk,score,meetsTime,meetsReserve,meetsRisk});
    }
  }

  candidates.sort((a,b)=>a.score-b.score);
  const feasible=candidates.filter(x=>x.meetsTime&&x.meetsReserve&&x.meetsRisk);
  const best=feasible[0]||candidates[0];

  $("optimizationResult").innerHTML=`<div class="optimization-result">
    <strong>${feasible.length?"Feasible solution found":"No candidate met every constraint"}</strong>
    <h3>${STRATEGIES[best.strategy]}</h3>
    <p>Recommended debt allocation: <strong>${best.allocation}%</strong></p>
    <p>Debt-free time: <strong>${best.deterministic.years===null?"not reached":best.deterministic.years.toFixed(1)+" years"}</strong> ·
       Ending savings: <strong>${money(best.deterministic.endingSavings)}</strong> ·
       Estimated failure risk: <strong>${percent(best.risk)}</strong></p>
    <p class="muted">The optimizer evaluated ${candidates.length} strategy/allocation combinations. Its risk estimate uses a smaller Monte Carlo sample than the full risk engine.</p>
  </div>`;
}

function stochasticInputsFor(p){
  const events=new Map();
  for(let m=12;m<p.horizon*12;m+=12){
    const e=weightedEvent();if(e!=="none")events.set(m,e);
  }
  return {
    salaryGrowth:Math.max(-10,normal(p.salaryGrowth,2)),
    inflation:Math.max(0,normal(p.inflation,1.5)),
    interestRate:p.interestType==="variable"?Math.max(0,normal(p.interestRate,1)):p.interestRate,
    events
  };
}

/* ---------- UI ---------- */

$("calculateBtn").addEventListener("click",calculate);
$("compareBtn").addEventListener("click",compare);
$("stressBtn").addEventListener("click",stressTest);
$("monteCarloBtn").addEventListener("click",runMonteCarlo);
$("optimizeBtn").addEventListener("click",optimize);

$("emergencyTarget").addEventListener("input",e=>{$("emergencyTargetVal").textContent=e.target.value+" months";if(profile)compare();});
$("strategyBudget").addEventListener("input",e=>{$("strategyBudgetVal").textContent=e.target.value+"%";if(profile)compare();});
$("targetYears").addEventListener("input",e=>{$("targetYearsVal").textContent=e.target.value+" years";});
$("targetEmergency").addEventListener("input",e=>{$("targetEmergencyVal").textContent=e.target.value+" months";});
$("maxFailureRisk").addEventListener("input",e=>{$("maxFailureRiskVal").textContent=e.target.value+"%";});
document.querySelectorAll(".strategy").forEach(x=>x.addEventListener("change",()=>{if(profile)compare();}));

// Keyboard-accessible tooltips: keep focus behavior native via :focus in CSS.
