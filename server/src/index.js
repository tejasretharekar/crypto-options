import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { initDatabase, isDatabaseReady } from './db/index.js';
import { getDeribitClient } from './services/deribit.js';
import portfolioRoutes from './routes/portfolio.js';
import pricesRoutes from './routes/prices.js';
import tradingRoutes from './routes/trading.js';
import optionChainRoutes from './routes/optionChain.js';
import markPriceRoutes from './routes/markPrice.js';
import { getMarkPriceCollector } from './services/markPriceCollector.js';

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ──────────────────────────────────────────── */
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

/* ── Routes ──────────────────────────────────────────────── */
app.use('/api', portfolioRoutes);
app.use('/api', pricesRoutes);
app.use('/api', tradingRoutes);
app.use('/api', optionChainRoutes);
app.use('/api', markPriceRoutes);

/* ── Health check (includes subsystem status) ────────────── */
app.get('/api/health', (_req, res) => {
  const deribit = getDeribitClient();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    subsystems: {
      database: isDatabaseReady(),
      deribit: deribit.isConnected,
    },
  });
});

/* ── HTTP + WebSocket server ─────────────────────────────── */
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients
const clients = new Set();

wss.on('error', (err) => {
  console.error('[WS] Server error:', err.message);
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (total: ${clients.size})`);

  // Send welcome + current state
  const deribit = getDeribitClient();
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Crypto Options Trader server',
    timestamp: new Date().toISOString(),
    prices: deribit.getPrices(),
    deribit_connected: deribit.isConnected,
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (total: ${clients.size})`);
  });
});

// Broadcast helper
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(msg);
    }
  }
}

function listen() {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(PORT);
  });
}

/* ── Bootstrap ───────────────────────────────────────────── */
async function start() {
  // 1. Initialize database
  try {
    await initDatabase();
    console.log('[Boot] ✓ Database ready');
  } catch (err) {
    console.error('[Boot] ✕ Database failed:', err.message);
    process.exit(1);
  }

  getMarkPriceCollector().initialize();

  // 2. Connect to Deribit
  const deribit = getDeribitClient();

  deribit.on('markprice_options', (data) => {
    getMarkPriceCollector().onData(data);
  });

  deribit.on('price_update', (update) => {
    // Broadcast price updates to all connected clients
    broadcast({
      type: 'price_update',
      ...update,
    });
  });

  deribit.on('connected', () => {
    broadcast({ type: 'deribit_status', connected: true });
  });

  deribit.on('disconnected', () => {
    broadcast({ type: 'deribit_status', connected: false });
  });

  deribit.on('error', (err) => {
    console.error('[Boot] Deribit error:', err.message);
    broadcast({ type: 'deribit_status', connected: false });
  });

  // 3. Start HTTP server
  try {
    await listen();
    console.log(`
╔══════════════════════════════════════════════════╗
║   Crypto Options Trader — Server                 ║
║                                                  ║
║   REST API  : http://localhost:${PORT}/api         ║
║   WebSocket : ws://localhost:${PORT}/ws            ║
║   Database  : ✓ SQLite (sql.js)                  ║
║   Deribit   : ${deribit.isConnected ? '✓ Connected' : '⚠ Reconnecting...'}                      ║
╚══════════════════════════════════════════════════╝
    `);
  } catch (err) {
    console.error(`[Boot] ✕ Server failed on port ${PORT}:`, err.message);
    process.exit(1);
  }

  try {
    await deribit.connect();
    console.log('[Boot] ✓ Deribit connected');
  } catch (err) {
    console.error('[Boot] ⚠ Deribit connection failed (will retry):', err.message);
    // Non-fatal — we retry in the background
  }
}

start();
