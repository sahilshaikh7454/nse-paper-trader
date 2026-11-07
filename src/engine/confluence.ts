// Confluence scorer — from multi-timeframe-analysis skill
// Max 6 points; need >= 4 to trade

import { Candle, sma, rsi, macd, swingHighs, swingLows, fibLevels, avgVolume20 } from './indicators';
import { detectBullishDivergence } from './divergence';

export interface ScoreBreakdown {
  weeklyTrend: boolean;      // +1 weekly trend up
  dailySetup: boolean;        // +1 daily pullback setup (price near fib 38.2–61.8)
  dailyRsi: boolean;          // +1 RSI > 50 or rising from oversold on daily
  dailyMacd: boolean;         // +1 MACD > signal on daily
  keyLevel: boolean;          // +1 clear S/R level for stop or target
  volumeConfirm: boolean;     // +1 volume confirms (avg declining on pullback = healthy)
  score: number;
}

export function computeConfluence(
  weekly: Candle[],
  daily: Candle[],
  hourly: Candle[]
): ScoreBreakdown {
  const sb: ScoreBreakdown = {
    weeklyTrend: false,
    dailySetup: false,
    dailyRsi: false,
    dailyMacd: false,
    keyLevel: false,
    volumeConfirm: false,
    score: 0,
  };

  if (weekly.length < 20 || daily.length < 50) return sb;

  // 1. Weekly trend: Higher Highs + Higher Lows & price > SMA20W
  const wCloses = weekly.map(c => c.close);
  const wSma20 = sma(wCloses, 20);
  const wLen = weekly.length;
  const wHighs = swingHighs(weekly, 3);
  const wLows = swingLows(weekly, 3);
  const lastWHigh = [...wHighs].reverse().find(v => !isNaN(v)) ?? NaN;
  const prevWHighIdx = wHighs.findLastIndex((v, i) => !isNaN(v) && i < wHighs.findLastIndex(x => !isNaN(x)));
  const prevWHigh = wHighs[prevWHighIdx] ?? NaN;
  const lastWLow = [...wLows].reverse().find(v => !isNaN(v)) ?? NaN;
  const prevWLow = wLows[wLows.findLastIndex((v, i) => !isNaN(v) && i < wLows.findLastIndex(x => !isNaN(x)))] ?? NaN;

  const weeklyUp =
    weekly[wLen - 1].close > (wSma20[wLen - 1] || 0) &&
    (!isNaN(lastWHigh) && !isNaN(prevWHigh) && lastWHigh > prevWHigh) &&
    (!isNaN(lastWLow) && !isNaN(prevWLow) && lastWLow > prevWLow);

  sb.weeklyTrend = weeklyUp;

  // 2. Daily pullback setup: price in fib 38.2–61.8 zone of recent swing
  const dLen = daily.length;
  const dSwingHighs = swingHighs(daily, 5);
  const dSwingLows = swingLows(daily, 5);
  const lastSwingHigh = [...dSwingHighs].reverse().find(v => !isNaN(v)) ?? NaN;
  const lastSwingLow = [...dSwingLows].reverse().find(v => !isNaN(v)) ?? NaN;
  const curPrice = daily[dLen - 1].close;

  if (!isNaN(lastSwingHigh) && !isNaN(lastSwingLow) && lastSwingHigh > lastSwingLow) {
    const fib = fibLevels(lastSwingLow, lastSwingHigh);
    sb.dailySetup = curPrice >= fib.r618 && curPrice <= fib.r382;
  }

  // 3. Daily RSI > 50 or rising from oversold
  const dCloses = daily.map(c => c.close);
  const dRsi = rsi(dCloses);
  const lastRsi = dRsi[dLen - 1];
  const prevRsi = dRsi[dLen - 2];
  sb.dailyRsi = !isNaN(lastRsi) && (lastRsi > 50 || (prevRsi < 35 && lastRsi > prevRsi));

  // Also check RSI divergence bonus (counts for dailyRsi if bullish divergence present)
  const divType = detectBullishDivergence(daily);
  if (divType === 'bullish_regular' || divType === 'bullish_hidden') {
    sb.dailyRsi = true;
  }

  // 4. Daily MACD line > signal
  const dMacd = macd(dCloses);
  const lm = dMacd.macd[dLen - 1];
  const ls = dMacd.signal[dLen - 1];
  sb.dailyMacd = !isNaN(lm) && !isNaN(ls) && lm > ls;

  // 5. Key S/R level: has at least one valid swing high as target
  sb.keyLevel = !isNaN(lastSwingHigh) && !isNaN(lastSwingLow);

  // 6. Volume: declining volume on pullback (bullish pullback characteristic)
  const vol = daily.slice(-5).map(c => c.volume);
  const avgVol = avgVolume20(daily, dLen - 1);
  const recentAvg = vol.reduce((a, b) => a + b, 0) / vol.length;
  sb.volumeConfirm = recentAvg < avgVol * 0.9; // declining volume on pullback

  sb.score =
    (sb.weeklyTrend ? 1 : 0) +
    (sb.dailySetup ? 1 : 0) +
    (sb.dailyRsi ? 1 : 0) +
    (sb.dailyMacd ? 1 : 0) +
    (sb.keyLevel ? 1 : 0) +
    (sb.volumeConfirm ? 1 : 0);

  return sb;
}

