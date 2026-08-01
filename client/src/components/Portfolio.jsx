import React, { useState, useEffect } from 'react';
import { getPortfolio, getPositions, closePosition } from '../services/api';

export default function Portfolio({ refreshTrigger }) {
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPortfolio = async () => {
    try {
      const portData = await getPortfolio();
      const posData = await getPositions();
      setPortfolio(portData);
      setPositions(posData.positions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, [refreshTrigger]);

  const handleClose = async (id) => {
    try {
      await closePosition(id);
      fetchPortfolio(); // Refresh after closing
    } catch (err) {
      alert(`Failed to close position: ${err.message}`);
    }
  };

  if (loading) return <div className="portfolio-panel loading">Loading Portfolio...</div>;

  return (
    <div className="portfolio-panel">
      <div className="panel-header">Portfolio</div>
      
      <div className="portfolio-summary">
        <div className="summary-stat">
          <span className="stat-label">Total Value</span>
          <span className="stat-value highlight">
            ${portfolio?.total_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Cash</span>
          <span className="stat-value">
            ${portfolio?.cash?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="positions-list">
        <div className="positions-header">Open Positions ({positions.length})</div>
        {positions.length === 0 ? (
          <div className="empty-message">No open positions.</div>
        ) : (
          <div className="positions-scroll">
            {positions.map((pos) => {
              const isCall = pos.option_type === 'call';
              const pnlClass = pos.pnl > 0 ? 'profit' : pos.pnl < 0 ? 'loss' : '';
              
              return (
                <div key={pos.id} className="position-card">
                  <div className="pos-header">
                    <span className={`pos-direction ${pos.direction}`}>{pos.direction.toUpperCase()}</span>
                    <span className="pos-qty">{pos.quantity}x</span>
                    <span className="pos-instrument">{pos.instrument_name}</span>
                  </div>
                  <div className="pos-details">
                    <div className="pos-detail-col">
                      <span className="detail-label">Entry</span>
                      <span>${pos.entry_price.toFixed(2)}</span>
                    </div>
                    <div className="pos-detail-col">
                      <span className="detail-label">Current</span>
                      <span>${pos.current_price.toFixed(2)}</span>
                    </div>
                    <div className="pos-detail-col">
                      <span className="detail-label">P&L</span>
                      <span className={`pos-pnl ${pnlClass}`}>
                        {pos.pnl > 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <button className="close-pos-btn" onClick={() => handleClose(pos.id)}>
                    Close Position
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
