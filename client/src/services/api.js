/**
 * API client service for the Crypto Options Trader backend.
 */
const API_BASE = 'http://localhost:3001/api';

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

/* ── Prices ──────────────────────────────────────────────── */
export const getPrices = () => request('/prices');

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
