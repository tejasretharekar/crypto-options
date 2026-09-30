import React, { useState, useEffect } from 'react';
import { getOptionChain, trackExpiry, getOptionTickers } from '../services/api';
import { blackScholes, btcToUsd } from '../utils/blackScholes';

export default function OptionChain({
  currency,
  underlyingPrice,
  selectedOption,
  onSelectOption,
  onOpenInChart,
  slot1,
  slot2,
  activeSlotIndex = 1,
}) {
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

  const handleOptionClick = (instrument, values, preferredSlot = null) => {
    if (!instrument) return;
    const optionPayload = {
      type: 'option',
      ...instrument,
      ...values,
      currency,
    };

    // Update order panel selection
    onSelectOption(optionPayload);

    // Route to chart slot
    if (onOpenInChart) {
      onOpenInChart(optionPayload, preferredSlot || activeSlotIndex);
    }
  };

  const getSlotNum = (instrumentName) => {
    if (!instrumentName) return null;
    const isSlot1 = slot1?.instrument_name === instrumentName;
    const isSlot2 = slot2?.instrument_name === instrumentName;
    if (isSlot1 && isSlot2) return 'both';
    if (isSlot1) return '1';
    if (isSlot2) return '2';
    return null;
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

    const isCallSelected = selectedOption?.instrument_name === callInst?.instrument_name;
    const isPutSelected = selectedOption?.instrument_name === putInst?.instrument_name;

    const callSlot = callInst ? getSlotNum(callInst.instrument_name) : null;
    const putSlot = putInst ? getSlotNum(putInst.instrument_name) : null;

    return (
      <tr
        key={strike}
        className={`${strike > underlyingPrice ? 'strike-row itm-put' : 'strike-row itm-call'} ${
          isCallSelected || isPutSelected ? 'row-selected' : ''
        }`}
      >
        {/* CALL DELTA */}
        <td
          className={`clickable ${isCallSelected ? 'cell-active' : ''}`}
          onClick={() =>
            handleOptionClick(callInst, {
              markUsd: callMarkUsd,
              currentPrice: callTicker?.mark_price,
              iv: callIV,
              delta: callDelta,
            })
          }
        >
          {callDelta !== 0 ? callDelta.toFixed(2) : '--'}
        </td>

        {/* CALL IV */}
        <td
          className={`clickable ${isCallSelected ? 'cell-active' : ''}`}
          onClick={() =>
            handleOptionClick(callInst, {
              markUsd: callMarkUsd,
              currentPrice: callTicker?.mark_price,
              iv: callIV,
              delta: callDelta,
            })
          }
        >
          {callIV > 0 ? `${(callIV * 100).toFixed(1)}%` : '--'}
        </td>

        {/* CALL MARK PRICE (USD) */}
        <td
          className={`clickable option-price call-price ${isCallSelected ? 'cell-active' : ''}`}
          onClick={() =>
            handleOptionClick(callInst, {
              markUsd: callMarkUsd,
              currentPrice: callTicker?.mark_price,
              iv: callIV,
              delta: callDelta,
            })
          }
        >
          <div className="price-cell-box call-box">
            {callSlot && (
              <span className={`slot-indicator-badge slot-${callSlot}`} title={`Open in Chart ${callSlot}`}>
                {callSlot === 'both' ? '1&2' : `C${callSlot}`}
              </span>
            )}
            <span className="price-value">
              {callMarkUsd > 0 ? `$${callMarkUsd.toFixed(2)}` : '--'}
            </span>
            {callInst && (
              <span className="quick-slot-actions call-actions">
                <button
                  type="button"
                  className={`quick-slot-btn ${callSlot === '1' || callSlot === 'both' ? 'active-slot-btn' : ''}`}
                  title="Open this Call in Chart 1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOptionClick(
                      callInst,
                      { markUsd: callMarkUsd, currentPrice: callTicker?.mark_price, iv: callIV, delta: callDelta },
                      1
                    );
                  }}
                >
                  1
                </button>
                <button
                  type="button"
                  className={`quick-slot-btn ${callSlot === '2' || callSlot === 'both' ? 'active-slot-btn' : ''}`}
                  title="Open this Call in Chart 2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOptionClick(
                      callInst,
                      { markUsd: callMarkUsd, currentPrice: callTicker?.mark_price, iv: callIV, delta: callDelta },
                      2
                    );
                  }}
                >
                  2
                </button>
              </span>
            )}
          </div>
        </td>

        {/* STRIKE */}
        <td className="strike-col">
          <span className="strike-val">${strike.toLocaleString()}</span>
        </td>

        {/* PUT MARK PRICE (USD) */}
        <td
          className={`clickable option-price put-price ${isPutSelected ? 'cell-active' : ''}`}
          onClick={() =>
            handleOptionClick(putInst, {
              markUsd: putMarkUsd,
              currentPrice: putTicker?.mark_price,
              iv: putIV,
              delta: putDelta,
            })
          }
        >
          <div className="price-cell-box put-box">
            {putSlot && (
              <span className={`slot-indicator-badge slot-${putSlot}`} title={`Open in Chart ${putSlot}`}>
                {putSlot === 'both' ? '1&2' : `C${putSlot}`}
              </span>
            )}
            <span className="price-value">
              {putMarkUsd > 0 ? `$${putMarkUsd.toFixed(2)}` : '--'}
            </span>
            {putInst && (
              <span className="quick-slot-actions put-actions">
                <button
                  type="button"
                  className={`quick-slot-btn ${putSlot === '1' || putSlot === 'both' ? 'active-slot-btn' : ''}`}
                  title="Open this Put in Chart 1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOptionClick(
                      putInst,
                      { markUsd: putMarkUsd, currentPrice: putTicker?.mark_price, iv: putIV, delta: putDelta },
                      1
                    );
                  }}
                >
                  1
                </button>
                <button
                  type="button"
                  className={`quick-slot-btn ${putSlot === '2' || putSlot === 'both' ? 'active-slot-btn' : ''}`}
                  title="Open this Put in Chart 2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOptionClick(
                      putInst,
                      { markUsd: putMarkUsd, currentPrice: putTicker?.mark_price, iv: putIV, delta: putDelta },
                      2
                    );
                  }}
                >
                  2
                </button>
              </span>
            )}
          </div>
        </td>

        {/* PUT IV */}
        <td
          className={`clickable ${isPutSelected ? 'cell-active' : ''}`}
          onClick={() =>
            handleOptionClick(putInst, {
              markUsd: putMarkUsd,
              currentPrice: putTicker?.mark_price,
              iv: putIV,
              delta: putDelta,
            })
          }
        >
          {putIV > 0 ? `${(putIV * 100).toFixed(1)}%` : '--'}
        </td>

        {/* PUT DELTA */}
        <td
          className={`clickable ${isPutSelected ? 'cell-active' : ''}`}
          onClick={() =>
            handleOptionClick(putInst, {
              markUsd: putMarkUsd,
              currentPrice: putTicker?.mark_price,
              iv: putIV,
              delta: putDelta,
            })
          }
        >
          {putDelta !== 0 ? putDelta.toFixed(2) : '--'}
        </td>
      </tr>
    );
  };

  return (
    <div className="option-chain-container">
      <div className="chain-header-bar">
        <div className="expiry-tabs">
          {chainData.expiries.slice(0, 8).map((exp) => (
            <button
              key={exp}
              type="button"
              className={`expiry-tab ${exp === selectedExpiry ? 'active' : ''}`}
              onClick={() => {
                setSelectedExpiry(exp);
              }}
            >
              {exp}
            </button>
          ))}
        </div>

        <div className="chain-instructions">
          <span className="inst-hint">
            Click price to chart in <strong>Chart {activeSlotIndex}</strong>, or hover and click <strong>[1]</strong> / <strong>[2]</strong>.
          </span>
        </div>
      </div>

      <div className="chain-table-wrapper">
        <table className="chain-table">
          <thead>
            <tr>
              <th colSpan="3" className="calls-header">
                CALLS
              </th>
              <th></th>
              <th colSpan="3" className="puts-header">
                PUTS
              </th>
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
          <tbody>{strikes.map(renderOptionRow)}</tbody>
        </table>
      </div>
    </div>
  );
}
