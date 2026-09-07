class DebtVisualizer {
    constructor(ir, amt, sal, col, sav) {
        this.ir = ir;
        this.amt = amt;
        this.sal = sal;
        this.col = col;
        this.sav = sav;

        this.mSal = sal / 12;
        this.mDisposable = this.mSal - col - this.sav; 

        let baseMonthlyRate = (this.ir / 100) / 12;
        let totalStandardMonths = 120; 
        
        if (baseMonthlyRate > 0) {
            this.requiredMinimum = this.amt * (baseMonthlyRate * Math.pow(1 + baseMonthlyRate, totalStandardMonths)) / (Math.pow(1 + baseMonthlyRate, totalStandardMonths) - 1);
        } else {
            this.requiredMinimum = this.amt / totalStandardMonths;
        }
    }

    isValid() {
        return (this.ir >= 0 && this.amt >= 0 && this.sal >= 0 && this.col >= 0 && this.sav >= 0);
    }

    simulatePayoff(isVariableModel, allocationPercentage, lifeEvent = "none") {
        let balance = this.amt;
        let monthsElapsed = 0;
        let totalPaid = 0;
        let baseMonthlyRate = (this.ir / 100) / 12;

        // --- APPLY PERMANENT SCALE EFFECTS ---
        let adjustedCol = this.col;
        if (lifeEvent === "divorce") {
            adjustedCol = this.col * 1.50; // Divorce: +50% Permanent Cost of Living
        } else if (lifeEvent === "inflation") {
            adjustedCol = this.col * 1.15; // Inflation: +15% Permanent Expenses
        }

        let adjustedDisposable = this.mSal - adjustedCol - this.sav;
        let plannedMonthlyPayment = adjustedDisposable * (allocationPercentage / 100);

        if (baseMonthlyRate > 0 && plannedMonthlyPayment <= this.amt * baseMonthlyRate && 
            lifeEvent !== "jobLoss" && lifeEvent !== "death") {
            return {
                stressLevel: "Critical Deficit (Interest accumulation outpaces payments)",
                totalPaid: "Incomplete",
                totalInterest: "Accumulating",
                timeToFreedom: "Infinite",
                years: 100,
                actualMonthlyPayment: plannedMonthlyPayment
            };
        }

        while (balance > 0 && monthsElapsed <= 1200) {
            let currentMonthlyRate = baseMonthlyRate;

            if (isVariableModel && monthsElapsed > 0 && monthsElapsed % 12 === 0) {
                let fluctuation = (Math.random() * 1 - 0.5) / 100 / 12;
                currentMonthlyRate = Math.max(0, currentMonthlyRate + fluctuation);
            }

            // --- INJECT ONE-TIME EMERGENCY LUMP SUMS AT MONTH 6 ---
            if (monthsElapsed === 6) {
                if (lifeEvent === "disease") balance += 4500;  // Unexpected Medical Emergency
                if (lifeEvent === "disaster") balance += 3000; // Natural Disaster / Damage
            }

            // --- INJECT TEMPORARY TIMELINE PAUSES ---
            let currentPaymentCapability = plannedMonthlyPayment;
            
            // Job Loss: 4 Months Unemployed (Months 6 to 10)
            if (lifeEvent === "jobLoss" && monthsElapsed >= 6 && monthsElapsed < 10) {
                currentPaymentCapability = 0; 
            }
            // Death: Family Crisis - 2 Months Without Income (Months 6 to 8)
            if (lifeEvent === "death" && monthsElapsed >= 6 && monthsElapsed < 8) {
                currentPaymentCapability = 0; 
            }

            balance += (balance * currentMonthlyRate);

            let payment = Math.min(currentPaymentCapability, balance);
            balance -= payment;
            
            totalPaid += payment;
            monthsElapsed++;
        }

        let yearsToPay = monthsElapsed / 12;
        let totalInterestPaid = Math.max(0, totalPaid - this.amt);

        let stressLevel = "Low Stress";
        if (yearsToPay > 15 || (lifeEvent === "jobLoss" && monthsElapsed > 1100)) stressLevel = "High Stress";
        else if (yearsToPay > 10) stressLevel = "Moderate Stress";

        if (monthsElapsed >= 1200) {
            return {
                stressLevel: "Critical Deficit (Timeline capped at 100 years)",
                totalPaid: "Incomplete",
                totalInterest: "Accumulating",
                timeToFreedom: "Infinite",
                years: 100,
                actualMonthlyPayment: plannedMonthlyPayment
            };
        }

        return {
            stressLevel: stressLevel,
            totalPaid: totalPaid,
            totalInterest: totalInterestPaid,
            timeToFreedom: yearsToPay.toFixed(1) + " Years",
            years: yearsToPay,
            actualMonthlyPayment: plannedMonthlyPayment
        };
    }
}

let activeVisualizer = null;

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.innerText = text;
}

