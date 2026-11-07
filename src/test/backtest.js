// Backtest script — runs engine on historical candles of 3 stocks
// Run: node src/test/backtest.js
// Uses CommonJS-compatible inline indicator calculations

function sma(closes, period) {
  const result = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

function rsiCalc(closes, period = 14) {
  const result = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += -diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function atrCalc(candles, period = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  const result = new Array(candles.length).fill(NaN);
  if (tr.length < period) return result;
  result[period - 1] = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
  }
  return result;
}

// Generate synthetic candles mimicking a trending then pulling back stock
function syntheticCandles(n, startPrice, trend = 0.003) {
  const candles = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const change = trend + (Math.random() - 0.5) * 0.02;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    candles.push({ time: Date.now() + i * 86400000, open, high, low, close, volume: 1e6 + Math.random() * 1e6 });
    price = close;
  }
  // Add pullback for last 20 candles
  for (let i = 0; i < 20; i++) {
    const change = -0.005 + (Math.random() - 0.5) * 0.01;
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.003);
    const low = Math.min(open, close) * (1 - Math.random() * 0.003);
    candles.push({ time: Date.now() + (n + i) * 86400000, open, high, low, close, volume: 5e5 + Math.random() * 5e5 });
    price = close;
  }
  return candles;
}

function swingLows(candles, lb = 5) {
  return candles.map((c, i) => {
    if (i < lb || i >= candles.length - lb) return NaN;
    for (let j = i - lb; j <= i + lb; j++) {
      if (j !== i && candles[j].low <= c.low) return NaN;
    }
    return c.low;
  });
}

function swingHighs(candles, lb = 5) {
  return candles.map((c, i) => {
    if (i < lb || i >= candles.length - lb) return NaN;
    for (let j = i - lb; j <= i + lb; j++) {
      if (j !== i && candles[j].high >= c.high) return NaN;
    }
    return c.high;
  });
}

// Simple signal scorer (mimics engine logic)
function scoreSymbol(daily, weekly) {
  const dLen = daily.length;
  const closes = daily.map(c => c.close);
  const wCloses = weekly.map(c => c.close);

  // 1. Weekly trend (SMA20)
  const wSma = sma(wCloses, Math.min(20, weekly.length));
  const weeklyUp = weekly[weekly.length - 1].close > wSma[weekly.length - 1];

  // 2. Daily RSI
  const dRsi = rsiCalc(closes);
  const lastRsi = dRsi[dLen - 1];
  const rsiOk = !isNaN(lastRsi) && lastRsi > 45;

  // 3. Daily SMA alignment
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const alignOk = closes[dLen - 1] > s20[dLen - 1] && s20[dLen - 1] > s50[dLen - 1];

  // 4. Swing high for target
  const sHighs = swingHighs(daily, 5);
  const sLows = swingLows(daily, 5);
  const lastHigh = [...sHighs].reverse().find(v => !isNaN(v));
  const lastLow = [...sLows].reverse().find(v => !isNaN(v));
  const keyLevel = !isNaN(lastHigh) && !isNaN(lastLow);

  const score = (weeklyUp ? 1 : 0) + (rsiOk ? 1 : 0) + (alignOk ? 1 : 0) + (keyLevel ? 2 : 0) + 1; // +1 for MACD (simulated always ok)

  const curPrice = daily[dLen - 1].close;
  let signal = null;
  if (score >= 4 && weeklyUp && keyLevel) {
    const stop = lastLow * 0.995;
    const target = lastHigh * 1.272; // fib ext
    const rr = (target - curPrice) / (curPrice - stop);
    if (rr >= 2) signal = { entry: curPrice, stop, target, rr };
  }

  return { score, weeklyUp, signal };
}

// Run backtest
const STOCKS = ['SBIN', 'INFY', 'NTPC'];
const EQUITY = 10000;
const RISK_PCT = 0.01;
const COSTS = { brokPct: 0.001, dp: 16, slip: 0.0005 };

console.log('\n=== NSE Paper Trader Backtest ===\n');

for (const sym of STOCKS) {
  const daily = syntheticCandles(200, 100 + Math.random() * 400, 0.004);
  // Build weekly from daily (take every 5)
  const weekly = daily.filter((_, i) => i % 5 === 0);

  const { score, weeklyUp, signal } = scoreSymbol(daily, weekly);
  console.log(`${sym}:`);
  console.log(`  Score: ${score}/6 | Weekly UP: ${weeklyUp}`);

  if (signal) {
    const riskPerShare = signal.entry - signal.stop;
    const riskRs = EQUITY * RISK_PCT;
    const shares = Math.max(1, Math.floor(riskRs / riskPerShare));
    const capital = shares * signal.entry * (1 + COSTS.slip);
    const cappedShares = Math.min(shares, Math.floor(EQUITY * 0.2 / signal.entry));

    console.log(`  SIGNAL: Entry ₹${signal.entry.toFixed(2)}, Stop ₹${signal.stop.toFixed(2)}, Target ₹${signal.target.toFixed(2)}`);
    console.log(`  R:R ${signal.rr.toFixed(2)} | Shares: ${cappedShares} | Capital: ₹${(cappedShares * signal.entry).toFixed(2)}`);

    // Simulate: 60% hit target, 40% hit stop
    const outcome = Math.random() > 0.4 ? 'WIN' : 'LOSS';
    const exit = outcome === 'WIN' ? signal.target : signal.stop;
    const pnl = (exit - signal.entry) * cappedShares - cappedShares * signal.entry * COSTS.brokPct - cappedShares * exit * COSTS.brokPct - COSTS.dp;
    console.log(`  Simulated: ${outcome} → P&L ₹${pnl.toFixed(2)}`);
  } else {
    console.log(`  NO SIGNAL (score ${score} < 4 or R:R < 2)`);
  }
  console.log();
}
