/**
 * Portfolio REST routes.
 * 
 * GET /api/portfolio       — Current portfolio (cash + positions + total value)
 * GET /api/positions       — Open positions
 * GET /api/trades          — Trade history
 */
import { Router } from 'express';
import { getPortfolio, getOpenPositions, getTradeHistory } from '../db/index.js';

const router = Router();

/* ── GET /api/portfolio ──────────────────────────────────── */
router.get('/portfolio', (_req, res) => {
  try {
    const portfolio = getPortfolio();
    const positions = getOpenPositions();

    const positionsValue = positions.reduce((sum, p) => {
      const multiplier = p.direction === 'buy' ? 1 : -1;
      return sum + (p.current_price * p.quantity * multiplier);
    }, 0);

    res.json({
      cash: portfolio.cash,
      positions_value: positionsValue,
      total_value: portfolio.cash + positionsValue,
      positions_count: positions.length,
      created_at: portfolio.created_at,
      updated_at: portfolio.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/positions ──────────────────────────────────── */
router.get('/positions', (_req, res) => {
  try {
    const positions = getOpenPositions();
    res.json({ positions, count: positions.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/trades ─────────────────────────────────────── */
router.get('/trades', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = getTradeHistory(limit);
    res.json({ trades, count: trades.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
