/* Finance Forward v5 — clarity-first financial resilience model */
const $=id=>document.getElementById(id);
const money=n=>"$"+Math.round(Math.max(0,Number(n)||0)).toLocaleString("en-US");
const pct=n=>(Number(n)||0).toFixed(1)+"%";
let profile=null,baseline=null;
function num(id){return Number($(id).value)}
function buildProfile(){return{loanAmount:num("GAmt"),annualRate:num("GIr"),annualIncome:num("GSal"),monthlyExpenses:num("GCol"),startingSavings:num("Gsav"),salaryGrowth:num("salaryGrowth"),inflation:num("inflationRate"),horizon:num("horizon"),interestType:$("interestType").value,emergencyMonths:num("emergencyTarget")}}
function validate(p){if([p.loanAmount,p.annualRate,p.annualIncome,p.monthlyExpenses,p.startingSavings].some(v=>!Number.isFinite(v)))return"Please fill in all required fields.";if(p.loanAmount<0||p.annualRate<0||p.annualIncome<=0||p.monthlyExpenses<0||p.startingSavings<0)return"Please enter valid values and income above $0.";return""}

class FinancialModel{
constructor(p){this.p=p;this.months=p.horizon*12}
rate(a){return Math.max(0,a)/100/12}
payment(b,a,n=120){if(b<=0)return 0;const r=this.rate(a);return r===0?b/n:b*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1)}
run(event="none",stochastic=null,tweaks={}){
const p=this.p;let balance=p.loanAmount,savings=p.startingSavings,income=p.annualIncome/12,expenses=p.monthlyExpenses,totalInterest=0,totalPaid=0,minSavings=savings,debtFreeMonth=null;
const emergencyMonths=tweaks.emergencyMonths??p.emergencyMonths,debtAllocation=tweaks.debtAllocation??30;
for(let m=0;m<this.months;m++){
if(m>0&&m%12===0){income*=1+(stochastic?.salaryGrowth??p.salaryGrowth)/100;expenses*=1+(stochastic?.inflation??p.inflation)/100}
let currentIncome=income,currentExpenses=expenses,shock=stochastic?.events?.get(m)||event;
if((shock==="disease"||shock==="medical")&&m===12)savings-=4500;
if(shock==="disaster"&&m===12)savings-=3000;
if(shock==="death"&&m>=12&&m<14)currentIncome=0;
if(shock==="divorce"&&m>=12)currentExpenses*=1.5;
if(shock==="inflation"&&m>=12)currentExpenses*=1.15;
if(shock==="shock2020"&&m>=12&&m<15)currentIncome*=.70;
if(shock==="shock2020"&&m===12)savings-=1500;
if(shock==="recession2008"&&m>=12&&m<18)currentIncome*=.65;
if(shock==="recession2008"&&m>=12)currentExpenses*=1.05;
const cash=currentIncome-currentExpenses;if(cash<0)savings+=cash;let available=Math.max(0,cash);
const reserveTarget=currentExpenses*emergencyMonths;const reserveGap=Math.max(0,reserveTarget-savings);const toSavings=Math.min(available,reserveGap);available-=toSavings;savings+=toSavings;
let toDebt=0;if(balance>0){const required=this.payment(balance,p.annualRate);toDebt=Math.max(required,available*(debtAllocation/100));let rate=p.annualRate;if(p.interestType==="variable")rate=Math.max(0,stochastic?.interestRate??p.annualRate);const interest=balance*this.rate(rate);balance+=interest;totalInterest+=interest;const pay=Math.min(balance,toDebt);balance-=pay;totalPaid+=pay;if(balance<=.01&&debtFreeMonth===null){balance=0;debtFreeMonth=m+1}}
savings+=Math.max(0,available-toDebt);savings=Math.max(0,savings);minSavings=Math.min(minSavings,savings)}
const years=debtFreeMonth?debtFreeMonth/12:null,failure=minSavings<=0||debtFreeMonth===null,finalExpenses=expenses;
const liquidity=Math.min(100,savings/Math.max(1,finalExpenses*emergencyMonths)*100);
const debtBurden=Math.min(100,Math.max(0,100-(this.payment(p.loanAmount,p.annualRate)/Math.max(1,p.annualIncome/12))*100));
const shockTolerance=Math.min(100,Math.max(0,minSavings/Math.max(1,p.monthlyExpenses*emergencyMonths)*100));
const resilience=Math.round(liquidity*.4+debtBurden*.3+shockTolerance*.3);
return{balance,savings,debtFreeMonth,years,totalInterest,totalPaid,minSavings,failure,liquidity,debtBurden,shockTolerance,resilience}
}}

