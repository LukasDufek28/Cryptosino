const { Pool } = require('pg');
require('dotenv').config();

// Expected env var: DATABASE_URL from Render (includes user, password, host, port, db, ssl)
// Render typically requires SSL. If DATABASE_URL has ?ssl=true or ?sslmode=require it's fine.
// If not, we set ssl: { rejectUnauthorized: false } to allow connection.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('[DB] DATABASE_URL not set. Database features will be disabled.');
}

const pool = connectionString ? new Pool({
  connectionString,
  // Force SSL for Render PostgreSQL
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
}) : null;

async function query(text, params) {
  if (!pool) throw new Error('Database not initialized: missing DATABASE_URL');
  return pool.query(text, params);
}

async function getClient() {
  if (!pool) throw new Error('Database not initialized: missing DATABASE_URL');
  return pool.connect();
}

module.exports = { pool, query, getClient };
