// RSI divergence detection (from rsi-divergence skill)
// Bullish regular: price LL, RSI HL → potential reversal UP
// Bullish hidden:  price HL, RSI LL → trend continues UP

import { Candle, rsi, swingLows } from './indicators';

export type DivergenceType = 'bullish_regular' | 'bullish_hidden' | 'none';

export function detectBullishDivergence(candles: Candle[]): DivergenceType {
  if (candles.length < 30) return 'none';

  const closes = candles.map(c => c.close);
  const rsiVals = rsi(closes);
  const swLows = swingLows(candles, 5);

  // Find last 2 swing lows with valid RSI
  const pivots: { idx: number; price: number; rsiVal: number }[] = [];
  for (let i = swLows.length - 1; i >= 0 && pivots.length < 3; i--) {
    if (!isNaN(swLows[i]) && !isNaN(rsiVals[i])) {
      pivots.unshift({ idx: i, price: swLows[i], rsiVal: rsiVals[i] });
    }
  }

  if (pivots.length < 2) return 'none';
  const [a, b] = [pivots[pivots.length - 2], pivots[pivots.length - 1]];

  // Bullish regular: price lower low, RSI higher low
  if (b.price < a.price && b.rsiVal > a.rsiVal) {
    return 'bullish_regular';
  }

  // Bullish hidden: price higher low, RSI lower low (trend continuation)
  if (b.price > a.price && b.rsiVal < a.rsiVal) {
    return 'bullish_hidden';
  }

  return 'none';
}

// Confirmation: bullish engulfing or RSI crosses above 30 on last candle
export function confirmBullish(candles: Candle[]): boolean {
  const closes = candles.map(c => c.close);
  const rsiVals = rsi(closes);
  const n = candles.length;
  if (n < 2) return false;

  const lastRsi = rsiVals[n - 1];
  const prevRsi = rsiVals[n - 2];
  // RSI crosses above 30
  if (prevRsi < 30 && lastRsi >= 30) return true;

  // Bullish engulfing
  const prev = candles[n - 2];
  const curr = candles[n - 1];
  if (prev.close < prev.open && curr.close > curr.open &&
    curr.close > prev.open && curr.open < prev.close) return true;

  // RSI > 50
  if (lastRsi > 50) return true;

  return false;
}

