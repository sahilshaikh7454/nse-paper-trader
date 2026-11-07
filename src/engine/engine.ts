// Main trading engine — orchestrates all skills
// Runs: on open, every 60s during market hours

import { fetchCandles, canTrade } from './data';
import { sma, rsi, atr, swingHighs, swingLows, fibLevels, type Candle } from './indicators';
import { computeConfluence } from './confluence';
import { calcSize, netRR, structureStop, hybridTrail, type CostSettings } from './sizing';
import { useStore, type Position, type TradeRecord } from '../store';

const WATCHLIST = [
  'ITC.NS','SBIN.NS','NTPC.NS','ONGC.NS','POWERGRID.NS','COALINDIA.NS',
  'TATASTEEL.NS','HINDALCO.NS','WIPRO.NS','BPCL.NS','IOC.NS','GAIL.NS',
  'PNB.NS','BANKBARODA.NS','HDFCBANK.NS','ICICIBANK.NS','INFY.NS',
  'AXISBANK.NS','NIFTYBEES.NS','BANKBEES.NS','GOLDBEES.NS',
];
const NIFTY = '^NSEI';
const MIN_SCORE = 4;
const MIN_RR = 2;

export interface ScanResult {
  symbol: string;
  weeklyBias: 'UP' | 'DOWN' | 'NEUTRAL';
  score: number;
  status: 'BUY' | 'WAIT' | 'SKIP';
  reason: string;
}

// --- NIFTY weekly trend gate ---
async function niftyWeeklyUp(): Promise<boolean> {
  try {
    const weekly = await fetchCandles(NIFTY, '1wk', '1y');
    if (weekly.length < 20) return false;
    const closes = weekly.map(c => c.close);
    const s20 = sma(closes, 20);
    const n = weekly.length;
    return weekly[n - 1].close > s20[n - 1];
  } catch {
    return false;
  }
}

// --- Per-symbol analysis ---
async function analyzeSymbol(symbol: string, settings: { riskPct: number; costs: CostSettings }): Promise<{
  scan: ScanResult;
  signal?: {
    entry: number;
    stop: number;
    target1: number;
    target2: number;
    shares: number;
    rr: number;
  };
}> {
  const scan: ScanResult = { symbol, weeklyBias: 'NEUTRAL', score: 0, status: 'SKIP', reason: '' };

  try {
    const [weekly, daily, hourly] = await Promise.all([
      fetchCandles(symbol, '1wk', '2y'),
      fetchCandles(symbol, '1d', '1y'),
      fetchCandles(symbol, '60m', '30d'),
    ]);

    if (weekly.length < 20 || daily.length < 50) {
      scan.reason = 'Insufficient data';
      return { scan };
    }

    // Weekly bias
    const wCloses = weekly.map(c => c.close);
    const wSma20 = sma(wCloses, 20);
    const wLen = weekly.length;
    const wRsi = rsi(wCloses);
    scan.weeklyBias =
      weekly[wLen - 1].close > wSma20[wLen - 1] && wRsi[wLen - 1] > 50
        ? 'UP'
        : weekly[wLen - 1].close < wSma20[wLen - 1] && wRsi[wLen - 1] < 50
        ? 'DOWN'
        : 'NEUTRAL';

    if (scan.weeklyBias !== 'UP') {
      scan.reason = `Weekly bias: ${scan.weeklyBias}`;
      scan.status = 'SKIP';
      return { scan };
    }

    // Confluence score
    const sb = computeConfluence(weekly, daily, hourly);
    scan.score = sb.score;

    if (scan.score < MIN_SCORE) {
      scan.status = 'WAIT';
      scan.reason = `Score ${scan.score}/6 < ${MIN_SCORE}`;
      return { scan };
    }

    // Build trade signal
    const dLen = daily.length;
    const dSwingLows = swingLows(daily, 5);
    const dSwingHighs = swingHighs(daily, 5);
    const lastSwingLow = [...dSwingLows].reverse().find(v => !isNaN(v)) ?? NaN;
    const lastSwingHigh = [...dSwingHighs].reverse().find(v => !isNaN(v)) ?? NaN;
    const curPrice = daily[dLen - 1].close;

    if (isNaN(lastSwingLow) || isNaN(lastSwingHigh)) {
      scan.reason = 'No swing levels found';
      return { scan };
    }

    const fib = fibLevels(lastSwingLow, lastSwingHigh);
    const stop = structureStop(lastSwingLow, true);
    const target1 = fib.ext1272;
    const target2 = fib.ext1618;
    const entry = curPrice;

    const rr = netRR(entry, stop, target1, settings.costs);
    if (rr < MIN_RR) {
      scan.status = 'SKIP';
      scan.reason = `Net R:R ${rr.toFixed(2)} < ${MIN_RR}`;
      return { scan };
    }

    // Check 1H/4H entry confirmation (hourly RSI > 50)
    if (hourly.length >= 14) {
      const hCloses = hourly.map(c => c.close);
      const hRsi = rsi(hCloses);
      const hLen = hourly.length;
      if (hRsi[hLen - 1] < 45) {
        scan.status = 'WAIT';
        scan.reason = '1H RSI not confirmed (< 45)';
        return { scan };
      }
    }

    scan.status = 'BUY';
    scan.reason = `Score ${scan.score}/6, R:R ${rr.toFixed(2)}`;

    return {
      scan,
      signal: { entry, stop, target1, target2, shares: 0, rr },
    };
  } catch (e) {
    scan.reason = `Error: ${e}`;
    return { scan };
  }
}

