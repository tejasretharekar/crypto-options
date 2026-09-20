import React, { useState, useEffect } from 'react';
import { getOptionChain, trackExpiry, getOptionTickers } from '../services/api';
import { blackScholes, btcToUsd } from '../utils/blackScholes';
import OptionCandlestickChart from './OptionCandlestickChart';

export default function OptionChain({ currency, underlyingPrice, selectedOption, onSelectOption }) {
  const [chainData, setChainData] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [tickers, setTickers] = useState({});
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
    
    trackExpiry(currency, selectedExpiry).catch(console.error);

    let active = true;
    const fetchTickers = async () => {
      try {
        const data = await getOptionTickers(currency, selectedExpiry);
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

  if (loading) return <div className="chain-loading">Loading Options Chain...</div>;
  if (!chainData || !selectedExpiry) return <div className="chain-loading">No options available.</div>;

  const currentExpiryData = chainData.chain[selectedExpiry];
  const { strikes, calls, puts, daysToExpiry } = currentExpiryData;
  const T = daysToExpiry / 365;

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

  const selectedTicker = selectedOption ? tickers[selectedOption.instrument_name] : null;
  const currentPrice = selectedTicker ? selectedTicker.mark_price : null;

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
            <OptionCandlestickChart
              instrumentName={selectedOption.instrument_name}
              optionType={selectedOption.option_type}
              currentPrice={currentPrice}
            />
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




