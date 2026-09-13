/* Loan Resilience — clarity-first financial resilience simulator */
const $ = id => document.getElementById(id);
const money = n => "$" + Math.round(Math.max(0, Number(n) || 0)).toLocaleString("en-US");
const pct = n => (Number(n) || 0).toFixed(1) + "%";
let profile = null;
let baseline = null;

function num(id){ return Number($(id).value); }

function buildProfile(){
  return {
    loanAmount:num("GAmt"),
    annualRate:num("GIr"),
    annualIncome:num("GSal"),
    monthlyExpenses:num("GCol"),
    startingSavings:num("Gsav"),
    salaryGrowth:num("salaryGrowth"),
    inflation:num("inflationRate"),
    horizon:num("horizon"),
    interestType:$('interestType').value,
    emergencyMonths:num("emergencyTarget")
  };
}

function validate(p){
  const required=[p.loanAmount,p.annualRate,p.annualIncome,p.monthlyExpenses,p.startingSavings,p.salaryGrowth,p.inflation,p.horizon,p.emergencyMonths];
  if(required.some(v=>!Number.isFinite(v))) return "Please fill in all required fields.";
  if(p.loanAmount<0||p.annualRate<0||p.annualIncome<=0||p.monthlyExpenses<0||p.startingSavings<0||p.horizon<=0||p.emergencyMonths<=0) return "Please enter valid values and income above $0.";
  return "";
}

class FinancialModel{
  constructor(p){ this.p=p; this.months=Math.max(1,Math.round(p.horizon*12)); }
  rate(a){ return Math.max(0,a)/100/12; }
  payment(balance,annualRate,months=120){
    if(balance<=0) return 0;
    const r=this.rate(annualRate);
    return r===0 ? balance/months : balance*(r*Math.pow(1+r,months))/(Math.pow(1+r,months)-1);
  }
  run(event="none",stochastic=null,tweaks={}){
    const p=this.p;
    let balance=p.loanAmount;
    let savings=p.startingSavings;
    let income=p.annualIncome/12;
    let expenses=p.monthlyExpenses;
    let totalInterest=0;
    let totalPaid=0;
    let minSavings=savings;
    let debtFreeMonth=null;
    let exhausted=false;
    const emergencyMonths=Number.isFinite(tweaks.emergencyMonths)?tweaks.emergencyMonths:p.emergencyMonths;
    const debtAllocation=Number.isFinite(tweaks.debtAllocation)?tweaks.debtAllocation:30;

    for(let m=0;m<this.months;m++){
      if(m>0 && m%12===0){
        income*=1+(stochastic?.salaryGrowth ?? p.salaryGrowth)/100;
        expenses*=1+(stochastic?.inflation ?? p.inflation)/100;
      }

      let currentIncome=income;
      let currentExpenses=expenses;
      const shock=stochastic?.events?.get(m) || event;

      if((shock==="disease"||shock==="medical") && m===12) savings-=4500;
      if(shock==="disaster" && m===12) savings-=3000;
      if(shock==="death" && m>=12 && m<14) currentIncome=0;
      if(shock==="divorce" && m>=12) currentExpenses*=1.50;
      if(shock==="inflation" && m>=12) currentExpenses*=1.15;
      if(shock==="shock2020" && m>=12 && m<15) currentIncome*=0.70;
      if(shock==="shock2020" && m===12) savings-=1500;
      if(shock==="recession2008" && m>=12 && m<18) currentIncome*=0.65;
      if(shock==="recession2008" && m>=12) currentExpenses*=1.05;

      const cash=currentIncome-currentExpenses;
      if(cash<0) savings+=cash;
      let available=Math.max(0,cash);

      // Build toward the reserve target before directing remaining cash to debt.
      const reserveTarget=currentExpenses*emergencyMonths;
      const reserveGap=Math.max(0,reserveTarget-savings);
      const toSavings=Math.min(available,reserveGap);
      available-=toSavings;
      savings+=toSavings;

      if(savings<=0) exhausted=true;

      if(balance>0){
        const required=this.payment(balance,p.annualRate);
        const extraDebt=Math.max(0,available*(debtAllocation/100));
        const toDebt=Math.max(required,extraDebt);
        let rate=p.annualRate;
        if(p.interestType==="variable") rate=Math.max(0,stochastic?.interestRate ?? p.annualRate);
        const interest=balance*this.rate(rate);
        balance+=interest;
        totalInterest+=interest;
        const payment=Math.min(balance,toDebt);
        balance-=payment;
        totalPaid+=payment;
        if(balance<=0.01 && debtFreeMonth===null){ balance=0; debtFreeMonth=m+1; }
        savings+=Math.max(0,available-payment);
      }else{
        savings+=available;
      }

      savings=Math.max(0,savings);
      minSavings=Math.min(minSavings,savings);
      if(savings<=0) exhausted=true;
    }

    const years=debtFreeMonth===null?null:debtFreeMonth/12;
    const failure=exhausted || debtFreeMonth===null;
    const finalReserveTarget=Math.max(1,expenses*emergencyMonths);
    const liquidity=Math.min(100,Math.max(0,minSavings/finalReserveTarget*100));
    const requiredAtStart=this.payment(p.loanAmount,p.annualRate);
    const debtBurden=Math.min(100,Math.max(0,100-(requiredAtStart/Math.max(1,p.annualIncome/12))*100));
    const liquidityCoverage=Math.min(100,Math.max(0,minSavings/Math.max(1,p.monthlyExpenses*emergencyMonths)*100));
    const debtProgress=p.loanAmount<=0?100:Math.min(100,Math.max(0,(1-balance/p.loanAmount)*100));
    const shockTolerance=Math.min(100,Math.max(0,liquidityCoverage*.65+debtProgress*.35));
    const resilience=Math.round(liquidity*.45+debtBurden*.30+shockTolerance*.25);

    return {balance,savings,debtFreeMonth,years,totalInterest,totalPaid,minSavings,exhausted,failure,liquidity,debtBurden,debtProgress,shockTolerance,resilience};
  }
}

