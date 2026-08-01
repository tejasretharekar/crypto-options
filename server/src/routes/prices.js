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

export default router;
