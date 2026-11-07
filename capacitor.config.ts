import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sahil.nsepapertrader',
  appName: 'NSE Paper Trader',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
