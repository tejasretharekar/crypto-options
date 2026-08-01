/**
 * Database layer using sql.js (SQLite compiled to WASM).
 * 
 * - In-memory database with periodic file persistence
 * - Auto-creates schema on first run
 * - Seeds portfolio with $100,000 paper money
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'data', 'paper_trading.db');

let db = null;

/* ── Schema ──────────────────────────────────────────────── */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS portfolio (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    cash        REAL    NOT NULL DEFAULT 100000.00,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_name TEXT    NOT NULL,
    direction       TEXT    NOT NULL CHECK (direction IN ('buy', 'sell')),
    quantity        REAL    NOT NULL,
    entry_price     REAL    NOT NULL,
    current_price   REAL    NOT NULL DEFAULT 0,
    currency        TEXT    NOT NULL DEFAULT 'BTC',
    kind            TEXT    NOT NULL DEFAULT 'option',
    strike          REAL,
    expiry          TEXT,
    option_type     TEXT    CHECK (option_type IN ('call', 'put')),
    pnl             REAL    NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    closed_at       TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_name TEXT    NOT NULL,
    direction       TEXT    NOT NULL CHECK (direction IN ('buy', 'sell')),
    quantity        REAL    NOT NULL,
    price           REAL    NOT NULL,
    total_cost      REAL    NOT NULL,
    currency        TEXT    NOT NULL DEFAULT 'BTC',
    kind            TEXT    NOT NULL DEFAULT 'option',
    strike          REAL,
    expiry          TEXT,
    option_type     TEXT    CHECK (option_type IN ('call', 'put')),
    executed_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
  CREATE INDEX IF NOT EXISTS idx_positions_instrument ON positions(instrument_name);
  CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument_name);
`;

/* ── Initialize ──────────────────────────────────────────── */
export async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing DB from disk if it exists
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from disk');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new in-memory database');
  }

  // Run schema (IF NOT EXISTS makes this idempotent)
  db.run(SCHEMA);

  // Seed portfolio if empty
  const result = db.exec('SELECT COUNT(*) as count FROM portfolio');
  const count = result[0]?.values[0]?.[0] || 0;
  if (count === 0) {
    db.run('INSERT INTO portfolio (id, cash) VALUES (1, 100000.00)');
    console.log('[DB] Seeded portfolio with $100,000.00');
  }

  // Persist to disk
  saveDatabase();

  console.log('[DB] Database initialized successfully');
  return db;
}

/* ── Persistence ─────────────────────────────────────────── */
export function saveDatabase() {
  if (!db) return;
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-save every 30 seconds
setInterval(() => {
  if (db) saveDatabase();
}, 30_000);

/* ── Query helpers ───────────────────────────────────────── */
export function getPortfolio() {
  const result = db.exec('SELECT * FROM portfolio WHERE id = 1');
  if (!result.length) return null;
  const cols = result[0].columns;
  const vals = result[0].values[0];
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
}

export function getOpenPositions() {
  const result = db.exec("SELECT * FROM positions WHERE status = 'open' ORDER BY opened_at DESC");
  if (!result.length) return [];
  return result[0].values.map((row) =>
    Object.fromEntries(result[0].columns.map((c, i) => [c, row[i]]))
  );
}

export function getTradeHistory(limit = 50) {
  const result = db.exec(`SELECT * FROM trades ORDER BY executed_at DESC LIMIT ${limit}`);
  if (!result.length) return [];
  return result[0].values.map((row) =>
    Object.fromEntries(result[0].columns.map((c, i) => [c, row[i]]))
  );
}

export function updateCash(newCash) {
  db.run("UPDATE portfolio SET cash = ?, updated_at = datetime('now') WHERE id = 1", [newCash]);
  saveDatabase();
}

export function getDb() {
  return db;
}
