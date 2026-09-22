/**
 * Database layer using PostgreSQL via pg (node-postgres).
 * 
 * - Connection pooling via pg.Pool
 * - Auto-creates schema on first run
 * - Seeds portfolio with $100,000 paper money
 * - All persistence is handled by PostgreSQL (no manual file I/O)
 */
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let ready = false;

/* ── Schema ──────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS portfolio (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    cash        DOUBLE PRECISION NOT NULL DEFAULT 100000.00,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_name TEXT             NOT NULL,
    direction       TEXT             NOT NULL CHECK (direction IN ('buy', 'sell')),
    quantity        DOUBLE PRECISION NOT NULL,
    entry_price     DOUBLE PRECISION NOT NULL,
    current_price   DOUBLE PRECISION NOT NULL DEFAULT 0,
    currency        TEXT             NOT NULL DEFAULT 'BTC',
    kind            TEXT             NOT NULL DEFAULT 'option',
    strike          DOUBLE PRECISION,
    expiry          TEXT,
    option_type     TEXT             CHECK (option_type IN ('call', 'put')),
    pnl             DOUBLE PRECISION NOT NULL DEFAULT 0,
    status          TEXT             NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_name TEXT             NOT NULL,
    direction       TEXT             NOT NULL CHECK (direction IN ('buy', 'sell')),
    quantity        DOUBLE PRECISION NOT NULL,
    price           DOUBLE PRECISION NOT NULL,
    total_cost      DOUBLE PRECISION NOT NULL,
    currency        TEXT             NOT NULL DEFAULT 'BTC',
    kind            TEXT             NOT NULL DEFAULT 'option',
    strike          DOUBLE PRECISION,
    expiry          TEXT,
    option_type     TEXT             CHECK (option_type IN ('call', 'put')),
    executed_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
  CREATE INDEX IF NOT EXISTS idx_positions_instrument ON positions(instrument_name);
  CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument_name);

  CREATE TABLE IF NOT EXISTS mark_price_ticks (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_name TEXT             NOT NULL,
    timestamp_ms    BIGINT           NOT NULL,
    mark_price      DOUBLE PRECISION NOT NULL,
    mark_iv         DOUBLE PRECISION,
    UNIQUE(instrument_name, timestamp_ms)
  );

  CREATE TABLE IF NOT EXISTS option_ath (
    instrument_name  TEXT             PRIMARY KEY,
    ath_mark_price   DOUBLE PRECISION NOT NULL,
    ath_timestamp    BIGINT           NOT NULL,
    first_tracked    BIGINT           NOT NULL,
    last_updated     BIGINT           NOT NULL,
    expiry_timestamp BIGINT
  );
`;

/* ── Initialize ──────────────────────────────────────────── */
export async function initDatabase() {
  // Build pool config from environment variables
  const config = {};

  if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
  } else {
    config.host = process.env.PGHOST || 'localhost';
    config.port = parseInt(process.env.PGPORT || '5432', 10);
    config.database = process.env.PGDATABASE || 'crypto_options_db';
    config.user = process.env.PGUSER || 'crypto_options';
    config.password = process.env.PGPASSWORD || '';
  }

  // Connection pool settings
  config.max = 10;                // max connections in pool
  config.idleTimeoutMillis = 30000;
  config.connectionTimeoutMillis = 5000;

  pool = new Pool(config);

  // Verify connection
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[DB] PostgreSQL connection verified');
  } finally {
    client.release();
  }

  // Run schema (IF NOT EXISTS makes this idempotent)
  await pool.query(SCHEMA);

  // Seed portfolio if empty
  const result = await pool.query('SELECT COUNT(*) as count FROM portfolio');
  const count = parseInt(result.rows[0].count, 10);
  if (count === 0) {
    await pool.query('INSERT INTO portfolio (id, cash) VALUES (1, 100000.00)');
    console.log('[DB] Seeded portfolio with $100,000.00');
  }

  ready = true;
  console.log('[DB] Database initialized successfully');
  return pool;
}

