import React, { useState, useEffect } from 'react';
import { getOptionChain } from '../services/api';
import { blackScholes, impliedVolatility, btcToUsd } from '../utils/blackScholes';

export default function OptionChain({ currency, underlyingPrice, onSelectOption }) {
  const [chainData, setChainData] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [tickers, setTickers] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch option chain structure
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
    return () => { active = false; };
  }, [currency]);

  // Fetch tickers for the selected expiry
  useEffect(() => {
    if (!selectedExpiry || !chainData) return;
    
    let active = true;
    const fetchTickers = async () => {
      try {
        // Use our batch endpoint to get all tickers for this expiry
        const res = await fetch(`http://localhost:3001/api/option-chain/tickers?currency=${currency}&expiryDate=${selectedExpiry}`);
        if (!res.ok) throw new Error('Failed to fetch tickers');
        const data = await res.json();
        if (active) setTickers(data);
      } catch (err) {
        console.error(err);
      }
    };

    fetchTickers();
    // Poll every 5 seconds
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

  const renderOptionRow = (strike) => {
    const callInst = calls[strike];
    const putInst = puts[strike];

    const callTicker = callInst ? tickers[callInst.instrument_name] : null;
    const putTicker = putInst ? tickers[putInst.instrument_name] : null;

    // Call Calculations
    let callMarkUsd = 0;
    let callIV = 0;
    let callDelta = 0;
    if (callTicker && underlyingPrice) {
      callMarkUsd = btcToUsd(callTicker.mark_price, underlyingPrice);
      callIV = callTicker.mark_iv / 100;
      if (callIV > 0) {
        const bs = blackScholes({ S: underlyingPrice, K: strike, T, sigma: callIV, type: 'call' });
        callDelta = bs.delta;
      }
    }

    // Put Calculations
    let putMarkUsd = 0;
    let putIV = 0;
    let putDelta = 0;
    if (putTicker && underlyingPrice) {
      putMarkUsd = btcToUsd(putTicker.mark_price, underlyingPrice);
      putIV = putTicker.mark_iv / 100;
      if (putIV > 0) {
        const bs = blackScholes({ S: underlyingPrice, K: strike, T, sigma: putIV, type: 'put' });
        putDelta = bs.delta;
      }
    }

    return (
      <tr key={strike} className={strike > underlyingPrice ? 'strike-row itm-put' : 'strike-row itm-call'}>
        {/* CALLS */}
        <td className="clickable" onClick={() => callInst && onSelectOption({ ...callInst, markUsd: callMarkUsd, iv: callIV })}>
          {callDelta !== 0 ? callDelta.toFixed(2) : '—'}
        </td>
        <td className="clickable" onClick={() => callInst && onSelectOption({ ...callInst, markUsd: callMarkUsd, iv: callIV })}>
          {callIV > 0 ? (callIV * 100).toFixed(1) + '%' : '—'}
        </td>
        <td className="clickable option-price call-price" onClick={() => callInst && onSelectOption({ ...callInst, markUsd: callMarkUsd, iv: callIV })}>
          {callMarkUsd > 0 ? `$${callMarkUsd.toFixed(2)}` : '—'}
        </td>

        {/* STRIKE */}
        <td className="strike-col">{strike}</td>

        {/* PUTS */}
        <td className="clickable option-price put-price" onClick={() => putInst && onSelectOption({ ...putInst, markUsd: putMarkUsd, iv: putIV })}>
          {putMarkUsd > 0 ? `$${putMarkUsd.toFixed(2)}` : '—'}
        </td>
        <td className="clickable" onClick={() => putInst && onSelectOption({ ...putInst, markUsd: putMarkUsd, iv: putIV })}>
          {putIV > 0 ? (putIV * 100).toFixed(1) + '%' : '—'}
        </td>
        <td className="clickable" onClick={() => putInst && onSelectOption({ ...putInst, markUsd: putMarkUsd, iv: putIV })}>
          {putDelta !== 0 ? putDelta.toFixed(2) : '—'}
        </td>
      </tr>
    );
  };

  return (
    <div className="option-chain-container">
      <div className="expiry-tabs">
        {chainData.expiries.slice(0, 8).map(exp => (
          <button 
            key={exp} 
            className={`expiry-tab ${exp === selectedExpiry ? 'active' : ''}`}
            onClick={() => setSelectedExpiry(exp)}
          >
            {exp}
          </button>
        ))}
      </div>

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
