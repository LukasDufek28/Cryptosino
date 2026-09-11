require('dotenv').config({ path: require('node:path').join(__dirname, '../.env'), quiet: true });
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { query, pool } = require('../db');
(async () => {
  try {
    await query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
    console.log('Casino presence schema installed.');
  } catch (error) {
    console.error('Casino migration failed:', error.code || 'database unavailable');
    process.exitCode = 1;
  } finally { if (pool) await pool.end(); }
})();
