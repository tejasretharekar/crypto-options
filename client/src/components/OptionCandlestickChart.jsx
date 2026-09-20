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
import { getOptionMarkPriceCandles } from '../services/api';

const RESOLUTIONS = [
  { label: '1m', value: '1', intervalSec: 60 },
  { label: '5m', value: '5', intervalSec: 300 },
  { label: '15m', value: '15', intervalSec: 900 },
  { label: '1h', value: '60', intervalSec: 3600 },
  { label: '4h', value: '240', intervalSec: 14400 },
  { label: '1D', value: '1D', intervalSec: 86400 },
];

export default function OptionCandlestickChart({ instrumentName, optionType, currentPrice }) {
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const rawCandlesRef = useRef([]);

  const [resolution, setResolution] = useState('60');
  const [chartType, setChartType] = useState('candles');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoverData, setHoverData] = useState(null);
  const [stats, setStats] = useState({ high: null, low: null, change: null, changePct: null });

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

  /* ── 2. Toggle Chart View ───────────────────────────────── */
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

  /* ── 3. Load Historical Data ────────────────────────────── */
  useEffect(() => {
    if (!instrumentName) return;
    
    let mounted = true;
    setLoading(true);
    setError(null);
    
    rawCandlesRef.current = [];
    candleSeriesRef.current?.setData([]);
    lineSeriesRef.current?.setData([]);

    getOptionMarkPriceCandles(instrumentName, resolution)
      .then((res) => {
        if (!mounted) return;
        if (res && res.candles) {
          rawCandlesRef.current = res.candles;
          candleSeriesRef.current?.setData(res.candles);
          lineSeriesRef.current?.setData(res.candles.map(c => ({ time: c.time, value: c.close })));
          
          if (res.candles.length > 0) {
            updateStats(res.candles);
          }
          chartInstanceRef.current?.timeScale().fitContent();
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [instrumentName, resolution]);

  const updateStats = (candles) => {
    if (candles.length === 0) return;
    const firstCandle = candles[0];
    const lastCandle = candles[candles.length - 1];
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    setStats({
      high: Math.max(...highs),
      low: Math.min(...lows),
      change: lastCandle.close - firstCandle.open,
      changePct: firstCandle.open > 0 ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100 : 0,
    });
  };

  /* ── 4. Live Tick Merge ─────────────────────────────────── */
  useEffect(() => {
    if (!currentPrice || !instrumentName || loading) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const currentRes = RESOLUTIONS.find((r) => r.value === resolution);
    const intervalSec = currentRes ? currentRes.intervalSec : 3600;
    const bucketTime = nowSec - (nowSec % intervalSec);

    const candles = rawCandlesRef.current;
    let latest = candles.length > 0 ? candles[candles.length - 1] : null;

    if (!latest || latest.time < bucketTime) {
      latest = {
        time: bucketTime,
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice
      };
      candles.push(latest);
    } else if (latest.time === bucketTime) {
      latest.high = Math.max(latest.high, currentPrice);
      latest.low = Math.min(latest.low, currentPrice);
      latest.close = currentPrice;
    }

    try {
      candleSeriesRef.current?.update(latest);
      lineSeriesRef.current?.update({ time: latest.time, value: latest.close });
      updateStats(candles);
    } catch (err) {
      // Ignore if timeframe changed concurrently
    }
  }, [currentPrice, instrumentName, resolution, loading]);

  const handleResetZoom = () => {
    chartInstanceRef.current?.timeScale().fitContent();
  };

  const activeCandle = hoverData || (rawCandlesRef.current.length > 0 ? rawCandlesRef.current[rawCandlesRef.current.length - 1] : null);
  const isPositive = (stats.changePct || 0) >= 0;

  return (
    <div className="option-candlestick-card">
      <div className="option-chart-header">
        <div className="option-chart-info">
          <span className={`instrument-type ${optionType}`}>{optionType?.toUpperCase()}</span>
          <span className="option-instrument-name">{instrumentName}</span>
          {activeCandle && (
            <span className="option-chart-price">
              {activeCandle.close?.toFixed(4)} BTC
            </span>
          )}
          {stats.changePct !== null && (
            <span className={`price-change ${isPositive ? 'up' : 'down'}`}>
              {isPositive ? '+' : ''}{stats.changePct.toFixed(2)}%
            </span>
          )}
        </div>

        {activeCandle && (
          <div className="ohlcv-hud">
            <div className="hud-item">
              <span className="hud-label">O</span>
              <span className="hud-val">{activeCandle.open?.toFixed(4)}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">H</span>
              <span className="hud-val up">{activeCandle.high?.toFixed(4)}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">L</span>
              <span className="hud-val down">{activeCandle.low?.toFixed(4)}</span>
            </div>
            <div className="hud-item">
              <span className="hud-label">C</span>
              <span className="hud-val">{activeCandle.close?.toFixed(4)}</span>
            </div>
          </div>
        )}

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
          </div>
        </div>
      </div>

      <div className="option-chart-canvas-wrapper">
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
        <div ref={chartContainerRef} className="option-chart-canvas" />
      </div>
    </div>
  );
}
