import https from 'https';
import pg from 'pg';

function fetchDeribit(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfill(isDryRun) {
  const pool = new pg.Pool();

  console.log(`[Init] Starting optimized backfill script in ${isDryRun ? 'DRY-RUN' : 'EXECUTE'} mode.`);

  // 1. Discover the global timestamp range for all NULL ticks
  console.log('[Stats] Determining global timestamp range...');
  const rangeResult = await pool.query(`
    SELECT MIN(timestamp_ms) as min_ts, 
           MAX(timestamp_ms) as max_ts, 
           COUNT(*) as total_null_ticks
    FROM mark_price_ticks 
    WHERE underlying_price IS NULL
  `);

  const globalMinTs = Number(rangeResult.rows[0].min_ts);
  const globalMaxTs = Number(rangeResult.rows[0].max_ts);
  const totalNullTicks = Number(rangeResult.rows[0].total_null_ticks);

  if (!totalNullTicks || !globalMinTs) {
    console.log('[Stats] No NULL ticks found. Nothing to backfill.');
    await pool.end();
    return;
  }

  console.log(`[Stats] Total NULL ticks: ${totalNullTicks}`);
  console.log(`[Stats] Global Timestamp Range: ${globalMinTs} to ${globalMaxTs}`);

  // 2. Fetch BTC-PERPETUAL data ONCE for the entire global range
  let allPTicks = [];
  let allPClose = [];
  let apiRequests = 0;

  const chunkMs = 604800000; // 7 days
  let currentStart = globalMinTs - 600000; // Pad 10 minutes
  const endPadTs = globalMaxTs + 600000;

  console.log(`[Fetch] Fetching BTC-PERPETUAL 1-minute history in chunks...`);
  while (currentStart < endPadTs) {
    let currentEnd = currentStart + chunkMs;
    if (currentEnd > endPadTs) {
      currentEnd = endPadTs;
    }

    const url = `https://www.deribit.com/api/v2/public/get_tradingview_chart_data?instrument_name=BTC-PERPETUAL&start_timestamp=${currentStart}&end_timestamp=${currentEnd}&resolution=1`;
    apiRequests++;
    
    try {
      const chartData = await fetchDeribit(url);
      if (chartData && chartData.result && chartData.result.status === 'ok' && chartData.result.ticks) {
         allPTicks = allPTicks.concat(chartData.result.ticks);
         allPClose = allPClose.concat(chartData.result.close);
      } else if (chartData && chartData.result && chartData.result.status === 'no_data') {
         // Skip silently if no data in window
      } else {
         console.error(`[Error] Failed to fetch data for BTC chunk.`, chartData);
      }
    } catch (err) {
      console.error(`[Error] Request failed: ${err.message}`);
    }

    currentStart = currentEnd;
    await delay(200); // 5 req/sec to be safe against rate limits
  }

  console.log(`[Fetch] Fetched ${allPTicks.length} 1-minute historical data points via ${apiRequests} API requests.`);

  if (allPTicks.length === 0) {
    console.error(`[Error] No BTC-PERPETUAL data could be fetched. Aborting.`);
    await pool.end();
    return;
  }

  // Explicitly sort the data by timestamp before doing binary search
  console.log(`[Init] Sorting global BTC-PERPETUAL data by timestamp...`);
  allPTicks = allPTicks.map((ts, i) => ({
    ts,
    price: allPClose[i]
  })).sort((a, b) => a.ts - b.ts);

  // 3. Discover affected instruments to process batch by batch
  const affectedInstrumentsResult = await pool.query(`
    SELECT instrument_name, COUNT(*) as null_count
    FROM mark_price_ticks 
    WHERE underlying_price IS NULL 
    GROUP BY instrument_name
  `);
  
  const instruments = affectedInstrumentsResult.rows;
  console.log(`[Stats] Found ${instruments.length} instruments needing backfill.`);

  let totalMapped = 0;
  let totalUnmapped = 0;
  let totalUpdates = 0;

  // Process instrument by instrument to control memory usage while reusing the global BTC history
  for (let i = 0; i < instruments.length; i++) {
    const instName = instruments[i].instrument_name;
    const nullCount = Number(instruments[i].null_count);
    
    console.log(`[Process] [${i + 1}/${instruments.length}] ${instName} - ${nullCount} ticks`);

    const ticksResult = await pool.query(
      'SELECT id, timestamp_ms FROM mark_price_ticks WHERE instrument_name = $1 AND underlying_price IS NULL ORDER BY timestamp_ms ASC',
      [instName]
    );
    const ticks = ticksResult.rows;

    let mappedCount = 0;
    let unmappedCount = 0;
    let updates = [];

    // Map ticks
    for (const tick of ticks) {
      const ts = Number(tick.timestamp_ms);
      
      let closestPrice = null;
      let minDiff = Infinity;

      // Binary search over the global BTC dataset
      let left = 0;
      let right = allPTicks.length - 1;
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const pTs = allPTicks[mid].ts;
        const pPrice = allPTicks[mid].price;
        
        const diff = Math.abs(pTs - ts);
        if (diff < minDiff) {
          minDiff = diff;
          closestPrice = pPrice;
        }

        if (pTs < ts) {
          left = mid + 1;
        } else if (pTs > ts) {
          right = mid - 1;
        } else {
          break; // exact match
        }
      }

      // Max 2 minutes diff allowed
      if (closestPrice !== null && minDiff <= 120000) {
        mappedCount++;
        updates.push({ id: tick.id, price: closestPrice });
      } else {
        unmappedCount++;
      }
    }

    totalMapped += mappedCount;
    totalUnmapped += unmappedCount;

    if (!isDryRun && updates.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Execute updates in batches to avoid huge queries
        const batchSize = 1000;
        for (let b = 0; b < updates.length; b += batchSize) {
          const batch = updates.slice(b, b + batchSize);
          
          let queryStr = 'UPDATE mark_price_ticks SET underlying_price = c.price FROM (VALUES ';
          let values = [];
          
          for (let k = 0; k < batch.length; k++) {
             queryStr += `($${k*2+1}::int, $${k*2+2}::numeric)${k === batch.length - 1 ? '' : ', '}`;
             values.push(batch[k].id, batch[k].price);
          }
          queryStr += ') AS c(id, price) WHERE mark_price_ticks.id = c.id AND mark_price_ticks.underlying_price IS NULL';
          
          await client.query(queryStr, values);
        }
        
        await client.query('COMMIT');
        totalUpdates += updates.length;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Error] DB Update failed for ${instName}:`, err);
      } finally {
        client.release();
      }
    }
  }

  const mappingPercentage = totalNullTicks > 0 ? ((totalMapped / totalNullTicks) * 100).toFixed(2) : '0.00';

  console.log('\n========================================');
  console.log(`[Summary] Total Instruments Processed: ${instruments.length}`);
  console.log(`[Summary] Total NULL Ticks: ${totalNullTicks}`);
  console.log(`[Summary] Timestamp Range: ${globalMinTs} - ${globalMaxTs}`);
  console.log(`[Summary] Total Mapped Ticks: ${totalMapped}`);
  console.log(`[Summary] Total Unmapped Ticks: ${totalUnmapped}`);
  console.log(`[Summary] Mapping Percentage: ${mappingPercentage}%`);
  console.log(`[Summary] Deribit API Requests: ${apiRequests}`);
  
  if (!isDryRun) {
    console.log(`[Summary] Total Rows Updated: ${totalUpdates}`);
  } else {
    console.log(`[Summary] DRY-RUN. No rows updated. (${totalMapped} would be updated)`);
  }
  console.log('========================================');

  await pool.end();
}

const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const dryRun = !isExecute;
backfill(dryRun).catch(console.error);
