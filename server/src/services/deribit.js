/**
 * Deribit WebSocket client for real-time crypto price feeds.
 * 
 * Connects to Deribit's public API (no auth needed) and subscribes to:
 * - BTC/ETH index price streams
 * - Option instrument listings
 * 
 * Emits events that the main server can listen to and broadcast to clients.
 */
import { EventEmitter } from 'events';
import WebSocket from 'ws';

const DERIBIT_WS_URL = 'wss://www.deribit.com/ws/api/v2';
const DERIBIT_TESTNET_WS_URL = 'wss://test.deribit.com/ws/api/v2';

// Heartbeat interval required by Deribit to keep connection alive
const HEARTBEAT_INTERVAL = 15_000;
const RECONNECT_DELAY = 5_000;

export class DeribitClient extends EventEmitter {
  constructor({ testnet = false } = {}) {
    super();
    this.url = testnet ? DERIBIT_TESTNET_WS_URL : DERIBIT_WS_URL;
    this.ws = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.isConnected = false;
    this.shouldReconnect = true;

    // Latest price cache
    this.prices = {
      btc_usd: null,
      eth_usd: null,
    };
  }

  /* ── Connection ────────────────────────────────────────── */
  connect() {
    return new Promise((resolve, reject) => {
      console.log(`[Deribit] Connecting to ${this.url}...`);
      this.ws = new WebSocket(this.url);

      const onOpen = () => {
        this.ws.removeListener('error', onError);
        resolve();
      };

      const onError = (err) => {
        this.ws.removeListener('open', onOpen);
        reject(err);
      };

      this.ws.once('open', onOpen);
      this.ws.once('error', onError);

      this.ws.on('open', () => {
        console.log('[Deribit] Connected');
        this.isConnected = true;
        this.emit('connected');
        this._startHeartbeat();
        this._subscribeToFeeds();
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        console.log('[Deribit] Disconnected');
        this.isConnected = false;
        this._stopHeartbeat();
        this.emit('disconnected');

        if (this.shouldReconnect) {
          console.log(`[Deribit] Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
          this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Deribit] WebSocket error:', err.message);
        this.emit('error', err);
      });
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /* ── JSON-RPC messaging ────────────────────────────────── */
  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket not connected'));
      }

      const id = ++this.requestId;
      const msg = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));

      // Timeout after 10s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 10_000);
    });
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Handle JSON-RPC response (to our requests)
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);

      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // Handle subscription notifications
    if (msg.method === 'subscription') {
      this._handleSubscription(msg.params);
      return;
    }

    // Handle heartbeat response
    if (msg.method === 'heartbeat' && msg.params?.type === 'test_request') {
      this._send('public/test').catch(() => {});
    }
  }

  _handleSubscription({ channel, data }) {
    // Index price updates
    if (channel?.startsWith('deribit_price_index.')) {
      const indexName = data.index_name; // e.g. "btc_usd"
      this.prices[indexName] = {
        price: data.price,
        timestamp: data.timestamp,
      };
      this.emit('price_update', {
        index: indexName,
        price: data.price,
        timestamp: data.timestamp,
      });
    }

    // Ticker updates for specific instruments
    if (channel?.startsWith('ticker.')) {
      this.emit('ticker', {
        channel,
        data,
      });
    }
  }

  /* ── Subscriptions ─────────────────────────────────────── */
  async _subscribeToFeeds() {
    try {
      // Subscribe to BTC and ETH index prices
      await this._send('public/subscribe', {
        channels: [
          'deribit_price_index.btc_usd',
          'deribit_price_index.eth_usd',
        ],
      });
      console.log('[Deribit] Subscribed to BTC/ETH index prices');
    } catch (err) {
      console.error('[Deribit] Subscription error:', err.message);
    }
  }

  /* ── Public API methods ────────────────────────────────── */
  async getInstruments(currency = 'BTC', kind = 'option') {
    return this._send('public/get_instruments', {
      currency,
      kind,
      expired: false,
    });
  }

  async getOrderBook(instrumentName, depth = 5) {
    return this._send('public/get_order_book', {
      instrument_name: instrumentName,
      depth,
    });
  }

  async getTicker(instrumentName) {
    return this._send('public/ticker', {
      instrument_name: instrumentName,
    });
  }

  async getIndexPrice(indexName = 'btc_usd') {
    return this._send('public/get_index_price', {
      index_name: indexName,
    });
  }

  async subscribeToTicker(instrumentName) {
    return this._send('public/subscribe', {
      channels: [`ticker.${instrumentName}.raw`],
    });
  }

  async unsubscribeFromTicker(instrumentName) {
    return this._send('public/unsubscribe', {
      channels: [`ticker.${instrumentName}.raw`],
    });
  }

  /* ── Heartbeat ─────────────────────────────────────────── */
  async _startHeartbeat() {
    try {
      await this._send('public/set_heartbeat', { interval: 15 });
      console.log('[Deribit] Heartbeat enabled');
    } catch (err) {
      console.error('[Deribit] Heartbeat setup error:', err.message);
    }
  }

  _stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
  }

  /* ── Getters ───────────────────────────────────────────── */
  getPrices() {
    return { ...this.prices };
  }

  getStatus() {
    return {
      connected: this.isConnected,
      url: this.url,
      prices: this.prices,
    };
  }
}

// Singleton instance
let client = null;

export function getDeribitClient(opts) {
  if (!client) {
    client = new DeribitClient(opts);
  }
  return client;
}
