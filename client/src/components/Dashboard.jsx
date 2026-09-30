import React, { useState, useEffect } from 'react';
import PriceBar from './PriceBar';
import ChartWorkspace from './ChartWorkspace';
import OptionChain from './OptionChain';
import OrderPanel from './OrderPanel';
import Portfolio from './Portfolio';

export default function Dashboard({ prices, systemStatus }) {
  const [currency, setCurrency] = useState('BTC');
  const [selectedOption, setSelectedOption] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Multi-chart workspace state
  const [layoutMode, setLayoutMode] = useState('single'); // 'single' | 'dual'
  const [activeSlotIndex, setActiveSlotIndex] = useState(1);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Persistent drawings keyed by instrument name at dashboard level
  const [drawingsByInstrument, setDrawingsByInstrument] = useState({});

  // Slot 1 defaults to underlying perpetual
  const [slot1, setSlot1] = useState({ type: 'underlying', currency: 'BTC' });
  // Slot 2 can be empty or another option / perpetual
  const [slot2, setSlot2] = useState(null);

  const underlyingPrice = currency === 'BTC' ? prices.btc_usd?.price : prices.eth_usd?.price;

  // Listen for Escape key to exit full screen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  // Sync underlying currency switch
  const handleCurrencyChange = (newCur) => {
    setCurrency(newCur);
    setSelectedOption(null);
    if (slot1?.type === 'underlying') {
      setSlot1({ type: 'underlying', currency: newCur });
    }
    if (slot2?.type === 'underlying') {
      setSlot2({ type: 'underlying', currency: newCur });
    }
  };

  const handleOpenInChart = (optionData, targetSlot = 1) => {
    setIsMinimized(false);
    if (targetSlot === 2) {
      setSlot2(optionData);
      setLayoutMode('dual');
      setActiveSlotIndex(2);
    } else {
      setSlot1(optionData);
      setActiveSlotIndex(1);
    }
  };

  const handleTradeSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // Full Screen Mode: completely collapse order ticket, portfolio, price bar, and option chain
  if (isFullScreen) {
    return (
      <div className="dashboard-fullscreen-root">
        <ChartWorkspace
          currency={currency}
          underlyingPrice={underlyingPrice}
          slot1={slot1}
          setSlot1={setSlot1}
          slot2={slot2}
          setSlot2={setSlot2}
          activeSlotIndex={activeSlotIndex}
          setActiveSlotIndex={setActiveSlotIndex}
          layoutMode={layoutMode}
          setLayoutMode={setLayoutMode}
          isMinimized={false}
          setIsMinimized={setIsMinimized}
          isFullScreen={true}
          setIsFullScreen={setIsFullScreen}
          drawingsByInstrument={drawingsByInstrument}
          setDrawingsByInstrument={setDrawingsByInstrument}
        />
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <PriceBar prices={prices} systemStatus={systemStatus} />

      <div className="dashboard-content">
        <div className="main-column">
          {/* Market Navigation Header */}
          <div className="market-header">
            <div className="currency-selector">
              <button
                type="button"
                className={`currency-btn ${currency === 'BTC' ? 'active' : ''}`}
                onClick={() => handleCurrencyChange('BTC')}
              >
                Bitcoin (BTC)
              </button>
              <button
                type="button"
                className={`currency-btn ${currency === 'ETH' ? 'active' : ''}`}
                onClick={() => handleCurrencyChange('ETH')}
              >
                Ethereum (ETH)
              </button>
            </div>

            <div className="market-header-actions">
              {/* Quick toggle to show underlying perpetual chart in active slot */}
              <button
                type="button"
                className="chart-toggle-btn"
                onClick={() => {
                  handleOpenInChart({ type: 'underlying', currency }, activeSlotIndex);
                }}
                title={`Open ${currency}-PERPETUAL in Chart ${activeSlotIndex}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span>{currency} Spot Chart</span>
              </button>

              <button
                type="button"
                className={`chart-toggle-btn ${!isMinimized ? 'active' : ''}`}
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Show Charts' : 'Hide Charts'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 3v3H5v10h2v5h2v-5h2V6H9V3H7zm10 5v3h-2v6h2v4h2v-4h2v-6h-2V8h-2z" />
                </svg>
                <span>{isMinimized ? 'Show Charts' : 'Hide Charts'}</span>
              </button>

              <div className="underlying-price">
                Underlying: <span className="highlight">${underlyingPrice?.toLocaleString() || '---'}</span>
              </div>
            </div>
          </div>

          {/* Master Multi-Chart Workspace with Dual-Chart & Manual Drawing Engine */}
          <ChartWorkspace
            currency={currency}
            underlyingPrice={underlyingPrice}
            slot1={slot1}
            setSlot1={setSlot1}
            slot2={slot2}
            setSlot2={setSlot2}
            activeSlotIndex={activeSlotIndex}
            setActiveSlotIndex={setActiveSlotIndex}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            isMinimized={isMinimized}
            setIsMinimized={setIsMinimized}
            isFullScreen={false}
            setIsFullScreen={setIsFullScreen}
            drawingsByInstrument={drawingsByInstrument}
            setDrawingsByInstrument={setDrawingsByInstrument}
          />

          {/* Option Chain */}
          <OptionChain
            currency={currency}
            underlyingPrice={underlyingPrice}
            selectedOption={selectedOption}
            onSelectOption={setSelectedOption}
            onOpenInChart={handleOpenInChart}
            slot1={slot1}
            slot2={slot2}
            activeSlotIndex={activeSlotIndex}
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
