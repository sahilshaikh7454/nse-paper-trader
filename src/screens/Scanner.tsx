import React, { useState } from 'react';
import { useStore } from '../store';
import { scanWatchlist, type ScanResult } from '../engine/engine';

export default function Scanner() {
  const store = useStore();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleScan() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await scanWatchlist();
      const buyCount = res.filter(r => r.status === 'BUY').length;
      setMsg(`Scanned ${res.length} stocks: ${buyCount} BUY signals found.`);
    } catch (e: any) {
      setMsg(`Scan failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  function handleTestBuy(item: ScanResult) {
    const entry = item.currentPrice || 100;
    const stop = item.stop || entry * 0.98;
    const target1 = item.target1 || entry * 1.05;
    const target2 = item.target2 || entry * 1.08;
    const riskPerShare = Math.max(0.5, entry - stop);

    const isReal = store.mode === 'REAL';
    const activePositions = isReal ? store.realPositions : store.paperPositions;
    const availableCash = isReal ? store.realCash : store.paperCash;

    const riskPct = Math.min(1, Math.max(0.01, store.settings.riskPct / 100));
    const riskRs = availableCash * riskPct;
    let shares = Math.floor(riskRs / riskPerShare);

    // Max 20% equity cap per position
    const maxSharesByCap = Math.floor((store.settings.startCapital * 0.20) / entry);
    shares = Math.min(shares, maxSharesByCap);
    if (shares < 1) shares = 1;

    const fillPrice = entry * (1 + store.settings.costs.slippagePct);
    const totalCost = fillPrice * shares * (1 + store.settings.costs.brokeragePct);

    if (!isReal && totalCost > store.paperCash) {
      setMsg(`❌ Insufficient cash in paper wallet (Requires ₹${totalCost.toFixed(0)}, Available ₹${store.paperCash.toFixed(0)})`);
      return;
    }

    if (activePositions.some(p => p.symbol === item.symbol)) {
      setMsg(`❌ ${item.symbol.replace('.NS', '')} already has an open position`);
      return;
    }

    if (activePositions.length >= 4) {
      setMsg(`❌ Max 4 open positions limit reached`);
      return;
    }

    store.openPosition(
      {
        symbol: item.symbol,
        entry: fillPrice,
        shares,
        stop,
        initialStop: stop,
        target1,
        target2,
        initialRisk: shares * riskPerShare,
        entryReason: `Manual Test (Score ${item.score}/6, W: ${item.weeklyBias})`,
        openDate: new Date().toISOString(),
        currentPrice: fillPrice,
        isReal,
      },
      totalCost,
      isReal
    );

    store.addLog(
      `[MANUAL BUY] ${item.symbol.replace('.NS', '')} x${shares} @ ₹${fillPrice.toFixed(2)} (Alloc: ₹${totalCost.toFixed(0)})`,
      'trade'
    );
    setMsg(`✓ Opened ${isReal ? 'REAL' : 'Paper'} position in ${item.symbol.replace('.NS', '')} (${shares} shares)! Check Dashboard.`);
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
          <p className="text-xs text-muted">Skills: Trend + Confluence ≥4 + Pullback Fib + R:R ≥2</p>
        </div>
        <button
          onClick={handleScan}
          disabled={loading}
          className="text-xs bg-accent text-bg px-3.5 py-2 rounded-xl font-bold disabled:opacity-50 shadow"
        >
          {loading ? 'Scanning...' : '⚡ Scan Watchlist'}
        </button>
      </div>

      {msg && (
        <div className={`text-xs p-2.5 rounded-xl border ${
          msg.startsWith('✓') ? 'bg-green/10 text-green border-green/30' :
          msg.startsWith('❌') ? 'bg-red/10 text-red border-red/30' :
          'bg-surface text-muted border-border'
        }`}>
          {msg}
        </div>
      )}

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
                  <span className="text-xs text-muted ml-2 font-mono">₹{r.currentPrice.toFixed(2)}</span>
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

            {/* Test paper trade button */}
            <div className="pt-1 flex justify-end">
              <button
                onClick={() => handleTestBuy(r)}
                className="text-[11px] bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1"
              >
                <span>+</span>
                <span>Test Paper Buy</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
