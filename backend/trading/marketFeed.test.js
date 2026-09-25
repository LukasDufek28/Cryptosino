const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketFeed } = require('./marketFeed');

test('market feed converts five quotes to cents and shares a cached refresh', async () => {
  let time = 1700000000000;
  let calls = 0;
  const request = async url => {
    calls++;
    const ticker = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);
    return { ok: true, json: async () => ({ chart: { result: [{
      meta: { currency: 'USD', regularMarketPrice: 123.456, regularMarketTime: Math.floor(time / 1000) - 60,
        currentTradingPeriod: { regular: { start: Math.floor(time / 1000) - 3600, end: Math.floor(time / 1000) + 3600 } } },
      timestamp: [Math.floor(time / 1000) - 300, Math.floor(time / 1000)],
      indicators: { quote: [{ close: [122, 123.456] }] }, ticker
    }] } }) };
  };
  const feed = createMarketFeed({ fetch: request, now: () => time });
  const [first, same] = await Promise.all([feed.getMarket(), feed.getMarket()]);
  assert.equal(first, same);
  assert.equal(calls, 5);
  assert.deepEqual(first.assets.map(a => a.symbol), ['SP500', 'NAS100', 'TSLA', 'AAPL', 'GOOGL']);
  assert.equal(first.assets[0].price, 123);
  assert.equal(first.assets[0].referencePrice, 12346);
  assert.equal(first.assets[3].price, 12346);
  assert.equal(first.assets[0].tradable, true);
  assert.equal(first.assets[0].history.length, 2);
  await feed.getMarket();
  assert.equal(calls, 5);
  time += 60000;
  await feed.getMarket();
  assert.equal(calls, 10);
});

test('provider failures and closed markets cannot be traded', async () => {
  const time = 1700000000000;
  const feed = createMarketFeed({ now: () => time, fetch: async url => {
    if (url.includes('TSLA')) throw new Error('offline');
    return { ok: true, json: async () => ({ chart: { result: [{
      meta: { currency: 'USD', regularMarketPrice: 50, regularMarketTime: Math.floor(time / 1000) - 7200,
        currentTradingPeriod: { regular: { start: Math.floor(time / 1000) - 10000, end: Math.floor(time / 1000) - 3000 } } },
      timestamp: [], indicators: { quote: [{ close: [] }] }
    }] } }) };
  } });
  const market = await feed.getMarket();
  assert.equal(market.assets.length, 5);
  assert.equal(market.assets.find(a => a.symbol === 'TSLA').unavailable, true);
  assert.equal(market.assets.find(a => a.symbol === 'AAPL').tradable, false);
});
