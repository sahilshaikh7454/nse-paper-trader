// Main trading engine — orchestrates all skills
// Runs: on open, every 60s during market hours, or on-demand

import { fetchCandles, canTrade } from './data';
import { sma, rsi, atr, swingHighs, swingLows, fibLevels } from './indicators';
import { computeConfluence } from './confluence';
import { calcSize, netRR, structureStop, hybridTrail, type CostSettings } from './sizing';
import { angelPlaceOrder } from './angelone';
import { useStore, type Position, type TradeRecord } from '../store';

const DEFAULT_WATCHLIST = [
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
  currentPrice?: number;
  stop?: number;
  target1?: number;
  target2?: number;
  rr?: number;
}

// --- NIFTY weekly trend gate ---
export async function niftyWeeklyUp(): Promise<boolean> {
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
export async function analyzeSymbol(
  symbol: string,
  settings: { riskPct: number; costs: CostSettings }
): Promise<{
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
      scan.reason = 'Insufficient candle data';
      return { scan };
    }

    const dLen = daily.length;
    const curPrice = daily[dLen - 1].close;
    scan.currentPrice = curPrice;

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

    // Confluence score (0 to 6)
    const sb = computeConfluence(weekly, daily, hourly);
    scan.score = sb.score;

    if (scan.score < MIN_SCORE) {
      scan.status = 'WAIT';
      scan.reason = `Score ${scan.score}/6 < ${MIN_SCORE}`;
      return { scan };
    }

    // Build trade signal
    const dSwingLows = swingLows(daily, 5);
    const dSwingHighs = swingHighs(daily, 5);
    const lastSwingLow = [...dSwingLows].reverse().find(v => !isNaN(v)) ?? NaN;
    const lastSwingHigh = [...dSwingHighs].reverse().find(v => !isNaN(v)) ?? NaN;

    if (isNaN(lastSwingLow) || isNaN(lastSwingHigh)) {
      scan.reason = 'No clear swing levels';
      return { scan };
    }

    const fib = fibLevels(lastSwingLow, lastSwingHigh);
    const stop = structureStop(lastSwingLow, true);
    const target1 = fib.ext1272;
    const target2 = fib.ext1618;
    const entry = curPrice;

    scan.stop = stop;
    scan.target1 = target1;
    scan.target2 = target2;

    const rr = netRR(entry, stop, target1, settings.costs);
    scan.rr = rr;

    if (rr < MIN_RR) {
      scan.status = 'SKIP';
      scan.reason = `Net R:R ${rr.toFixed(2)} < ${MIN_RR}`;
      return { scan };
    }

    // Check 1H entry confirmation (hourly RSI >= 45)
    if (hourly.length >= 14) {
      const hCloses = hourly.map(c => c.close);
      const hRsi = rsi(hCloses);
      const hLen = hourly.length;
      if (hRsi[hLen - 1] < 45) {
        scan.status = 'WAIT';
        scan.reason = `1H RSI not confirmed (${hRsi[hLen - 1]?.toFixed(0)} < 45)`;
        return { scan };
      }
    }

    scan.status = 'BUY';
    scan.reason = `Score ${scan.score}/6, R:R ${rr.toFixed(2)}`;

    return {
      scan,
      signal: { entry, stop, target1, target2, shares: 0, rr },
    };
  } catch (e: any) {
    scan.reason = `Error: ${e?.message || e}`;
    return { scan };
  }
}

// --- Scan entire watchlist ---
export async function scanWatchlist(customWatchlist?: string[]): Promise<ScanResult[]> {
  const store = useStore.getState();
  const list = customWatchlist || store.settings.watchlist || DEFAULT_WATCHLIST;
  const costs = store.settings.costs;
  const riskPct = store.settings.riskPct / 100;

  const isNiftyUp = await niftyWeeklyUp();
  const results: ScanResult[] = [];

  for (const symbol of list) {
    // If already open
    if (store.positions.some(p => p.symbol === symbol)) {
      results.push({
        symbol,
        weeklyBias: 'UP',
        score: 0,
        status: 'SKIP',
        reason: 'Already in open positions',
      });
      continue;
    }

    const { scan } = await analyzeSymbol(symbol, { riskPct, costs });

    // If stock has BUY setup but NIFTY is not trending up, downgrade to WAIT
    if (scan.status === 'BUY' && !isNiftyUp) {
      scan.status = 'WAIT';
      scan.reason = `Setup ready (Score ${scan.score}/6) but NIFTY weekly trend DOWN`;
    }

    results.push(scan);
  }

  store.setScanResults(results);
  return results;
}

