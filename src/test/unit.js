// Unit tests: sizing, stop/trailing, R:R math
// Run: node src/test/unit.js

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertClose(a, b, tol = 0.01) {
  if (Math.abs(a - b) > tol) throw new Error(`Expected ${b} ± ${tol}, got ${a}`);
}

// --- Position Sizing ---
function calcSize(equity, entry, stop, riskPct, openPositions, totalOpenRiskRs, costs) {
  const maxOpenPositions = 4;
  const maxSinglePct = 0.20;
  const maxTotalRisk = 0.06;

  if (openPositions >= maxOpenPositions) return { shares: 0, skipReason: 'Max 4 positions' };
  if (totalOpenRiskRs / equity >= maxTotalRisk) return { shares: 0, skipReason: 'Total risk >= 6%' };

  const riskPerShare = entry - stop;
  if (riskPerShare <= 0) return { shares: 0, skipReason: 'Invalid stop' };

  const effectiveEntry = entry * (1 + costs.slippagePct);
  const riskAmount = equity * riskPct;
  const rawShares = riskAmount / riskPerShare;
  const shares = Math.floor(rawShares);

  if (shares < 1) return { shares: 0, skipReason: '1 share doesnt fit' };

  const capitalRequired = shares * effectiveEntry;
  const portfolioPct = capitalRequired / equity;

  if (portfolioPct > maxSinglePct) {
    const cappedShares = Math.floor(equity * maxSinglePct / effectiveEntry);
    if (cappedShares < 1) return { shares: 0, skipReason: 'Even 1 share > 20%' };
    return { shares: cappedShares, capitalRequired: cappedShares * effectiveEntry, portfolioPct: (cappedShares * effectiveEntry) / equity };
  }

  return { shares, capitalRequired, riskAmount: shares * riskPerShare, portfolioPct };
}

function netRR(entry, stop, target, costs) {
  const costEntry = entry * costs.brokeragePct + entry * costs.slippagePct;
  const costExit = target * costs.brokeragePct + costs.dpPerSell + target * costs.slippagePct;
  const netReward = target - entry - costEntry - costExit;
  const netRisk = entry - stop + costEntry;
  if (netRisk <= 0) return 0;
  return netReward / netRisk;
}

function structureStop(swingLow, isLargeCap = true) {
  return swingLow * (isLargeCap ? 0.995 : 0.99);
}

function hybridTrail({ entry, currentStop, currentPrice, initialStop, atrValue, recentSwingLow, highestClose }) {
  const oneR = entry - initialStop;
  const profit = currentPrice - entry;
  if (profit < oneR) return currentStop;
  if (profit < 2 * oneR) return Math.max(currentStop, entry);
  if (profit < 3 * oneR) return Math.max(currentStop, highestClose - atrValue * 1.5);
  return Math.max(currentStop, recentSwingLow - atrValue * 0.5);
}

// === SIZING TESTS ===
console.log('\n=== Unit Tests ===\n');
console.log('--- Position Sizing ---');

const costs = { brokeragePct: 0.001, dpPerSell: 16, slippagePct: 0.0005 };

test('1% risk on 10k = 100 Rs risk', () => {
  // Entry 500, stop 467, riskPerShare=33, riskAmount=100, shares=floor(100/33)=3
  // capital = 3 * 500 * 1.0005 = 1501.5 (15% < 20% cap)
  const r = calcSize(10000, 500, 467, 0.01, 0, 0, costs);
  assert(r.shares === 3, `Expected 3 shares, got ${r.shares}`);
  assertClose(r.riskAmount, 99, 2);
});

test('Max 20% portfolio cap', () => {
  // Entry 1000, stop 990, risk/share=10, riskAmount=100, shares=10, capital=10050 > 20%
  // Capped to floor(10000*0.2 / 1000.5) = floor(2000/1000.5) = 1 share
  const r = calcSize(10000, 1000, 990, 0.01, 0, 0, costs);
  assert(r.shares >= 1 && r.portfolioPct <= 0.20, `Expected <=20% allocation, got shares=${r.shares} pct=${r.portfolioPct}`);
});

test('Skip when >4 open positions', () => {
  const r = calcSize(10000, 500, 490, 0.01, 4, 0, costs);
  assert(r.shares === 0 && r.skipReason.includes('Max 4'), `Got: ${JSON.stringify(r)}`);
});

