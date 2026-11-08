// Zustand store with persist — v3 (Separate Paper vs Real state, fixed drawdown & sizing)
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
  isReal?: boolean;
  orderId?: string;
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
  isReal?: boolean;
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
  muhuratMode: boolean;
}

export type AppMode = 'PAPER' | 'REAL';

export interface EngineLog {
  time: string;
  msg: string;
  type: 'info' | 'trade' | 'warn' | 'error';
}

interface AppState {
  mode: AppMode;
  autoTrade: boolean;
  settings: AppSettings;
  lastScanResults: import('./engine/engine').ScanResult[];
  engineLogs: EngineLog[];
  safetyPaused: boolean;
  safetyReason: string;

  // PAPER MODE STATE
  paperCash: number;
  paperPeakValue: number;
  paperPositions: Position[];
  paperTrades: TradeRecord[];

  // REAL MODE STATE
  realCash: number;
  realPeakValue: number;
  realPositions: Position[];
  realTrades: TradeRecord[];

  setMode: (m: AppMode) => void;
  setAutoTrade: (v: boolean) => void;
  openPosition: (pos: Position, cost: number, isReal?: boolean) => void;
  closePosition: (symbol: string, exitPrice: number, record: TradeRecord, isReal?: boolean) => void;
  updatePositionStop: (symbol: string, stop: number, isReal?: boolean) => void;
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
  muhuratMode: false, // Default false so app follows real NSE market hours strictly
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: 'PAPER',
      autoTrade: false,
      settings: DEFAULT_SETTINGS,
      lastScanResults: [],
      engineLogs: [],
      safetyPaused: false,
      safetyReason: '',

      paperCash: DEFAULT_SETTINGS.startCapital,
      paperPeakValue: DEFAULT_SETTINGS.startCapital,
      paperPositions: [],
      paperTrades: [],

      realCash: DEFAULT_SETTINGS.startCapital,
      realPeakValue: DEFAULT_SETTINGS.startCapital,
      realPositions: [],
      realTrades: [],

      setMode: (m) => set({ mode: m, safetyPaused: false, safetyReason: '' }),
      setAutoTrade: (v) => set({ autoTrade: v }),

      openPosition: (pos, cost, isReal = false) => set((s) => {
        if (isReal) {
          const positions = [...s.realPositions, { ...pos, isReal: true }];
          const posVal = positions.reduce((sum, p) => sum + p.shares * (p.currentPrice ?? p.entry), 0);
          return {
            realPositions: positions,
            realPeakValue: Math.max(s.realPeakValue, posVal),
          };
        } else {
          const newCash = Math.max(0, s.paperCash - cost);
          const positions = [...s.paperPositions, { ...pos, isReal: false }];
          const posVal = positions.reduce((sum, p) => sum + p.shares * (p.currentPrice ?? p.entry), 0);
          const totalPort = newCash + posVal;
          return {
            paperCash: newCash,
            paperPositions: positions,
            paperPeakValue: Math.max(s.paperPeakValue, totalPort),
          };
        }
      }),

      closePosition: (symbol, exitPrice, record, isReal = false) => set((s) => {
        if (isReal) {
          const positions = s.realPositions.filter(p => p.symbol !== symbol);
          return {
            realPositions: positions,
            realTrades: [...s.realTrades, { ...record, isReal: true }],
          };
        } else {
          const pos = s.paperPositions.find(p => p.symbol === symbol);
          if (!pos) return {};
          const proceeds = exitPrice * pos.shares
            - pos.shares * exitPrice * s.settings.costs.brokeragePct
            - s.settings.costs.dpPerSell;
          const newCash = s.paperCash + proceeds;
          const positions = s.paperPositions.filter(p => p.symbol !== symbol);
          const posVal = positions.reduce((sum, p) => sum + p.shares * (p.currentPrice ?? p.entry), 0);
          const totalPort = newCash + posVal;
          return {
            paperCash: newCash,
            paperPositions: positions,
            paperTrades: [...s.paperTrades, { ...record, isReal: false }],
            paperPeakValue: Math.max(s.paperPeakValue, totalPort),
          };
        }
      }),

      updatePositionStop: (symbol, stop, isReal = false) => set((s) => {
        if (isReal) {
          return {
            realPositions: s.realPositions.map(p => p.symbol === symbol ? { ...p, stop } : p),
          };
        } else {
          return {
            paperPositions: s.paperPositions.map(p => p.symbol === symbol ? { ...p, stop } : p),
          };
        }
      }),

      updatePositionPrice: (symbol, price) => set((s) => {
        const update = (list: Position[]) =>
          list.map(p => p.symbol === symbol ? { ...p, currentPrice: price } : p);

        const newPaper = update(s.paperPositions);
        const paperVal = s.paperCash + newPaper.reduce((sum, p) => sum + p.shares * (p.currentPrice ?? p.entry), 0);

        const newReal = update(s.realPositions);
        const realVal = s.realCash + newReal.reduce((sum, p) => sum + p.shares * (p.currentPrice ?? p.entry), 0);

        return {
          paperPositions: newPaper,
          paperPeakValue: Math.max(s.paperPeakValue, paperVal),
          realPositions: newReal,
          realPeakValue: Math.max(s.realPeakValue, realVal),
        };
      }),

      updateSettings: (s) => set((state) => ({
        settings: { ...state.settings, ...s, costs: { ...state.settings.costs, ...(s.costs || {}) } },
      })),

      resetPaperAccount: () => set((s) => ({
        paperCash: s.settings.startCapital,
        paperPeakValue: s.settings.startCapital,
        paperPositions: [],
        paperTrades: [],
        safetyPaused: false,
        safetyReason: '',
        engineLogs: [{ time: new Date().toLocaleTimeString('en-IN'), msg: 'Virtual paper account reset to ₹10,000', type: 'info' }],
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
      name: 'nse-paper-trader-v3', // Fresh storage key to clear out corrupted 22-position state
      partialize: (s) => ({
        mode: s.mode,
        settings: s.settings,
        paperCash: s.paperCash,
        paperPeakValue: s.paperPeakValue,
        paperPositions: s.paperPositions,
        paperTrades: s.paperTrades,
        realCash: s.realCash,
        realPeakValue: s.realPeakValue,
        realPositions: s.realPositions,
        realTrades: s.realTrades,
      }),
    }
  )
);
