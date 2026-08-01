import { useState, useEffect, useRef } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';

function App() {
  const [apiStatus, setApiStatus] = useState({ state: 'connecting', data: null });
  const [wsStatus, setWsStatus] = useState({ state: 'connecting', data: null });
  const [deribitStatus, setDeribitStatus] = useState({ state: 'connecting' });
  const [dbStatus, setDbStatus] = useState({ state: 'connecting' });
  
  const [prices, setPrices] = useState({ btc_usd: null, eth_usd: null });
  const wsRef = useRef(null);

  const [bootComplete, setBootComplete] = useState(false);

  /* ── Check REST API health ───────────────────────── */
  useEffect(() => {
    fetch('http://localhost:3001/api/health')
      .then((res) => res.json())
      .then((data) => {
        setApiStatus({ state: 'connected', data });
        setDbStatus({ state: data.subsystems?.database ? 'connected' : 'error' });
        setDeribitStatus({ state: data.subsystems?.deribit ? 'connected' : 'connecting' });
      })
      .catch((err) => setApiStatus({ state: 'error', data: err.message }));
  }, []);

  /* ── WebSocket connection ────────────────────────── */
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus((prev) => ({ ...prev, state: 'connected' }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'welcome':
          setWsStatus({ state: 'connected', data: msg });
          if (msg.prices) {
            setPrices((prev) => ({
              ...prev,
              ...Object.fromEntries(
                Object.entries(msg.prices).filter(([, v]) => v !== null)
              ),
            }));
          }
          if (msg.deribit_connected) {
            setDeribitStatus({ state: 'connected' });
          }
          break;

        case 'price_update':
          setPrices((prev) => ({
            ...prev,
            [msg.index]: { price: msg.price, timestamp: msg.timestamp },
          }));
          setDeribitStatus({ state: 'connected' });
          break;

        case 'deribit_status':
          setDeribitStatus({
            state: msg.connected ? 'connected' : 'connecting',
          });
          break;
      }
    };

    ws.onerror = () => {
      setWsStatus({ state: 'error', data: 'Connection failed' });
    };

    ws.onclose = () => {
      setWsStatus((prev) => {
        if (prev.state === 'connected') return { ...prev, state: 'disconnected' };
        return prev;
      });
    };

    return () => ws.close();
  }, []);

  // Transition from boot screen to dashboard once API and WS are connected
  useEffect(() => {
    if (apiStatus.state === 'connected' && wsStatus.state === 'connected') {
      // Small delay for dramatic effect
      const timer = setTimeout(() => {
        setBootComplete(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [apiStatus.state, wsStatus.state]);

  const statusClass = (state) => {
    if (state === 'connected') return 'ok';
    if (state === 'error') return 'error';
    return 'pending';
  };

  const dotClass = (state) => {
    if (state === 'connected') return 'connected';
    if (state === 'error' || state === 'disconnected') return 'disconnected';
    return 'connecting';
  };

  if (bootComplete) {
    return <Dashboard prices={prices} systemStatus={{ api: apiStatus.state === 'connected', deribit: deribitStatus.state === 'connected' }} />;
  }

  // Boot Screen
  return (
    <div className="boot-screen">
      <div className="boot-logo">
        CryptoOptions<span>.paper</span>
      </div>
      <div className="boot-status">
        <div className="boot-status-header">Initializing Systems</div>
        {[
          { label: 'REST API', status: apiStatus.state },
          { label: 'WebSocket', status: wsStatus.state },
          { label: 'Database', status: dbStatus.state },
          { label: 'Deribit Feed', status: deribitStatus.state },
        ].map(({ label, status }) => (
          <div className="boot-status-row" key={label}>
            <span className="label">
              <span className={`status-dot ${dotClass(status)}`} />
              {label}
            </span>
            <span className={`value ${statusClass(status)}`}>
              {status === 'connected' ? '● Online' : status === 'error' ? '✕ Failed' : '◌ Connecting…'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
