import React, { useState } from 'react';
import PriceBar from './PriceBar';
import CandlestickChart from './CandlestickChart';
import OptionChain from './OptionChain';
import OrderPanel from './OrderPanel';
import Portfolio from './Portfolio';

export default function Dashboard({ prices, systemStatus }) {
  const [currency, setCurrency] = useState('BTC');
  const [selectedOption, setSelectedOption] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showChart, setShowChart] = useState(true);

  const underlyingPrice = currency === 'BTC' ? prices.btc_usd?.price : prices.eth_usd?.price;

  const handleTradeSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
    setSelectedOption(null); // Deselect after trade
  };

  return (
    <div className="dashboard-layout">
      <PriceBar prices={prices} systemStatus={systemStatus} />
      
      <div className="dashboard-content">
        <div className="main-column">
          <div className="market-header">
            <div className="currency-selector">
              <button 
                className={`currency-btn ${currency === 'BTC' ? 'active' : ''}`}
                onClick={() => {
                  setCurrency('BTC');
                  setSelectedOption(null);
                }}
              >
                Bitcoin (BTC)
              </button>
              <button 
                className={`currency-btn ${currency === 'ETH' ? 'active' : ''}`}
                onClick={() => {
                  setCurrency('ETH');
                  setSelectedOption(null);
                }}
              >
                Ethereum (ETH)
              </button>
            </div>
            
            <div className="market-header-actions">
              <button 
                className={`chart-toggle-btn ${showChart ? 'active' : ''}`}
                onClick={() => setShowChart(!showChart)}
                title={showChart ? 'Hide Candlestick Chart' : 'Show Candlestick Chart'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 3v3H5v10h2v5h2v-5h2V6H9V3H7zm10 5v3h-2v6h2v4h2v-4h2v-6h-2V8h-2z" />
                </svg>
                <span>{showChart ? 'Hide Chart' : 'Show Chart'}</span>
              </button>

              <div className="underlying-price">
                Underlying: <span className="highlight">${underlyingPrice?.toLocaleString() || '---'}</span>
              </div>
            </div>
          </div>

          {showChart && (
            <CandlestickChart 
              currency={currency} 
              underlyingPrice={underlyingPrice} 
              selectedOption={selectedOption} 
            />
          )}

          <OptionChain 
            currency={currency} 
            underlyingPrice={underlyingPrice} 
            selectedOption={selectedOption}
            onSelectOption={setSelectedOption} 
          />
        </div>
        
        <div className="side-column">
          <OrderPanel 
            selectedOption={selectedOption} 
            underlyingPrice={underlyingPrice}
            onTradeSuccess={handleTradeSuccess}
          />
          <Portfolio refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </div>
  );
}

