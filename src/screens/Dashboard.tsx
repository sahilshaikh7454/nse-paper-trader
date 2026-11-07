import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { runEngineTick } from '../engine/engine';
import { isMarketOpen, istNow } from '../engine/data';

export default function Dashboard() {
  const store = useStore();
  const [ticking, setTicking] = useState(false);
  const pnl = store.equity - store.settings.startCapital;
  const pnlPct = (pnl / store.settings.startCapital) * 100;
  const drawdown = ((store.peakEquity - store.equity) / store.peakEquity) * 100;

  // Today P&L
  const today = new Date().toISOString().slice(0, 10);
  const todayPnl = store.trades
    .filter(t => t.date.startsWith(today))
    .reduce((s, t) => s + t.pnl, 0);

  async function handleScan() {
    setTicking(true);
    await runEngineTick();
    setTicking(false);
  }

  const ist = istNow();
  const marketOpen = isMarketOpen();

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-bold text-white">NSE Paper Trader</h1>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
            store.mode === 'PAPER' ? 'bg-accent/20 text-accent' : 'bg-warn/20 text-warn'
          }`}>{store.mode}</span>
          <div className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-green animate-pulse' : 'bg-muted'}`} />
        </div>
      </div>

      {/* Mode Switch */}
      <div className="bg-surface rounded-xl p-3 border border-border">
        <div className="flex gap-2">
          <button
            onClick={() => store.setMode('PAPER')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              store.mode === 'PAPER' ? 'bg-accent text-bg' : 'text-muted'
            }`}
          >
            PAPER
          </button>
          <button
            onClick={() => store.setMode('REAL')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              store.mode === 'REAL' ? 'bg-warn text-bg' : 'text-muted'
            }`}
          >
            REAL 🔒
          </button>
        </div>
        {store.mode === 'REAL' && (
          <p className="text-xs text-warn mt-2 text-center">
            🔒 Locked — requires Angel One + static IP + 30 profitable paper trades
          </p>
        )}
      </div>

      {/* Wallet Stats */}
      <div className="bg-surface rounded-xl p-4 border border-border space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-muted text-sm">Equity</span>
          <span className="text-2xl font-bold text-white">₹{store.equity.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted text-sm">Total P&L</span>
          <span className={`font-semibold ${pnl >= 0 ? 'text-green' : 'text-red'}`}>
            {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted text-sm">Today P&L</span>
          <span className={`font-semibold ${todayPnl >= 0 ? 'text-green' : 'text-red'}`}>
            {todayPnl >= 0 ? '+' : ''}₹{todayPnl.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted text-sm">Drawdown</span>
          <span className={`font-semibold ${drawdown > 5 ? 'text-red' : 'text-muted'}`}>
            -{drawdown.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Auto-trade toggle */}
      <div className="bg-surface rounded-xl p-4 border border-border flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">Auto-Trade</div>
          <div className="text-xs text-muted">Engine runs every 60s during market hours</div>
        </div>
        <button
          onClick={() => store.setAutoTrade(!store.autoTrade)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            store.autoTrade ? 'bg-accent' : 'bg-border'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
            store.autoTrade ? 'left-7' : 'left-1'
          }`} />
        </button>
      </div>

      {/* Manual scan button */}
      <button
        onClick={handleScan}
        disabled={ticking}
        className="w-full bg-accent/10 border border-accent/30 text-accent py-3 rounded-xl font-semibold text-sm active:bg-accent/20 disabled:opacity-50"
      >
        {ticking ? 'Scanning...' : '⚡ Run Engine Now'}
      </button>

      {/* Open Positions */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
          Open Positions ({store.positions.length}/4)
        </h2>
        {store.positions.length === 0 && (
          <div className="bg-surface rounded-xl p-4 border border-border text-center text-muted text-sm">
            No open positions
          </div>
        )}
        {store.positions.map(pos => {
          const livePnl = (pos.entry - pos.stop) * pos.shares; // approx
          return (
            <div key={pos.symbol} className="bg-surface rounded-xl p-4 border border-border">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{pos.symbol.replace('.NS', '')}</div>
                  <div className="text-xs text-muted">{pos.shares} shares @ ₹{pos.entry.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted">Stop: ₹{pos.stop.toFixed(2)}</div>
                  <div className="text-xs text-green">T1: ₹{pos.target1.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted">{pos.entryReason}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

