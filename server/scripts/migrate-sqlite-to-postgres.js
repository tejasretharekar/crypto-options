import fs from 'fs';
import initSqlJs from 'sql.js';
import pg from 'pg';
const { Pool } = pg;

async function migrate() {
  const sqlitePath = process.argv[2];
  if (!sqlitePath) {
    console.error('Usage: node --env-file=.env scripts/migrate-sqlite-to-postgres.js <path-to-sqlite.db>');
    process.exit(1);
  }

  if (!fs.existsSync(sqlitePath)) {
    console.error(`Error: SQLite database file not found at ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`[Migrate] Opening SQLite database from ${sqlitePath}`);
  const fileBuffer = fs.readFileSync(sqlitePath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);

  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'crypto_options_db',
    user: process.env.PGUSER || 'crypto_options',
    password: process.env.PGPASSWORD || ''
  });

  try {
    const client = await pool.connect();
    console.log('[Migrate] Connected to PostgreSQL successfully.');
    
    // Verify Schema exists
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    const requiredTables = ['portfolio', 'positions', 'trades', 'option_ath', 'mark_price_ticks'];
    
    for (const rt of requiredTables) {
      if (!tables.includes(rt)) {
        console.error(`Error: Required table '${rt}' does not exist in PostgreSQL. Please initialize the schema first.`);
        process.exit(1);
      }
    }

    // Verify Tables are empty
    for (const rt of requiredTables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${rt}`);
      const count = parseInt(res.rows[0].count, 10);
      if (rt === 'portfolio' && count > 0) {
          // portfolio starts with 1 row in pg typically from init, but let's check if it's default
          const p = await client.query(`SELECT cash FROM portfolio WHERE id = 1`);
          if (p.rows.length > 0 && parseFloat(p.rows[0].cash) !== 100000) {
              console.error(`Error: Table '${rt}' is not empty and seems modified. Stop. (${count} rows)`);
              process.exit(1);
          }
      } else if (rt !== 'portfolio' && count > 0) {
        console.error(`Error: Table '${rt}' is not empty. Target database must be clean. (${count} rows)`);
        process.exit(1);
      }
    }
    
    client.release();
  } catch (err) {
    console.error('[Migrate] PostgreSQL connection or verification failed:', err);
    process.exit(1);
  }

  // 1. Portfolio
  console.log('\n--- Migrating portfolio ---');
  let res = db.exec(`SELECT * FROM portfolio`);
  let sqlitePortfolioCount = 0;
  if (res.length > 0 && res[0].values.length > 0) {
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const portfolio = Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Delete the default portfolio inserted by initDatabase
      await client.query('DELETE FROM portfolio WHERE id = 1');
      await client.query(
        `INSERT INTO portfolio (id, cash, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
        [1, portfolio.cash, portfolio.created_at, portfolio.updated_at]
      );
      await client.query('COMMIT');
      sqlitePortfolioCount = 1;
      console.log(`[Migrate] Migrated portfolio successfully.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // 2. Positions
  console.log('\n--- Migrating positions ---');
  res = db.exec(`SELECT * FROM positions`);
  let sqlitePositionsCount = 0;
  if (res.length > 0 && res[0].values.length > 0) {
    const cols = res[0].columns;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of res[0].values) {
        const p = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
        await client.query(
          `INSERT INTO positions (id, instrument_name, direction, quantity, entry_price, current_price, currency, kind, strike, expiry, option_type, pnl, status, opened_at, closed_at)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [p.id, p.instrument_name, p.direction, p.quantity, p.entry_price, p.current_price, p.currency, p.kind, p.strike, p.expiry, p.option_type, p.pnl, p.status, p.opened_at, p.closed_at]
        );
        sqlitePositionsCount++;
      }
      await client.query('COMMIT');
      console.log(`[Migrate] Migrated ${sqlitePositionsCount} positions successfully.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // 3. Trades
  console.log('\n--- Migrating trades ---');
  res = db.exec(`SELECT * FROM trades`);
  let sqliteTradesCount = 0;
  if (res.length > 0 && res[0].values.length > 0) {
    const cols = res[0].columns;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of res[0].values) {
        const t = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
        await client.query(
          `INSERT INTO trades (id, instrument_name, direction, quantity, price, total_cost, currency, kind, strike, expiry, option_type, executed_at)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [t.id, t.instrument_name, t.direction, t.quantity, t.price, t.total_cost, t.currency, t.kind, t.strike, t.expiry, t.option_type, t.executed_at]
        );
        sqliteTradesCount++;
      }
      await client.query('COMMIT');
      console.log(`[Migrate] Migrated ${sqliteTradesCount} trades successfully.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // 4. option_ath
  console.log('\n--- Migrating option_ath ---');
  res = db.exec(`SELECT * FROM option_ath`);
  let sqliteAthCount = 0;
  if (res.length > 0 && res[0].values.length > 0) {
    const cols = res[0].columns;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of res[0].values) {
        const ath = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
        await client.query(
          `INSERT INTO option_ath (instrument_name, ath_mark_price, ath_timestamp, first_tracked, last_updated, expiry_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ath.instrument_name, ath.ath_mark_price, ath.ath_timestamp, ath.first_tracked, ath.last_updated, ath.expiry_timestamp]
        );
        sqliteAthCount++;
      }
      await client.query('COMMIT');
      console.log(`[Migrate] Migrated ${sqliteAthCount} option_ath records successfully.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // 5. mark_price_ticks (CHUNKED)
  console.log('\n--- Migrating mark_price_ticks (CHUNKED) ---');
  const BATCH_SIZE = 5000;
  let lastId = 0;
  let totalTicksMigrated = 0;
  let hasMore = true;

  while (hasMore) {
    // Keyset pagination using id
    const stmt = db.prepare(`SELECT * FROM mark_price_ticks WHERE id > $lastId ORDER BY id ASC LIMIT $limit`);
    stmt.bind({ $lastId: lastId, $limit: BATCH_SIZE });
    
    const batch = [];
    let cols = null;
    while (stmt.step()) {
      if (!cols) cols = stmt.getColumnNames();
      batch.push(stmt.get());
    }
    stmt.free();

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of batch) {
        const tick = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
        // We do NOT migrate 'id' for mark_price_ticks. We let PostgreSQL generate a sequence seamlessly.
        await client.query(
          `INSERT INTO mark_price_ticks (instrument_name, timestamp_ms, mark_price, mark_iv)
           VALUES ($1, $2, $3, $4)`,
          [tick.instrument_name, tick.timestamp_ms, tick.mark_price, tick.mark_iv]
        );
        lastId = tick.id; // update lastId to the maximum id in this batch
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[Migrate] Error migrating batch starting after id ' + (lastId));
      throw e;
    } finally {
      client.release();
    }

    totalTicksMigrated += batch.length;
    console.log(`[Migrate] Migrated ${totalTicksMigrated} mark_price_ticks...`);
    
    // Suggest garbage collection by removing references
    batch.length = 0; 
  }
  
  console.log(`[Migrate] Migrated ${totalTicksMigrated} mark_price_ticks successfully.`);

  // 6. SYNC SEQUENCES
  console.log('\n--- Syncing Sequences ---');
  const client = await pool.connect();
  try {
    await client.query(`SELECT setval('positions_id_seq', COALESCE((SELECT MAX(id) FROM positions), 1))`);
    await client.query(`SELECT setval('trades_id_seq', COALESCE((SELECT MAX(id) FROM trades), 1))`);
    console.log('[Migrate] Sequences synced for positions and trades.');
  } finally {
    client.release();
  }

  // 7. VERIFICATION
  console.log('\n=== MIGRATION VERIFICATION ===');
  const pgCounts = {};
  for (const t of ['portfolio', 'positions', 'trades', 'option_ath', 'mark_price_ticks']) {
    const cRes = await pool.query(`SELECT COUNT(*) FROM ${t}`);
    pgCounts[t] = parseInt(cRes.rows[0].count, 10);
  }

  console.log('--- Counts ---');
  console.log(`Portfolio: SQLite=${sqlitePortfolioCount}, PG=${pgCounts.portfolio}, Diff=${pgCounts.portfolio - sqlitePortfolioCount}`);
  console.log(`Positions: SQLite=${sqlitePositionsCount}, PG=${pgCounts.positions}, Diff=${pgCounts.positions - sqlitePositionsCount}`);
  console.log(`Trades: SQLite=${sqliteTradesCount}, PG=${pgCounts.trades}, Diff=${pgCounts.trades - sqliteTradesCount}`);
  console.log(`Option_Ath: SQLite=${sqliteAthCount}, PG=${pgCounts.option_ath}, Diff=${pgCounts.option_ath - sqliteAthCount}`);
  console.log(`Mark_Price_Ticks: SQLite=${totalTicksMigrated}, PG=${pgCounts.mark_price_ticks}, Diff=${pgCounts.mark_price_ticks - totalTicksMigrated}`);

  console.log('\n--- Sample Records ---');
  const tickSamples = await pool.query(`SELECT MIN(timestamp_ms) as min_ts, MAX(timestamp_ms) as max_ts FROM mark_price_ticks`);
  console.log(`Earliest Tick Timestamp: ${tickSamples.rows[0].min_ts}`);
  console.log(`Latest Tick Timestamp: ${tickSamples.rows[0].max_ts}`);
  
  const sampleTick = await pool.query(`SELECT * FROM mark_price_ticks LIMIT 1`);
  if (sampleTick.rows.length > 0) {
    console.log(`Sample Tick: ${JSON.stringify(sampleTick.rows[0])}`);
  }

  const sampleAth = await pool.query(`SELECT * FROM option_ath LIMIT 1`);
  if (sampleAth.rows.length > 0) {
    console.log(`Sample ATH: ${JSON.stringify(sampleAth.rows[0])}`);
  }
  
  const memUsage = process.memoryUsage();
  console.log(`\n[Migrate] Memory Usage at completion: RSS = ${Math.round(memUsage.rss / 1024 / 1024)} MB`);
  
  console.log('\n[Migrate] Migration script finished successfully.');
  await pool.end();
}

migrate().catch(err => {
  console.error('[Migrate] Fatal Error:', err);
  process.exit(1);
});