function calculate(){
profile=buildProfile();const err=validate(profile);$("errorMessage").textContent=err;if(err)return;
const model=new FinancialModel(profile);baseline=model.run();const income=profile.annualIncome/12,required=model.payment(profile.loanAmount,profile.annualRate),disposable=Math.max(0,income-profile.monthlyExpenses),dti=income?required/income*100:0,reserve=profile.monthlyExpenses?profile.startingSavings/profile.monthlyExpenses:0;
$("monthlyIncome").textContent=money(income);$("monthlyExpenses").textContent=money(profile.monthlyExpenses);$("monthlyDisposable").textContent=money(disposable);$("requiredPayment").textContent=money(required);$("dti").textContent=pct(dti);$("reserveMonths").textContent=reserve.toFixed(1)+" mo";$("reserveDollars").textContent=money(profile.startingSavings)+" saved";
setScore("resilienceScore",baseline.resilience);$("resilienceLabel").textContent=scoreLabel(baseline.resilience);$("resilienceText").textContent=resilienceCopy(baseline);setBar("liquidityBar","liquidityScore",baseline.liquidity);setBar("debtBar","debtScore",baseline.debtBurden);setBar("shockBar","shockScore",baseline.shockTolerance);
["results","stressSection","simulationSection","actionSection"].forEach(id=>$(id).classList.remove("hidden"));renderVulnerability(baseline);$("results").scrollIntoView({behavior:"smooth",block:"start"})
}
function scoreLabel(s){return s>=80?"Strong":s>=60?"Moderate":"Vulnerable"}
function resilienceCopy(r){return r.resilience>=80?"Your baseline has a strong cushion. Now see which shock creates the most strain.":r.resilience>=60?"Your plan has some protection, but a major disruption could reduce your financial flexibility.":"Your plan has limited room for disruption. Stress-testing shows where the weak point is."}
function setScore(id,v){$(id).textContent=Math.round(v)+"/100"}function setBar(b,s,v){$(b).style.width=Math.max(2,Math.min(100,v))+"%";$(s).textContent=Math.round(v)}
function stressExplanation(e){return({disease:"Emergency savings absorb a modeled medical expense before remaining cash flow is allocated.",death:"The model temporarily removes income to test whether liquidity can bridge a household income disruption.",divorce:"Living costs permanently increase to test whether remaining cash flow can support the plan.",disaster:"A one-time major expense tests the depth of liquid savings.",shock2020:"A temporary income disruption and one-time expense test whether your plan can bridge a sudden economic shock.",recession2008:"A prolonged income reduction plus higher expenses tests a severe recession-style environment.",inflation:"Expenses accelerate beyond baseline, testing whether income can keep pace.",none:"Your baseline assumptions are used without a named shock."})[e]}

