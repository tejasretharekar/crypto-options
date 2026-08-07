import React, { useState } from 'react';
import PriceBar from './PriceBar';
import OptionChain from './OptionChain';
import OrderPanel from './OrderPanel';
import Portfolio from './Portfolio';

export default function Dashboard({ prices, systemStatus }) {
  const [currency, setCurrency] = useState('BTC');
  const [selectedOption, setSelectedOption] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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
            
            <div className="underlying-price">
              Underlying: <span className="highlight">${underlyingPrice?.toLocaleString() || '---'}</span>
            </div>
          </div>

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
