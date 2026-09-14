const express = require('express');
const { randomInt } = require('node:crypto');
const { getClient } = require('../db');

const TICK_MS = 5000;
const assets = [
  { symbol: 'AMBR', name: 'Amber Index', initial: 12500, volatility: 0.004 },
  { symbol: 'NEON', name: 'Neon Energy', initial: 4000, volatility: 0.009 },
  { symbol: 'FLUX', name: 'Flux Labs', initial: 800, volatility: 0.016 }
];
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const quote = price => ({ bid: Math.max(1, Math.floor(price * 0.999)), ask: Math.ceil(price * 1.001) });

// Persistent shared market, advanced lazily: no daemon or browser host required.
// Only new cryptographic random samples are used; future ticks are never exposed.
async function advance(client) {
  await client.query('SELECT pg_advisory_xact_lock(71420391)');
  const { rows } = await client.query('SELECT state FROM trading_market WHERE id=1 FOR UPDATE');
  const now = Date.now(), tick = Math.floor(now / TICK_MS);
  const state = rows[0]?.state || { tick, assets: assets.map(a => ({ symbol: a.symbol, price: a.initial, history: [{ time: tick * TICK_MS, price: a.initial }] })) };
  // A long inactive gap resumes with at most ten minutes of ticks, not unbounded work.
  const first = Math.max(state.tick + 1, tick - 119);
  for (let t = first; t <= tick; t++) {
    state.assets.forEach((asset, i) => {
      const shock = (randomInt(0, 2000001) - 1000000) / 1000000;
      asset.price = Math.max(100, Math.min(1000000, Math.round(asset.price * (1 + shock * assets[i].volatility))));
      asset.history.push({ time: t * TICK_MS, price: asset.price });
      asset.history = asset.history.slice(-120);
    });
  }
  if (!rows.length || tick > state.tick) {
    state.tick = tick;
    await client.query('INSERT INTO trading_market(id,state) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state', [JSON.stringify(state)]);
  }
  return { state, market: { tick: state.tick, serverNow: now, tickMs: TICK_MS, synthetic: true,
    assets: state.assets.map((a, i) => ({ ...a, name: assets[i].name, ...quote(a.price) })) } };
}

async function account(client, userId) {
  const user = (await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
  const positions = (await client.query('SELECT symbol,quantity,cost_cents FROM trading_positions WHERE user_id=$1 AND quantity>0 ORDER BY symbol', [userId])).rows;
  const orders = (await client.query('SELECT response FROM trading_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [userId])).rows.map(r => r.response);
  return { balance: Number(user.balance), positions: positions.map(p => ({ symbol: p.symbol, quantity: p.quantity, costCents: Number(p.cost_cents) })), orders };
}

module.exports = (auth, { getClient: connect = getClient } = {}) => {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const transaction = handler => async (req, res) => {
    let client;
    try {
      client = await connect(); await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='4s'");
      await client.query("SET LOCAL statement_timeout='8s'");
      const result = await handler(client, req);
      await client.query('COMMIT'); res.json(result);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(error.status || 503).json({ error: error.status ? error.message : 'Trading unavailable. Check the trading migration, or retry the same order.' });
    } finally { client?.release(); }
  };
  router.get('/market', transaction(async client => (await advance(client)).market));
  router.get('/account', auth, transaction((client, req) => account(client, req.user.id)));
  router.post('/orders', auth, transaction(async (client, req) => {
    const { requestId, symbol, side, quantity, quoteTick, limitPrice } = req.body || {};
    if (!uuid(requestId)) fail('Invalid request ID.');
    // Retries return the original fill even when its quote has since expired.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`trade:${req.user.id}:${requestId}`]);
    const existing = (await client.query('SELECT response FROM trading_orders WHERE user_id=$1 AND request_id=$2', [req.user.id, requestId])).rows[0];
    if (existing) return { order: existing.response, ...(await account(client, req.user.id)) };
    if (!assets.some(a => a.symbol === symbol) || !['buy', 'sell'].includes(side) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isSafeInteger(quoteTick) || !Number.isSafeInteger(limitPrice) || limitPrice < 1) fail('Invalid order. Use 1–10,000 whole units.');
    const { market } = await advance(client);
    if (quoteTick > market.tick || market.tick - quoteTick > 3) fail('Quote expired. Refresh prices and submit again.', 409);
    const asset = market.assets.find(a => a.symbol === symbol), price = side === 'buy' ? asset.ask : asset.bid;
    if ((side === 'buy' && price > limitPrice) || (side === 'sell' && price < limitPrice)) fail('Price moved beyond your limit. Review the new quote.', 409);
    const user = (await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
    const cash = Math.round(Number(user.balance) * 100), total = price * quantity;
    const position = (await client.query('SELECT quantity,cost_cents FROM trading_positions WHERE user_id=$1 AND symbol=$2 FOR UPDATE', [req.user.id, symbol])).rows[0] || { quantity: 0, cost_cents: 0 };
    if (side === 'buy' && total > cash) fail('Insufficient game balance.');
    if (side === 'sell' && quantity > position.quantity) fail('You do not own enough units. Short selling is not enabled.');
    const removedCost = side === 'sell' ? Math.round(Number(position.cost_cents) * quantity / position.quantity) : 0;
    const nextQuantity = position.quantity + (side === 'buy' ? quantity : -quantity);
    if (nextQuantity > 10000000) fail('Maximum holding is 10,000,000 units per asset.');
    const cost = Number(position.cost_cents) + (side === 'buy' ? total : -removedCost);
    const newBalance = (cash + (side === 'buy' ? -total : total)) / 100;
    await client.query('UPDATE users SET balance=$2,peak_balance=GREATEST(peak_balance,$2) WHERE id=$1', [req.user.id, newBalance]);
    await client.query('INSERT INTO trading_positions(user_id,symbol,quantity,cost_cents) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,symbol) DO UPDATE SET quantity=EXCLUDED.quantity,cost_cents=EXCLUDED.cost_cents', [req.user.id, symbol, nextQuantity, cost]);
    const order = { requestId, symbol, side, quantity, price, total, tick: market.tick, time: Date.now(), realizedPnlCents: side === 'sell' ? total - removedCost : null };
    await client.query('INSERT INTO trading_orders(user_id,request_id,response) VALUES($1,$2,$3)', [req.user.id, requestId, JSON.stringify(order)]);
    return { order, market, ...(await account(client, req.user.id)) };
  }));
  return router;
};
