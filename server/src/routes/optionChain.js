import { Router } from 'express';
import { getOptionChain, getTickersForExpiry } from '../services/optionChain.js';

const router = Router();

/* ── GET /api/option-chain ───────────────────────────────── */
router.get('/option-chain', async (req, res) => {
  try {
    const currency = req.query.currency || 'BTC';
    const chainData = await getOptionChain(currency);
    res.json(chainData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── GET /api/option-chain/tickers ───────────────────────── */
router.get('/option-chain/tickers', async (req, res) => {
  try {
    const { currency = 'BTC', expiryDate } = req.query;
    
    if (!expiryDate) {
      return res.status(400).json({ error: 'expiryDate is required' });
    }

    const chainData = await getOptionChain(currency);
    
    if (!chainData.chain[expiryDate]) {
      return res.status(404).json({ error: 'Expiry date not found' });
    }

    const strikes = chainData.chain[expiryDate].strikes;
    const tickers = await getTickersForExpiry(currency, expiryDate, strikes, chainData.chain);
    
    res.json(tickers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