function calculate(){
  profile=buildProfile();
  const err=validate(profile);
  $("errorMessage").textContent=err;
  if(err) return;

  baseline=new FinancialModel(profile).run();
  const model=new FinancialModel(profile);
  const income=profile.annualIncome/12;
  const required=model.payment(profile.loanAmount,profile.annualRate);
  const disposable=Math.max(0,income-profile.monthlyExpenses);
  const dti=income?required/income*100:0;
  const reserve=profile.monthlyExpenses?profile.startingSavings/profile.monthlyExpenses:0;

  $("monthlyIncome").textContent=money(income);
  $("monthlyExpenses").textContent=money(profile.monthlyExpenses);
  $("monthlyDisposable").textContent=money(disposable);
  $("requiredPayment").textContent=money(required);
  $("dti").textContent=pct(dti);
  $("reserveMonths").textContent=reserve.toFixed(1)+" mo";
  $("reserveDollars").textContent=money(profile.startingSavings)+" saved";
  setScore("resilienceScore",baseline.resilience);
  $("resilienceLabel").textContent=scoreLabel(baseline.resilience);
  $("resilienceText").textContent=resilienceCopy(baseline);
  setBar("liquidityBar","liquidityScore",baseline.liquidity);
  setBar("debtBar","debtScore",baseline.debtBurden);
  setBar("shockBar","shockScore",baseline.shockTolerance);
  renderVulnerability(baseline);

  ["results","stressSection","simulationSection","actionSection"].forEach(id=>$(id).classList.remove("hidden"));
  $("results").scrollIntoView({behavior:"smooth",block:"start"});
}

function scoreLabel(s){ return s>=80?"Strong":s>=60?"Moderate":"Vulnerable"; }
function resilienceCopy(r){
  if(r.resilience>=80) return "Your baseline has a strong modeled cushion. Now see which shock creates the most strain.";
  if(r.resilience>=60) return "Your plan has some protection, but a major disruption could reduce your financial flexibility.";
  return "Your plan has limited room for disruption. Stress-testing shows where the weak point is.";
}
function setScore(id,v){ $(id).textContent=Math.round(v)+"/100"; }
function setBar(barId,scoreId,v){ $(barId).style.width=Math.max(2,Math.min(100,v))+"%"; $(scoreId).textContent=Math.round(v); }

