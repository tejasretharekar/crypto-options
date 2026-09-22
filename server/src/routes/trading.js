/**
 * Trading REST routes — paper trade execution.
 * 
 * POST /api/trade              — Execute a paper trade
 * POST /api/position/:id/close — Close an open position
 */
import { Router } from 'express';
import { 
  getPortfolio, 
  updateCash, 
  insertTrade,
  findOpenPosition,
  findOpenPositionById,
  updatePositionQuantity,
  closePosition,
  createPosition
} from '../db/index.js';
import { getDeribitClient } from '../services/deribit.js';

const router = Router();

/* ── POST /api/trade ─────────────────────────────────────── */
router.post('/trade', async (req, res) => {
  try {
    const {
      instrument_name,
      direction,     // 'buy' or 'sell'
      quantity,
      option_type,   // 'call' or 'put'
      strike,
      expiry,
      currency = 'BTC',
    } = req.body;

    // Validation
    if (!instrument_name || !direction || !quantity || !option_type || !strike) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['buy', 'sell'].includes(direction)) {
      return res.status(400).json({ error: 'Direction must be buy or sell' });
    }

    if (!['call', 'put'].includes(option_type)) {
      return res.status(400).json({ error: 'Option type must be call or put' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be positive' });
    }

    // Get current market price from Deribit
    const deribit = getDeribitClient();
    if (!deribit.isConnected) {
      return res.status(503).json({ error: 'Deribit not connected' });
    }

    const ticker = await deribit.getTicker(instrument_name);
    const markPrice = ticker.mark_price; // In BTC

    // Get underlying price for USD conversion
    const indexName = `${currency.toLowerCase()}_usd`;
    const underlyingPrice = deribit.prices[indexName]?.price || 0;

    if (!underlyingPrice) {
      return res.status(503).json({ error: 'Underlying price not available' });
    }

    // Calculate cost in USD
    // Deribit option prices are in BTC. Cost = markPrice * quantity * underlyingPrice
    const priceUsd = markPrice * underlyingPrice;
    const totalCost = priceUsd * quantity;

    // Check portfolio balance
    const portfolio = await getPortfolio();

    if (direction === 'buy' && totalCost > portfolio.cash) {
      return res.status(400).json({
        error: 'Insufficient funds',
        required: totalCost,
        available: portfolio.cash,
      });
    }

    // Record the trade
    await insertTrade(instrument_name, direction, quantity, priceUsd, totalCost, currency, strike, expiry, option_type);

    // Create or update position
    // Check if there's an existing open position for this instrument
    const pos = await findOpenPosition(instrument_name);

    if (pos) {
      // Update existing position
      const currentQty = pos.quantity;
      const currentDir = pos.direction;

      if (direction === currentDir) {
        // Adding to position
        const newQty = currentQty + quantity;
        const avgPrice = (pos.entry_price * currentQty + priceUsd * quantity) / newQty;
        await updatePositionQuantity(pos.id, newQty, avgPrice);
      } else {
        // Reducing or closing position
        if (quantity >= currentQty) {
          // Close position
          const pnl = currentDir === 'buy'
            ? (priceUsd - pos.entry_price) * currentQty
            : (pos.entry_price - priceUsd) * currentQty;
          await closePosition(pos.id, priceUsd, pnl);
        } else {
          // Partial close
          const newQty = currentQty - quantity;
          await updatePositionQuantity(pos.id, newQty);
        }
      }
    } else {
      // Create new position
      await createPosition(instrument_name, direction, quantity, priceUsd, priceUsd, currency, strike, expiry, option_type);
    }

    // Update cash
    const cashChange = direction === 'buy' ? -totalCost : totalCost;
    await updateCash(portfolio.cash + cashChange);

    // Return confirmation
    const updatedPortfolio = await getPortfolio();

    res.json({
      success: true,
      trade: {
        instrument_name,
        direction,
        quantity,
        price_usd: priceUsd,
        total_cost: totalCost,
        mark_price_btc: markPrice,
        underlying_price: underlyingPrice,
      },
      portfolio: {
        cash: updatedPortfolio.cash,
      },
    });
  } catch (err) {
    console.error('[Trade] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── POST /api/position/:id/close ────────────────────────── */
router.post('/position/:id/close', async (req, res) => {
  try {
    const { id } = req.params;

    // Get position
    const position = await findOpenPositionById(id);
    if (!position) {
      return res.status(404).json({ error: 'Position not found or already closed' });
    }

    // Get current price
    const deribit = getDeribitClient();
    if (!deribit.isConnected) {
      return res.status(503).json({ error: 'Deribit not connected' });
    }

    const ticker = await deribit.getTicker(position.instrument_name);
    const markPrice = ticker.mark_price;
    const indexName = `${position.currency.toLowerCase()}_usd`;
    const underlyingPrice = deribit.prices[indexName]?.price || 0;
    const currentPriceUsd = markPrice * underlyingPrice;

    // Calculate P&L
    const pnl = position.direction === 'buy'
      ? (currentPriceUsd - position.entry_price) * position.quantity
      : (position.entry_price - currentPriceUsd) * position.quantity;

    // Close position
    await closePosition(id, currentPriceUsd, pnl);

    // Record closing trade
    const closeDirection = position.direction === 'buy' ? 'sell' : 'buy';
    const totalCost = currentPriceUsd * position.quantity;
    await insertTrade(position.instrument_name, closeDirection, position.quantity, currentPriceUsd, totalCost, position.currency, position.strike, position.expiry, position.option_type);

    // Update cash (return value of closed position)
    const portfolio = await getPortfolio();
    const cashBack = position.direction === 'buy' ? totalCost : -totalCost;
    await updateCash(portfolio.cash + cashBack);

    const updatedPortfolio = await getPortfolio();

    res.json({
      success: true,
      position: {
        id: position.id,
        instrument_name: position.instrument_name,
        pnl,
        close_price_usd: currentPriceUsd,
      },
      portfolio: {
        cash: updatedPortfolio.cash,
      },
    });
  } catch (err) {
    console.error('[Close Position] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
