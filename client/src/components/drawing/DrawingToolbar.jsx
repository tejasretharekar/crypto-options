import React, { useState, useRef, useEffect } from 'react';

const COLORS = [
  { label: 'Yellow', value: '#eab308' },
  { label: 'Blue', value: '#38bdf8' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'White', value: '#f8fafc' },
];

export default function DrawingToolbar({
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
  lineStyle,
  setLineStyle,
  onUndo,
  onClearAll,
  onAddPriceLine,
  drawingCount = 0,
  canUndo = false,
}) {
  const [showPriceInput, setShowPriceInput] = useState(false);
  const [exactPrice, setExactPrice] = useState('');
  const priceInputRef = useRef(null);

  useEffect(() => {
    if (showPriceInput && priceInputRef.current) {
      priceInputRef.current.focus();
    }
  }, [showPriceInput]);

  const handlePriceSubmit = (e) => {
    e.preventDefault();
    const parsed = parseFloat(exactPrice);
    if (!isNaN(parsed) && parsed > 0) {
      onAddPriceLine(parsed);
      setExactPrice('');
      setShowPriceInput(false);
    }
  };

  return (
    <div className="drawing-toolbar">
      {/* Tool Selector */}
      <div className="dt-group">
        <button
          type="button"
          className={`dt-btn ${activeTool === 'cursor' ? 'active' : ''}`}
          onClick={() => {
            setActiveTool('cursor');
            setShowPriceInput(false);
          }}
          title="Pointer / Pan & Zoom Chart"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3 3 7 18 3-7 7-3L3 3z" />
          </svg>
          <span className="dt-label">Pan</span>
        </button>

        <button
          type="button"
          className={`dt-btn ${activeTool === 'hline' ? 'active' : ''}`}
          onClick={() => {
            setActiveTool(activeTool === 'hline' ? 'cursor' : 'hline');
            setShowPriceInput(false);
          }}
          title="Horizontal Line: Click anywhere on chart to drop full-width horizontal line"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="12" x2="22" y2="12" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
          <span className="dt-label">Horz Line</span>
        </button>

        <button
          type="button"
          className={`dt-btn ${activeTool === 'segment' ? 'active' : ''}`}
          onClick={() => {
            setActiveTool(activeTool === 'segment' ? 'cursor' : 'segment');
            setShowPriceInput(false);
          }}
          title="Line Segment: Click Point A, then click Point B to draw segment in any direction"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="20" x2="20" y2="4" />
            <circle cx="4" cy="20" r="2.5" fill="currentColor" />
            <circle cx="20" cy="4" r="2.5" fill="currentColor" />
          </svg>
          <span className="dt-label">Segment</span>
        </button>

        {/* Exact Price Line button & popover */}
        <div className="dt-price-wrapper">
          <button
            type="button"
            className={`dt-btn ${showPriceInput ? 'active' : ''}`}
            onClick={() => setShowPriceInput(!showPriceInput)}
            title="Exact Price Line: Type exact price to project horizontal line across entire chart"
          >
            <span className="dt-price-icon">$</span>
            <span className="dt-label">Price Line</span>
          </button>

          {showPriceInput && (
            <div className="dt-price-popover">
              <form onSubmit={handlePriceSubmit} className="dt-price-form">
                <span className="dt-popover-title">Add Horizontal Price Line</span>
                <div className="dt-price-row">
                  <span className="dt-price-curr">$</span>
                  <input
                    ref={priceInputRef}
                    type="number"
                    step="any"
                    placeholder="e.g. 96500"
                    value={exactPrice}
                    onChange={(e) => setExactPrice(e.target.value)}
                    className="dt-price-input"
                  />
                  <button type="submit" className="dt-price-add-btn" disabled={!exactPrice}>
                    Add
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      <div className="dt-divider" />

      {/* Color Picker */}
      <div className="dt-group dt-colors">
        {COLORS.map((col) => (
          <button
            key={col.value}
            type="button"
            className={`dt-color-dot ${activeColor === col.value ? 'selected' : ''}`}
            style={{ backgroundColor: col.value }}
            onClick={() => setActiveColor(col.value)}
            title={col.label}
          />
        ))}
      </div>

      <div className="dt-divider" />

      {/* Line Style Toggle */}
      <div className="dt-group">
        <button
          type="button"
          className={`dt-btn icon-only ${lineStyle === 'solid' ? 'active' : ''}`}
          onClick={() => setLineStyle('solid')}
          title="Solid Line"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          className={`dt-btn icon-only ${lineStyle === 'dashed' ? 'active' : ''}`}
          onClick={() => setLineStyle('dashed')}
          title="Dashed Line"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="3 3">
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </button>
      </div>

      <div className="dt-divider" />

      {/* Undo & Clear */}
      <div className="dt-group">
        <button
          type="button"
          className="dt-btn icon-only"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo Last Drawing"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
          </svg>
        </button>

        <button
          type="button"
          className="dt-btn icon-only dt-btn-danger"
          onClick={onClearAll}
          disabled={drawingCount === 0}
          title={`Clear All Drawings (${drawingCount})`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>

      {drawingCount > 0 && (
        <span className="dt-counter-badge">{drawingCount}</span>
      )}
    </div>
  );
}
