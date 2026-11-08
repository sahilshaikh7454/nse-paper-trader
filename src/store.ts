// Zustand store with persist — v2 (fixed wallet math + Angel One real mode)
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Position {
  symbol: string;
  entry: number;
  shares: number;
  stop: number;
  initialStop: number;
  target1: number;
  target2: number;
  initialRisk: number;
  entryReason: string;
  openDate: string;
  currentPrice?: number; // live price for P&L
}

export interface TradeRecord {
  id: string;
  symbol: string;
  entry: number;
  exit: number;
  shares: number;
  entryReason: string;
  exitReason: string;
  pnl: number;
  rResult: number;
  date: string;
}

export interface CostSettings {
  brokeragePct: number;
  dpPerSell: number;
  slippagePct: number;
}

export interface AngelOneConfig {
  apiKey: string;
  clientId: string;
  password: string;
  totp: string; // TOTP secret
  connected: boolean;
  token?: string;
  tokenExpiry?: number;
}

export interface AppSettings {
  startCapital: number;
  riskPct: number;
  costs: CostSettings;
  watchlist: string[];
  angelOne: AngelOneConfig;
  muhuratMode: boolean; // Special Muhurat trading or weekend session override
}

export type AppMode = 'PAPER' | 'REAL';

export interface EngineLog {
  time: string;
  msg: string;
  type: 'info' | 'trade' | 'warn' | 'error';
}

interface AppState {
  mode: AppMode;
  equity: number;
  peakEquity: number;
  positions: Position[];
  trades: TradeRecord[];
  autoTrade: boolean;
  settings: AppSettings;
  lastScanResults: import('./engine/engine').ScanResult[];
  engineLogs: EngineLog[];
  safetyPaused: boolean;
  safetyReason: string;

  setMode: (m: AppMode) => void;
  setAutoTrade: (v: boolean) => void;
  openPosition: (pos: Position, cost: number) => void;
  closePosition: (symbol: string, exitPrice: number, record: TradeRecord) => void;
  updatePositionStop: (symbol: string, stop: number) => void;
  updatePositionPrice: (symbol: string, price: number) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  resetPaperAccount: () => void;
  setScanResults: (r: import('./engine/engine').ScanResult[]) => void;
  addLog: (msg: string, type?: EngineLog['type']) => void;
  setSafetyPause: (paused: boolean, reason: string) => void;
  setAngelOneToken: (token: string, expiry: number) => void;
  setAngelOneConnected: (connected: boolean) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  startCapital: 10000,
  riskPct: 1,
  costs: { brokeragePct: 0.001, dpPerSell: 16, slippagePct: 0.0005 },
  watchlist: [
    'ITC.NS','SBIN.NS','NTPC.NS','ONGC.NS','POWERGRID.NS','COALINDIA.NS',
    'TATASTEEL.NS','HINDALCO.NS','WIPRO.NS','BPCL.NS','IOC.NS','GAIL.NS',
    'PNB.NS','BANKBARODA.NS','HDFCBANK.NS','ICICIBANK.NS','INFY.NS',
    'AXISBANK.NS','NIFTYBEES.NS','BANKBEES.NS','GOLDBEES.NS',
  ],
  angelOne: {
    apiKey: '', clientId: '', password: '', totp: '', connected: false,
  },
  muhuratMode: true,
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      mode: 'PAPER',
      equity: DEFAULT_SETTINGS.startCapital,
      peakEquity: DEFAULT_SETTINGS.startCapital,
      positions: [],
      trades: [],
      autoTrade: false,
      settings: DEFAULT_SETTINGS,
      lastScanResults: [],
      engineLogs: [],
      safetyPaused: false,
      safetyReason: '',

      setMode: (m) => set({ mode: m }),
      setAutoTrade: (v) => set({ autoTrade: v }),

      // BUG FIX: equity was wrongly subtracting cost AND then not crediting back properly on close.
      // Now: equity = cash in wallet (not invested). Open = reduce cash. Close = add proceeds.
      openPosition: (pos, cost) => set((s) => {
        const newEquity = s.equity - cost;
        return {
          positions: [...s.positions, pos],
          equity: Math.max(0, newEquity), // never negative
          peakEquity: Math.max(s.peakEquity, s.equity), // peak before opening
        };
      }),

      closePosition: (symbol, exitPrice, record) => set((s) => {
        const pos = s.positions.find(p => p.symbol === symbol);
        if (!pos) return {};
        // Proceeds = exit value minus exit brokerage + DP
        const proceeds = exitPrice * pos.shares
          - pos.shares * exitPrice * s.settings.costs.brokeragePct
          - s.settings.costs.dpPerSell;
        const newEquity = s.equity + proceeds;
        return {
          positions: s.positions.filter(p => p.symbol !== symbol),
          trades: [...s.trades, record],
          equity: newEquity,
          peakEquity: Math.max(s.peakEquity, newEquity),
        };
      }),

      updatePositionStop: (symbol, stop) => set((s) => ({
        positions: s.positions.map(p => p.symbol === symbol ? { ...p, stop } : p),
      })),

      updatePositionPrice: (symbol, price) => set((s) => ({
        positions: s.positions.map(p => p.symbol === symbol ? { ...p, currentPrice: price } : p),
      })),

      updateSettings: (s) => set((state) => ({
        settings: { ...state.settings, ...s, costs: { ...state.settings.costs, ...(s.costs || {}) } },
      })),

      resetPaperAccount: () => set((s) => ({
        equity: s.settings.startCapital,
        peakEquity: s.settings.startCapital,
        positions: [],
        trades: [],
        autoTrade: false,
        engineLogs: [],
        safetyPaused: false,
        safetyReason: '',
      })),

      setScanResults: (r) => set({ lastScanResults: r }),

      addLog: (msg, type = 'info') => set((s) => {
        const log: EngineLog = { time: new Date().toLocaleTimeString('en-IN'), msg, type };
        return { engineLogs: [log, ...s.engineLogs].slice(0, 100) };
      }),

      setSafetyPause: (paused, reason) => set({ safetyPaused: paused, safetyReason: reason }),

      setAngelOneToken: (token, expiry) => set((s) => ({
        settings: { ...s.settings, angelOne: { ...s.settings.angelOne, token, tokenExpiry: expiry, connected: true } },
      })),

      setAngelOneConnected: (connected) => set((s) => ({
        settings: { ...s.settings, angelOne: { ...s.settings.angelOne, connected } },
      })),
    }),
    {
      name: 'nse-paper-trader-v2', // new key to avoid stale data
      partialize: (s) => ({
        mode: s.mode,
        equity: s.equity,
        peakEquity: s.peakEquity,
        positions: s.positions,
        trades: s.trades,
        settings: s.settings,
        // don't persist: autoTrade, logs, safetyPaused
      }),
    }
  )
);
