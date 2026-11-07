import React, { useState } from 'react';
import { useStore } from '../store';

export default function Settings() {
  const store = useStore();
  const [capital, setCapital] = useState(String(store.settings.startCapital));
  const [riskPct, setRiskPct] = useState(String(store.settings.riskPct));
  const [brokPct, setBrokPct] = useState(String(store.settings.costs.brokeragePct * 100));
  const [dp, setDp] = useState(String(store.settings.costs.dpPerSell));
  const [watchlistText, setWatchlistText] = useState(store.settings.watchlist.join('\n'));
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function save() {
    const watchlist = watchlistText
      .split(/[\n,]/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0 && s.endsWith('.NS'));

    store.updateSettings({
      startCapital: parseFloat(capital) || 10000,
      riskPct: parseFloat(riskPct) || 1,
      costs: {
        brokeragePct: (parseFloat(brokPct) || 0.1) / 100,
        dpPerSell: parseFloat(dp) || 16,
        slippagePct: 0.0005,
      },
      watchlist: watchlist.length > 0 ? watchlist : store.settings.watchlist,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return; }
    store.resetPaperAccount();
    setConfirmReset(false);
  }

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-lg font-bold pt-2">Settings</h1>

      <div className="bg-surface rounded-xl p-4 border border-border space-y-4">
        <Field label="Starting Capital (₹)" value={capital} onChange={setCapital} />
        <Field label="Risk per Trade (%)" value={riskPct} onChange={setRiskPct} />
        <Field label="Brokerage per Side (%)" value={brokPct} onChange={setBrokPct} />
        <Field label="DP Charge per Sell (₹)" value={dp} onChange={setDp} />
      </div>

      <div className="bg-surface rounded-xl p-4 border border-border space-y-2">
        <label className="text-xs text-muted uppercase tracking-wide">Watchlist (.NS symbols, one per line)</label>
        <textarea
          value={watchlistText}
          onChange={e => setWatchlistText(e.target.value)}
          rows={8}
          className="w-full bg-bg border border-border rounded-lg p-2 text-sm text-white font-mono focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <button
        onClick={save}
        className="w-full bg-accent text-bg py-3 rounded-xl font-bold text-sm"
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>

      <div className="bg-surface rounded-xl p-4 border border-red/30 space-y-3">
        <div className="text-sm font-semibold text-red">Danger Zone</div>
        <button
          onClick={handleReset}
          className="w-full border border-red/50 text-red py-2 rounded-xl text-sm font-semibold"
        >
          {confirmReset ? '⚠ Confirm Reset Paper Account?' : 'Reset Paper Account'}
        </button>
        {confirmReset && (
          <button onClick={() => setConfirmReset(false)} className="w-full text-muted text-sm">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
      />
    </div>
  );
}

