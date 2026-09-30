import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import { getChartData, getATH, getOptionMarkPriceCandles } from '../services/api';
import DrawingToolbar from './drawing/DrawingToolbar';
import DrawingOverlay from './drawing/DrawingOverlay';

const RESOLUTIONS = [
  { label: '1m', value: '1', intervalSec: 60 },
  { label: '5m', value: '5', intervalSec: 300 },
  { label: '15m', value: '15', intervalSec: 900 },
  { label: '1h', value: '60', intervalSec: 3600 },
  { label: '4h', value: '240', intervalSec: 14400 },
  { label: '1D', value: '1D', intervalSec: 86400 },
];

export default function UnifiedChart({
  slotId = 1,
  instrument,
  underlyingPrice,
  currency = 'BTC',
  onClose,
  onMaximize,
  isActiveSlot = false,
  onSelectSlot,
  isDual = false,
  drawings: externalDrawings,
  onUpdateDrawings: externalOnUpdateDrawings,
}) {
  const wrapperRef = useRef(null);
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const athLineRef = useRef(null);
  const rawCandlesRef = useRef([]);

  const isOption = instrument?.type === 'option';
  const instrumentName = isOption
    ? instrument.instrument_name
    : `${instrument?.currency || currency}-PERPETUAL`;

  // Display unit (USD or Crypto currency)
  const [displayUnit, setDisplayUnit] = useState('USD');
  const [resolution, setResolution] = useState('60');
  const [chartType, setChartType] = useState('candles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [stats, setStats] = useState({ high: null, low: null, change: null, changePct: null });
  const [athValue, setAthValue] = useState(null);

  // Drawing state
  const [activeTool, setActiveTool] = useState('cursor');
  const [activeColor, setActiveColor] = useState('#eab308');
  const [lineStyle, setLineStyle] = useState('solid');
  const [localDrawings, setLocalDrawings] = useState([]);
  const [history, setHistory] = useState([]);

  // Active drawings from parent or local fallback
  const drawings = externalDrawings !== undefined ? externalDrawings : localDrawings;

  // Multiplier for option contracts displayed in USD
  const multiplier = isOption && displayUnit === 'USD' && underlyingPrice ? underlyingPrice : 1;

  /* ── 1. Initialize Chart Canvas ────────────────────────── */
  useEffect(() => {
    if (!chartContainerRef.current || !wrapperRef.current) return;

    const initialWidth = wrapperRef.current.clientWidth || 600;
    const initialHeight = wrapperRef.current.clientHeight || 300;

    const chart = createChart(chartContainerRef.current, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#e2e8f0',
        fontSize: 11,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(56, 189, 248, 0.6)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: 'rgba(56, 189, 248, 0.6)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        visible: true,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        textColor: '#f8fafc',
        minimumWidth: 75,
        scaleMargins: {
          top: 0.08,
          bottom: 0.14,
        },
      },
      timeScale: {
        visible: true,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        textColor: '#f8fafc',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartInstanceRef.current = chart;

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    const initialPriceFormat =
      displayUnit === 'USD'
        ? { type: 'price', precision: 2, minMove: 0.01 }
        : { type: 'price', precision: 4, minMove: 0.0001 };

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceFormat: initialPriceFormat,
    });
    candleSeriesRef.current = candleSeries;

    // Line series
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      visible: false,
      priceFormat: initialPriceFormat,
    });
    lineSeriesRef.current = lineSeries;

    // Crosshair listener for HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }
      const cData = param.seriesData.get(candleSeriesRef.current);
      const vData = param.seriesData.get(volumeSeriesRef.current);
      if (cData) {
        const change = cData.close - cData.open;
        const changePct = cData.open > 0 ? (change / cData.open) * 100 : 0;
        setHoverData({
          time: param.time,
          open: cData.open,
          high: cData.high,
          low: cData.low,
          close: cData.close,
          volume: vData?.value || 0,
          change,
          changePct,
        });
      }
    });

    // Resize observer accurately watching wrapper dimensions
    const handleResize = () => {
      if (!wrapperRef.current || !chartInstanceRef.current) return;
      const w = wrapperRef.current.clientWidth;
      const h = wrapperRef.current.clientHeight;
      if (w > 20 && h > 20) {
        chartInstanceRef.current.applyOptions({ width: w, height: h });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(wrapperRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, []);

  /* ── 2. Toggle View Mode (Candles vs Line) ───────────────── */
  useEffect(() => {
    if (!candleSeriesRef.current || !lineSeriesRef.current) return;
    if (chartType === 'candles') {
      candleSeriesRef.current.applyOptions({ visible: true });
      lineSeriesRef.current.applyOptions({ visible: false });
    } else {
      candleSeriesRef.current.applyOptions({ visible: false });
      lineSeriesRef.current.applyOptions({ visible: true });
    }
  }, [chartType]);

  const updateStats = (candles) => {
    if (!candles || candles.length === 0) return;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const change = last.close - first.open;
    const changePct = first.open > 0 ? (change / first.open) * 100 : 0;

    setStats({
      high: Math.max(...highs),
      low: Math.min(...lows),
      change,
      changePct,
    });
  };

  const applyCandlesToSeries = (candles, mult, unit) => {
    if (!candleSeriesRef.current || !lineSeriesRef.current) return;
    const isUsd = unit === 'USD';
    const priceFormat = isUsd
      ? { type: 'price', precision: 2, minMove: 0.01 }
      : { type: 'price', precision: 4, minMove: 0.0001 };

    candleSeriesRef.current.applyOptions({ priceFormat });
    lineSeriesRef.current.applyOptions({ priceFormat });

    if (candles && candles.length > 0) {
      const mapped = candles.map((c) => ({
        time: c.time,
        open: c.open * mult,
        high: c.high * mult,
        low: c.low * mult,
        close: c.close * mult,
      }));
      candleSeriesRef.current.setData(mapped);
      lineSeriesRef.current.setData(mapped.map((c) => ({ time: c.time, value: c.close })));

      if (volumeSeriesRef.current) {
        const volMapped = candles.map((c) => ({
          time: c.time,
          value: c.volume || 0,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)',
        }));
        volumeSeriesRef.current.setData(volMapped);
      }

      updateStats(mapped);
    }
  };

  /* ── 3. Display Unit change for Options ──────────────────── */
  useEffect(() => {
    if (isOption && rawCandlesRef.current.length > 0) {
      applyCandlesToSeries(rawCandlesRef.current, multiplier, displayUnit);
    }
  }, [displayUnit, multiplier, isOption]);

  /* ── 4. Fetch Historical Data ────────────────────────────── */
  useEffect(() => {
    if (!instrumentName) return;

    let active = true;
    setLoading(true);
    setError(null);
    rawCandlesRef.current = [];
    candleSeriesRef.current?.setData([]);
    lineSeriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);

    const fetchPromise = isOption
      ? getOptionMarkPriceCandles(instrumentName, resolution)
      : getChartData(instrumentName, resolution);

    fetchPromise
      .then((res) => {
        if (!active) return;
        const candles = res?.candles || [];
        rawCandlesRef.current = candles;
        if (candles.length > 0) {
          applyCandlesToSeries(candles, multiplier, displayUnit);
          chartInstanceRef.current?.timeScale().fitContent();
        } else {
          setError(`No candlestick data available for ${instrumentName}`);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load historical candles');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [instrumentName, resolution, isOption]);

  /* ── 5. ATH & Strike Line Overlays for Underlying ─────────── */
  useEffect(() => {
    if (isOption) {
      if (athLineRef.current) {
        candleSeriesRef.current?.removePriceLine(athLineRef.current);
        athLineRef.current = null;
      }
      return;
    }

    let active = true;
    const cur = instrument?.currency || currency;
    if (cur === 'BTC') {
      getATH('BTC')
        .then((data) => {
          if (active && data?.ath) {
            setAthValue(data.ath);
          }
        })
        .catch(() => {});
    } else {
      setAthValue(null);
    }

    return () => {
      active = false;
    };
  }, [isOption, instrument, currency]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    if (athLineRef.current) {
      candleSeriesRef.current.removePriceLine(athLineRef.current);
      athLineRef.current = null;
    }
    if (athValue !== null && !isOption) {
      athLineRef.current = candleSeriesRef.current.createPriceLine({
        price: athValue,
        color: '#fbbf24',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `ATH: $${athValue.toLocaleString()}`,
      });
    }
  }, [athValue, isOption]);

  /* ── 6. Live Tick Updates ────────────────────────────────── */
  const livePrice = isOption
    ? instrument.currentPrice || instrument.markUsd
    : underlyingPrice;

  useEffect(() => {
    if (!livePrice || rawCandlesRef.current.length === 0 || loading) return;

    const candles = rawCandlesRef.current;
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    const currentRes = RESOLUTIONS.find((r) => r.value === resolution);
    const intervalSec = currentRes ? currentRes.intervalSec : 3600;
    const nowSec = Math.floor(Date.now() / 1000);

    const priceToMerge = isOption ? (instrument.currentPrice || (instrument.markUsd && underlyingPrice ? instrument.markUsd / underlyingPrice : livePrice)) : livePrice;

    if (nowSec < lastCandle.time + intervalSec) {
      lastCandle.high = Math.max(lastCandle.high, priceToMerge);
      lastCandle.low = Math.min(lastCandle.low, priceToMerge);
      lastCandle.close = priceToMerge;
    } else {
      const newCandle = {
        time: lastCandle.time + intervalSec,
        open: lastCandle.close,
        high: Math.max(lastCandle.close, priceToMerge),
        low: Math.min(lastCandle.close, priceToMerge),
        close: priceToMerge,
        volume: 0,
      };
      candles.push(newCandle);
    }

    const latest = candles[candles.length - 1];
    const scaled = {
      time: latest.time,
      open: latest.open * multiplier,
      high: latest.high * multiplier,
      low: latest.low * multiplier,
      close: latest.close * multiplier,
    };

    try {
      candleSeriesRef.current?.update(scaled);
      lineSeriesRef.current?.update({ time: scaled.time, value: scaled.close });
      updateStats(
        candles.map((c) => ({
          ...c,
          open: c.open * multiplier,
          high: c.high * multiplier,
          low: c.low * multiplier,
          close: c.close * multiplier,
        }))
      );
    } catch {
      // Ignored during timeframe switch
    }
  }, [livePrice, resolution, loading, multiplier, isOption, underlyingPrice]);

  /* ── 7. Drawings State Management & Undo ─────────────────── */
  const handleUpdateDrawings = (updater) => {
    const next = typeof updater === 'function' ? updater(drawings) : updater;
    setHistory((h) => [...h, drawings]);
    if (externalOnUpdateDrawings) {
      externalOnUpdateDrawings(next);
    } else {
      setLocalDrawings(next);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    if (externalOnUpdateDrawings) {
      externalOnUpdateDrawings(previous);
    } else {
      setLocalDrawings(previous);
    }
  };

  const handleClearAll = () => {
    if (drawings.length === 0) return;
    setHistory((h) => [...h, drawings]);
    if (externalOnUpdateDrawings) {
      externalOnUpdateDrawings([]);
    } else {
      setLocalDrawings([]);
    }
  };

  const handleAddPriceLine = (exactPrice) => {
    const newHLine = {
      id: 'hline_' + Date.now(),
      type: 'hline',
      price: exactPrice,
      color: activeColor,
      style: lineStyle,
    };
    handleUpdateDrawings((prev) => [...prev, newHLine]);
  };

  const handleResetZoom = () => {
    chartInstanceRef.current?.timeScale().fitContent();
  };

  const activeCandle =
    hoverData ||
    (rawCandlesRef.current.length > 0
      ? {
          ...rawCandlesRef.current[rawCandlesRef.current.length - 1],
          open: rawCandlesRef.current[rawCandlesRef.current.length - 1].open * multiplier,
          high: rawCandlesRef.current[rawCandlesRef.current.length - 1].high * multiplier,
          low: rawCandlesRef.current[rawCandlesRef.current.length - 1].low * multiplier,
          close: rawCandlesRef.current[rawCandlesRef.current.length - 1].close * multiplier,
        }
      : null);

  const isPositive = (stats.changePct || 0) >= 0;

  return (
    <div
      className={`unified-chart-card ${isActiveSlot ? 'active-slot' : ''}`}
      onClick={() => onSelectSlot && onSelectSlot(slotId)}
    >
      {/* Chart Top Header & HUD */}
      <div className="unified-chart-header">
        <div className="chart-info-left">
          {/* Slot Badge */}
          <div className="slot-badge" title={`Chart Slot ${slotId}`}>
            Slot {slotId}
          </div>

          <div className="symbol-meta">
            {isOption ? (
              <span className={`instrument-type ${instrument.option_type}`}>
                {instrument.option_type?.toUpperCase()}
              </span>
            ) : (
              <span className="market-badge">Perpetual</span>
            )}
            <span className="symbol-name">{instrumentName}</span>
          </div>

          {activeCandle && (
            <div className="symbol-pricing">
              <span className="current-price">
                {displayUnit === 'USD'
                  ? `$${activeCandle.close?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${activeCandle.close?.toFixed(4)} ${currency}`}
              </span>
              {stats.changePct !== null && (
                <span className={`price-change ${isPositive ? 'up' : 'down'}`}>
                  {isPositive ? '+' : ''}
                  {stats.changePct.toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {athValue !== null && !isOption && currency === 'BTC' && (
            <span className="ath-badge" title="All-Time High Reference">
              ATH: ${athValue.toLocaleString()}
            </span>
          )}
        </div>

        {/* OHLCV Readout HUD */}
        {activeCandle && (
          <div className="ohlcv-hud">
            <div className="hud-item">
              <span className="hud-label">O</span>
              <span className="hud-val">
                {displayUnit === 'USD' ? `$${activeCandle.open?.toFixed(2)}` : activeCandle.open?.toFixed(4)}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">H</span>
              <span className="hud-val up">
                {displayUnit === 'USD' ? `$${activeCandle.high?.toFixed(2)}` : activeCandle.high?.toFixed(4)}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">L</span>
              <span className="hud-val down">
                {displayUnit === 'USD' ? `$${activeCandle.low?.toFixed(2)}` : activeCandle.low?.toFixed(4)}
              </span>
            </div>
            <div className="hud-item">
              <span className="hud-label">C</span>
              <span className="hud-val">
                {displayUnit === 'USD' ? `$${activeCandle.close?.toFixed(2)}` : activeCandle.close?.toFixed(4)}
              </span>
            </div>
          </div>
        )}

        {/* View Controls & Action Buttons */}
        <div className="chart-header-actions">
          {/* USD / Crypto toggle for options */}
          {isOption && (
            <div className="timeframe-group">
              <button
                type="button"
                className={`tf-btn ${displayUnit === 'USD' ? 'active' : ''}`}
                onClick={() => setDisplayUnit('USD')}
                title="Display in USD ($)"
              >
                USD
              </button>
              <button
                type="button"
                className={`tf-btn ${displayUnit === 'BTC' ? 'active' : ''}`}
                onClick={() => setDisplayUnit('BTC')}
                title={`Display in ${currency}`}
              >
                {currency}
              </button>
            </div>
          )}

          {/* Resolutions */}
          <div className="timeframe-group">
            {RESOLUTIONS.map((res) => (
              <button
                key={res.value}
                type="button"
                className={`tf-btn ${resolution === res.value ? 'active' : ''}`}
                onClick={() => setResolution(res.value)}
              >
                {res.label}
              </button>
            ))}
          </div>

          {/* Chart Display Mode */}
          <div className="view-group">
            <button
              type="button"
              className={`view-btn ${chartType === 'candles' ? 'active' : ''}`}
              onClick={() => setChartType('candles')}
              title="Candlestick Chart"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 3v3H5v10h2v5h2v-5h2V6H9V3H7zm10 5v3h-2v6h2v4h2v-4h2v-6h-2V8h-2z" />
              </svg>
            </button>
            <button
              type="button"
              className={`view-btn ${chartType === 'line' ? 'active' : ''}`}
              onClick={() => setChartType('line')}
              title="Line Chart"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 17 9 11 13 15 21 7" />
              </svg>
            </button>
            <button
              type="button"
              className="view-btn icon-only"
              onClick={handleResetZoom}
              title="Fit View / Reset Zoom"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>

          {/* Maximize to single layout */}
          {isDual && onMaximize && (
            <button
              type="button"
              className="view-btn icon-only"
              onClick={(e) => {
                e.stopPropagation();
                onMaximize(slotId);
              }}
              title="Expand this chart to Single Full-Width View"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          )}

          {/* Close Chart Button */}
          {onClose && (
            <button
              type="button"
              className="btn-close-chart"
              onClick={(e) => {
                e.stopPropagation();
                onClose(slotId);
              }}
              title={isDual ? 'Close this chart (switches to Single Chart)' : 'Close Chart'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Manual Drawing Toolbar */}
      <DrawingToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        activeColor={activeColor}
        setActiveColor={setActiveColor}
        lineStyle={lineStyle}
        setLineStyle={setLineStyle}
        onUndo={handleUndo}
        onClearAll={handleClearAll}
        onAddPriceLine={handleAddPriceLine}
        drawingCount={drawings.length}
        canUndo={history.length > 0}
      />

      {/* Chart Canvas & SVG Drawing Overlay */}
      <div ref={wrapperRef} className="unified-chart-canvas-wrapper">
        {loading && (
          <div className="chart-loading-overlay">
            <div className="chart-spinner" />
            <span>Loading {instrumentName}…</span>
          </div>
        )}
        {error && (
          <div className="chart-error-overlay">
            <span>⚠ {error}</span>
          </div>
        )}
        <div ref={chartContainerRef} className="unified-chart-canvas" />

        <DrawingOverlay
          chartInstance={chartInstanceRef.current}
          seriesInstance={candleSeriesRef.current}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          activeColor={activeColor}
          lineStyle={lineStyle}
          drawings={drawings}
          setDrawings={handleUpdateDrawings}
          displayUnit={displayUnit}
          containerRef={wrapperRef}
        />
      </div>
    </div>
  );
}
