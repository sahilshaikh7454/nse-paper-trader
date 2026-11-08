// Angel One Smart API integration
// Docs: https://smartapi.angelbroking.com/docs
// Uses CapacitorHttp on Android (no CORS), native fetch on web

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { AngelOneConfig } from '../store';

const BASE = 'https://apiconnect.angelbroking.com';

async function apiCall(
  path: string,
  method: 'GET' | 'POST',
  body?: object,
  token?: string,
  apiKey?: string
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': apiKey || '',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      method,
      url: BASE + path,
      headers,
      data: body,
    });
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } else {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }
}

// TOTP generation (RFC 6238 compatible)
export async function generateTOTP(secret: string): Promise<string> {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret_upper = secret.toUpperCase().replace(/\s/g, '');
  let bits = '';
  for (const c of secret_upper) {
    const idx = base32Chars.indexOf(c);
    if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  let c = BigInt(Math.floor(Date.now() / 1000 / 30));
  const cb = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    cb[i] = Number(c & 0xffn);
    c >>= 8n;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, cb);
  const sigArr = new Uint8Array(sig);
  const offset = sigArr[19] & 0xf;
  const code =
    (((sigArr[offset] & 0x7f) << 24) |
      (sigArr[offset + 1] << 16) |
      (sigArr[offset + 2] << 8) |
      sigArr[offset + 3]) %
    1000000;
  return code.toString().padStart(6, '0');
}

export interface AngelLoginResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  feedToken?: string;
  error?: string;
}

export async function angelLogin(cfg: AngelOneConfig): Promise<AngelLoginResult> {
  try {
    if (!cfg.apiKey || !cfg.clientId || !cfg.password || !cfg.totp) {
      return { success: false, error: 'API Key, Client ID, PIN/Password & TOTP secret are required' };
    }
    const totp = await generateTOTP(cfg.totp);
    const res = await apiCall(
      '/rest/auth/angelbroking/user/v1/loginByPassword',
      'POST',
      {
        clientcode: cfg.clientId.trim(),
        password: cfg.password.trim(),
        totp,
      },
      undefined,
      cfg.apiKey.trim()
    );

    if (res && res.status && res.data?.jwtToken) {
      return {
        success: true,
        token: res.data.jwtToken,
        refreshToken: res.data.refreshToken,
        feedToken: res.data.feedToken,
      };
    }
    return { success: false, error: res?.message || 'Login failed — check credentials' };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export interface AngelOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

// NSE symbol -> Angel One token map (for the 21 watchlist symbols)
export const ANGEL_TOKEN_MAP: Record<string, string> = {
  'ITC': '1660',
  'SBIN': '3045',
  'NTPC': '11630',
  'ONGC': '2475',
  'POWERGRID': '14977',
  'COALINDIA': '20374',
  'TATASTEEL': '3499',
  'HINDALCO': '1363',
  'WIPRO': '3787',
  'BPCL': '526',
  'IOC': '1624',
  'GAIL': '1067',
  'PNB': '10666',
  'BANKBARODA': '4668',
  'HDFCBANK': '1333',
  'ICICIBANK': '4963',
  'INFY': '1594',
  'AXISBANK': '5900',
  'NIFTYBEES': '15068',
  'BANKBEES': '12934',
  'GOLDBEES': '8664',
};

// Place a market order (delivery/NORMAL) on Angel One
export async function angelPlaceOrder(
  cfg: AngelOneConfig,
  symbol: string,
  qty: number,
  transactionType: 'BUY' | 'SELL'
): Promise<AngelOrderResult> {
  try {
    if (!cfg.connected || !cfg.token) {
      // Try re-authenticating first if credentials exist
      const loginRes = await angelLogin(cfg);
      if (!loginRes.success || !loginRes.token) {
        return { success: false, error: 'Angel One not logged in: ' + (loginRes.error || 'auth failed') };
      }
      cfg.token = loginRes.token;
    }

    const clean = symbol.replace('.NS', '').toUpperCase();
    const token = ANGEL_TOKEN_MAP[clean] || '';
    const tradingSymbol = `${clean}-EQ`;

    const res = await apiCall(
      '/rest/secure/angelbroking/order/v1/placeOrder',
      'POST',
      {
        variety: 'NORMAL',
        tradingsymbol: tradingSymbol,
        symboltoken: token,
        transactiontype: transactionType,
        exchange: 'NSE',
        ordertype: 'MARKET',
        producttype: 'DELIVERY',
        duration: 'DAY',
        price: '0',
        squareoff: '0',
        stoploss: '0',
        quantity: String(qty),
      },
      cfg.token,
      cfg.apiKey
    );

    if (res && res.status && res.data?.orderid) {
      return { success: true, orderId: res.data.orderid };
    }
    return { success: false, error: res?.message || 'Order rejected by broker' };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}
