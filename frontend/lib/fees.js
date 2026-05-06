/**
 * Single source of truth for FlowFi platform fee logic.
 * Fixed rate: 5% on fees/profit only — never on principal capital.
 * Mirrors PLATFORM_FEE_BPS = 500 in FlowFiHarvester.sol.
 */

export function getFeeRate() {
  return 0.05;
}

export function calcFees(totalUsd) {
  const safeTotal = (!totalUsd || isNaN(totalUsd) || totalUsd < 0) ? 0 : totalUsd;
  const rate = 0.05;
  const ratePercent = 5;
  const platformFee = parseFloat((safeTotal * rate).toFixed(4));
  const userNet = parseFloat((safeTotal - platformFee).toFixed(4));
  return { rate, ratePercent, platformFee, userNet, totalUsd: safeTotal };
}
