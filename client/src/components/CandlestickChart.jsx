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
import { getChartData, getATH } from '../services/api';

const RESOLUTIONS = [
  { label: '1m', value: '1', intervalSec: 60 },
  { label: '5m', value: '5', intervalSec: 300 },
  { label: '15m', value: '15', intervalSec: 900 },
  { label: '1h', value: '60', intervalSec: 3600 },
  { label: '4h', value: '240', intervalSec: 14400 },
  { label: '1D', value: '1D', intervalSec: 86400 },
];

export default function CandlestickChart({
  currency = 'BTC',
  underlyingPrice,
  selectedOption,
}) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const strikeLineRef = useRef(null);
  const rawCandlesRef = useRef([]);

  const [resolution, setResolution] = useState('60');
  const [chartType, setChartType] = useState('candles'); // 'candles' | 'line'
  const [loading, setLoading] = useState(true);
  const [athValue, setAthValue] = useState(null);
  const athLineRef = useRef(null);
  const [error, setError] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [stats, setStats] = useState({ high24h: null, low24h: null, change24h: null, changePct24h: null });
  const [isExpanded, setIsExpanded] = useState(false);

  const instrumentName = `${currency}-PERPETUAL`;

  /* ── 1. Initialize Chart Canvas ────────────────────────── */
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontSize: 12,
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
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: 'rgba(59, 130, 246, 0.5)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.22,
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
        top: 0.8,
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

    // Line Series
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      visible: false,
    });
    lineSeriesRef.current = lineSeries;

    // Crosshair listener
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }
      const candleData = param.seriesData.get(candleSeriesRef.current);
      const volData = param.seriesData.get(volumeSeriesRef.current);

      if (candleData) {
        const change = candleData.close - candleData.open;
        const changePct = candleData.open > 0 ? (change / candleData.open) * 100 : 0;
        setHoverData({
          time: param.time,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value || 0,
          change,
          changePct,
        });
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

  /* ── 2. Toggle Chart View (Candles vs Line) ─────────────── */
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

  /* ── 3. Fetch Historical OHLCV Candles ─────────────────── */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getChartData(instrumentName, resolution)
      .then((data) => {
        if (!active) return;
        const candles = data.candles || [];
        rawCandlesRef.current = candles;

        if (candles.length > 0) {
          const candleData = candles.map((c) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          const lineData = candles.map((c) => ({
            time: c.time,
            value: c.close,
          }));

          const volumeData = candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
          }));

          candleSeriesRef.current?.setData(candleData);
          lineSeriesRef.current?.setData(lineData);
          volumeSeriesRef.current?.setData(volumeData);

          const lastCandle = candles[candles.length - 1];
          const firstCandle = candles[0];
          const highs = candles.map((c) => c.high);
          const lows = candles.map((c) => c.low);
          const high24h = Math.max(...highs);
          const low24h = Math.min(...lows);
          const change24h = lastCandle.close - firstCandle.open;
          const changePct24h = firstCandle.open > 0 ? (change24h / firstCandle.open) * 100 : 0;

          setStats({
            high24h,
            low24h,
            change24h,
            changePct24h,
          });

          chartInstanceRef.current?.timeScale().fitContent();
        } else {
          setError('No historical candlestick data available for this range');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load chart candles:', err);
        setError(err.message || 'Failed to load chart');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [instrumentName, resolution]);

  /* ── 4. Live Tick Updates on Current Candle ─────────────── */
  useEffect(() => {
    if (!underlyingPrice || rawCandlesRef.current.length === 0) return;

    const candles = rawCandlesRef.current;
    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    const currentRes = RESOLUTIONS.find((r) => r.value === resolution);
    const intervalSec = currentRes ? currentRes.intervalSec : 3600;
    const nowSec = Math.floor(Date.now() / 1000);

    if (nowSec < lastCandle.time + intervalSec) {
      const updatedCandle = {
        time: lastCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, underlyingPrice),
        low: Math.min(lastCandle.low, underlyingPrice),
        close: underlyingPrice,
      };
      candleSeriesRef.current?.update(updatedCandle);
      lineSeriesRef.current?.update({ time: lastCandle.time, value: underlyingPrice });
    } else {
      const newCandleTime = lastCandle.time + intervalSec;
      const newCandle = {
        time: newCandleTime,
        open: lastCandle.close,
        high: Math.max(lastCandle.close, underlyingPrice),
        low: Math.min(lastCandle.close, underlyingPrice),
        close: underlyingPrice,
      };
      candles.push({ ...newCandle, volume: 0 });
      candleSeriesRef.current?.update(newCandle);
      lineSeriesRef.current?.update({ time: newCandleTime, value: underlyingPrice });
    }
  }, [underlyingPrice, resolution]);

  /* ── 5. Option Strike Price Line Overlay ─────────────────── */
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (strikeLineRef.current) {
      candleSeriesRef.current.removePriceLine(strikeLineRef.current);
      strikeLineRef.current = null;
    }

    if (selectedOption && selectedOption.strike) {
      const isCall = selectedOption.option_type === 'call';
      const isITM = isCall
        ? underlyingPrice > selectedOption.strike
        : underlyingPrice < selectedOption.strike;

      strikeLineRef.current = candleSeriesRef.current.createPriceLine({
        price: selectedOption.strike,
        color: isCall ? '#22c55e' : '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `STRIKE $${selectedOption.strike.toLocaleString()} ${selectedOption.option_type.toUpperCase()} (${isITM ? 'ITM' : 'OTM'})`,
      });
    }
  }, [selectedOption, underlyingPrice]);

  /* ── 6. ATH (All-Time High) Overlay ─────────────────────── */
  useEffect(() => {
    let active = true;
    
    // Only fetch ATH for BTC
    if (currency === 'BTC') {
      getATH('BTC')
        .then((data) => {
          if (active && data && data.ath) {
            setAthValue(data.ath);
          }
        })
        .catch((err) => console.warn('Failed to fetch ATH:', err));
    } else {
      setAthValue(null);
    }
    
    return () => {
      active = false;
    };
  }, [currency]);

  // Draw ATH line
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    if (athLineRef.current) {
      candleSeriesRef.current.removePriceLine(athLineRef.current);
      athLineRef.current = null;
    }

    if (athValue !== null) {
      athLineRef.current = candleSeriesRef.current.createPriceLine({
        price: athValue,
        color: '#fbbf24', // Gold color for ATH
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `ATH: $${athValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
      });
    }
  }, [athValue]);

  // Real-time ATH breaking check
  useEffect(() => {
    if (athValue !== null && underlyingPrice > athValue) {
      setAthValue(underlyingPrice);
    }
  }, [underlyingPrice, athValue]);

  const handleResetZoom = () => {
    chartInstanceRef.current?.timeScale().fitContent();
  };

  const activeCandle = hoverData || (rawCandlesRef.current.length > 0 ? rawCandlesRef.current[rawCandlesRef.current.length - 1] : null);
  const isPositive = stats.changePct24h >= 0;

  return (
    <div className={`candlestick-card ${isExpanded ? 'expanded' : ''}`}>
      {/* Chart Top Header & HUD */}
      <div className="chart-header">
        <div className="chart-symbol-info">
          <div className="symbol-title">
            <span className="symbol-name">{instrumentName}</span>
            <span className="market-badge">Live Deribit Feed</span>
            {selectedOption && (
              <span className={`strike-tag ${selectedOption.option_type}`}>
                Strike: ${selectedOption.strike?.toLocaleString()} {selectedOption.option_type?.toUpperCase()}
              </span>
            )}
          </div>

          <div className="symbol-pricing">
            <span className="current-price">
              ${underlyingPrice?.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '---'}
            </span>
            {stats.changePct24h !== null && (
              <span className={`price-change ${isPositive ? 'up' : 'down'}`}>
                {isPositive ? '+' : ''}{stats.changePct24h.toFixed(2)}%
                <span className="change-usd">({isPositive ? '+' : ''}${stats.change24h?.toFixed(1)})</span>
              </span>
            )}
            {athValue !== null && currency === 'BTC' && (
              <span className="ath-badge">
                ATH: ${athValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                {underlyingPrice && (
                  <span className="ath-distance">
                    ({((underlyingPrice - athValue) / athValue * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* OHLCV Readout HUD */}
        {activeCandle && (
          <div className="ohlcv-hud">
            <div className="hud-item">
              <span className="hud-label">O</span>
              <span className="hud-val">${activeCandle.open?.toFixed(1)}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">H</span>
              <span className="hud-val up">${activeCandle.high?.toFixed(1)}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">L</span>
              <span className="hud-val down">${activeCandle.low?.toFixed(1)}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">C</span>
              <span className="hud-val">${activeCandle.close?.toFixed(1)}</span>
            </div>
            {activeCandle.volume !== undefined && (
              <div className="hud-item">
                <span className="hud-label">Vol</span>
                <span className="hud-val">{activeCandle.volume?.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {/* Chart Controls & Timeframe Selector */}
        <div className="chart-controls">
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

          <div className="view-group">
            <button
              className={`view-btn ${chartType === 'candles' ? 'active' : ''}`}
              onClick={() => setChartType('candles')}
              title="Candlestick Chart"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 3v3H5v10h2v5h2v-5h2V6H9V3H7zm10 5v3h-2v6h2v4h2v-4h2v-6h-2V8h-2z" />
              </svg>
            </button>
            <button
              className={`view-btn ${chartType === 'line' ? 'active' : ''}`}
              onClick={() => setChartType('line')}
              title="Line Chart"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 17 9 11 13 15 21 7" />
              </svg>
            </button>
            <button
              className="view-btn icon-only"
              onClick={handleResetZoom}
              title="Reset Zoom / Fit View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
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
          </div>
        </div>
      </div>

      {/* Canvas Wrapper */}
      <div className="chart-canvas-wrapper">
        {loading && (
          <div className="chart-loading-overlay">
            <div className="chart-spinner" />
            <span>Loading {instrumentName} candles…</span>
          </div>
        )}
        {error && (
          <div className="chart-error-overlay">
            <span>⚠ {error}</span>
          </div>
        )}
        <div ref={chartContainerRef} className="chart-canvas" />
      </div>
    </div>
  );
}
