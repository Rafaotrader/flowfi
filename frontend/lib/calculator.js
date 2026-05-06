import { calcFees } from './fees';

export function calculatePosition({ amountUsd, apr, days = 30 }) {
  const dailyRate = (apr / 100) / 365;

  function scenario(volMult, inRange) {
    const dailyFees = amountUsd * dailyRate * volMult * inRange;
    const totalFees = dailyFees * days;
    const { platformFee, userNet: netFees, ratePercent: platformPct } = calcFees(totalFees);
    return {
      dailyFees:   parseFloat(dailyFees.toFixed(4)),
      totalFees:   parseFloat(totalFees.toFixed(4)),
      platformFee: parseFloat(platformFee.toFixed(4)),
      platformPct,
      netFees:     parseFloat(netFees.toFixed(4)),
      apr:         parseFloat((amountUsd > 0 ? (netFees / amountUsd / days * 365 * 100) : 0).toFixed(2)),
    };
  }

  return {
    worst:    scenario(0.40, 0.50),
    expected: scenario(1.00, 0.75),
    best:     scenario(1.60, 0.95),
  };
}
