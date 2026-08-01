/**
 * Option Chain service — fetches instrument data from Deribit
 * and formats it into a grouped option chain structure.
 */
import { getDeribitClient } from './deribit.js';

// Cache instruments for 5 minutes
let instrumentsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get all option instruments grouped by expiry date.
 * @param {string} currency - 'BTC' or 'ETH'
 * @returns {Object} { expiries: [...], instruments: { expiryKey: [...] } }
 */
export async function getOptionChain(currency = 'BTC') {
  const deribit = getDeribitClient();

  if (!deribit.isConnected) {
    throw new Error('Deribit not connected');
  }

  // Fetch instruments (cached)
  const now = Date.now();
  const cacheKey = `${currency}_option`;
  if (
    !instrumentsCache.data ||
    instrumentsCache.key !== cacheKey ||
    now - instrumentsCache.timestamp > CACHE_TTL
  ) {
    const instruments = await deribit.getInstruments(currency, 'option');
    instrumentsCache = { data: instruments, key: cacheKey, timestamp: now };
  }

  const instruments = instrumentsCache.data;

  // Get current underlying price
  const indexName = `${currency.toLowerCase()}_usd`;
  const priceData = deribit.prices[indexName];
  const underlyingPrice = priceData?.price || 0;

  // Group by expiry
  const expiryMap = {};
  const expiryDates = new Set();

  for (const inst of instruments) {
    const expiry = inst.expiration_timestamp;
    const expiryDate = new Date(expiry).toISOString().split('T')[0];
    expiryDates.add(expiryDate);

    if (!expiryMap[expiryDate]) {
      expiryMap[expiryDate] = {
        expiryDate,
        expiryTimestamp: expiry,
        calls: {},
        puts: {},
        strikes: new Set(),
      };
    }

    const group = expiryMap[expiryDate];
    group.strikes.add(inst.strike);

    const entry = {
      instrument_name: inst.instrument_name,
      strike: inst.strike,
      option_type: inst.option_type,
      min_trade_amount: inst.min_trade_amount,
      tick_size: inst.tick_size,
      contract_size: inst.contract_size,
    };

    if (inst.option_type === 'call') {
      group.calls[inst.strike] = entry;
    } else {
      group.puts[inst.strike] = entry;
    }
  }

  // Sort and format
  const expiries = Array.from(expiryDates).sort();

  const chain = {};
  for (const [date, group] of Object.entries(expiryMap)) {
    const sortedStrikes = Array.from(group.strikes).sort((a, b) => a - b);

    // Filter to show strikes around ATM (±30% of underlying price)
    const lowerBound = underlyingPrice * 0.7;
    const upperBound = underlyingPrice * 1.3;
    const relevantStrikes = sortedStrikes.filter(
      (s) => s >= lowerBound && s <= upperBound
    );

    chain[date] = {
      expiryDate: date,
      expiryTimestamp: group.expiryTimestamp,
      daysToExpiry: Math.max(
        0,
        Math.ceil((group.expiryTimestamp - now) / (1000 * 60 * 60 * 24))
      ),
      strikes: relevantStrikes.length > 0 ? relevantStrikes : sortedStrikes.slice(0, 20),
      allStrikes: sortedStrikes,
      calls: group.calls,
      puts: group.puts,
    };
  }

  return {
    currency,
    underlyingPrice,
    expiries,
    chain,
  };
}

/**
 * Get ticker data for multiple instruments at once.
 * Uses parallel requests (batched).
 */
export async function getTickersForExpiry(currency, expiryDate, strikes, chain) {
  const deribit = getDeribitClient();
  if (!deribit.isConnected) throw new Error('Deribit not connected');

  const expiryData = chain[expiryDate];
  if (!expiryData) throw new Error(`No data for expiry ${expiryDate}`);

  const instrumentNames = [];
  for (const strike of strikes) {
    if (expiryData.calls[strike]) instrumentNames.push(expiryData.calls[strike].instrument_name);
    if (expiryData.puts[strike]) instrumentNames.push(expiryData.puts[strike].instrument_name);
  }

  // Fetch tickers in parallel (batch of 10)
  const BATCH_SIZE = 10;
  const tickers = {};

  for (let i = 0; i < instrumentNames.length; i += BATCH_SIZE) {
    const batch = instrumentNames.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((name) => deribit.getTicker(name))
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        tickers[batch[j]] = results[j].value;
      }
    }
  }

  return tickers;
}
