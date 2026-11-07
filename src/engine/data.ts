// Yahoo Finance data fetcher
// On Android: uses CapacitorHttp (no CORS)
// On web dev: uses Vite proxy at /api/yahoo

import type { Candle } from './indicators';

declare const window: Window & { Capacitor?: { isNativePlatform: () => boolean } };

type YInterval = '1d' | '1wk' | '60m';

interface YahooChart {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
      };
    }>;
    error: null | { description: string };
  };
}

async function fetchRaw(symbol: string, interval: YInterval, range: string): Promise<YahooChart> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

  const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

  if (isNative) {
    // Use CapacitorHttp on Android to avoid CORS
    const { CapacitorHttp } = await import('@capacitor/core');
    const response = await CapacitorHttp.request({
      method: 'GET',
      url: `https://query1.finance.yahoo.com${path}`,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return response.data as YahooChart;
  } else {
    // Dev: Vite proxy
    const res = await fetch(`/api/yahoo${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

function parseCandles(data: YahooChart): Candle[] {
  const result = data.chart.result?.[0];
  if (!result) return [];
  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] == null || q.open[i] == null) continue;
    candles.push({
      time: ts[i] * 1000,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i] ?? 0,
    });
  }
  return candles;
}

// Cache to avoid hammering Yahoo
const cache = new Map<string, { data: Candle[]; ts: number }>();
const CACHE_TTL = 60_000; // 1 min

export async function fetchCandles(symbol: string, interval: YInterval, range: string): Promise<Candle[]> {
  const key = `${symbol}|${interval}|${range}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const raw = await fetchRaw(symbol, interval, range);
    if (raw.chart.error) throw new Error(raw.chart.error.description);
    const candles = parseCandles(raw);
    cache.set(key, { data: candles, ts: Date.now() });
    return candles;
  } catch (err) {
    console.warn(`[Yahoo] Failed ${symbol} ${interval}:`, err);
    return cached?.data ?? []; // return stale if any
  }
}

// NSE market hours check (IST = UTC+5:30)
export function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function istNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function canTrade(): boolean {
  const ist = istNow();
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 30 && mins <= 15 * 60; // 9:30–15:00
}
