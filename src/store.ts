// Zustand store with persist
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

export interface AppSettings {
  startCapital: number;
  riskPct: number;
  costs: CostSettings;
  watchlist: string[];
}

export type AppMode = 'PAPER' | 'REAL';

interface AppState {
  mode: AppMode;
  equity: number;
  peakEquity: number;
  positions: Position[];
  trades: TradeRecord[];
  autoTrade: boolean;
  settings: AppSettings;
  lastScanResults: import('./engine/engine').ScanResult[];

  setMode: (m: AppMode) => void;
  setAutoTrade: (v: boolean) => void;
  openPosition: (pos: Position, cost: number) => void;
  closePosition: (symbol: string, exitPrice: number, record: TradeRecord) => void;
  updatePositionStop: (symbol: string, stop: number) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
  resetPaperAccount: () => void;
  setScanResults: (r: import('./engine/engine').ScanResult[]) => void;
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
};

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: 'PAPER',
      equity: DEFAULT_SETTINGS.startCapital,
      peakEquity: DEFAULT_SETTINGS.startCapital,
      positions: [],
      trades: [],
      autoTrade: false,
      settings: DEFAULT_SETTINGS,
      lastScanResults: [],

      setMode: (m) => set({ mode: m }),
      setAutoTrade: (v) => set({ autoTrade: v }),

      openPosition: (pos, cost) => set((s) => {
        const newEquity = s.equity - cost;
        return {
          positions: [...s.positions, pos],
          equity: newEquity,
          peakEquity: Math.max(s.peakEquity, newEquity),
        };
      }),

      closePosition: (symbol, exitPrice, record) => set((s) => {
        const pos = s.positions.find(p => p.symbol === symbol);
        if (!pos) return {};
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

      updateSettings: (s) => set((state) => ({
        settings: { ...state.settings, ...s },
      })),

      resetPaperAccount: () => set((s) => ({
        equity: s.settings.startCapital,
        peakEquity: s.settings.startCapital,
        positions: [],
        trades: [],
        autoTrade: false,
      })),

      setScanResults: (r) => set({ lastScanResults: r }),
    }),
    { name: 'nse-paper-trader-v1' }
  )
);

