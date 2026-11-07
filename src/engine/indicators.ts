// Core indicator calculations — no external deps

export interface Candle {
  time: number; // unix timestamp ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Simple Moving Average
export function sma(closes: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

// RSI(14) — Wilder smoothing
export function rsi(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
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

// MACD(12,26,9)
export function macd(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const ema = (src: number[], p: number): number[] => {
    const k = 2 / (p + 1);
    const out = new Array(src.length).fill(NaN);
    let start = p - 1;
    while (start < src.length && isNaN(src[start])) start++;
    if (start >= src.length) return out;
    out[start] = src.slice(0, start + 1).reduce((a, b) => a + b, 0) / (start + 1);
    for (let i = start + 1; i < src.length; i++) {
      out[i] = src[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  };
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const ml = e12.map((v, i) => (isNaN(v) || isNaN(e26[i])) ? NaN : v - e26[i]);
  const sig = ema(ml, 9);
  const hist = ml.map((v, i) => (isNaN(v) || isNaN(sig[i])) ? NaN : v - sig[i]);
  return { macd: ml, signal: sig, hist };
}

// ATR(14)
export function atr(candles: Candle[], period = 14): number[] {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  const result: number[] = new Array(candles.length).fill(NaN);
  if (tr.length < period) return result;
  result[period - 1] = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    result[i] = (result[i - 1] * (period - 1) + tr[i]) / period;
  }
  return result;
}

// Swing highs/lows — left+right lookback bars
export function swingHighs(candles: Candle[], lb = 5): number[] {
  return candles.map((c, i) => {
    if (i < lb || i >= candles.length - lb) return NaN;
    for (let j = i - lb; j <= i + lb; j++) {
      if (j !== i && candles[j].high >= c.high) return NaN;
    }
    return c.high;
  });
}

export function swingLows(candles: Candle[], lb = 5): number[] {
  return candles.map((c, i) => {
    if (i < lb || i >= candles.length - lb) return NaN;
    for (let j = i - lb; j <= i + lb; j++) {
      if (j !== i && candles[j].low <= c.low) return NaN;
    }
    return c.low;
  });
}

// Fibonacci retracement levels (uptrend pullback)
export function fibLevels(swingLow: number, swingHigh: number) {
  const diff = swingHigh - swingLow;
  return {
    r236: swingHigh - diff * 0.236,
    r382: swingHigh - diff * 0.382,
    r500: swingHigh - diff * 0.500,
    r618: swingHigh - diff * 0.618,
    r786: swingHigh - diff * 0.786,
    // extensions from swing low (point C = retracement low assumed at 50%)
    ext1272: swingLow + diff * 1.272,
    ext1618: swingLow + diff * 1.618,
    ext2000: swingLow + diff * 2.000,
  };
}

// Volume 20-bar average
export function avgVolume20(candles: Candle[], idx: number): number {
  const start = Math.max(0, idx - 19);
  const slice = candles.slice(start, idx + 1);
  return slice.reduce((s, c) => s + c.volume, 0) / slice.length;
}

