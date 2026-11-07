// Position sizing — fixed fractional (from position-sizing skill)
// risk 1% of equity, max 20% per stock, max 4 open, total open risk <= 6%

export interface SizeResult {
  shares: number;
  capitalRequired: number;
  riskAmount: number;
  portfolioPct: number;
  skipReason?: string;
}

export interface CostSettings {
  brokeragePct: number;   // e.g. 0.001 = 0.1%
  dpPerSell: number;      // e.g. 16
  slippagePct: number;    // e.g. 0.0005 = 0.05%
}

export function calcSize(
  equity: number,
  entry: number,
  stop: number,
  riskPct: number,            // 0.01 = 1%
  openPositions: number,
  totalOpenRiskRs: number,
  costs: CostSettings
): SizeResult {
  const maxOpenPositions = 4;
  const maxSinglePct = 0.20;
  const maxTotalRisk = 0.06; // 6%

  if (openPositions >= maxOpenPositions) {
    return { shares: 0, capitalRequired: 0, riskAmount: 0, portfolioPct: 0, skipReason: 'Max 4 positions open' };
  }

  if (totalOpenRiskRs / equity >= maxTotalRisk) {
    return { shares: 0, capitalRequired: 0, riskAmount: 0, portfolioPct: 0, skipReason: 'Total open risk >= 6%' };
  }

  const riskPerShare = entry - stop;
  if (riskPerShare <= 0) {
    return { shares: 0, capitalRequired: 0, riskAmount: 0, portfolioPct: 0, skipReason: 'Invalid stop (stop >= entry)' };
  }

  // Effective entry including slippage
  const effectiveEntry = entry * (1 + costs.slippagePct);

  const riskAmount = equity * riskPct;
  const rawShares = riskAmount / riskPerShare;
  const shares = Math.floor(rawShares);

  if (shares < 1) {
    return { shares: 0, capitalRequired: 0, riskAmount: 0, portfolioPct: 0, skipReason: 'Min 1 share does not fit risk budget' };
  }

  const capitalRequired = shares * effectiveEntry;
  const portfolioPct = capitalRequired / equity;

  if (portfolioPct > maxSinglePct) {
    // Reduce to max 20% allocation
    const cappedShares = Math.floor(equity * maxSinglePct / effectiveEntry);
    if (cappedShares < 1) {
      return { shares: 0, capitalRequired: 0, riskAmount: 0, portfolioPct: 0, skipReason: 'Even 1 share > 20% portfolio' };
    }
    return {
      shares: cappedShares,
      capitalRequired: cappedShares * effectiveEntry,
      riskAmount: cappedShares * riskPerShare,
      portfolioPct: (cappedShares * effectiveEntry) / equity,
    };
  }

  return { shares, capitalRequired, riskAmount: shares * riskPerShare, portfolioPct };
}

// Net R:R after costs — must be >= 2
export function netRR(
  entry: number,
  stop: number,
  target: number,
  costs: CostSettings
): number {
  const costEntry = entry * costs.brokeragePct + entry * costs.slippagePct;
  const costExit = target * costs.brokeragePct + costs.dpPerSell / 1 + target * costs.slippagePct;
  const netReward = target - entry - costEntry - costExit;
  const netRisk = entry - stop + costEntry;
  if (netRisk <= 0) return 0;
  return netReward / netRisk;
}

// Structure stop: below recent swing low with buffer (from stop-loss-strategies skill)
// 0.5% buffer for large-caps
export function structureStop(swingLow: number, isLargeCap = true): number {
  const buffer = isLargeCap ? 0.005 : 0.01;
  return swingLow * (1 - buffer);
}

// Trailing stop (hybrid from trailing-stops skill)
// 0..1R: fixed  |  1..2R: breakeven  |  2..3R: ATR trail  |  3R+: structure trail
export function hybridTrail(params: {
  entry: number;
  currentStop: number;
  currentPrice: number;
  initialStop: number;
  atrValue: number;
  recentSwingLow: number;
  highestClose: number;
}): number {
  const { entry, currentStop, currentPrice, initialStop, atrValue, recentSwingLow, highestClose } = params;
  const oneR = entry - initialStop;

  const profit = currentPrice - entry;

  if (profit < oneR) {
    // Below 1R: use initial stop unchanged
    return currentStop;
  } else if (profit < 2 * oneR) {
    // At 1R: move to breakeven
    return Math.max(currentStop, entry);
  } else if (profit < 3 * oneR) {
    // At 2R: ATR trail — highest close minus ATR * 1.5
    const atrStop = highestClose - atrValue * 1.5;
    return Math.max(currentStop, atrStop);
  } else {
    // At 3R+: structure trail — below most recent swing low
    return Math.max(currentStop, recentSwingLow - atrValue * 0.5);
  }
}