function runStress(event){
if(!profile){calculate();if(!profile)return}const model=new FinancialModel(profile),base=model.run("none"),shock=model.run(event),survived=!shock.failure,delta=shock.savings-base.savings,scoreDelta=shock.resilience-base.resilience;
$("stressResult").innerHTML=`<div class="result-status ${survived?"survived":"failed"}"><div class="status-icon">${survived?"✓":"!"}</div><div><p class="eyebrow">${survived?"PLAN SURVIVES":"PLAN IS AT RISK"}</p><h3>${survived?"Your plan absorbs this scenario.":"This scenario exhausts your modeled financial cushion."}</h3><p>${stressExplanation(event)}</p></div></div><div class="before-after"><div><span>Baseline debt-free</span><b>${base.years===null?"Not reached":base.years.toFixed(1)+" yrs"}</b></div><div><span>Scenario debt-free</span><b>${shock.years===null?"Not reached":shock.years.toFixed(1)+" yrs"}</b></div><div><span>Ending savings</span><b>${money(shock.savings)}</b><small>${delta>=0?"+":""}${money(delta)} vs. baseline</small></div><div><span>Resilience</span><b>${Math.round(shock.resilience)}/100</b><small>${scoreDelta>=0?"+":""}${Math.round(scoreDelta)} points</small></div></div>`
}
function normal(mean,sd){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
function stochasticInputs(){const events=new Map();for(let m=12;m<profile.horizon*12;m+=12){const r=Math.random();if(r<.08)events.set(m,"shock2020");else if(r<.14)events.set(m,"recession2008");else if(r<.19)events.set(m,"disease");else if(r<.23)events.set(m,"disaster");else if(r<.26)events.set(m,"inflation");else if(r<.28)events.set(m,"death");else if(r<.30)events.set(m,"divorce")}return{salaryGrowth:Math.max(-10,normal(profile.salaryGrowth,2)),inflation:Math.max(0,normal(profile.inflation,1.5)),interestRate:profile.interestType==="variable"?Math.max(0,normal(profile.annualRate,1)):profile.annualRate,events}}
function quantile(a,p){if(!a.length)return null;const x=[...a].sort((u,v)=>u-v),i=(x.length-1)*p,l=Math.floor(i),u=Math.ceil(i);return l===u?x[l]:x[l]+(x[u]-x[l])*(i-l)}
function renderHistogram(values){const h=$("histogram");h.innerHTML="";if(!values.length){h.textContent="No debt-free outcomes within the horizon.";return}const bins=12,c=Array(bins).fill(0);values.forEach(v=>c[Math.min(bins-1,Math.floor(v/profile.horizon*bins))]++);const max=Math.max(...c);c.forEach(n=>{const b=document.createElement("div");b.className="hist-bar";b.style.height=Math.max(4,n/max*100)+"%";b.title=n+" outcomes";h.appendChild(b)})}
function runMonteCarlo(){
if(!profile){calculate();if(!profile)return}const n=num("simulationCount");$("mcStatus").textContent=`Running ${n.toLocaleString()} simulated futures…`;
setTimeout(()=>{const model=new FinancialModel(profile),o=[];for(let i=0;i<n;i++)o.push(model.run("none",stochasticInputs()));const df=o.filter(x=>x.years!==null),fail=o.filter(x=>x.failure).length,s=o.map(x=>x.savings),my=quantile(df.map(x=>x.years),.5);
$("mcDebtFreeProb").textContent=pct(df.length/n*100);$("mcFailureProb").textContent=pct(fail/n*100);$("mcMedianYears").textContent=my===null?"Not reached":my.toFixed(1)+" yrs";$("mcMedianSavings").textContent=money(quantile(s,.5));renderHistogram(df.map(x=>x.years));
$("mcInterpretation").innerHTML=`<p class="eyebrow">WHAT THIS MEANS</p><h3>${fail/n<=.10?"Your plan is relatively resilient across simulated futures.":fail/n<=.25?"Your plan survives many futures, but has meaningful failure risk.":"Your plan is highly sensitive to economic disruption."}</h3><p>Across ${n.toLocaleString()} futures, <strong>${pct(fail/n*100)}</strong> exhausted the modeled cushion or failed to clear debt within the horizon.</p>`;$("mcResults").classList.remove("hidden");$("mcStatus").textContent="Simulation complete. These are modeled possibilities, not predictions."},30)
}
function renderVulnerability(r){let title,text;if(r.liquidity<r.debtBurden&&r.liquidity<r.shockTolerance){title="Emergency savings";text="Your liquid reserve is the weakest part of your baseline. A larger cash cushion can reduce the chance that a shock forces you to stop making payments."}else if(r.debtBurden<r.shockTolerance){title="Debt burden";text="Your required debt payment consumes a meaningful share of monthly income. Lowering the payment burden creates more flexibility during a disruption."}else{title="Shock tolerance";text="Your baseline looks reasonable, but unexpected income or expense changes can still reduce your margin."}$("vulnerabilityTitle").textContent=title;$("vulnerabilityText").textContent=text}
function applyTweak(){if(!profile)return;const e=num("tweakEmergency"),d=num("tweakDebt"),before=new FinancialModel(profile).run(),after=new FinancialModel(profile).run("none",null,{emergencyMonths:e,debtAllocation:d});$("tweakResult").innerHTML=`<div><span>Before</span><b>${Math.round(before.resilience)}/100</b></div><div><span>After</span><b>${Math.round(after.resilience)}/100</b></div><p>${after.resilience>before.resilience?"This change improves modeled baseline resilience.":"This change does not improve the modeled baseline score; try another combination."}</p>`;$("tweakResult").classList.remove("hidden")}

$("calculateBtn").addEventListener("click",calculate);$("stressBtn").addEventListener("click",()=>runStress($("scenarioSelect").value));$("scenarioSelect").addEventListener("change",e=>{document.querySelectorAll(".stress-tab").forEach(b=>b.classList.toggle("active",b.dataset.event===e.target.value));runStress(e.target.value)});
document.querySelectorAll(".stress-tab").forEach(b=>b.addEventListener("click",()=>{$("scenarioSelect").value=b.dataset.event;document.querySelectorAll(".stress-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");runStress(b.dataset.event)}));
document.querySelectorAll(".history-card").forEach(b=>b.addEventListener("click",()=>{$("scenarioSelect").value=b.dataset.history;runStress(b.dataset.history);$("stressSection").scrollIntoView({behavior:"smooth"})}));
$("monteCarloBtn").addEventListener("click",runMonteCarlo);$("applyTweakBtn").addEventListener("click",applyTweak);
$("tweakEmergency").addEventListener("input",e=>$("tweakEmergencyVal").textContent=e.target.value+" months");$("tweakDebt").addEventListener("input",e=>$("tweakDebtVal").textContent=e.target.value+"%");
