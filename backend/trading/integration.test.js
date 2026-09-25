// Real PostgreSQL integration, isolated in a new schema inside a rolled-back
// transaction. Never imports the casino app or changes real player accounts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const express = require('express');

test('trading endpoints: live prices, settlement, retries and legacy liquidation', { skip: process.env.RUN_TRADING_DB_TESTS !== '1' }, async t => {
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
    const testTick = Math.floor(Date.now() / 60000);
    const marketFeed = { getMarket: async () => {
      const fetchedAt = Date.now();
      return { tick: testTick, fetchedAt, serverNow: fetchedAt, tickMs: 60000, source: 'Test feed', synthetic: false,
        assets: ['SP500', 'NAS100', 'TSLA', 'AAPL', 'GOOGL'].map(symbol => ({ symbol, name: symbol, price: 10000, bid: 9990, ask: 10010, history: [], quotedAt: fetchedAt, marketOpen: true, tradable: true })) };
    } };
    app.use('/api/trading', require('./router')((req, res, next) => { req.user = { id: 1 }; next(); }, { getClient: async () => isolatedClient, marketFeed }));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/trading`;
    const request = async (route, body) => {
      const response = await fetch(base + route, { signal: AbortSignal.timeout(15000), ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const market = await request('/market');
    assert.equal(market.status, 200); assert.equal(market.body.assets.length, 5);
    assert.equal(market.body.synthetic, false);
    const account = await request('/account');
    assert.equal(account.status, 200); assert.equal(account.body.balance, 1000);
    assert.deepEqual(account.body.positions, []);
    const order = { requestId: randomUUID(), symbol: 'AAPL', side: 'buy', quantity: 2, quoteTick: market.body.tick, limitPrice: 1000001 };
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
    await client.query('INSERT INTO trading_market(id,state) VALUES(1,$1)', [JSON.stringify({ assets: [{ symbol: 'AMBR', price: 12500, history: [] }] })]);
    await client.query('INSERT INTO trading_positions(user_id,symbol,quantity,cost_cents) VALUES(1,$1,2,25000)', ['AMBR']);
    const legacyMarket = await request('/market');
    assert.equal(legacyMarket.body.legacyAssets[0].symbol, 'AMBR');
    const legacySell = await request('/orders', { ...order, requestId: randomUUID(), symbol: 'AMBR', side: 'sell', quantity: 2, quoteTick: legacyMarket.body.tick, limitPrice: 1 });
    assert.equal(legacySell.status, 200);
    assert.equal(legacySell.body.positions.length, 0);
    const legacyBuy = await request('/orders', { ...order, requestId: randomUUID(), symbol: 'AMBR', quoteTick: legacyMarket.body.tick });
    assert.equal(legacyBuy.status, 400);
    t.diagnostic('Five live assets, settlement, retries, rejections and legacy liquidation verified using isolated test credits.');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (client) { await client.query('ROLLBACK'); client.release(); }
    await pool.end();
  }
});