// --- Manage open positions (trailing + exit) ---
export async function managePositions(): Promise<void> {
  const store = useStore.getState();
  const positions = store.positions;
  if (positions.length === 0) return;

  for (const pos of positions) {
    try {
      const daily = await fetchCandles(pos.symbol, '1d', '60d');
      if (daily.length < 5) continue;
      const dLen = daily.length;
      const curPrice = daily[dLen - 1].close;

      // Update live price for real-time P&L in Dashboard
      store.updatePositionPrice(pos.symbol, curPrice);

      const closes = daily.map(c => c.close);
      const atrArr = atr(daily);
      const atrVal = atrArr[dLen - 1] || (curPrice * 0.015);
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

      // Check Stop hit
      if (curPrice <= updatedStop) {
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

        // Real order execution if in REAL mode
        if (store.mode === 'REAL' && store.settings.angelOne.connected) {
          const ord = await angelPlaceOrder(store.settings.angelOne, pos.symbol, pos.shares, 'SELL');
          store.addLog(
            `[REAL SELL STOP] ${pos.symbol} x${pos.shares} - ${ord.success ? 'Order ID: ' + ord.orderId : 'Error: ' + ord.error}`,
            ord.success ? 'trade' : 'error'
          );
        } else {
          store.addLog(`[PAPER STOP] Exit ${pos.symbol} x${pos.shares} @ ₹${exitPrice.toFixed(2)} (P&L: ₹${pnl.toFixed(2)})`, 'trade');
        }

        store.closePosition(pos.symbol, exitPrice, record);
        continue;
      }

      // Check Target 1 hit
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

        // Real order execution if in REAL mode
        if (store.mode === 'REAL' && store.settings.angelOne.connected) {
          const ord = await angelPlaceOrder(store.settings.angelOne, pos.symbol, pos.shares, 'SELL');
          store.addLog(
            `[REAL SELL TARGET] ${pos.symbol} x${pos.shares} - ${ord.success ? 'Order ID: ' + ord.orderId : 'Error: ' + ord.error}`,
            ord.success ? 'trade' : 'error'
          );
        } else {
          store.addLog(`[PAPER TARGET] Exit ${pos.symbol} x${pos.shares} @ ₹${exitPrice.toFixed(2)} (P&L: ₹${pnl.toFixed(2)})`, 'trade');
        }

        store.closePosition(pos.symbol, exitPrice, record);
        continue;
      }

      // Ratchet stop up if changed
      if (updatedStop > pos.stop) {
        store.updatePositionStop(pos.symbol, updatedStop);
        store.addLog(`[TRAIL] ${pos.symbol} stop raised to ₹${updatedStop.toFixed(2)}`, 'info');
      }
    } catch (e: any) {
      console.warn(`[Position Manage] Error on ${pos.symbol}:`, e);
    }
  }
}

// --- Safety checks ---
function safetyCheck(store: ReturnType<typeof useStore.getState>): { paused: boolean; reason: string } {
  const { equity, peakEquity, settings } = store;
  const startEquity = settings.startCapital;

  // Daily loss > 2% of starting capital
  const today = new Date().toISOString().slice(0, 10);
  const todayPnl = store.trades
    .filter(t => t.date.startsWith(today))
    .reduce((s, t) => s + t.pnl, 0);

  if (todayPnl < -startEquity * 0.02) {
    return { paused: true, reason: `Daily loss of ₹${Math.abs(todayPnl).toFixed(2)} > 2% max limit` };
  }

  // Drawdown from peak > 10%
  if (equity < peakEquity * 0.90) {
    const dd = ((peakEquity - equity) / peakEquity) * 100;
    return { paused: true, reason: `Drawdown of ${dd.toFixed(1)}% > 10% max limit` };
  }

  return { paused: false, reason: '' };
}

