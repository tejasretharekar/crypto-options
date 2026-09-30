import React, { useState } from 'react';
import UnifiedChart from './UnifiedChart';

export default function ChartWorkspace({
  currency,
  underlyingPrice,
  slot1,
  setSlot1,
  slot2,
  setSlot2,
  activeSlotIndex,
  setActiveSlotIndex,
  layoutMode,
  setLayoutMode,
  isMinimized,
  setIsMinimized,
  isFullScreen = false,
  setIsFullScreen,
  drawingsByInstrument = {},
  setDrawingsByInstrument,
}) {
  const getInstrumentKey = (inst) => {
    if (!inst) return null;
    return inst.type === 'option' ? inst.instrument_name : `${inst.currency || currency}-PERPETUAL`;
  };

  const key1 = getInstrumentKey(slot1);
  const drawings1 = key1 ? drawingsByInstrument[key1] || [] : [];
  const handleUpdateDrawings1 = (newDrawings) => {
    if (!key1 || !setDrawingsByInstrument) return;
    setDrawingsByInstrument((prev) => ({
      ...prev,
      [key1]: newDrawings,
    }));
  };

  const key2 = getInstrumentKey(slot2);
  const drawings2 = key2 ? drawingsByInstrument[key2] || [] : [];
  const handleUpdateDrawings2 = (newDrawings) => {
    if (!key2 || !setDrawingsByInstrument) return;
    setDrawingsByInstrument((prev) => ({
      ...prev,
      [key2]: newDrawings,
    }));
  };

  const handleCloseSlot = (slotId) => {
    if (layoutMode === 'dual') {
      if (slotId === 1) {
        // Slot 2 becomes Slot 1
        setSlot1(slot2);
        setSlot2(null);
        setActiveSlotIndex(1);
        setLayoutMode('single');
      } else {
        // Close Slot 2
        setSlot2(null);
        setActiveSlotIndex(1);
        setLayoutMode('single');
      }
    } else {
      // Single chart closed
      if (isFullScreen && setIsFullScreen) {
        setIsFullScreen(false);
      }
      setIsMinimized(true);
    }
  };

  const handleMaximizeSlot = (slotId) => {
    if (slotId === 2 && slot2) {
      setSlot1(slot2);
      setSlot2(null);
    }
    setActiveSlotIndex(1);
    setLayoutMode('single');
  };

  const handleSwapSlots = () => {
    if (!slot1 || !slot2) return;
    const temp = slot1;
    setSlot1(slot2);
    setSlot2(temp);
  };

  if (isMinimized) {
    return (
      <div className="workspace-minimized-bar">
        <div className="minimized-info">
          <span className="minimized-pulse" />
          <span className="minimized-label">Charts Minimized</span>
          <span className="minimized-desc">
            {slot1?.type === 'option' ? slot1.instrument_name : `${currency}-PERPETUAL`}
            {layoutMode === 'dual' && slot2 && (
              <> &bull; {slot2?.type === 'option' ? slot2.instrument_name : `${currency}-PERPETUAL`}</>
            )}
          </span>
        </div>
        <button
          type="button"
          className="restore-charts-btn"
          onClick={() => setIsMinimized(false)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 3v3H5v10h2v5h2v-5h2V6H9V3H7zm10 5v3h-2v6h2v4h2v-4h2v-6h-2V8h-2z" />
          </svg>
          <span>Restore Charts</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`chart-workspace-container ${
        isFullScreen ? 'chart-height-fullscreen is-fullscreen' : 'chart-height-short'
      }`}
    >
      {/* Workspace Master Toolbar */}
      <div className="workspace-toolbar">
        <div className="workspace-toolbar-left">
          {/* Layout Mode Switcher */}
          <div className="layout-switcher-group">
            <button
              type="button"
              className={`layout-btn ${layoutMode === 'single' ? 'active' : ''}`}
              onClick={() => {
                setLayoutMode('single');
                setActiveSlotIndex(1);
              }}
              title="Single Chart View (Full Width)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span>1 Chart</span>
            </button>

            <button
              type="button"
              className={`layout-btn ${layoutMode === 'dual' ? 'active' : ''}`}
              onClick={() => {
                setLayoutMode('dual');
                if (!slot2) {
                  setSlot2({ type: 'underlying', currency });
                }
              }}
              title="Dual Charts View (Side-by-Side Split 50% / 50%)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="8" height="18" rx="1.5" />
                <rect x="13" y="3" width="8" height="18" rx="1.5" />
              </svg>
              <span>2 Charts Split</span>
            </button>
          </div>

          {/* Active Target Indicator (which slot receives selected options) */}
          {layoutMode === 'dual' && (
            <div className="active-target-selector">
              <span className="target-label">Target for options:</span>
              <button
                type="button"
                className={`target-pill ${activeSlotIndex === 1 ? 'active' : ''}`}
                onClick={() => setActiveSlotIndex(1)}
              >
                Chart 1 {activeSlotIndex === 1 && '✓'}
              </button>
              <button
                type="button"
                className={`target-pill ${activeSlotIndex === 2 ? 'active' : ''}`}
                onClick={() => setActiveSlotIndex(2)}
              >
                Chart 2 {activeSlotIndex === 2 && '✓'}
              </button>
              <button
                type="button"
                className="target-swap-btn"
                onClick={handleSwapSlots}
                title="Swap Chart 1 and Chart 2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m7 16-4-4m0 0 4-4m-4 4h18" />
                  <path d="m17 8 4 4m0 0-4 4m4-4H3" />
                </svg>
                <span style={{ fontSize: '0.72rem', marginLeft: '4px' }}>Swap</span>
              </button>
            </div>
          )}
        </div>

        <div className="workspace-toolbar-right">
          {/* Chart Size Presets: Exactly 2 options (Short and Full Screen) */}
          <div className="size-presets-group">
            <button
              type="button"
              className={`size-btn ${!isFullScreen ? 'active' : ''}`}
              onClick={() => setIsFullScreen && setIsFullScreen(false)}
              title="Short Height (Compact view to see Option Chain below)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 14h6v6m10-10h-6V4m0 6 7-7M4 20l7-7" />
              </svg>
              <span>Short</span>
            </button>
            <button
              type="button"
              className={`size-btn ${isFullScreen ? 'active' : ''}`}
              onClick={() => setIsFullScreen && setIsFullScreen(true)}
              title="Full Screen (Spans entire screen, collapses other panels)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              <span>Full Screen</span>
            </button>
          </div>

          {/* Quick Exit Full Screen Button if active */}
          {isFullScreen && (
            <button
              type="button"
              className="exit-fullscreen-btn"
              onClick={() => setIsFullScreen && setIsFullScreen(false)}
              title="Exit Full Screen View (or press Esc)"
            >
              ✕ Exit Full Screen
            </button>
          )}

          {/* Minimize / Hide Button */}
          {!isFullScreen && (
            <button
              type="button"
              className="workspace-hide-btn"
              onClick={() => setIsMinimized(true)}
              title="Minimize charts to easily browse option chain table"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span>Hide Charts</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of Charts (1 full width or 2 side-by-side) */}
      <div className={`charts-grid ${layoutMode === 'dual' ? 'dual-grid' : 'single-grid'}`}>
        {/* Slot 1 */}
        <div className="chart-grid-slot">
          {slot1 ? (
            <UnifiedChart
              key={key1 || 'slot-1'}
              slotId={1}
              instrument={slot1}
              underlyingPrice={underlyingPrice}
              currency={currency}
              isActiveSlot={activeSlotIndex === 1}
              onSelectSlot={setActiveSlotIndex}
              onClose={handleCloseSlot}
              onMaximize={handleMaximizeSlot}
              isDual={layoutMode === 'dual'}
              drawings={drawings1}
              onUpdateDrawings={handleUpdateDrawings1}
            />
          ) : (
            <div className="empty-slot-placeholder" onClick={() => setSlot1({ type: 'underlying', currency })}>
              <span>+ Click to load {currency}-PERPETUAL or pick an option below</span>
            </div>
          )}
        </div>

        {/* Slot 2 (Rendered in dual mode) */}
        {layoutMode === 'dual' && (
          <div className="chart-grid-slot">
            {slot2 ? (
              <UnifiedChart
                key={key2 || 'slot-2'}
                slotId={2}
                instrument={slot2}
                underlyingPrice={underlyingPrice}
                currency={currency}
                isActiveSlot={activeSlotIndex === 2}
                onSelectSlot={setActiveSlotIndex}
                onClose={handleCloseSlot}
                onMaximize={handleMaximizeSlot}
                isDual={true}
                drawings={drawings2}
                onUpdateDrawings={handleUpdateDrawings2}
              />
            ) : (
              <div
                className="empty-slot-placeholder"
                onClick={() => setSlot2({ type: 'underlying', currency })}
              >
                <span>+ Select any Call or Put from the Option Chain below to open in Chart 2</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
