import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import { getChartData } from '../services/api';

const RESOLUTIONS = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1h', value: '60' },
  { label: '4h', value: '240' },
  { label: '1D', value: '1D' },
];

export default function OptionCandleCard({
  selectedOption,
  underlyingPrice,
  onClose,
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const rawCandlesRef = useRef([]);

  const [resolution, setResolution] = useState('60');
  const [priceMode, setPriceMode] = useState('usd'); // 'usd' | 'crypto'
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoverData, setHoverData] = useState(null);
  const [ath, setAth] = useState(null);

  const instrumentName = selectedOption.instrument_name;
  const currency = instrumentName.split('-')[0];

  /* ── 1. Initialize Chart Canvas ────────────────────────── */
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
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
          color: 'rgba(59, 130, 246, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: 'rgba(59, 130, 246, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
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

    // Volume Series
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

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = candleSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeriesRef.current);
      if (candleData) {
        setHoverData(candleData);
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !chartInstanceRef.current) return;
      const { width, height } = entries[0].contentRect;
      chartInstanceRef.current.applyOptions({ width, height });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
    };
  }, []);

  /* ── 2. Dynamic Price Precision ────────────────────────── */
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    if (priceMode === 'crypto') {
      candleSeriesRef.current.applyOptions({
        priceFormat: {
          type: 'price',
          precision: 5,
          minMove: 0.00001,
        },
      });
    } else {
      candleSeriesRef.current.applyOptions({
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });
    }
  }, [priceMode]);

  /* ── 3. Fetch Option Candles Silently (No Buffering Overlay) ─ */
  useEffect(() => {
    let active = true;

    getChartData(instrumentName, resolution)
      .then((data) => {
        if (!active) return;
        const candles = data.candles || [];
        rawCandlesRef.current = candles;

        if (candles.length > 0) {
          const multiplier = (priceMode === 'usd' && underlyingPrice) ? underlyingPrice : 1;

          const transformed = candles.map((c) => ({
            ...c,
            open: c.open * multiplier,
            high: c.high * multiplier,
            low: c.low * multiplier,
            close: c.close * multiplier,
          }));

          const candleData = transformed.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          const volumeData = transformed.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
          }));

          candleSeriesRef.current?.setData(candleData);
          volumeSeriesRef.current?.setData(volumeData);

          const highs = transformed.map((c) => c.high);
          setAth(Math.max(...highs));

          chartInstanceRef.current?.timeScale().fitContent();
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('Error fetching option candles:', err);
      });

    return () => {
      active = false;
    };
  }, [instrumentName, resolution, priceMode, underlyingPrice]);

  /* ── 4. Live Tick Updates with Mark Price ───────────────── */
  useEffect(() => {
    if (rawCandlesRef.current.length === 0) return;

    const currentPrice = priceMode === 'usd'
      ? selectedOption.markUsd
      : (selectedOption.mark_price || (selectedOption.markUsd && underlyingPrice ? selectedOption.markUsd / underlyingPrice : null));

    if (!currentPrice) return;

    const candles = rawCandlesRef.current;
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    const updatedCandle = {
      time: lastCandle.time,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, currentPrice),
      low: Math.min(lastCandle.low, currentPrice),
      close: currentPrice,
    };
    candleSeriesRef.current?.update(updatedCandle);
  }, [selectedOption, priceMode, underlyingPrice]);

  const activeCandle = hoverData || (rawCandlesRef.current.length > 0 ? rawCandlesRef.current[rawCandlesRef.current.length - 1] : null);

  const formatPrice = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '---';
    if (priceMode === 'crypto') {
      return `${val.toFixed(5)} ${currency}`;
    }
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const currentDisplayMark = priceMode === 'usd'
    ? selectedOption.markUsd
    : (selectedOption.mark_price || (selectedOption.markUsd && underlyingPrice ? selectedOption.markUsd / underlyingPrice : null));

  return (
    <div className={`option-candle-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="option-card-header">
        <div className="option-card-info">
          <div className="option-title-row">
            <span className={`instrument-type ${selectedOption.option_type}`}>
              {selectedOption.option_type.toUpperCase()}
            </span>
            <strong className="option-name">{selectedOption.instrument_name}</strong>
            <span className="strike-tag-small">
              Strike: ${selectedOption.strike?.toLocaleString()}
            </span>
            {selectedOption.iv > 0 && (
              <span className="opt-meta">IV: {(selectedOption.iv * 100).toFixed(1)}%</span>
            )}
            {selectedOption.delta !== undefined && (
              <span className="opt-meta">Δ: {selectedOption.delta?.toFixed(2)}</span>
            )}
          </div>

          <div className="option-price-row">
            <div className="mark-badge-wrap">
              <span className="mark-label">MARK</span>
              <span className="opt-current-price">{formatPrice(currentDisplayMark)}</span>
            </div>
            {ath !== null && (
              <span className="ath-tag">
                ATH: <strong>{formatPrice(ath)}</strong>
              </span>
            )}

            <div className="price-mode-toggle">
              <button
                className={`pm-btn ${priceMode === 'usd' ? 'active' : ''}`}
                onClick={() => setPriceMode('usd')}
              >
                USD ($)
              </button>
              <button
                className={`pm-btn ${priceMode === 'crypto' ? 'active' : ''}`}
                onClick={() => setPriceMode('crypto')}
              >
                {currency}
              </button>
            </div>
          </div>
        </div>

        {activeCandle && (
          <div className="opt-hud">
            <span>O: <b>{formatPrice(activeCandle.open)}</b></span>
            <span>H: <b className="up">{formatPrice(activeCandle.high)}</b></span>
            <span>L: <b className="down">{formatPrice(activeCandle.low)}</b></span>
            <span>C: <b>{formatPrice(activeCandle.close)}</b></span>
          </div>
        )}

        <div className="option-card-actions">
          <div className="timeframe-group">
            {RESOLUTIONS.map((res) => (
              <button
                key={res.value}
                className={`tf-btn ${resolution === res.value ? 'active' : ''}`}
                onClick={() => setResolution(res.value)}
              >
                {res.label}
              </button>
            ))}
          </div>

          <button
            className={`view-btn icon-only ${isExpanded ? 'active' : ''}`}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse Chart' : 'Expand Chart'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {isExpanded ? (
                <path d="M4 14h6v6m10-10h-6V4m0 6 7-7M4 20l7-7" />
              ) : (
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              )}
            </svg>
          </button>

          <button
            className="view-btn icon-only close-card-btn"
            onClick={onClose}
            title="Close Option Chart"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="option-canvas-wrapper">
        <div ref={chartContainerRef} className="option-chart-canvas" />
      </div>
    </div>
  );
}
