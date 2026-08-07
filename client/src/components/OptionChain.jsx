import React, { useState, useEffect } from 'react';
import { getOptionChain } from '../services/api';
import { blackScholes, btcToUsd } from '../utils/blackScholes';

const HISTORY_LIMIT = 72;

const defaultIndicatorSettings = {
  fastEma: 5,
  slowEma: 13,
  momentum: 6,
  ivWeight: 35,
};

function ema(values, period) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const result = [values[0]];

  for (let i = 1; i < values.length; i += 1) {
    result.push(values[i] * alpha + result[i - 1] * (1 - alpha));
  }

  return result;
}

function pointsFromValues(values, width, height, pad = 8) {
  if (values.length === 0) return '';
  if (values.length === 1) return `${pad},${height / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(max, 1) * 0.01 || 1;

  return values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function OptionSignalChart({ history, settings, markUsd, iv, delta, optionType }) {
  const width = 560;
  const height = 160;
  const prices = history.map((point) => point.markUsd).filter((value) => value > 0);
  const fastLine = ema(prices, settings.fastEma);
  const slowLine = ema(prices, settings.slowEma);
  const lastFast = fastLine.at(-1) || markUsd;
  const lastSlow = slowLine.at(-1) || markUsd;
  const momentumBase = prices.at(-1 - settings.momentum) || prices[0] || markUsd;
  const lastPrice = prices.at(-1) || markUsd || 0;
  const momentumPct = momentumBase > 0 ? ((lastPrice - momentumBase) / momentumBase) * 100 : 0;
  const trendPct = lastSlow > 0 ? ((lastFast - lastSlow) / lastSlow) * 100 : 0;
  const ivBoost = ((iv || 0) * 100 - 60) / 100;
  const deltaLift = optionType === 'put' ? Math.abs(delta || 0) * 8 : (delta || 0) * 12;
  const score = trendPct * 52 + momentumPct * 10 + ivBoost * settings.ivWeight + deltaLift;
  const forecastPct = Math.max(-18, Math.min(18, score / 18));
  const forecastPrice = lastPrice * (1 + forecastPct / 100);
  const direction = score >= 7 ? 'bullish' : score <= -7 ? 'bearish' : 'neutral';
  const confidence = Math.min(99, Math.max(8, Math.round(Math.abs(score) * 1.8)));
  const combinedValues = [...prices, ...fastLine, ...slowLine, forecastPrice].filter((value) => Number.isFinite(value) && value > 0);
  const min = combinedValues.length ? Math.min(...combinedValues) : 0;
  const max = combinedValues.length ? Math.max(...combinedValues) : 1;
  const span = max - min || Math.max(max, 1) * 0.01 || 1;
  const forecastX = width - 10;
  const forecastY = height - 8 - ((forecastPrice - min) / span) * (height - 16);
  const lastX = width - 76;
  const lastY = height - 8 - ((lastPrice - min) / span) * (height - 16);

  return (
    <div className={`option-signal ${direction}`}>
      <svg className="option-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${optionType} option ${direction} chart`}>
        <polyline className="sparkline-grid" points={`8,${height - 8} ${width - 8},${height - 8}`} />
        <polyline className="price-line" points={pointsFromValues(prices, width, height)} />
        <polyline className="fast-line" points={pointsFromValues(fastLine, width, height)} />
        <polyline className="slow-line" points={pointsFromValues(slowLine, width, height)} />
        {prices.length > 1 && (
          <line className="forecast-line" x1={lastX} y1={lastY} x2={forecastX} y2={forecastY} />
        )}
        <circle className="forecast-dot" cx={forecastX} cy={forecastY} r="4" />
      </svg>
      <div className="signal-readout">
        <span className="signal-bias">{direction}</span>
        <span>{forecastPct >= 0 ? '+' : ''}{forecastPct.toFixed(1)}%</span>
        <span>{confidence}%</span>
      </div>
    </div>
  );
}

