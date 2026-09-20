import { getDeribitClient } from './deribit.js';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const athCache = {};

export async function getATH(currency = 'BTC') {
  if (currency !== 'BTC') {
    return null; // For now, only BTC ATH is supported
  }

  const instrumentName = 'BTC-PERPETUAL';
  const now = Date.now();

  if (athCache[instrumentName] && (now - athCache[instrumentName].calculatedAt < CACHE_TTL)) {
    return athCache[instrumentName];
  }

  const deribit = getDeribitClient();
  
  // Start from Jan 1, 2018
  const startTimestamp = 1514764800000; 
  const endTimestamp = now;

  try {
    const candles = await deribit.getTradingViewChartData(instrumentName, '1D', startTimestamp, endTimestamp);
    
    if (!candles || candles.length === 0) {
      if (athCache[instrumentName]) {
        return athCache[instrumentName]; // Return stale cache if fetch fails
      }
      return null;
    }

    const athValue = candles.reduce((max, c) => Math.max(max, c.high), -Infinity);

    athCache[instrumentName] = {
      ath: athValue,
      instrument: instrumentName,
      calculatedAt: now,
      candleCount: candles.length
    };

    return athCache[instrumentName];
  } catch (err) {
    console.error('[ATH] Error fetching historical data:', err.message);
    if (athCache[instrumentName]) {
      return athCache[instrumentName]; // Return stale cache if fetch fails
    }
    throw err;
  }
}
