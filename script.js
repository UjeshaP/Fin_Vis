/*
 Finance Forward — Phase 1 + 2
 Financial modeling engine + Strategy Lab
*/

class FinancialModel {
    constructor(profile) {
        this.profile = profile;
        this.months = profile.horizon * 12;
    }

    monthlyRate(annualRate) {
        return Math.max(0, annualRate / 100 / 12);
    }

    requiredPayment(balance, annualRate, months = 120) {
        if (balance <= 0 || months <= 0) return 0;
        const r = this.monthlyRate(annualRate);
        if (r === 0) return balance / months;
        return balance * (r * Math.pow(1 + r, months)) /
            (Math.pow(1 + r, months) - 1);
    }

    simulate(strategyName, lifeEvent = "none") {
        const p = this.profile;
        let balance = p.loanAmount;
        let savings = p.initialSavings;
        let totalInterest = 0;
        let totalPaid = 0;
        let debtFreeMonth = null;
        let minimumSavings = savings;
        let maxDebt = balance;

        let income = p.annualSalary / 12;
        let expenses = p.monthlyExpenses;

        const emergencyTarget = expenses * p.emergencyMonths;
        const eventStart = 12; // month 13
        const eventEnd = lifeEvent === "jobLoss" ? 16 : lifeEvent === "death" ? 14 : eventStart + 1;

        for (let month = 0; month < this.months; month++) {
            // Annual salary growth and inflation.
            if (month > 0 && month % 12 === 0) {
                income *= (1 + p.salaryGrowth / 100);
                expenses *= (1 + p.inflationRate / 100);
            }

            let currentIncome = income;
            let currentExpenses = expenses;

            // Stress event mechanics.
            if (lifeEvent === "jobLoss" && month >= eventStart && month < eventEnd) {
                currentIncome = 0;
            } else if (lifeEvent === "death" && month >= eventStart && month < eventEnd) {
                currentIncome = 0;
            } else if (lifeEvent === "medical" && month === eventStart) {
                savings -= 4500;
            } else if (lifeEvent === "disaster" && month === eventStart) {
                savings -= 3000;
            } else if (lifeEvent === "inflationShock" && month === eventStart) {
                expenses *= 1.15;
            } else if (lifeEvent === "divorce" && month >= eventStart) {
                currentExpenses *= 1.50;
            }

            const cashBeforeStrategy = currentIncome - currentExpenses;

            // Negative cash flow is funded by savings first.
            if (cashBeforeStrategy < 0) {
                savings += cashBeforeStrategy;
            }

            let available = Math.max(0, cashBeforeStrategy);

            let savingsAllocation = 0;
            let debtAllocation = 0;

            if (strategyName === "aggressive") {
                debtAllocation = available;
            } else if (strategyName === "balanced") {
                savingsAllocation = available * 0.40;
                debtAllocation = available * 0.60;
            } else if (strategyName === "emergency") {
                if (savings < emergencyTarget) {
                    savingsAllocation = Math.min(available, emergencyTarget - savings);
                    debtAllocation = available - savingsAllocation;
                } else {
                    debtAllocation = available;
                }
            } else if (strategyName === "avalanche" || strategyName === "snowball") {
                // With a single debt, both algorithms converge.
                // Architecture is intentionally strategy-ready for multi-debt expansion.
                const required = this.requiredPayment(balance, p.interestRate, 120);
                debtAllocation = Math.max(required, available * (p.strategyBudget / 100));
            }

            savings += savingsAllocation;

            // Interest is calculated before payment.
            if (balance > 0) {
                let rate = p.interestRate;
                if (p.interestType === "variable" && month > 0 && month % 12 === 0) {
                    rate += (Math.random() * 1 - 0.5);
                }

                const interest = balance * this.monthlyRate(rate);
                balance += interest;
                totalInterest += interest;

                const payment = Math.min(balance, debtAllocation);
                balance -= payment;
                totalPaid += payment;

                if (balance <= 0.005 && debtFreeMonth === null) {
                    balance = 0;
                    debtFreeMonth = month + 1;
                }
            }

            // Never allow the model to report negative savings.
            if (savings < 0) savings = 0;

            minimumSavings = Math.min(minimumSavings, savings);
            maxDebt = Math.max(maxDebt, balance);
        }

        const debtFreeYears = debtFreeMonth ? debtFreeMonth / 12 : null;
        const debtBurden = p.loanAmount > 0 ? Math.min(1, balance / p.loanAmount) : 0;
        const liquidityScore = Math.min(100, (minimumSavings / Math.max(1, emergencyTarget)) * 100);
        const debtScore = 100 - debtBurden * 100;
        const speedScore = debtFreeYears === null ? 0 : Math.max(0, 100 - debtFreeYears * 8);
        const resilience = Math.round(
            liquidityScore * 0.45 +
            debtScore * 0.30 +
            speedScore * 0.25
        );

        return {
            strategy: strategyName,
            debtFreeMonth,
            debtFreeYears,
            totalInterest,
            totalPaid,
            endingSavings: savings,
            minimumSavings,
            resilience,
            worstShock: minimumSavings <= 0 ? "Savings depleted" : "Absorbed"
        };
    }
}