// --- Main engine tick ---
export async function runEngineTick(): Promise<ScanResult[]> {
  const store = useStore.getState();

  // Always manage open positions and update live prices
  await managePositions();

  // Evaluate safety limits
  const safety = safetyCheck(store);
  if (safety.paused) {
    store.setSafetyPause(true, safety.reason);
    store.addLog(`Safety limit triggered: ${safety.reason}`, 'warn');
    return store.lastScanResults;
  }

  // If autoTrade is disabled: simply run scan so UI has updated watchlist status
  if (!store.autoTrade) {
    return await scanWatchlist();
  }

  // Auto-trade is ON: verify market hours window (9:30 - 15:00 IST)
  if (!canTrade()) {
    store.addLog('Outside trading window (9:30–15:00 IST) — scanning only', 'info');
    return await scanWatchlist();
  }

  // Check NIFTY weekly trend gate
  const niftyUp = await niftyWeeklyUp();
  if (!niftyUp) {
    store.addLog('NIFTY weekly trend is DOWN — new entries paused per rules', 'warn');
    return await scanWatchlist();
  }

  // Run full scan and check for BUY setups
  const results = await scanWatchlist();
  const costs = store.settings.costs;
  const riskPct = store.settings.riskPct / 100;

  // Calculate current total open risk in Rupees
  const totalOpenRiskRs = store.positions.reduce(
    (s, p) => s + p.shares * Math.max(0, p.entry - p.stop),
    0
  );

  for (const scan of results) {
    if (scan.status !== 'BUY') continue;

    // Check if max 4 positions reached
    if (store.positions.length >= 4) {
      store.addLog(`Skipped ${scan.symbol}: Max 4 positions already open`, 'info');
      break;
    }

    const { signal } = await analyzeSymbol(scan.symbol, { riskPct, costs });
    if (!signal) continue;

    // Position sizing (1% risk, max 20% equity, total risk <= 6%)
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
      store.addLog(`Sizing skip for ${scan.symbol}: ${sizeResult.skipReason || '0 shares'}`, 'info');
      continue;
    }

    const fillPrice = signal.entry * (1 + costs.slippagePct);
    const totalCost = fillPrice * sizeResult.shares * (1 + costs.brokeragePct);

    if (totalCost > store.equity) {
      store.addLog(`Insufficient wallet cash for ${scan.symbol} (Req: ₹${totalCost.toFixed(0)}, Avail: ₹${store.equity.toFixed(0)})`, 'warn');
      continue;
    }

    const newPos: Position = {
      symbol: scan.symbol,
      entry: fillPrice,
      shares: sizeResult.shares,
      stop: signal.stop,
      initialStop: signal.stop,
      target1: signal.target1,
      target2: signal.target2,
      initialRisk: sizeResult.riskAmount,
      entryReason: `Score ${scan.score}/6, R:R ${signal.rr.toFixed(1)}`,
      openDate: new Date().toISOString(),
      currentPrice: fillPrice,
    };

    if (store.mode === 'REAL') {
      if (!store.settings.angelOne.connected) {
        store.addLog(`[REAL MODE] Cannot enter ${scan.symbol}: Angel One account not connected`, 'error');
        continue;
      }

      const ord = await angelPlaceOrder(
        store.settings.angelOne,
        scan.symbol,
        sizeResult.shares,
        'BUY'
      );

      if (ord.success) {
        store.openPosition(newPos, totalCost);
        store.addLog(`[REAL BUY] ${scan.symbol} x${sizeResult.shares} @ ₹${fillPrice.toFixed(2)} (Order ID: ${ord.orderId})`, 'trade');
      } else {
        store.addLog(`[REAL ORDER FAILED] ${scan.symbol}: ${ord.error}`, 'error');
      }
    } else {
      // PAPER MODE
      store.openPosition(newPos, totalCost);
      store.addLog(`[PAPER BUY] ${scan.symbol} x${sizeResult.shares} @ ₹${fillPrice.toFixed(2)} (Alloc: ₹${totalCost.toFixed(0)})`, 'trade');
    }
  }

  return results;
}

export { DEFAULT_WATCHLIST as WATCHLIST };
