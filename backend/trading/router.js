const express = require('express');
const { getClient } = require('../db');
const { ASSETS, createMarketFeed } = require('./marketFeed');

const LEGACY_NAMES = { AMBR: 'Amber Index', NEON: 'Neon Energy', FLUX: 'Flux Labs' };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const quote = price => ({ bid: Math.max(1, Math.floor(price * 0.999)), ask: Math.ceil(price * 1.001) });

async function legacyAssets(client) {
  const { rows } = await client.query('SELECT state FROM trading_market WHERE id=1');
  return (rows[0]?.state?.assets || []).filter(a => LEGACY_NAMES[a.symbol]).map(a => ({
    symbol: a.symbol, name: LEGACY_NAMES[a.symbol], price: a.price, ...quote(a.price),
    history: a.history || [], legacy: true, tradable: false
  }));
}

async function account(client, userId) {
  const user = (await client.query('SELECT balance FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
  const positions = (await client.query('SELECT symbol,quantity,cost_cents FROM trading_positions WHERE user_id=$1 AND quantity>0 ORDER BY symbol', [userId])).rows;
  const orders = (await client.query('SELECT response FROM trading_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [userId])).rows.map(r => r.response);
  return { balance: Number(user.balance), positions: positions.map(p => ({ symbol: p.symbol, quantity: p.quantity, costCents: Number(p.cost_cents) })), orders };
}

module.exports = (auth, { getClient: connect = getClient, marketFeed = createMarketFeed() } = {}) => {
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
  router.get('/market', async (req, res) => {
    let client;
    try {
      const market = await marketFeed.getMarket({ activeChart: req.query.chart === '1' });
      client = await connect();
      res.json({ ...market, legacyAssets: await legacyAssets(client) });
    } catch { res.status(503).json({ error: 'Market data unavailable. Please try again shortly.' }); }
    finally { client?.release(); }
  });
  router.get('/account', auth, transaction((client, req) => account(client, req.user.id)));
  router.post('/orders', auth, transaction(async (client, req) => {
    const { requestId, symbol, side, quantity, quoteTick, limitPrice } = req.body || {};
    if (!uuid(requestId)) fail('Invalid request ID.');
    // Retries return the original fill even when its quote has since expired.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`trade:${req.user.id}:${requestId}`]);
    const existing = (await client.query('SELECT response FROM trading_orders WHERE user_id=$1 AND request_id=$2', [req.user.id, requestId])).rows[0];
    if (existing) return { order: existing.response, ...(await account(client, req.user.id)) };
    if (![...ASSETS.map(a => a.symbol), ...Object.keys(LEGACY_NAMES)].includes(symbol) || !['buy', 'sell'].includes(side) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isSafeInteger(quoteTick) || !Number.isSafeInteger(limitPrice) || limitPrice < 1) fail('Invalid order. Use 1–10,000 whole units.');
    const config = ASSETS.find(a => a.symbol === symbol);
    if (config) {
      const stepUnits = Math.round(config.lotStep * config.lotUnits);
      if (quantity % stepUnits !== 0) fail(`Volume must use ${config.lotStep} lot increments.`);
    }
    const market = await marketFeed.getMarket();
    if (Date.now() - market.fetchedAt > 120000 || quoteTick !== market.tick) fail('Quote expired. Refresh prices and submit again.', 409);
    const legacy = Object.hasOwn(LEGACY_NAMES, symbol);
    if (legacy && side === 'buy') fail('This retired asset can only be sold.', 400);
    const asset = legacy ? (await legacyAssets(client)).find(a => a.symbol === symbol) : market.assets.find(a => a.symbol === symbol);
    if (!asset) fail('Quote unavailable. Refresh prices and try again.', 409);
    if (!legacy && (!asset.tradable || Date.now() - asset.quotedAt > 30 * 60000 ||
      (asset.marketClosesAt && Date.now() >= asset.marketClosesAt))) fail('Trading is paused while this market is closed or its quote is delayed.', 409);
    const price = side === 'buy' ? asset.ask : asset.bid;
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
