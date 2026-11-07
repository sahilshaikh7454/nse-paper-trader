import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { runEngineTick } from './engine/engine';
import { isMarketOpen } from './engine/data';
import Dashboard from './screens/Dashboard';
import Scanner from './screens/Scanner';
import Trades from './screens/Trades';
import Settings from './screens/Settings';

type Screen = 'dashboard' | 'scanner' | 'trades' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const store = useStore();
  const tickRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Initial tick
    if (store.autoTrade) runTick();
    // Every 60s
    tickRef.current = setInterval(() => {
      if (isMarketOpen() && store.autoTrade) runTick();
    }, 60_000);
    return () => clearInterval(tickRef.current);
  }, [store.autoTrade]);

  async function runTick() {
    const results = await runEngineTick();
    if (results.length > 0) useStore.getState().setScanResults(results);
  }

  const nav = (s: Screen) => (
    <button
      onClick={() => setScreen(s)}
      className={`flex-1 py-3 text-xs font-semibold transition-colors ${
        screen === s ? 'text-accent border-t-2 border-accent' : 'text-muted'
      }`}
    >
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </button>
  );

  return (
    <div className="min-h-screen bg-bg flex flex-col max-w-md mx-auto">
      <div className="flex-1 overflow-y-auto pb-16">
        {screen === 'dashboard' && <Dashboard />}
        {screen === 'scanner' && <Scanner />}
        {screen === 'trades' && <Trades />}
        {screen === 'settings' && <Settings />}
      </div>
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface border-t border-border flex">
        {nav('dashboard')}
        {nav('scanner')}
        {nav('trades')}
        {nav('settings')}
      </nav>
    </div>
  );
}