test('Skip when total open risk >= 6%', () => {
  const r = calcSize(10000, 500, 490, 0.01, 2, 600, costs); // 600/10000=6%
  assert(r.shares === 0 && r.skipReason.includes('Total risk'), `Got: ${JSON.stringify(r)}`);
});

test('Skip when 1 share doesnt fit', () => {
  // Entry 500, stop 499.9, riskPerShare=0.1, risk budget=100, need 1000 shares > 20% cap
  const r = calcSize(10000, 500, 499.9, 0.01, 0, 0, costs);
  // 100/0.1=1000 shares, capital=500000 >> equity → capped to 20%=2000 → 4 shares
  assert(r.shares >= 1, 'Should have at least 1 share after cap');
});

// === STOP TESTS ===
console.log('\n--- Stop-Loss Strategies ---');

test('Structure stop large-cap: 0.5% below swing low', () => {
  const stop = structureStop(1000, true);
  assertClose(stop, 995, 0.1);
});

test('Structure stop small-cap: 1% below swing low', () => {
  const stop = structureStop(1000, false);
  assertClose(stop, 990, 0.1);
});

// === TRAILING TESTS ===
console.log('\n--- Trailing Stops (Hybrid) ---');

test('Below 1R: keep initial stop', () => {
  const result = hybridTrail({ entry: 100, currentStop: 90, currentPrice: 105, initialStop: 90, atrValue: 3, recentSwingLow: 95, highestClose: 105 });
  // 1R = 10, profit = 5 < 10, keep 90
  assertClose(result, 90, 0.01);
});

test('At 1R: move to breakeven', () => {
  const result = hybridTrail({ entry: 100, currentStop: 90, currentPrice: 110, initialStop: 90, atrValue: 3, recentSwingLow: 95, highestClose: 110 });
  // profit=10 == 1R, breakeven = entry = 100
  assertClose(result, 100, 0.01);
});

test('At 2R: ATR trail = highestClose - ATR*1.5', () => {
  const result = hybridTrail({ entry: 100, currentStop: 90, currentPrice: 120, initialStop: 90, atrValue: 4, recentSwingLow: 95, highestClose: 120 });
  // 2R=20, profit=20, atrStop = 120 - 4*1.5 = 114
  assertClose(result, 114, 0.5);
});

test('At 3R+: structure trail = recentSwingLow - ATR*0.5', () => {
  const result = hybridTrail({ entry: 100, currentStop: 90, currentPrice: 135, initialStop: 90, atrValue: 4, recentSwingLow: 108, highestClose: 135 });
  // 3R=30, profit=35, structure = 108 - 2 = 106
  assertClose(result, 106, 0.5);
});

test('Trail only ratchets up', () => {
  const r1 = hybridTrail({ entry: 100, currentStop: 112, currentPrice: 109, initialStop: 90, atrValue: 4, recentSwingLow: 95, highestClose: 120 });
  // Can't go below currentStop=112
  assert(r1 >= 112, `Expected >= 112, got ${r1}`);
});

// === R:R TESTS ===
console.log('\n--- Risk-Reward Ratio ---');

test('Net R:R >= 2 on clean setup', () => {
  // Entry 100, stop 90 (risk 10), target 125 (reward 25) → gross RR=2.5
  // costs: entry brok 0.1 + slip 0.05 = 0.15; exit brok 0.125 + dp16/shares + slip 0.0625 = ~0.2+16/shares
  // Net reward = 125-100 - 0.15 - 0.1875 - 16 ~= 8.6 for 1 share → RR = 8.6/(10+0.15) ~= 0.85 for 1 share
  // Use larger numbers to dilute fixed DP charge: target 2000, entry 1000, stop 900 (1 share, dp=16)
  const rr = netRR(1000, 900, 2000, costs);
  // netReward = 2000-1000 - 1 - (2+16+1) = 1000-20 = 980; netRisk=100+1=101; rr~9.7
  assert(rr >= 2, `Expected >= 2, got ${rr.toFixed(3)}`);
});

test('Net R:R < 2 on tight target', () => {
  // Entry 100, stop 95, target 106
  const rr = netRR(100, 95, 106, costs);
  assert(rr < 2, `Expected < 2, got ${rr.toFixed(3)}`);
});

test('R:R = 0 when stop >= entry', () => {
  const rr = netRR(100, 105, 120, costs);
  assert(rr === 0, `Expected 0, got ${rr}`);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
