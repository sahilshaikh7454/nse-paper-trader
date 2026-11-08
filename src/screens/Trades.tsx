import React from 'react';
import { useStore } from '../store';

export default function Trades() {
  const store = useStore();
  const isReal = store.mode === 'REAL';
  const trades = isReal ? store.realTrades : store.paperTrades;

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const expectancy = wins.length > 0 && losses.length > 0
    ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
    : 0;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold pt-2">Trade History</h1>

      {/* Stats */}
      {trades.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted">Win Rate</div>
            <div className="font-bold text-white">{winRate.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-xs text-muted">Expectancy</div>
            <div className={`font-bold ${expectancy >= 0 ? 'text-green' : 'text-red'}`}>
              ₹{expectancy.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Total P&L</div>
            <div className={`font-bold ${totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
              {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Trades</div>
            <div className="font-bold">{trades.length} ({wins.length}W/{losses.length}L)</div>
          </div>
        </div>
      )}

      {trades.length === 0 && (
        <div className="bg-surface rounded-xl p-6 border border-border text-center text-muted text-sm">
          No completed trades yet
        </div>
      )}

      <div className="space-y-2">
        {[...trades].reverse().map(t => (
          <div key={t.id} className="bg-surface rounded-xl p-4 border border-border">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{t.symbol.replace('.NS', '')}</div>
                <div className="text-xs text-muted">{t.date.slice(0, 10)}</div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${t.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                  {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toFixed(2)}
                </div>
                <div className={`text-xs ${t.rResult >= 0 ? 'text-green' : 'text-red'}`}>
                  {t.rResult >= 0 ? '+' : ''}{t.rResult.toFixed(2)}R
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted">
              <div>Entry: ₹{t.entry.toFixed(2)} → Exit: ₹{t.exit.toFixed(2)} ({t.shares} shares)</div>
              <div className="mt-0.5">In: {t.entryReason} | Out: {t.exitReason}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