/* ── Query helpers ───────────────────────────────────────── */
export async function getPortfolio() {
  const result = await pool.query('SELECT * FROM portfolio WHERE id = 1');
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getOpenPositions() {
  const result = await pool.query("SELECT * FROM positions WHERE status = 'open' ORDER BY opened_at DESC");
  return result.rows;
}

export async function getTradeHistory(limit = 50) {
  const result = await pool.query(
    'SELECT * FROM trades ORDER BY executed_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

export async function updateCash(newCash) {
  await pool.query(
    "UPDATE portfolio SET cash = $1, updated_at = NOW() WHERE id = 1",
    [newCash]
  );
}

export function isDatabaseReady() {
  return ready;
}

/* ── Mark Price & ATH Helpers ─────────────────────────────── */
export async function insertMarkPriceTick(instrumentName, timestampMs, markPrice, markIv) {
  if (!pool) return;
  await pool.query(
    "INSERT INTO mark_price_ticks (instrument_name, timestamp_ms, mark_price, mark_iv) VALUES ($1, $2, $3, $4) ON CONFLICT (instrument_name, timestamp_ms) DO NOTHING",
    [instrumentName, timestampMs, markPrice, markIv]
  );
}

export async function getOptionAth(instrumentName) {
  if (!pool) return null;
  const result = await pool.query(
    "SELECT * FROM option_ath WHERE instrument_name = $1",
    [instrumentName]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function updateOptionAth(instrumentName, athMarkPrice, athTimestamp, firstTracked, expiryTimestamp) {
  if (!pool) return;
  const now = Date.now();
  await pool.query(
    "INSERT INTO option_ath (instrument_name, ath_mark_price, ath_timestamp, first_tracked, last_updated, expiry_timestamp) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(instrument_name) DO UPDATE SET ath_mark_price = EXCLUDED.ath_mark_price, ath_timestamp = EXCLUDED.ath_timestamp, last_updated = EXCLUDED.last_updated",
    [instrumentName, athMarkPrice, athTimestamp, firstTracked, now, expiryTimestamp]
  );
}

export async function getActiveTrackedOptions(currentMs) {
  if (!pool) return [];
  const result = await pool.query(
    "SELECT * FROM option_ath WHERE expiry_timestamp > $1",
    [currentMs]
  );
  return result.rows;
}

export async function getOptionTicks(instrumentName, fromMs, toMs) {
  if (!pool) return [];
  const result = await pool.query(
    "SELECT timestamp_ms, mark_price FROM mark_price_ticks WHERE instrument_name = $1 AND timestamp_ms >= $2 AND timestamp_ms <= $3 ORDER BY timestamp_ms ASC",
    [instrumentName, fromMs, toMs]
  );
  return result.rows;
}

/* ── Trading Helpers (previously raw getDb() access) ──────── */
export async function insertTrade(instrumentName, direction, quantity, price, totalCost, currency, strike, expiry, optionType) {
  await pool.query(
    `INSERT INTO trades (instrument_name, direction, quantity, price, total_cost, currency, kind, strike, expiry, option_type)
     VALUES ($1, $2, $3, $4, $5, $6, 'option', $7, $8, $9)`,
    [instrumentName, direction, quantity, price, totalCost, currency, strike, expiry, optionType]
  );
}

export async function findOpenPosition(instrumentName) {
  const result = await pool.query(
    "SELECT * FROM positions WHERE instrument_name = $1 AND status = 'open'",
    [instrumentName]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function findOpenPositionById(positionId) {
  const result = await pool.query(
    "SELECT * FROM positions WHERE id = $1 AND status = 'open'",
    [positionId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function updatePositionQuantity(positionId, newQuantity, newEntryPrice) {
  if (newEntryPrice !== undefined) {
    await pool.query(
      "UPDATE positions SET quantity = $1, entry_price = $2 WHERE id = $3",
      [newQuantity, newEntryPrice, positionId]
    );
  } else {
    await pool.query(
      "UPDATE positions SET quantity = $1 WHERE id = $2",
      [newQuantity, positionId]
    );
  }
}

export async function closePosition(positionId, currentPrice, pnl) {
  await pool.query(
    "UPDATE positions SET status = 'closed', closed_at = NOW(), current_price = $1, pnl = $2 WHERE id = $3",
    [currentPrice, pnl, positionId]
  );
}

export async function createPosition(instrumentName, direction, quantity, entryPrice, currentPrice, currency, strike, expiry, optionType) {
  await pool.query(
    `INSERT INTO positions (instrument_name, direction, quantity, entry_price, current_price, currency, kind, strike, expiry, option_type)
     VALUES ($1, $2, $3, $4, $5, $6, 'option', $7, $8, $9)`,
    [instrumentName, direction, quantity, entryPrice, currentPrice, currency, strike, expiry, optionType]
  );
}

/* ── Shutdown ────────────────────────────────────────────── */
export async function shutdownDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    ready = false;
    console.log('[DB] PostgreSQL pool closed');
  }
}

// Clean shutdown on process signals
process.on('SIGTERM', async () => {
  console.log('[DB] SIGTERM received, closing pool...');
  await shutdownDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[DB] SIGINT received, closing pool...');
  await shutdownDatabase();
  process.exit(0);
});
