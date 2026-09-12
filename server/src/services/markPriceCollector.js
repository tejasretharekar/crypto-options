import { 
  insertMarkPriceTick, 
  getOptionAth, 
  updateOptionAth, 
  getActiveTrackedOptions,
  getOptionTicks 
} from '../db/index.js';

class MarkPriceCollector {
  constructor() {
    this.trackedInstruments = new Set();
    this.lastStoredTimestamp = {};
    this.athCache = {};
  }

  initialize() {
    const now = Date.now();
    const active = getActiveTrackedOptions(now);
    for (const opt of active) {
      this.trackedInstruments.add(opt.instrument_name);
      this.athCache[opt.instrument_name] = {
        ath: opt.ath_mark_price,
        timestamp: opt.ath_timestamp,
        firstTracked: opt.first_tracked,
        expiryTimestamp: opt.expiry_timestamp
      };
    }
    console.log('[Collector] Initialized. Tracking ' + this.trackedInstruments.size + ' active instruments.');
  }

  onData(data) {
    if (!Array.isArray(data)) return;
    // console.log('[Collector] Received batch of ' + data.length + ' instruments');
    const now = Date.now();

    for (const item of data) {
      const { instrument_name, mark_price, iv, timestamp } = item;
      
      if (!this.trackedInstruments.has(instrument_name)) continue;
      console.log('[Collector] Processing tracked instrument: ' + instrument_name);

      if (!this.athCache[instrument_name]) {
        this.athCache[instrument_name] = {
          ath: mark_price,
          timestamp,
          firstTracked: timestamp,
          expiryTimestamp: this._guessExpiry(instrument_name)
        };
      }

      const cache = this.athCache[instrument_name];

      if (mark_price > cache.ath) {
        cache.ath = mark_price;
        cache.timestamp = timestamp;
        
        updateOptionAth(
          instrument_name, 
          cache.ath, 
          cache.timestamp, 
          cache.firstTracked, 
          cache.expiryTimestamp
        );
      }

      const lastStored = this.lastStoredTimestamp[instrument_name] || 0;
      if (timestamp - lastStored >= 5000) {
        insertMarkPriceTick(instrument_name, timestamp, mark_price, iv || 0);
        this.lastStoredTimestamp[instrument_name] = timestamp;
      }
    }
    
    if (Math.random() < 0.01) {
      this._cleanupExpired();
    }
  }

  trackExpiry(chainData, expiryDate) {
    const expiryGroup = chainData.chain[expiryDate];
    if (!expiryGroup) return;

    const expiryTimestamp = expiryGroup.expiryTimestamp;
    let addedCount = 0;
    const now = Date.now();

    for (const strike of expiryGroup.allStrikes) {
      const call = expiryGroup.calls[strike];
      const put = expiryGroup.puts[strike];

      if (call && !this.trackedInstruments.has(call.instrument_name)) {
        this.trackedInstruments.add(call.instrument_name);
        this.athCache[call.instrument_name] = {
          ath: 0,
          timestamp: now,
          firstTracked: now,
          expiryTimestamp
        };
        addedCount++;
      }
      
      if (put && !this.trackedInstruments.has(put.instrument_name)) {
        this.trackedInstruments.add(put.instrument_name);
        this.athCache[put.instrument_name] = {
          ath: 0,
          timestamp: now,
          firstTracked: now,
          expiryTimestamp
        };
        addedCount++;
      }
    }
    
    if (addedCount > 0) {
      console.log('[Collector] Now tracking ' + addedCount + ' new instruments for expiry ' + expiryDate);
    }
  }

  getATH(instrumentName) {
    if (this.athCache[instrumentName]) {
      return {
        instrument_name: instrumentName,
        ath_mark_price: this.athCache[instrumentName].ath,
        ath_timestamp: this.athCache[instrumentName].timestamp,
        first_tracked: this.athCache[instrumentName].firstTracked
      };
    }
    return getOptionAth(instrumentName);
  }

  getCandles(instrumentName, resolutionStr, startMs, endMs) {
    let resolutionSec = 3600;
    if (resolutionStr === '1D') resolutionSec = 86400;
    else if (!isNaN(parseInt(resolutionStr, 10))) resolutionSec = parseInt(resolutionStr, 10);
    
    const intervalMs = resolutionSec * 1000;
    
    const ticks = getOptionTicks(instrumentName, startMs, endMs);
    if (!ticks || ticks.length === 0) return [];

    const candlesMap = new Map();
    for (const tick of ticks) {
      const bucket = tick.timestamp_ms - (tick.timestamp_ms % intervalMs);
      if (!candlesMap.has(bucket)) {
        candlesMap.set(bucket, {
          time: Math.floor(bucket / 1000),
          open: tick.mark_price,
          high: tick.mark_price,
          low: tick.mark_price,
          close: tick.mark_price
        });
      } else {
        const c = candlesMap.get(bucket);
        c.high = Math.max(c.high, tick.mark_price);
        c.low = Math.min(c.low, tick.mark_price);
        c.close = tick.mark_price;
      }
    }

    const candles = Array.from(candlesMap.values());
    candles.sort((a, b) => a.time - b.time);
    return candles;
  }

  _guessExpiry(instrumentName) {
    return Date.now() + 30 * 24 * 3600 * 1000;
  }

  _cleanupExpired() {
    const now = Date.now();
    for (const inst of this.trackedInstruments) {
      const cache = this.athCache[inst];
      if (cache && cache.expiryTimestamp < now) {
        this.trackedInstruments.delete(inst);
        delete this.athCache[inst];
        delete this.lastStoredTimestamp[inst];
      }
    }
  }
}

const collector = new MarkPriceCollector();
export function getMarkPriceCollector() {
  return collector;
}