function stressExplanation(e){
  return ({
    disease:"A modeled $4,500 medical expense is taken from liquid savings before remaining cash flow is allocated.",
    death:"Income is temporarily removed for two months to test whether your plan can bridge a household income disruption.",
    divorce:"Living costs permanently increase by 50% to test whether the remaining cash flow can support the plan.",
    disaster:"A modeled $3,000 one-time expense tests the depth of your liquid savings.",
    shock2020:"A temporary income reduction plus a one-time expense tests whether your plan can bridge a sudden economic shock.",
    recession2008:"Income falls for several months while expenses rise, creating a prolonged recession-style stress environment.",
    inflation:"Living costs increase 15% beyond the baseline to test whether your income can keep pace.",
    none:"Your baseline assumptions are used without a named shock."
  })[e] || "The selected scenario changes the baseline assumptions.";
}

function runStress(event){
  if(!profile){ calculate(); if(!profile) return; }
  const model=new FinancialModel(profile);
  const base=model.run("none");
  const shock=model.run(event);
  const savingsExhausted=shock.exhausted;
  const debtCleared=shock.years!==null;
  const survives=!savingsExhausted && debtCleared;
  const scoreDelta=shock.resilience-base.resilience;

  let title,copy,icon;
  if(survives){
    title="Your plan absorbs this scenario.";
    copy=stressExplanation(event);
    icon="✓";
  }else if(savingsExhausted){
    title="This scenario exhausts your modeled financial cushion.";
    copy=stressExplanation(event)+" Liquid savings reach $0 or below during the modeled path.";
    icon="!";
  }else{
    title="This scenario pushes the plan beyond its horizon.";
    copy=stressExplanation(event)+" The loan is not fully cleared within the selected horizon.";
    icon="!";
  }

  $("stressResult").innerHTML=`
    <div class="result-status ${survives?"survived":"failed"}">
      <div class="status-icon">${icon}</div>
      <div><p class="eyebrow">${survives?"PLAN SURVIVES":"PLAN IS AT RISK"}</p><h3>${title}</h3><p>${copy}</p></div>
    </div>
    <div class="before-after">
      <div><span>Baseline debt-free</span><b>${base.years===null?"Not reached":base.years.toFixed(1)+" yrs"}</b></div>
      <div><span>Scenario debt-free</span><b>${shock.years===null?"Not reached":shock.years.toFixed(1)+" yrs"}</b></div>
      <div><span>Resilience</span><b>${Math.round(shock.resilience)}/100</b><small>${scoreDelta>=0?"+":""}${Math.round(scoreDelta)} points vs. baseline</small></div>
    </div>`;
}

