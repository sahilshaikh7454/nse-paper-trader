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
    // Initial engine run on startup
    runTick();

    // 60-second engine loop
    tickRef.current = setInterval(() => {
      if (isMarketOpen() || store.positions.length > 0) {
        runTick();
      }
    }, 60_000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [store.autoTrade]);

  async function runTick() {
    try {
      await runEngineTick();
    } catch (e: any) {
      console.warn('[App] Engine tick error:', e);
    }
  }

  const nav = (s: Screen, label: string, icon: string) => (
    <button
      onClick={() => setScreen(s)}
      className={`flex-1 py-3 text-xs font-semibold flex flex-col items-center gap-1 transition-colors ${
        screen === s ? 'text-accent border-t-2 border-accent' : 'text-muted hover:text-white'
      }`}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-bg text-white flex flex-col max-w-md mx-auto relative select-none">
      <div className="flex-1 overflow-y-auto pb-20">
        {screen === 'dashboard' && <Dashboard />}
        {screen === 'scanner' && <Scanner />}
        {screen === 'trades' && <Trades />}
        {screen === 'settings' && <Settings />}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface border-t border-border flex z-50">
        {nav('dashboard', 'Dashboard', '📊')}
        {nav('scanner', 'Scanner', '🔍')}
        {nav('trades', 'Trades', '📜')}
        {nav('settings', 'Settings', '⚙️')}
      </nav>
    </div>
  );
}