function calculateLoan() {
    const ir = Number(document.getElementById("GIr").value);
    const amt = Number(document.getElementById("GAmt").value);
    const sal = Number(document.getElementById("GSal").value);
    const col = Number(document.getElementById("GCol").value);
    const initialSav = Number(document.getElementById("Gsav").value);

    activeVisualizer = new DebtVisualizer(ir, amt, sal, col, initialSav);
    const resultsContainer = document.getElementById("results");

    if (!activeVisualizer.isValid()) {
        resultsContainer.classList.remove("hidden");
        setText("RL", "Input Error");
        setText("MP", "Please enter positive numerical values only.");
        return;
    }

    const maxSavingsAllowed = Math.max(0, activeVisualizer.mSal - col);
    const savingsSlider = document.getElementById("savingsSlider");
    savingsSlider.max = Math.round(maxSavingsAllowed);
    savingsSlider.value = initialSav; 

    document.getElementById("incomePercentSlider").value = 30;
    
    // Reveal the Life Happens Dropdown next to the Calculate button
    document.getElementById("lifeEventWrapper").classList.remove("hidden");
    
    updateAppView(30, true); 
}

function updateAppView(percentValue, updateTimeSlider) {
    if (!activeVisualizer) return;

    const typeIR = document.getElementById("interestType").value;
    const isVariable = (typeIR !== "fixed");
    
    const currentLifeEvent = document.getElementById("lifeEvent").value;
    const report = activeVisualizer.simulatePayoff(isVariable, percentValue, currentLifeEvent);

    if (activeVisualizer.mDisposable <= 0) {
        setText("RL", "Debt Stress Level: Critical Deficit");
        setText("MP", "Monthly Cash Leftover: $0.00");
        setText("TP", "Unpayable");
        setText("IRP", "Your savings goal + cost of living leaves nothing for loans.");
        setText("YP", "Time to Freedom: Infinite");
        setText("DP", "Disposable Income: $0.00");
        setText("incomePercentVal", percentValue + "%");
        setText("timeGoalVal", "Infinite");
        return;
    }

    setText("RL", "Debt Stress Level: " + report.stressLevel);
    setText("MP", "Monthly Payment: $" + report.actualMonthlyPayment.toFixed(2));
    setText("DP", "Disposable Income: $" + activeVisualizer.mDisposable.toFixed(2));
    
    let dispTotal = typeof report.totalPaid === "number" ? "$" + report.totalPaid.toFixed(2) : report.totalPaid;
    let dispInterest = typeof report.totalInterest === "number" ? "$" + report.totalInterest.toFixed(2) : report.totalInterest;

    setText("TP", "Total Lifetime Payout: " + dispTotal);
    setText("IRP", "Total Interest Paid: " + dispInterest);
    setText("YP", "Time to Freedom: " + report.timeToFreedom);

    setText("incomePercentVal", percentValue + "%");
    setText("savingsVal", "$" + Math.round(activeVisualizer.sav));
    
    if (typeof report.totalPaid === "number" && report.years < 100) {
        setText("timeGoalVal", report.years.toFixed(1) + " years");
        if (updateTimeSlider) {
            document.getElementById("timeGoalSlider").value = report.years;
        }
    } else {
        setText("timeGoalVal", "Infinite");
    }

    document.getElementById("results").classList.remove("hidden");
}

// --- EVENT LISTENERS ---

document.getElementById("lifeEvent").addEventListener("change", () => {
    const currentPercent = Number(document.getElementById("incomePercentSlider").value);
    updateAppView(currentPercent, true);
});

document.getElementById("savingsSlider").addEventListener("input", (e) => {
    if (!activeVisualizer) return;
    const currentSavingsGoal = Number(e.target.value);
    document.getElementById("Gsav").value = currentSavingsGoal;

    activeVisualizer.sav = currentSavingsGoal;
    activeVisualizer.mDisposable = activeVisualizer.mSal - activeVisualizer.col - currentSavingsGoal;

    const currentPercent = Number(document.getElementById("incomePercentSlider").value);
    updateAppView(currentPercent, true);
});

document.getElementById("incomePercentSlider").addEventListener("input", (e) => {
    const currentPercent = Number(e.target.value);
    updateAppView(currentPercent, true);
});

document.getElementById("timeGoalSlider").addEventListener("input", (e) => {
    if (!activeVisualizer) return;
    if (activeVisualizer.mDisposable <= 0) return;

    const targetYears = Number(e.target.value);
    const targetMonths = targetYears * 12;
    const baseMonthlyRate = (activeVisualizer.ir / 100) / 12;
    
    let requiredPayment = 0;
    if (baseMonthlyRate > 0) {
        requiredPayment = activeVisualizer.amt * (baseMonthlyRate * Math.pow(1 + baseMonthlyRate, targetMonths)) / (Math.pow(1 + baseMonthlyRate, targetMonths) - 1);
    } else {
        requiredPayment = activeVisualizer.amt / targetMonths;
    }

    let neededPercent = (requiredPayment / activeVisualizer.mDisposable) * 100;
    neededPercent = Math.min(100, Math.max(1, Math.round(neededPercent)));

    document.getElementById("incomePercentSlider").value = neededPercent;
    
    updateAppView(neededPercent, false);
    setText("timeGoalVal", targetYears + " years");
});