// --- Manage open positions (trailing + exit) ---
async function managePositions() {
  const store = useStore.getState();
  const positions = store.positions;
  if (positions.length === 0) return;

  for (const pos of positions) {
    try {
      const daily = await fetchCandles(pos.symbol, '1d', '60d');
      if (daily.length < 20) continue;
      const dLen = daily.length;
      const curPrice = daily[dLen - 1].close;
      const closes = daily.map(c => c.close);
      const atrArr = atr(daily);
      const atrVal = atrArr[dLen - 1];
      const swLows = swingLows(daily, 5);
      const recentSwLow = [...swLows].reverse().find(v => !isNaN(v)) ?? pos.stop;
      const highestClose = Math.max(...closes.slice(-20));

      const newStop = hybridTrail({
        entry: pos.entry,
        currentStop: pos.stop,
        currentPrice: curPrice,
        initialStop: pos.initialStop,
        atrValue: atrVal,
        recentSwingLow: recentSwLow,
        highestClose,
      });

      const updatedStop = Math.max(pos.stop, newStop); // only ratchet up

      // Check stop hit (use closing price trigger)
      if (curPrice <= updatedStop) {
        // Exit trade
        const exitPrice = curPrice * (1 - store.settings.costs.slippagePct);
        const pnl = (exitPrice - pos.entry) * pos.shares
          - pos.shares * pos.entry * store.settings.costs.brokeragePct
          - pos.shares * exitPrice * store.settings.costs.brokeragePct
          - store.settings.costs.dpPerSell;

        const rResult = pnl / (pos.initialRisk || 100);
        const record: TradeRecord = {
          id: `${pos.symbol}-${Date.now()}`,
          symbol: pos.symbol,
          entry: pos.entry,
          exit: exitPrice,
          shares: pos.shares,
          entryReason: pos.entryReason,
          exitReason: 'Stop hit',
          pnl,
          rResult,
          date: new Date().toISOString(),
        };
        store.closePosition(pos.symbol, exitPrice, record);
        continue;
      }

      // Check target hit
      if (curPrice >= pos.target1) {
        const exitPrice = curPrice * (1 - store.settings.costs.slippagePct);
        const pnl = (exitPrice - pos.entry) * pos.shares
          - pos.shares * pos.entry * store.settings.costs.brokeragePct
          - pos.shares * exitPrice * store.settings.costs.brokeragePct
          - store.settings.costs.dpPerSell;
        const rResult = pnl / (pos.initialRisk || 100);
        const record: TradeRecord = {
          id: `${pos.symbol}-${Date.now()}`,
          symbol: pos.symbol,
          entry: pos.entry,
          exit: exitPrice,
          shares: pos.shares,
          entryReason: pos.entryReason,
          exitReason: 'Target 1 hit',
          pnl,
          rResult,
          date: new Date().toISOString(),
        };
        store.closePosition(pos.symbol, exitPrice, record);
        continue;
      }

      store.updatePositionStop(pos.symbol, updatedStop);
    } catch {
      // Skip on error, don't trade stale data
    }
  }
}

