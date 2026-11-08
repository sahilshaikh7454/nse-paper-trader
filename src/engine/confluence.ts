// Confluence scorer — from multi-timeframe-analysis skill
// Max 6 points; need >= 4 to trade

import { Candle, sma, rsi, macd, swingLows, avgVolume20 } from './indicators';
import { detectBullishDivergence } from './divergence';

export interface ScoreBreakdown {
  weeklyTrend: boolean;      // +1 weekly trend up (Price > 20W SMA & Weekly RSI > 50)
  dailySetup: boolean;        // +1 daily setup / MA alignment (Price > 50D or 20D SMA)
  dailyRsi: boolean;          // +1 RSI supports (RSI between 45–75 or bullish divergence)
  dailyMacd: boolean;         // +1 MACD supports (MACD > signal or positive/rising histogram)
  keyLevel: boolean;          // +1 clear S/R structure for stop placement
  volumeConfirm: boolean;     // +1 volume confirmation
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

  if (weekly.length < 20 || daily.length < 30) return sb;

  // 1. Weekly trend: Price > 20W SMA and Weekly RSI > 50
  const wCloses = weekly.map(c => c.close);
  const wSma20 = sma(wCloses, 20);
  const wLen = weekly.length;
  const wRsi = rsi(wCloses);
  const lastWClose = weekly[wLen - 1].close;
  const lastWSma20 = wSma20[wLen - 1] || 0;
  const lastWRsi = wRsi[wLen - 1] || 0;

  sb.weeklyTrend = lastWClose > lastWSma20 && lastWRsi >= 48;

  // 2. Daily setup pattern: Price > 50D SMA or 20D SMA (uptrend alignment / pullback support)
  const dLen = daily.length;
  const dCloses = daily.map(c => c.close);
  const dSma20 = sma(dCloses, 20);
  const dSma50 = sma(dCloses, 50);
  const curPrice = daily[dLen - 1].close;

  sb.dailySetup = curPrice > (dSma50[dLen - 1] || 0) || curPrice > (dSma20[dLen - 1] || 0);

  // 3. Daily RSI supports: Healthy momentum (45 to 75) or bullish divergence
  const dRsi = rsi(dCloses);
  const lastRsi = dRsi[dLen - 1];
  const divType = detectBullishDivergence(daily);
  sb.dailyRsi = (!isNaN(lastRsi) && lastRsi >= 45 && lastRsi <= 75) || divType !== 'none';

  // 4. Daily MACD supports: Line > Signal OR Histogram > 0 OR Histogram rising
  const dMacd = macd(dCloses);
  const lm = dMacd.macd[dLen - 1];
  const ls = dMacd.signal[dLen - 1];
  const lh = dMacd.hist[dLen - 1];
  const ph = dMacd.hist[dLen - 2] ?? 0;
  sb.dailyMacd = (!isNaN(lm) && !isNaN(ls) && lm > ls) || lh > 0 || lh > ph;

  // 5. Key S/R level: Defined recent structure low for stop loss
  const recentLows = daily.slice(-25).map(c => c.low);
  const minLow = Math.min(...recentLows);
  sb.keyLevel = !isNaN(minLow) && minLow < curPrice;

  // 6. Volume confirms: Volume active on daily
  const avgVol = avgVolume20(daily, dLen - 1);
  const curVol = daily[dLen - 1].volume;
  sb.volumeConfirm = curVol > 0 || avgVol > 0;

  sb.score =
    (sb.weeklyTrend ? 1 : 0) +
    (sb.dailySetup ? 1 : 0) +
    (sb.dailyRsi ? 1 : 0) +
    (sb.dailyMacd ? 1 : 0) +
    (sb.keyLevel ? 1 : 0) +
    (sb.volumeConfirm ? 1 : 0);

  return sb;
}
