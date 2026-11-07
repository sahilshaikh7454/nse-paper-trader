import React, { useState } from 'react';
import { useStore } from '../store';
import { runEngineTick } from '../engine/engine';
import type { ScanResult } from '../engine/engine';

export default function Scanner() {
  const store = useStore();
  const [loading, setLoading] = useState(false);

  async function scan() {
    setLoading(true);
    const results = await runEngineTick();
    if (results.length > 0) useStore.getState().setScanResults(results);
    setLoading(false);
  }

  const results: ScanResult[] = store.lastScanResults;

  const statusColor = (s: string) => {
    if (s === 'BUY') return 'text-green';
    if (s === 'WAIT') return 'text-warn';
    return 'text-muted';
  };

  const biasColor = (b: string) => {
    if (b === 'UP') return 'text-green';
    if (b === 'DOWN') return 'text-red';
    return 'text-muted';
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold">Scanner</h1>
        <button
          onClick={scan}
          disabled={loading}
          className="text-xs bg-accent/10 text-accent border border-accent/30 px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
        >
          {loading ? '...' : '⚡ Scan'}
        </button>
      </div>

      {results.length === 0 && (
        <div className="bg-surface rounded-xl p-6 border border-border text-center text-muted text-sm">
          Hit Scan to analyse the watchlist
        </div>
      )}

      <div className="space-y-2">
        {results.map(r => (
          <div key={r.symbol} className="bg-surface rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{r.symbol.replace('.NS', '')}</div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${biasColor(r.weeklyBias)}`}>
                  W:{r.weeklyBias}
                </span>
                <span className="text-xs text-muted">{r.score}/6</span>
                <span className={`text-xs font-bold ${statusColor(r.status)}`}>{r.status}</span>
              </div>
            </div>
            {r.reason && <div className="text-xs text-muted mt-1">{r.reason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