// --- Safety checks ---
function safetyCheck(store: ReturnType<typeof useStore.getState>): { paused: boolean; reason: string } {
  const { equity, peakEquity, settings } = store;
  const startEquity = settings.startCapital;

  // Daily loss > 2%
  const todayPnl = store.trades
    .filter(t => t.date.startsWith(new Date().toISOString().slice(0, 10)))
    .reduce((s, t) => s + t.pnl, 0);
  if (todayPnl < -startEquity * 0.02) {
    return { paused: true, reason: 'Daily loss > 2% — paused' };
  }

  // Drawdown from peak > 10%
  if (equity < peakEquity * 0.90) {
    return { paused: true, reason: 'Drawdown > 10% from peak — paused' };
  }

  return { paused: false, reason: '' };
}

// --- Main engine tick ---
export async function runEngineTick(): Promise<ScanResult[]> {
  const store = useStore.getState();
  if (!store.autoTrade || store.mode !== 'PAPER') return [];

  const safety = safetyCheck(store);
  if (safety.paused) {
    console.log('[Engine] Paused:', safety.reason);
    return [];
  }

  // Manage existing positions first
  await managePositions();

  // Check if we can enter new trades
  if (!canTrade()) return [];

  const niftyUp = await niftyWeeklyUp();
  if (!niftyUp) return [];

  const results: ScanResult[] = [];
  const costs = store.settings.costs;
  const riskPct = store.settings.riskPct / 100;

  // Current open risk
  const totalOpenRiskRs = store.positions.reduce((s, p) => s + (p.shares * (p.entry - p.stop)), 0);

  for (const symbol of WATCHLIST) {
    // Skip already open
    if (store.positions.find(p => p.symbol === symbol)) {
      results.push({ symbol, weeklyBias: 'UP', score: 0, status: 'SKIP', reason: 'Already open' });
      continue;
    }

    const { scan, signal } = await analyzeSymbol(symbol, { riskPct, costs });
    results.push(scan);

    if (scan.status === 'BUY' && signal) {
      // Position sizing
      const sizeResult = calcSize(
        store.equity,
        signal.entry,
        signal.stop,
        riskPct,
        store.positions.length,
        totalOpenRiskRs,
        costs
      );

      if (sizeResult.shares < 1 || sizeResult.skipReason) {
        results[results.length - 1] = { ...scan, status: 'SKIP', reason: sizeResult.skipReason || 'Sizing failed' };
        continue;
      }

      // Paper fill: current price + slippage
      const fillPrice = signal.entry * (1 + costs.slippagePct);
      const cost = fillPrice * sizeResult.shares
        + sizeResult.shares * fillPrice * costs.brokeragePct;

      if (cost > store.equity) {
        results[results.length - 1] = { ...scan, status: 'SKIP', reason: 'Insufficient equity' };
        continue;
      }

      const newPos: Position = {
        symbol,
        entry: fillPrice,
        shares: sizeResult.shares,
        stop: signal.stop,
        initialStop: signal.stop,
        target1: signal.target1,
        target2: signal.target2,
        initialRisk: sizeResult.riskAmount,
        entryReason: `Score ${scan.score}/6, R:R ${signal.rr.toFixed(1)}`,
        openDate: new Date().toISOString(),
      };

      store.openPosition(newPos, cost);
    }
  }

  return results;
}

export { WATCHLIST };

