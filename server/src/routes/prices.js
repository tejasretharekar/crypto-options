/**
 * Prices REST routes.
 * 
 * GET /api/prices           — Current BTC/ETH index prices
 * GET /api/instruments      — Available options instruments
 * GET /api/ticker/:name     — Ticker for a specific instrument
 */
import { Router } from 'express';
import { getDeribitClient } from '../services/deribit.js';

const router = Router();

/* ── GET /api/prices ─────────────────────────────────────── */
router.get('/prices', (_req, res) => {
  try {
    const deribit = getDeribitClient();
    const status = deribit.getStatus();
    res.json({
      connected: status.connected,
      prices: status.prices,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/instruments ────────────────────────────────── */
router.get('/instruments', async (req, res) => {
  try {
    const currency = req.query.currency || 'BTC';
    const kind = req.query.kind || 'option';
    const deribit = getDeribitClient();

    if (!deribit.isConnected) {
      return res.status(503).json({ error: 'Deribit not connected' });
    }

    const instruments = await deribit.getInstruments(currency, kind);
    res.json({
      currency,
      kind,
      count: instruments.length,
      instruments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/ticker/:name ───────────────────────────────── */
router.get('/ticker/:name', async (req, res) => {
  try {
    const deribit = getDeribitClient();

    if (!deribit.isConnected) {
      return res.status(503).json({ error: 'Deribit not connected' });
    }

    const ticker = await deribit.getTicker(req.params.name);
    res.json(ticker);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/chart-data ────────────────────────────────── */
router.get('/chart-data', async (req, res) => {
  try {
    const instrument = req.query.instrument || 'BTC-PERPETUAL';
    const resolution = req.query.resolution || '60';
    const start = req.query.start ? Number(req.query.start) : undefined;
    const end = req.query.end ? Number(req.query.end) : undefined;

    const deribit = getDeribitClient();
    const isOption = instrument.includes('-') && (instrument.endsWith('-C') || instrument.endsWith('-P'));
    let tickerInfo = null;
    if (isOption && deribit.isConnected) {
      try {
        tickerInfo = await deribit.getTicker(instrument);
      } catch (err) {
        // ticker optional
      }
    }

    let candles = await deribit.getTradingViewChartData(instrument, resolution, start, end);

    // If it is an option and has no trade candles yet, synthesize baseline candles from mark price so the chart can still render
    if (isOption && (!candles || candles.length === 0) && tickerInfo && (tickerInfo.mark_price || tickerInfo.best_bid_price || tickerInfo.best_ask_price)) {
      const basePrice = tickerInfo.mark_price || tickerInfo.best_bid_price || tickerInfo.best_ask_price;
      const nowSec = Math.floor(Date.now() / 1000);
      const resMap = { '1': 60, '3': 180, '5': 300, '15': 900, '30': 1800, '60': 3600, '120': 7200, '240': 14400, '1D': 86400 };
      const stepSec = resMap[resolution] || 3600;
      const count = 30;
      const synthCandles = [];
      for (let i = count - 1; i >= 0; i--) {
        const t = nowSec - i * stepSec;
        synthCandles.push({
          time: t,
          open: basePrice,
          high: basePrice,
          low: basePrice,
          close: basePrice,
          volume: 0,
        });
      }
      candles = synthCandles;
    }

    res.json({
      instrument,
      resolution,
      isOption,
      ticker: tickerInfo ? {
        mark_price: tickerInfo.mark_price,
        mark_iv: tickerInfo.mark_iv,
        underlying_price: tickerInfo.underlying_price,
        best_bid_price: tickerInfo.best_bid_price,
        best_ask_price: tickerInfo.best_ask_price,
        greeks: tickerInfo.greeks,
        stats: tickerInfo.stats,
      } : null,
      count: candles.length,
      candles,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

