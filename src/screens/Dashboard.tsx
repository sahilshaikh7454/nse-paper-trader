import React, { useState } from 'react';
import { useStore } from '../store';
import { runEngineTick } from '../engine/engine';
import { isMarketOpen, istNow } from '../engine/data';

export default function Dashboard() {
  const store = useStore();
  const [ticking, setTicking] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Portfolio calculations
  const cash = store.equity;
  const positionsValue = store.positions.reduce(
    (sum, p) => sum + p.shares * (p.currentPrice ?? p.entry),
    0
  );
  const totalPortfolioValue = cash + positionsValue;
  const totalPnl = totalPortfolioValue - store.settings.startCapital;
  const totalPnlPct = (totalPnl / store.settings.startCapital) * 100;

  const unrealizedPnl = store.positions.reduce(
    (sum, p) => sum + p.shares * ((p.currentPrice ?? p.entry) - p.entry),
    0
  );

  const peak = Math.max(store.peakEquity, totalPortfolioValue);
  const drawdown = peak > 0 ? ((peak - totalPortfolioValue) / peak) * 100 : 0;

  // Today realized P&L
  const today = new Date().toISOString().slice(0, 10);
  const todayRealizedPnl = store.trades
    .filter(t => t.date.startsWith(today))
    .reduce((s, t) => s + t.pnl, 0);

  async function handleScan() {
    setTicking(true);
    await runEngineTick();
    setTicking(false);
  }

  const ist = istNow();
  const timeStr = ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const marketOpen = isMarketOpen();

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-lg font-bold text-white">NSE Paper Trader</h1>
          <div className="text-[11px] text-muted flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-green animate-pulse' : 'bg-red'}`} />
            <span>NSE {marketOpen ? 'OPEN' : 'CLOSED'}</span>
            <span>•</span>
            <span>{timeStr} IST</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
            store.mode === 'PAPER' ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-warn/20 text-warn border border-warn/40'
          }`}>
            {store.mode}
          </span>
        </div>
      </div>

      {/* Safety Alert Banner */}
      {store.safetyPaused && (
        <div className="bg-red/10 border border-red/40 rounded-xl p-3 flex items-center justify-between">
          <div className="text-xs text-red">
            <div className="font-bold">🚨 Auto-Trading Paused</div>
            <div>{store.safetyReason}</div>
          </div>
          <button
            onClick={() => store.setSafetyPause(false, '')}
            className="text-xs bg-red text-white px-2.5 py-1 rounded-lg font-semibold"
          >
            Resume
          </button>
        </div>
      )}

      {/* Mode Switch */}
      <div className="bg-surface rounded-xl p-3 border border-border">
        <div className="flex gap-2">
          <button
            onClick={() => store.setMode('PAPER')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              store.mode === 'PAPER' ? 'bg-accent text-bg shadow' : 'text-muted hover:text-white'
            }`}
          >
            PAPER (Virtual ₹10k)
          </button>
          <button
            onClick={() => store.setMode('REAL')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              store.mode === 'REAL' ? 'bg-warn text-bg shadow' : 'text-muted hover:text-white'
            }`}
          >
            REAL (Angel One)
          </button>
        </div>

        {store.mode === 'REAL' && (
          <div className="mt-2.5 pt-2.5 border-t border-border/50 text-xs">
            {store.settings.angelOne.connected ? (
              <div className="text-green flex items-center gap-1.5 font-medium">
                <span>●</span> Angel One Connected — Ready to execute live delivery swing trades
              </div>
            ) : (
              <div className="text-warn flex items-center justify-between">
                <span>⚠ Angel One not connected</span>
                <span className="text-[11px] underline">Set up in Settings</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Wallet Stats */}
      <div className="bg-surface rounded-xl p-4 border border-border space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-muted text-xs uppercase tracking-wider font-semibold">Total Portfolio</span>
          <span className="text-2xl font-bold text-white">₹{totalPortfolioValue.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
          <div>
            <div className="text-[11px] text-muted">Cash Available</div>
            <div className="text-sm font-semibold text-white">₹{cash.toFixed(2)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted">Invested Value</div>
            <div className="text-sm font-semibold text-white">₹{positionsValue.toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-xs">
          <div>
            <div className="text-muted text-[11px]">Total P&L</div>
            <div className={`font-bold ${totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)} ({totalPnlPct.toFixed(1)}%)
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted text-[11px]">Unrealized</div>
            <div className={`font-bold ${unrealizedPnl >= 0 ? 'text-green' : 'text-red'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-muted text-[11px]">Drawdown</div>
            <div className={`font-bold ${drawdown > 5 ? 'text-red' : 'text-muted'}`}>
              -{drawdown.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Auto-trade toggle */}
      <div className="bg-surface rounded-xl p-4 border border-border flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm flex items-center gap-2">
            Auto-Trade Engine
            {store.autoTrade && <span className="w-2 h-2 rounded-full bg-green animate-ping" />}
          </div>
          <div className="text-xs text-muted mt-0.5">Runs every 60s during 9:30–15:00 IST</div>
        </div>
        <button
          onClick={() => store.setAutoTrade(!store.autoTrade)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            store.autoTrade ? 'bg-accent' : 'bg-border'
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow ${
            store.autoTrade ? 'left-7' : 'left-1'
          }`} />
        </button>
      </div>

      {/* Manual scan button */}
      <button
        onClick={handleScan}
        disabled={ticking}
        className="w-full bg-accent text-bg py-3 rounded-xl font-bold text-sm active:opacity-90 disabled:opacity-50 shadow"
      >
        {ticking ? 'Scanning Watchlist & Market...' : '⚡ Run Engine & Scan Now'}
      </button>

      {/* Open Positions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
            Open Positions ({store.positions.length}/4)
          </h2>
          {store.positions.length > 0 && (
            <span className="text-xs text-muted font-medium">
              Live P&L: <span className={unrealizedPnl >= 0 ? 'text-green font-bold' : 'text-red font-bold'}>
                {unrealizedPnl >= 0 ? '+' : ''}₹{unrealizedPnl.toFixed(2)}
              </span>
            </span>
          )}
        </div>

        {store.positions.length === 0 && (
          <div className="bg-surface rounded-xl p-5 border border-border text-center text-muted text-sm">
            No open positions. Auto-trade or run scanner to find setups.
          </div>
        )}

        {store.positions.map(pos => {
          const curPrice = pos.currentPrice ?? pos.entry;
          const posPnl = (curPrice - pos.entry) * pos.shares;
          const posPnlPct = ((curPrice - pos.entry) / pos.entry) * 100;
          const rMult = pos.initialRisk > 0 ? posPnl / pos.initialRisk : 0;

          return (
            <div key={pos.symbol} className="bg-surface rounded-xl p-4 border border-border space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-base text-white">{pos.symbol.replace('.NS', '')}</div>
                  <div className="text-xs text-muted">
                    {pos.shares} shares @ ₹{pos.entry.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-base ${posPnl >= 0 ? 'text-green' : 'text-red'}`}>
                    {posPnl >= 0 ? '+' : ''}₹{posPnl.toFixed(2)} ({posPnl >= 0 ? '+' : ''}{posPnlPct.toFixed(1)}%)
                  </div>
                  <div className="text-xs text-muted">
                    LTP: ₹{curPrice.toFixed(2)} ({rMult >= 0 ? '+' : ''}{rMult.toFixed(1)}R)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                <div>
                  <span className="text-muted">Trail Stop: </span>
                  <span className="font-semibold text-warn">₹{pos.stop.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-muted">Target: </span>
                  <span className="font-semibold text-green">₹{pos.target1.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-[11px] text-muted italic">{pos.entryReason}</div>
            </div>
          );
        })}
      </div>

      {/* Engine Logs Section */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full p-3 text-xs font-semibold text-muted flex items-center justify-between hover:text-white"
        >
          <span>Activity Log ({store.engineLogs.length})</span>
          <span>{showLogs ? '▲ Hide' : '▼ View'}</span>
        </button>
        {showLogs && (
          <div className="p-3 pt-0 max-h-48 overflow-y-auto space-y-1 text-[11px] font-mono border-t border-border/50">
            {store.engineLogs.length === 0 ? (
              <div className="text-muted text-center py-2">No activity recorded yet</div>
            ) : (
              store.engineLogs.slice(0, 30).map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-muted shrink-0">{log.time}</span>
                  <span className={
                    log.type === 'trade' ? 'text-green font-semibold' :
                    log.type === 'warn' ? 'text-warn' :
                    log.type === 'error' ? 'text-red font-semibold' : 'text-white'
                  }>
                    {log.msg}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
