import React, { useState } from 'react';
import { placeTrade } from '../services/api';

export default function OrderPanel({ selectedOption, underlyingPrice, onTradeSuccess }) {
  const [quantity, setQuantity] = useState(1);
  const [direction, setDirection] = useState('buy');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!selectedOption) {
    return (
      <div className="order-panel empty">
        <div className="empty-message">Select an option from the chain to trade</div>
      </div>
    );
  }

  const { instrument_name, option_type, strike, markUsd, iv } = selectedOption;
  const isCall = option_type === 'call';
  const totalCost = markUsd * quantity;

  const handleTrade = async () => {
    setLoading(true);
    setError(null);
    try {
      // Parse expiry from instrument name (e.g. BTC-25AUG23-30000-C)
      const parts = instrument_name.split('-');
      const expiry = parts[1];

      await placeTrade({
        instrument_name,
        direction,
        quantity: Number(quantity),
        option_type,
        strike,
        expiry,
        currency: parts[0]
      });

      onTradeSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="order-panel">
      <div className="panel-header">Order Ticket</div>
      
      <div className="selected-instrument">
        <div className={`instrument-type ${isCall ? 'call' : 'put'}`}>
          {isCall ? 'CALL' : 'PUT'}
        </div>
        <div className="instrument-name">{instrument_name}</div>
      </div>

      <div className="market-data">
        <div className="data-row">
          <span>Mark Price</span>
          <span className="highlight">${markUsd.toFixed(2)}</span>
        </div>
        <div className="data-row">
          <span>Implied Vol</span>
          <span>{iv > 0 ? (iv * 100).toFixed(1) + '%' : '—'}</span>
        </div>
        <div className="data-row">
          <span>Strike</span>
          <span>${strike}</span>
        </div>
      </div>

      <div className="order-controls">
        <div className="direction-toggle">
          <button 
            className={`toggle-btn ${direction === 'buy' ? 'active buy' : ''}`}
            onClick={() => setDirection('buy')}
          >
            Buy
          </button>
          <button 
            className={`toggle-btn ${direction === 'sell' ? 'active sell' : ''}`}
            onClick={() => setDirection('sell')}
          >
            Sell
          </button>
        </div>

        <div className="quantity-input">
          <label>Quantity</label>
          <input 
            type="number" 
            min="0.1" 
            step="0.1" 
            value={quantity} 
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="order-summary">
          <div className="summary-row">
            <span>Estimated Cost</span>
            <span className="total-cost">${totalCost.toFixed(2)}</span>
          </div>
        </div>

        {error && <div className="order-error">{error}</div>}

        <button 
          className={`submit-order-btn ${direction}`} 
          onClick={handleTrade}
          disabled={loading || totalCost <= 0}
        >
          {loading ? 'Processing...' : `${direction === 'buy' ? 'Buy' : 'Sell'} ${quantity} Contract${quantity > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
