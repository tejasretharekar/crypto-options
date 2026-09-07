/**
 * Prices REST routes.
 * 
 * GET /api/prices           — Current BTC/ETH index prices
 * GET /api/instruments      — Available options instruments
 * GET /api/ticker/:name     — Ticker for a specific instrument
 */
import { Router } from 'express';
import { getDeribitClient } from '../services/deribit.js';
import { getATH } from '../services/ath.js';

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
    const candles = await deribit.getTradingViewChartData(instrument, resolution, start, end);

    res.json({
      instrument,
      resolution,
      count: candles.length,
      candles,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/ath ───────────────────────────────────────── */
router.get('/ath', async (req, res) => {
  try {
    const currency = req.query.currency || 'BTC';
    const athData = await getATH(currency);
    
    if (!athData) {
      return res.status(404).json({ error: 'ATH data not available' });
    }
    
    res.json(athData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