export default function OptionChain({ currency, underlyingPrice, selectedOption, onSelectOption }) {
  const [chainData, setChainData] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [tickers, setTickers] = useState({});
  const [tickerHistory, setTickerHistory] = useState({});
  const [indicatorSettings, setIndicatorSettings] = useState(defaultIndicatorSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getOptionChain(currency)
      .then((data) => {
        if (!active) return;
        setChainData(data);
        if (data.expiries.length > 0) {
          setSelectedExpiry(data.expiries[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currency]);

  useEffect(() => {
    if (!selectedExpiry || !chainData) return;

    let active = true;
    const fetchTickers = async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/option-chain/tickers?currency=${currency}&expiryDate=${selectedExpiry}`);
        if (!res.ok) throw new Error('Failed to fetch tickers');
        const data = await res.json();
        if (active) setTickers(data);
      } catch (err) {
        console.error(err);
      }
    };

    fetchTickers();
    const interval = setInterval(fetchTickers, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedExpiry, chainData, currency]);

  useEffect(() => {
    if (!underlyingPrice || Object.keys(tickers).length === 0) return;

    setTickerHistory((prev) => {
      const next = { ...prev };

      Object.entries(tickers).forEach(([instrumentName, ticker]) => {
        if (!ticker?.mark_price) return;

        const markUsd = btcToUsd(ticker.mark_price, underlyingPrice);
        const series = next[instrumentName] || [];
        const lastPoint = series.at(-1);
        const point = {
          time: ticker.timestamp || Date.now(),
          markUsd,
          iv: (ticker.mark_iv || 0) / 100,
          underlying: underlyingPrice,
        };

        if (lastPoint && lastPoint.time === point.time && Math.abs(lastPoint.markUsd - point.markUsd) < 0.0001) {
          return;
        }

        next[instrumentName] = [...series, point].slice(-HISTORY_LIMIT);
      });

      return next;
    });
  }, [tickers, underlyingPrice]);

  const updateIndicator = (key, value) => {
    setIndicatorSettings((prev) => ({
      ...prev,
      [key]: Number(value),
    }));
  };

  if (loading) return <div className="chain-loading">Loading Options Chain...</div>;
  if (!chainData || !selectedExpiry) return <div className="chain-loading">No options available.</div>;

  const currentExpiryData = chainData.chain[selectedExpiry];
  const { strikes, calls, puts, daysToExpiry } = currentExpiryData;
  const T = daysToExpiry / 365;
  const selectedHistory = selectedOption ? tickerHistory[selectedOption.instrument_name] || [] : [];

  const selectOption = (instrument, values) => {
    if (!instrument) return;
    onSelectOption({ ...instrument, ...values });
  };

  const renderOptionRow = (strike) => {
    const callInst = calls[strike];
    const putInst = puts[strike];
    const callTicker = callInst ? tickers[callInst.instrument_name] : null;
    const putTicker = putInst ? tickers[putInst.instrument_name] : null;

    let callMarkUsd = 0;
    let callIV = 0;
    let callDelta = 0;
    if (callTicker && underlyingPrice) {
      callMarkUsd = btcToUsd(callTicker.mark_price, underlyingPrice);
      callIV = callTicker.mark_iv / 100;
      if (callIV > 0) {
        callDelta = blackScholes({ S: underlyingPrice, K: strike, T, sigma: callIV, type: 'call' }).delta;
      }
    }

    let putMarkUsd = 0;
    let putIV = 0;
    let putDelta = 0;
    if (putTicker && underlyingPrice) {
      putMarkUsd = btcToUsd(putTicker.mark_price, underlyingPrice);
      putIV = putTicker.mark_iv / 100;
      if (putIV > 0) {
        putDelta = blackScholes({ S: underlyingPrice, K: strike, T, sigma: putIV, type: 'put' }).delta;
      }
    }

    return (
      <tr key={strike} className={strike > underlyingPrice ? 'strike-row itm-put' : 'strike-row itm-call'}>
        <td className="clickable" onClick={() => selectOption(callInst, { markUsd: callMarkUsd, iv: callIV, delta: callDelta })}>
          {callDelta !== 0 ? callDelta.toFixed(2) : '--'}
        </td>
        <td className="clickable" onClick={() => selectOption(callInst, { markUsd: callMarkUsd, iv: callIV, delta: callDelta })}>
          {callIV > 0 ? `${(callIV * 100).toFixed(1)}%` : '--'}
        </td>
        <td className="clickable option-price call-price" onClick={() => selectOption(callInst, { markUsd: callMarkUsd, iv: callIV, delta: callDelta })}>
          {callMarkUsd > 0 ? `$${callMarkUsd.toFixed(2)}` : '--'}
        </td>

        <td className="strike-col">{strike}</td>

        <td className="clickable option-price put-price" onClick={() => selectOption(putInst, { markUsd: putMarkUsd, iv: putIV, delta: putDelta })}>
          {putMarkUsd > 0 ? `$${putMarkUsd.toFixed(2)}` : '--'}
        </td>
        <td className="clickable" onClick={() => selectOption(putInst, { markUsd: putMarkUsd, iv: putIV, delta: putDelta })}>
          {putIV > 0 ? `${(putIV * 100).toFixed(1)}%` : '--'}
        </td>
        <td className="clickable" onClick={() => selectOption(putInst, { markUsd: putMarkUsd, iv: putIV, delta: putDelta })}>
          {putDelta !== 0 ? putDelta.toFixed(2) : '--'}
        </td>
      </tr>
    );
  };

  return (
    <div className="option-chain-container">
      <div className="expiry-tabs">
        {chainData.expiries.slice(0, 8).map((exp) => (
          <button
            key={exp}
            className={`expiry-tab ${exp === selectedExpiry ? 'active' : ''}`}
            onClick={() => {
              setSelectedExpiry(exp);
              onSelectOption(null);
            }}
          >
            {exp}
          </button>
        ))}
      </div>

      {selectedOption && (
        <div className="selected-analysis">
          <div className="analysis-chart">
            <div className="analysis-kicker">
              <span className={`instrument-type ${selectedOption.option_type}`}>{selectedOption.option_type.toUpperCase()}</span>
              <strong>{selectedOption.instrument_name}</strong>
              <span>${selectedOption.markUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <OptionSignalChart
              history={selectedHistory}
              settings={indicatorSettings}
              markUsd={selectedOption.markUsd}
              iv={selectedOption.iv}
              delta={selectedOption.delta}
              optionType={selectedOption.option_type}
            />
          </div>

          <div className="indicator-lab selected">
            <div className="indicator-title">
              <span>Indicators</span>
              <strong>{selectedHistory.length}</strong>
            </div>
            <label>
              Fast EMA
              <input type="range" min="2" max="12" value={indicatorSettings.fastEma} onChange={(event) => updateIndicator('fastEma', event.target.value)} />
              <span>{indicatorSettings.fastEma}</span>
            </label>
            <label>
              Slow EMA
              <input type="range" min="8" max="34" value={indicatorSettings.slowEma} onChange={(event) => updateIndicator('slowEma', event.target.value)} />
              <span>{indicatorSettings.slowEma}</span>
            </label>
            <label>
              Momentum
              <input type="range" min="2" max="18" value={indicatorSettings.momentum} onChange={(event) => updateIndicator('momentum', event.target.value)} />
              <span>{indicatorSettings.momentum}</span>
            </label>
            <label>
              IV weight
              <input type="range" min="0" max="80" value={indicatorSettings.ivWeight} onChange={(event) => updateIndicator('ivWeight', event.target.value)} />
              <span>{indicatorSettings.ivWeight}</span>
            </label>
          </div>
        </div>
      )}

      <div className="chain-table-wrapper">
        <table className="chain-table">
          <thead>
            <tr>
              <th colSpan="3" className="calls-header">CALLS</th>
              <th></th>
              <th colSpan="3" className="puts-header">PUTS</th>
            </tr>
            <tr>
              <th>Delta</th>
              <th>IV</th>
              <th>Mark (USD)</th>
              <th className="strike-col">Strike</th>
              <th>Mark (USD)</th>
              <th>IV</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map(renderOptionRow)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
