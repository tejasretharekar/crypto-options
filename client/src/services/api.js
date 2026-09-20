/**
 * API client service for the Crypto Options Trader backend.
 */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/* ── Health & Status ─────────────────────────────────────── */
export const getHealth = () => request('/health');

/* ── Prices & Charts ─────────────────────────────────────── */
export const getPrices = () => request('/prices');

export const getChartData = (instrument = 'BTC-PERPETUAL', resolution = '60', start, end) => {
  const params = new URLSearchParams({ instrument, resolution });
  if (start) params.append('start', start);
  if (end) params.append('end', end);
  return request(`/chart-data?${params.toString()}`);
};

export const getATH = (currency = 'BTC') => request(`/ath?currency=${currency}`);

/* ── Portfolio ───────────────────────────────────────────── */
export const getPortfolio = () => request('/portfolio');
export const getPositions = () => request('/positions');
export const getTrades = (limit = 50) => request(`/trades?limit=${limit}`);

/* ── Option Chain ────────────────────────────────────────── */
export const getOptionChain = (currency = 'BTC') =>
  request(`/option-chain?currency=${currency}`);

export const getInstruments = (currency = 'BTC', kind = 'option') =>
  request(`/instruments?currency=${currency}&kind=${kind}`);

export const getTicker = (instrumentName) =>
  request(`/ticker/${instrumentName}`);

/* ── Trading ─────────────────────────────────────────────── */
export const placeTrade = (trade) =>
  request('/trade', {
    method: 'POST',
    body: JSON.stringify(trade),
  });

export const closePosition = (positionId) =>
  request(`/position/${positionId}/close`, {
    method: 'POST',
  });

export async function getOptionMarkPriceCandles(instrument, resolution = '60', start, end) {
  const query = new URLSearchParams({ instrument, resolution });
  if (start) query.append('start', start);
  if (end) query.append('end', end);
  return request('/option-mark-price-candles?' + query.toString());
}

export async function getOptionATH(instrument) {
  return request('/option-ath?instrument=' + instrument);
}

export async function trackExpiry(currency, expiryDate) {
  return request('/mark-price-collector/track?currency=' + currency + '&expiryDate=' + expiryDate, {
    method: 'POST'
  });
}
export const getOptionTickers = (currency = 'BTC', expiryDate) =>
  request(`/option-chain/tickers?currency=${currency}&expiryDate=${expiryDate}`);
