import React, { useState } from 'react';
import { useStore } from '../store';
import { scanWatchlist, type ScanResult } from '../engine/engine';

export default function Scanner() {
  const store = useStore();
  const [loading, setLoading] = useState(false);

  async function handleScan() {
    setLoading(true);
    try {
      await scanWatchlist();
    } finally {
      setLoading(false);
    }
  }

  const results: ScanResult[] = store.lastScanResults;

  const statusBadge = (s: string) => {
    if (s === 'BUY') {
      return <span className="bg-green/20 text-green border border-green/40 px-2 py-0.5 rounded text-xs font-bold">BUY</span>;
    }
    if (s === 'WAIT') {
      return <span className="bg-warn/20 text-warn border border-warn/40 px-2 py-0.5 rounded text-xs font-bold">WAIT</span>;
    }
    return <span className="bg-border text-muted px-2 py-0.5 rounded text-xs font-medium">SKIP</span>;
  };

  const biasBadge = (b: string) => {
    if (b === 'UP') return <span className="text-green font-semibold">Weekly ▲ UP</span>;
    if (b === 'DOWN') return <span className="text-red font-semibold">Weekly ▼ DOWN</span>;
    return <span className="text-muted">Weekly ▬ NEUTRAL</span>;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold text-white">NSE Scanner</h1>
          <p className="text-xs text-muted">Rules: Weekly Trend + Confluence ≥4/6 + R:R ≥2</p>
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          className="text-xs bg-accent text-bg px-3.5 py-2 rounded-xl font-bold disabled:opacity-50 shadow"
        >
          {loading ? 'Scanning...' : '⚡ Scan Watchlist'}
        </button>
      </div>

      {results.length === 0 && (
        <div className="bg-surface rounded-xl p-8 border border-border text-center space-y-2">
          <div className="text-2xl">🔍</div>
          <div className="text-white font-semibold text-sm">No Scan Results Yet</div>
          <div className="text-xs text-muted">Tap "Scan Watchlist" to scan 21 NSE stocks using the 9 skills</div>
        </div>
      )}

      <div className="space-y-2.5">
        {results.map(r => (
          <div key={r.symbol} className="bg-surface rounded-xl p-4 border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-base text-white">{r.symbol.replace('.NS', '')}</span>
                {r.currentPrice && (
                  <span className="text-xs text-muted ml-2">₹{r.currentPrice.toFixed(2)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-bg px-2 py-0.5 rounded text-white border border-border">
                  Score {r.score}/6
                </span>
                {statusBadge(r.status)}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
              <div>{biasBadge(r.weeklyBias)}</div>
              {r.rr ? (
                <div className="text-muted">
                  Stop: <span className="text-warn">₹{r.stop?.toFixed(1)}</span> • T1: <span className="text-green">₹{r.target1?.toFixed(1)}</span> • R:R: <span className="font-bold text-white">{r.rr.toFixed(1)}</span>
                </div>
              ) : null}
            </div>

            {r.reason && (
              <div className="text-[11px] text-muted bg-bg/50 px-2 py-1 rounded">
                {r.reason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