function normal(mean,sd){
  let u=0,v=0;
  while(!u) u=Math.random();
  while(!v) v=Math.random();
  return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function stochasticInputs(){
  const events=new Map();
  for(let m=12;m<profile.horizon*12;m+=12){
    const r=Math.random();
    if(r<.08) events.set(m,"shock2020");
    else if(r<.14) events.set(m,"recession2008");
    else if(r<.19) events.set(m,"disease");
    else if(r<.23) events.set(m,"disaster");
    else if(r<.26) events.set(m,"inflation");
    else if(r<.28) events.set(m,"death");
    else if(r<.30) events.set(m,"divorce");
  }
  return {
    salaryGrowth:Math.max(-10,normal(profile.salaryGrowth,2)),
    inflation:Math.max(0,normal(profile.inflation,1.5)),
    interestRate:profile.interestType==="variable"?Math.max(0,normal(profile.annualRate,1)):profile.annualRate,
    events
  };
}

function quantile(a,p){
  if(!a.length) return null;
  const x=[...a].sort((u,v)=>u-v);
  const i=(x.length-1)*p,l=Math.floor(i),u=Math.ceil(i);
  return l===u?x[l]:x[l]+(x[u]-x[l])*(i-l);
}

function renderHistogram(values){
  const h=$("histogram");
  h.innerHTML="";
  if(!values.length){ h.textContent="No debt-free outcomes within the horizon."; return; }
  const bins=12, counts=Array(bins).fill(0);
  values.forEach(v=>counts[Math.min(bins-1,Math.floor(v/profile.horizon*bins))]++);
  const max=Math.max(...counts);
  counts.forEach(n=>{
    const b=document.createElement("div");
    b.className="hist-bar";
    b.style.height=Math.max(4,n/max*100)+"%";
    b.title=n.toLocaleString()+" simulated outcomes";
    h.appendChild(b);
  });
}

function runMonteCarlo(){
  if(!profile){ calculate(); if(!profile) return; }
  const n=Math.max(1,Math.round(num("simulationCount")));
  $("mcStatus").textContent=`Running ${n.toLocaleString()} simulated futures…`;
  $("monteCarloBtn").disabled=true;
  setTimeout(()=>{
    const model=new FinancialModel(profile);
    const outcomes=[];
    for(let i=0;i<n;i++) outcomes.push(model.run("none",stochasticInputs()));
    const debtFree=outcomes.filter(x=>x.years!==null);
    const failures=outcomes.filter(x=>x.failure).length;
    const exhausted=outcomes.filter(x=>x.exhausted).length;
    const medianYears=quantile(debtFree.map(x=>x.years),.5);
    const debtFreeProb=debtFree.length/n*100;
    const failureProb=failures/n*100;
    const exhaustionProb=exhausted/n*100;

    $("mcDebtFreeProb").textContent=pct(debtFreeProb);
    $("mcFailureProb").textContent=pct(failureProb);
    $("mcMedianYears").textContent=medianYears===null?"Not reached":medianYears.toFixed(1)+" yrs";
    $("mcSavingsExhaustion").textContent=pct(exhaustionProb);
    renderHistogram(debtFree.map(x=>x.years));

    let headline,detail;
    if(failureProb<=10){
      headline="Your plan is relatively resilient across simulated futures.";
      detail="Most modeled paths reach debt-free status without triggering the model's failure conditions.";
    }else if(failureProb<=25){
      headline="Your plan survives many futures, but has meaningful failure risk.";
      detail="The distribution shows that moderate changes in income, inflation, or disruption timing can materially change the outcome.";
    }else{
      headline="Your plan is highly sensitive to economic disruption.";
      detail="A substantial share of modeled paths either exhaust liquid savings or do not clear the loan within the selected horizon.";
    }
    $("mcInterpretation").innerHTML=`<p class="eyebrow">WHAT THIS MEANS</p><h3>${headline}</h3><p>${detail} Across ${n.toLocaleString()} futures, <strong>${pct(exhaustionProb)}</strong> exhausted liquid savings at some point and <strong>${pct(failureProb)}</strong> met the model's overall failure definition.</p>`;
    $("mcResults").classList.remove("hidden");
    $("mcStatus").textContent="Simulation complete. These are modeled possibilities, not predictions.";
    $("monteCarloBtn").disabled=false;
  },40);
}

function renderVulnerability(r){
  let title,text;
  if(r.liquidity<r.debtBurden && r.liquidity<r.shockTolerance){
    title="Emergency savings";
    text="Your liquid reserve is the weakest part of the baseline. A larger cash cushion gives the plan more room when an unexpected expense or income disruption occurs.";
  }else if(r.debtBurden<r.shockTolerance){
    title="Debt-payment pressure";
    text="Your required payment consumes a meaningful share of income. Reducing payment pressure can create more flexibility during disruption.";
  }else{
    title="Shock tolerance";
    text="Your baseline has some protection, but the plan remains sensitive to unexpected income or expense changes.";
  }
  $("vulnerabilityTitle").textContent=title;
  $("vulnerabilityText").textContent=text;
  $("vulnerabilityTitleAction").textContent=title;
  $("vulnerabilityTextAction").textContent=text;
}

function applyTweak(){
  if(!profile) return;
  const e=num("tweakEmergency");
  const d=num("tweakDebt");
  const before=new FinancialModel(profile).run();
  const after=new FinancialModel(profile).run("none",null,{emergencyMonths:e,debtAllocation:d});
  const delta=Math.round(after.resilience-before.resilience);
  $("tweakResult").innerHTML=`
    <div><span>Before</span><b>${Math.round(before.resilience)}/100</b><small>Shock tolerance: ${Math.round(before.shockTolerance)}/100</small></div>
    <div><span>After</span><b>${Math.round(after.resilience)}/100</b><small>Shock tolerance: ${Math.round(after.shockTolerance)}/100</small></div>
    <p>${delta>0?`Modeled resilience improves by <strong>${delta} points</strong>. Your changes increased the modeled cushion.`:delta<0?`Modeled resilience falls by <strong>${Math.abs(delta)} points</strong>. The new allocation trades away more of the model's cushion.`:`The overall resilience score is unchanged. Try a different combination of reserve and debt allocation.`}</p>`;
  $("tweakResult").classList.remove("hidden");
}

function syncStressTab(event){
  document.querySelectorAll(".stress-tab").forEach(b=>b.classList.toggle("active",b.dataset.event===event));
}

function setupTooltips(){
  const tips=[...document.querySelectorAll(".tip")];
  let openTip=null;
  const close=()=>{ if(openTip){openTip.classList.remove("is-open");openTip.setAttribute("aria-expanded","false");openTip=null;} };
  const position=tip=>{
    const box=tip.querySelector(".tip-box");
    if(!box)return;
    box.style.left="0px"; box.style.top="0px";
    const rect=tip.getBoundingClientRect();
    const width=Math.min(290,window.innerWidth-28);
    const boxRect=box.getBoundingClientRect();
    let left=rect.left+rect.width/2-width/2;
    left=Math.max(14,Math.min(window.innerWidth-width-14,left));
    const above=rect.top-boxRect.height-10;
    const below=rect.bottom+10;
    const top=above>=10?above:Math.min(window.innerHeight-boxRect.height-10,below);
    box.style.width=width+"px";
    box.style.left=left+"px";
    box.style.top=Math.max(10,top)+"px";
  };
  tips.forEach(tip=>{
    tip.addEventListener("click",e=>{
      e.stopPropagation();
      const was=tip.classList.contains("is-open");
      close();
      if(!was){
        tip.classList.add("is-open");tip.setAttribute("aria-expanded","true");openTip=tip;position(tip);
      }
    });
    tip.addEventListener("mouseenter",()=>position(tip));
    tip.addEventListener("focus",()=>position(tip));
  });
  document.addEventListener("click",close);
  window.addEventListener("resize",()=>{if(openTip)position(openTip);});
  window.addEventListener("scroll",()=>{if(openTip)position(openTip);},{passive:true});
}

function updateSimulationButton(){
  const n=Number($("simulationCount").value)||1000;
  $("monteCarloBtn").innerHTML=`Simulate ${n.toLocaleString()} possible futures <span>→</span>`;
}

$("calculateBtn").addEventListener("click",calculate);
$("stressBtn").addEventListener("click",()=>runStress($("scenarioSelect").value));
$("scenarioSelect").addEventListener("change",e=>{syncStressTab(e.target.value);runStress(e.target.value);});
document.querySelectorAll(".stress-tab").forEach(b=>b.addEventListener("click",()=>{const event=b.dataset.event;$("scenarioSelect").value=event;syncStressTab(event);runStress(event);}));
document.querySelectorAll(".history-card").forEach(b=>b.addEventListener("click",()=>{const event=b.dataset.history;$("scenarioSelect").value=event;syncStressTab(event);runStress(event);$("stressSection").scrollIntoView({behavior:"smooth",block:"start"});}));
$("monteCarloBtn").addEventListener("click",runMonteCarlo);
$("simulationCount").addEventListener("change",updateSimulationButton);
$("applyTweakBtn").addEventListener("click",applyTweak);
$("tweakEmergency").addEventListener("input",e=>$("tweakEmergencyVal").textContent=e.target.value+" months");
$("tweakDebt").addEventListener("input",e=>$("tweakDebtVal").textContent=e.target.value+"%");
setupTooltips();
updateSimulationButton();
