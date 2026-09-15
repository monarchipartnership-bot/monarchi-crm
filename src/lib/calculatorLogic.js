// Project Calculator — funnel economics math, ported verbatim from
// project_calculator.html's runScenario(). Purely client-side, no backend.

export function fmtMoney(n) {
  const s = Math.round(Math.abs(n)).toLocaleString('en-US');
  return (n < 0 ? '-' : '') + '$' + s;
}
export function fmtMoney2(n) {
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + s;
}
export function fmtPct(n) { return (n * 100).toFixed(1) + '%'; }
export function fmtPct2(n) { return (n * 100).toFixed(2) + '%'; }
export function fmtX(n) { return n.toFixed(2) + 'x'; }
export function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
export function fmt1(n) { return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
export function fmtSigned(n) { return (n >= 0 ? '+' : '') + n.toFixed(0) + '%'; }

// assumptions = {ctrChange, cvrChange, cpmChange} in whole percent (e.g. 30, -20), not fractions
export function runScenario(assumptions, inputs) {
  const { trafficSource, budget, cpm, ctr, cpc, convRate, aov, cogsPct, fixedCosts, txnFeePct, fulfilCost } = inputs;
  const { ctrChange, cvrChange, cpmChange } = assumptions;

  let impressions = null, ctrEff = null, clicks, cpcEff, scenarioCpm = null;
  if (trafficSource === 'meta') {
    scenarioCpm = cpm * (1 + cpmChange / 100);
    impressions = (budget / scenarioCpm) * 1000;
    ctrEff = ctr * (1 + ctrChange / 100);
    clicks = impressions * ctrEff;
    cpcEff = budget / clicks;
  } else {
    cpcEff = cpc;
    clicks = budget / cpc;
  }

  const crEff = convRate * (1 + cvrChange / 100);
  const estPurchases = clicks * crEff; // kept at full precision — never rounded before downstream math
  const cpa = budget / estPurchases;
  const revenue = estPurchases * aov;
  const roas = revenue / budget;
  const cogs = revenue * cogsPct;
  const variableCosts = revenue * txnFeePct + estPurchases * fulfilCost;
  const otherCosts = fixedCosts + variableCosts;
  const totalCosts = budget + cogs + otherCosts;
  // Contribution Profit = Revenue - Ad Spend - COGS - Variable Costs - Fixed Modelled Costs
  const contributionProfit = revenue - budget - cogs - variableCosts - fixedCosts;
  const contributionROI = contributionProfit / totalCosts;

  return {
    impressions, ctrEff, clicks, cpcEff, crEff, estPurchases, cpa, revenue, roas, cogs,
    variableCosts, otherCosts, totalCosts, contributionProfit, contributionROI, scenarioCpm,
  };
}

// Break-even analysis, based on the Current scenario's cost structure.
export function computeBreakEven(inputs, currentRevenue) {
  const denom = Math.max(0.0001, 1 - inputs.cogsPct - inputs.txnFeePct);
  const beRevenue = (inputs.budget + inputs.fixedCosts) / denom;
  const beROAS = inputs.budget > 0 ? beRevenue / inputs.budget : 0;
  const bePurchases = inputs.aov > 0 ? beRevenue / inputs.aov : 0;
  const beGap = currentRevenue - beRevenue;
  return { beRevenue, beROAS, bePurchases, beGap };
}
