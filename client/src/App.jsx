import { useState, useEffect, useRef } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';

const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';
const RETRY_DELAY_MS = 2000;

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
    let cancelled = false;
    let retryTimer;

    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (cancelled) return;

        setApiStatus({ state: 'connected', data });
        setDbStatus({ state: data.subsystems?.database ? 'connected' : 'error' });
        setDeribitStatus({ state: data.subsystems?.deribit ? 'connected' : 'connecting' });
      } catch (err) {
        if (cancelled) return;

        setApiStatus({ state: 'error', data: err.message });
        setDbStatus({ state: 'connecting' });
        setDeribitStatus({ state: 'connecting' });
      } finally {
        if (!cancelled) {
          retryTimer = setTimeout(checkHealth, RETRY_DELAY_MS);
        }
      }
    };

    checkHealth();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  /* ── WebSocket connection ────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    const connect = () => {
      if (cancelled) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      setWsStatus((prev) => ({ ...prev, state: 'connecting' }));

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
            setDeribitStatus({ state: msg.deribit_connected ? 'connected' : 'connecting' });
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
        if (cancelled) return;

        setWsStatus((prev) => ({
          ...prev,
          state: prev.state === 'connected' ? 'disconnected' : 'connecting',
        }));
        retryTimer = setTimeout(connect, RETRY_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
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
              {status === 'connected' ? 'Online' : status === 'error' ? 'Retrying' : 'Connecting'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
