import React from 'react';

export default function PriceBar({ prices, systemStatus }) {
  const formatPrice = (priceObj) => {
    if (!priceObj || !priceObj.price) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(priceObj.price);
  };

  return (
    <div className="price-bar">
      <div className="price-bar-left">
        <div className="brand">
          CryptoOptions<span>.paper</span>
        </div>
      </div>

      <div className="price-bar-center">
        <div className={`ticker-item ${prices.btc_usd ? 'active' : ''}`}>
          <span className="ticker-label">BTC/USD</span>
          <span className="ticker-value">{formatPrice(prices.btc_usd)}</span>
        </div>
        <div className={`ticker-item ${prices.eth_usd ? 'active' : ''}`}>
          <span className="ticker-label">ETH/USD</span>
          <span className="ticker-value">{formatPrice(prices.eth_usd)}</span>
        </div>
      </div>

      <div className="price-bar-right">
        <div className={`system-status ${systemStatus.deribit ? 'ok' : 'error'}`}>
          <span className="status-dot"></span>
          Deribit
        </div>
        <div className={`system-status ${systemStatus.api ? 'ok' : 'error'}`}>
          <span className="status-dot"></span>
          API
        </div>
      </div>
    </div>
  );
}
