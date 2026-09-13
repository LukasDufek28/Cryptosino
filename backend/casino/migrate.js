require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getClient, pool } = require('../db');
(async () => {
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM information_schema.tables
      WHERE table_schema=current_schema() AND table_name IN
      ('casino_presence','casino_browser_rooms','casino_browser_members','casino_browser_signals')`);
    if (result.rows[0].count !== 4) throw new Error('Casino schema incomplete');
    await client.query('COMMIT');
    console.log('Casino schema installed and verified: presence, browser rooms, members, and signaling.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Casino migration failed:', error.code || 'database unavailable');
    process.exitCode = 1;
  } finally { if (client) client.release(); if (pool) await pool.end(); }
})();
