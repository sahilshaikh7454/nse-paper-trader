import React, { useState, useEffect } from 'react';
import { useStore, type AngelOneConfig } from '../store';
import { angelLogin, getOrGenerateTOTP } from '../engine/angelone';

export default function Settings() {
  const store = useStore();
  const [capital, setCapital] = useState(String(store.settings.startCapital));
  const [riskPct, setRiskPct] = useState(String(store.settings.riskPct));
  const [brokPct, setBrokPct] = useState(String(store.settings.costs.brokeragePct * 100));
  const [dp, setDp] = useState(String(store.settings.costs.dpPerSell));
  const [watchlistText, setWatchlistText] = useState(store.settings.watchlist.join('\n'));

  // Angel One state
  const [apiKey, setApiKey] = useState(store.settings.angelOne.apiKey || '');
  const [clientId, setClientId] = useState(store.settings.angelOne.clientId || '');
  const [password, setPassword] = useState(store.settings.angelOne.password || '');
  const [totp, setTotp] = useState(store.settings.angelOne.totp || '');
  const [liveOtp, setLiveOtp] = useState<string | null>(null);
  const [angelStatus, setAngelStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Live preview of calculated TOTP
  useEffect(() => {
    let active = true;
    async function updateCode() {
      if (!totp || totp.trim().length < 6) {
        setLiveOtp(null);
        return;
      }
      try {
        const code = await getOrGenerateTOTP(totp);
        if (active) setLiveOtp(code);
      } catch {
        if (active) setLiveOtp('Invalid Key');
      }
    }
    updateCode();
    const interval = setInterval(updateCode, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [totp]);

  async function handleAngelConnect() {
    setConnecting(true);
    setAngelStatus(null);

    const cfg: AngelOneConfig = {
      apiKey: apiKey.trim(),
      clientId: clientId.trim().toUpperCase(),
      password: password.trim(),
      totp: totp.trim(),
      connected: false,
    };

    const res = await angelLogin(cfg);
    setConnecting(false);

    if (res.success && res.token) {
      store.updateSettings({
        angelOne: {
          ...cfg,
          connected: true,
          token: res.token,
          tokenExpiry: Date.now() + 24 * 3600 * 1000,
        },
      });
      setAngelStatus('✓ Connected successfully to Angel One!');
      store.addLog(`Angel One account ${cfg.clientId} connected successfully`, 'info');
    } else {
      setAngelStatus(`✗ Connection failed: ${res.error || 'Check credentials'}`);
      store.addLog(`Angel One connection failed: ${res.error}`, 'error');
    }
  }

  function handleAngelDisconnect() {
    store.updateSettings({
      angelOne: {
        apiKey: '',
        clientId: '',
        password: '',
        totp: '',
        connected: false,
        token: undefined,
      },
    });
    setApiKey('');
    setClientId('');
    setPassword('');
    setTotp('');
    setAngelStatus('Disconnected from Angel One');
  }

  function saveAll() {
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
      angelOne: {
        ...store.settings.angelOne,
        apiKey: apiKey.trim(),
        clientId: clientId.trim().toUpperCase(),
        password: password.trim(),
        totp: totp.trim(),
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return; }
    store.resetPaperAccount();
    setConfirmReset(false);
  }

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2">
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <p className="text-xs text-muted">Configure risk parameters & broker credentials</p>
      </div>

      {/* Angel One Broker Section */}
      <div className="bg-surface rounded-xl p-4 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-bold text-sm text-white flex items-center gap-2">
            <span>Angel One SmartAPI</span>
            <span className={`w-2 h-2 rounded-full ${store.settings.angelOne.connected ? 'bg-green animate-pulse' : 'bg-muted'}`} />
          </div>
          {store.settings.angelOne.connected ? (
            <span className="text-[11px] bg-green/20 text-green px-2 py-0.5 rounded font-bold">CONNECTED</span>
          ) : (
            <span className="text-[11px] bg-border text-muted px-2 py-0.5 rounded font-bold">DISCONNECTED</span>
          )}
        </div>
        <p className="text-xs text-muted">
          Required for REAL trading mode (Delivery swing trades only, no leverage).
        </p>

        <div className="space-y-2.5 pt-1">
          <div>
            <Field
              label="SmartAPI Key"
              value={apiKey}
              onChange={setApiKey}
              placeholder="e.g. uJ9x... (from SmartAPI Dashboard)"
            />
          </div>

          <div>
            <Field
              label="Client ID / Code"
              value={clientId}
              onChange={setClientId}
              placeholder="e.g. S123456 (Angel One User ID)"
            />
          </div>

          <div>
            <Field
              label="Password / MPIN"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Angel One 4-digit/6-digit Login PIN"
            />
            <p className="text-[10px] text-muted mt-0.5">⚠️ Note: Enter your Angel One App Login PIN, not email password.</p>
          </div>

          <div>
            <Field
              label="TOTP Secret Key or 6-digit OTP"
              type="password"
              value={totp}
              onChange={setTotp}
              placeholder="Base32 Key from enable-totp OR 6-digit code"
            />
            {liveOtp && (
              <div className="mt-1.5 text-xs bg-bg p-2 rounded-lg border border-border flex items-center justify-between">
                <span className="text-muted">Live 6-Digit OTP:</span>
                <span className="font-mono font-bold text-accent tracking-widest text-sm">{liveOtp}</span>
              </div>
            )}
            <p className="text-[10px] text-muted mt-0.5">Paste the Base32 Key or current 6-digit Authenticator code.</p>
          </div>
        </div>

        {angelStatus && (
          <div className={`text-xs p-2.5 rounded-lg border font-mono ${
            angelStatus.startsWith('✓') ? 'bg-green/10 text-green border-green/30' : 'bg-red/10 text-red border-red/30'
          }`}>
            {angelStatus}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleAngelConnect}
            disabled={connecting || !apiKey || !clientId || !password || !totp}
            className="flex-1 bg-accent text-bg py-2.5 rounded-lg font-bold text-xs disabled:opacity-50 shadow"
          >
            {connecting ? 'Authenticating...' : store.settings.angelOne.connected ? 'Re-Connect Angel One' : 'Connect Angel One'}
          </button>
          {store.settings.angelOne.connected && (
            <button
              onClick={handleAngelDisconnect}
              className="px-3 border border-border text-muted hover:text-white rounded-lg text-xs"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Trading Parameters */}
      <div className="bg-surface rounded-xl p-4 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-sm text-white">Muhurat / Special Session</div>
            <div className="text-xs text-muted">Allow trading outside regular Mon–Fri hours</div>
          </div>
          <button
            onClick={() => store.updateSettings({ muhuratMode: !store.settings.muhuratMode })}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              store.settings.muhuratMode ? 'bg-accent' : 'bg-border'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow ${
              store.settings.muhuratMode ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        <div className="pt-2 border-t border-border/50">
          <div className="font-bold text-sm text-white mb-2">Trading Parameters (Skills Logic)</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starting Capital (₹)" value={capital} onChange={setCapital} type="number" />
            <Field label="Risk per Trade (%)" value={riskPct} onChange={setRiskPct} type="number" />
            <Field label="Brokerage per Side (%)" value={brokPct} onChange={setBrokPct} type="number" />
            <Field label="DP Charge / Sell (₹)" value={dp} onChange={setDp} type="number" />
          </div>
        </div>
      </div>

      {/* Watchlist */}
      <div className="bg-surface rounded-xl p-4 border border-border space-y-2">
        <label className="text-xs text-muted uppercase tracking-wider font-semibold">
          Watchlist (21 NSE Symbols with .NS)
        </label>
        <textarea
          value={watchlistText}
          onChange={e => setWatchlistText(e.target.value)}
          rows={7}
          className="w-full bg-bg border border-border rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-accent resize-none"
        />
      </div>

      <button
        onClick={saveAll}
        className="w-full bg-accent text-bg py-3 rounded-xl font-bold text-sm shadow"
      >
        {saved ? '✓ Settings Saved' : 'Save All Settings'}
      </button>

      {/* Danger Zone */}
      <div className="bg-surface rounded-xl p-4 border border-red/30 space-y-3">
        <div className="text-sm font-semibold text-red">Danger Zone</div>
        <button
          onClick={handleReset}
          className="w-full border border-red/50 text-red py-2 rounded-xl text-sm font-semibold hover:bg-red/10"
        >
          {confirmReset ? '⚠ Confirm Reset Virtual Account to ₹10,000?' : 'Reset Paper Account'}
        </button>
        {confirmReset && (
          <button onClick={() => setConfirmReset(false)} className="w-full text-muted text-xs text-center py-1">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-accent placeholder:text-muted/50 font-mono"
      />
    </div>
  );
}