const STRATEGIES = {
    aggressive: "Aggressive Debt",
    balanced: "Balanced",
    emergency: "Emergency Fund First",
    avalanche: "Debt Avalanche",
    snowball: "Debt Snowball"
};

let activeProfile = null;
let lastResults = [];

const money = n => "$" + Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

function getNumber(id) {
    return Number(document.getElementById(id).value);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function validateProfile(p) {
    if (p.loanAmount < 0 || p.interestRate < 0 || p.annualSalary <= 0 ||
        p.monthlyExpenses < 0 || p.initialSavings < 0) {
        return "Please enter valid non-negative financial values and a salary greater than $0.";
    }
    if (p.monthlyExpenses + p.initialSavings > p.annualSalary / 12 && p.loanAmount === 0) {
        return "Your monthly expenses and savings exceed monthly take-home income.";
    }
    return "";
}

function buildProfile() {
    return {
        loanAmount: getNumber("GAmt"),
        interestRate: getNumber("GIr"),
        annualSalary: getNumber("GSal"),
        monthlyExpenses: getNumber("GCol"),
        initialSavings: getNumber("Gsav"),
        salaryGrowth: getNumber("salaryGrowth"),
        inflationRate: getNumber("inflationRate"),
        horizon: getNumber("horizon"),
        interestType: document.getElementById("interestType").value,
        emergencyMonths: getNumber("emergencyTarget"),
        strategyBudget: getNumber("strategyBudget")
    };
}

function calculateLoan() {
    const profile = buildProfile();
    const error = validateProfile(profile);

    if (error) {
        setText("errorMessage", error);
        return;
    }

    setText("errorMessage", "");
    activeProfile = profile;

    const model = new FinancialModel(profile);
    const monthlyIncome = profile.annualSalary / 12;
    const disposable = monthlyIncome - profile.monthlyExpenses - profile.initialSavings;
    const dti = monthlyIncome > 0 ? (model.requiredPayment(profile.loanAmount, profile.interestRate) / monthlyIncome) * 100 : 0;

    setText("monthlyIncome", money(monthlyIncome));
    setText("monthlyExpenses", money(profile.monthlyExpenses));
    setText("monthlySavings", money(profile.initialSavings));
    setText("monthlyDisposable", money(Math.max(0, disposable)));
    setText("dti", dti.toFixed(1) + "%");
    setText("requiredPayment", money(model.requiredPayment(profile.loanAmount, profile.interestRate)));

    document.getElementById("results").classList.remove("hidden");
    compareStrategies();
}

function compareStrategies() {
    if (!activeProfile) {
        setText("errorMessage", "Build your financial model first.");
        return;
    }

    activeProfile.emergencyMonths = getNumber("emergencyTarget");
    activeProfile.strategyBudget = getNumber("strategyBudget");

    const event = document.getElementById("lifeEvent").value;
    const selected = [...document.querySelectorAll(".strategy:checked")].map(x => x.value);
    const model = new FinancialModel(activeProfile);

    lastResults = selected.map(strategy => model.simulate(strategy, event));

    renderTable(lastResults);
    renderRecommendation(lastResults);
    renderInsights(lastResults);
}

function renderTable(results) {
    const tbody = document.getElementById("strategyTable");
    tbody.innerHTML = "";

    if (!results.length) {
        tbody.innerHTML = '<tr><td colspan="6">Select at least one strategy.</td></tr>';
        return;
    }

    results.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${STRATEGIES[r.strategy]}</strong></td>
            <td>${r.debtFreeYears === null ? "Not reached" : r.debtFreeYears.toFixed(1) + " yrs"}</td>
            <td>${money(r.totalInterest)}</td>
            <td>${money(r.endingSavings)}</td>
            <td>${r.worstShock}</td>
            <td><strong>${r.resilience}/100</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderRecommendation(results) {
    const box = document.getElementById("recommendation");
    if (!results.length) {
        box.textContent = "Select a strategy to generate a recommendation.";
        return;
    }

    const best = [...results].sort((a, b) => b.resilience - a.resilience)[0];
    const fastest = [...results].filter(r => r.debtFreeYears !== null)
        .sort((a, b) => a.debtFreeYears - b.debtFreeYears)[0];

    box.innerHTML = `
        <h3>${STRATEGIES[best.strategy]} scores highest on modeled resilience.</h3>
        <p><strong>Resilience score:</strong> ${best.resilience}/100</p>
        <p><strong>Debt-free timeline:</strong> ${best.debtFreeYears === null ? "Not reached within the simulation horizon" : best.debtFreeYears.toFixed(1) + " years"}</p>
        <p><strong>Ending savings:</strong> ${money(best.endingSavings)}</p>
        ${fastest ? `<p><strong>Fastest strategy:</strong> ${STRATEGIES[fastest.strategy]} at ${fastest.debtFreeYears.toFixed(1)} years. The fastest option is not automatically the most resilient.</p>` : ""}
    `;
}

function renderInsights(results) {
    const box = document.getElementById("insights");
    if (!results.length) return;

    const highestSavings = [...results].sort((a, b) => b.endingSavings - a.endingSavings)[0];
    const lowestInterest = [...results].sort((a, b) => a.totalInterest - b.totalInterest)[0];
    const highestResilience = [...results].sort((a, b) => b.resilience - a.resilience)[0];

    box.innerHTML = `
        <ul>
            <li><strong>Liquidity:</strong> ${STRATEGIES[highestSavings.strategy]} leaves the most modeled ending savings (${money(highestSavings.endingSavings)}).</li>
            <li><strong>Interest efficiency:</strong> ${STRATEGIES[lowestInterest.strategy]} produces the lowest modeled interest cost (${money(lowestInterest.totalInterest)}).</li>
            <li><strong>Resilience:</strong> ${STRATEGIES[highestResilience.strategy]} performs best on the composite score (${highestResilience.resilience}/100).</li>
        </ul>
    `;
}

document.getElementById("calculateBtn").addEventListener("click", calculateLoan);
document.getElementById("compareBtn").addEventListener("click", compareStrategies);
document.getElementById("lifeEvent").addEventListener("change", compareStrategies);

document.getElementById("emergencyTarget").addEventListener("input", e => {
    setText("emergencyTargetVal", e.target.value + " months");
    if (activeProfile) compareStrategies();
});

document.getElementById("strategyBudget").addEventListener("input", e => {
    setText("strategyBudgetVal", e.target.value + "%");
    if (activeProfile) compareStrategies();
});

document.querySelectorAll(".strategy").forEach(box => {
    box.addEventListener("change", () => {
        if (activeProfile) compareStrategies();
    });
});
