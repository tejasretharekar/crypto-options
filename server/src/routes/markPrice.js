import { Router } from 'express';
import { getMarkPriceCollector } from '../services/markPriceCollector.js';
import { getOptionChain } from '../services/optionChain.js';

const router = Router();

router.get('/option-mark-price-candles', (req, res) => {
  try {
    const { instrument, resolution = '60', start, end } = req.query;
    if (!instrument) {
      return res.status(400).json({ error: 'instrument is required' });
    }

    const startMs = start ? parseInt(start, 10) : 0;
    const endMs = end ? parseInt(end, 10) : Date.now();

    const collector = getMarkPriceCollector();
    const candles = collector.getCandles(instrument, resolution, startMs, endMs);
    
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

router.get('/option-ath', (req, res) => {
  try {
    const { instrument } = req.query;
    if (!instrument) {
      return res.status(400).json({ error: 'instrument is required' });
    }

    const collector = getMarkPriceCollector();
    const athData = collector.getATH(instrument);
    
    if (!athData) {
      return res.status(404).json({ error: 'ATH data not available' });
    }
    
    res.json(athData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark-price-collector/track', async (req, res) => {
  try {
    const { expiryDate, currency = 'BTC' } = req.query;
    if (!expiryDate) {
      return res.status(400).json({ error: 'expiryDate is required' });
    }

    const chainData = await getOptionChain(currency);
    const collector = getMarkPriceCollector();
    collector.trackExpiry(chainData, expiryDate);
    
    res.json({ success: true, message: "Tracking started for " + expiryDate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
