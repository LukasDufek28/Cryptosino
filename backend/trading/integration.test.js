// Real PostgreSQL integration, isolated in a new schema inside a rolled-back
// transaction. Never imports the casino app or changes real player accounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const express = require('express');

test('trading endpoints: schema, shared prices, settlement, retries and rejection', { skip: process.env.RUN_TRADING_DB_TESTS !== '1' }, async t => {
  require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
  const { pool } = require('../db');
  assert.ok(pool, 'Configure the database before running this integration test');
  let client, server;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const schema = `trading_test_${randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query('CREATE TABLE users(id INTEGER PRIMARY KEY,balance NUMERIC(16,2),peak_balance NUMERIC(16,2))');
    await client.query('INSERT INTO users VALUES(1,1000,1000)');
    await client.query(readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    const isolatedClient = {
      query(sql, values) {
        // Keep the real advisory-lock behavior without blocking the live market
        // for the lifetime of our outer rollback-only test transaction.
        if (sql === 'SELECT pg_advisory_xact_lock(71420391)') return client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [schema]);
        if (sql === 'BEGIN') return client.query('SAVEPOINT request_test');
        if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT request_test');
        if (sql === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT request_test');
        return client.query(sql, values);
      }, release() {}
    };
    const app = express(); app.use(express.json());
    app.use('/api/trading', require('./router')((req, res, next) => { req.user = { id: 1 }; next(); }, { getClient: async () => isolatedClient }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/trading`;
    const request = async (route, body) => {
      const response = await fetch(base + route, { signal: AbortSignal.timeout(15000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const market = await request('/market');
    assert.equal(market.status, 200); assert.equal(market.body.assets.length, 3);
    assert.equal(market.body.synthetic, true);
    const account = await request('/account');
    assert.equal(account.status, 200); assert.equal(account.body.balance, 1000);
    assert.deepEqual(account.body.positions, []);
    const order = { requestId: randomUUID(), symbol: 'FLUX', side: 'buy', quantity: 2, quoteTick: market.body.tick, limitPrice: 1000001 };
    const buy = await request('/orders', order);
    assert.equal(buy.status, 200);
    assert.equal(buy.body.positions[0].quantity, 2);
    assert.equal(buy.body.balance, (100000 - buy.body.order.total) / 100);
    const retry = await request('/orders', order);
    assert.equal(retry.status, 200); assert.deepEqual(retry.body.order, buy.body.order);
    assert.equal(retry.body.balance, buy.body.balance); assert.equal(retry.body.orders.length, 1);
    for (const [label, change, status] of [
      ['oversell', { side: 'sell', quantity: 3, limitPrice: 1 }, 400],
      ['insufficient cash', { quantity: 10000 }, 400],
      ['fractional units', { quantity: 0.5 }, 400],
      ['expired quote', { quoteTick: market.body.tick - 100 }, 409],
      ['price limit', { limitPrice: 1 }, 409]
    ]) {
      const rejected = await request('/orders', { ...order, ...change, requestId: randomUUID() });
      assert.equal(rejected.status, status, label);
    }
    const afterReject = await request('/account');
    assert.equal(afterReject.body.balance, buy.body.balance);
    assert.equal(afterReject.body.positions[0].quantity, 2);
    const fresh = await request('/market');
    const sell = await request('/orders', { ...order, requestId: randomUUID(), side: 'sell', quoteTick: fresh.body.tick, limitPrice: 1 });
    assert.equal(sell.status, 200); assert.deepEqual(sell.body.positions, []);
    assert.equal(sell.body.order.realizedPnlCents, sell.body.order.total - buy.body.order.total);
    assert.equal(sell.body.balance, (100000 - buy.body.order.total + sell.body.order.total) / 100);
    assert.equal(sell.body.orders.length, 2);
    t.diagnostic('Market/account HTTP 200; buy, sell, retry and five rejection cases verified using isolated test credits.');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (client) { await client.query('ROLLBACK'); client.release(); }
    await pool.end();
  }
});
