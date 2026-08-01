import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { initDatabase } from './db/index.js';
import { getDeribitClient } from './services/deribit.js';
import portfolioRoutes from './routes/portfolio.js';
import pricesRoutes from './routes/prices.js';
import tradingRoutes from './routes/trading.js';
import optionChainRoutes from './routes/optionChain.js';

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

/* ── Health check (includes subsystem status) ────────────── */
app.get('/api/health', (_req, res) => {
  const deribit = getDeribitClient();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    subsystems: {
      database: true,
      deribit: deribit.isConnected,
    },
  });
});

/* ── HTTP + WebSocket server ─────────────────────────────── */
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients
const clients = new Set();

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

  // 2. Connect to Deribit
  const deribit = getDeribitClient();

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

  try {
    await deribit.connect();
    console.log('[Boot] ✓ Deribit connected');
  } catch (err) {
    console.error('[Boot] ⚠ Deribit connection failed (will retry):', err.message);
    // Non-fatal — we retry in the background
  }

  // 3. Start HTTP server
  server.listen(PORT, () => {
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
  });
}

start();
