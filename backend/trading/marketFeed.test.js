const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketFeed } = require('./marketFeed');

test('market feed converts six quotes to cents and shares a cached refresh', async () => {
  let time = 1700000000000;
  let calls = 0;
  const request = async url => {
    calls++;
    assert.ok(url.includes('interval=1m'));
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
  assert.equal(calls, 6);
  assert.deepEqual(first.assets.map(a => a.symbol), ['SP500', 'NAS100', 'TSLA', 'AAPL', 'GOOGL', 'BTCUSD']);
  assert.equal(first.assets[0].price, 123);
  assert.equal(first.assets[0].referencePrice, 12346);
  assert.equal(first.assets[3].price, 12346);
  assert.equal(first.assets[0].tradable, true);
  assert.equal(first.assets[0].history.length, 2);
  await feed.getMarket();
  assert.equal(calls, 6);
  time += 4999;
  await feed.getMarket({ activeChart: true });
  assert.equal(calls, 6);
  time += 1;
  const [fast, shared] = await Promise.all([feed.getMarket({ activeChart: true }), feed.getMarket({ activeChart: true })]);
  assert.equal(calls, 12);
  assert.equal(fast, shared);
  assert.equal(fast.tickMs, 5000);
  assert.notEqual(fast.tick, first.tick);
  time += 5000;
  await feed.getMarket();
  assert.equal(calls, 12, 'inactive clients retain the slower shared cache');
  time += 55000;
  await feed.getMarket();
  assert.equal(calls, 18);
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
  assert.equal(market.assets.length, 6);
  assert.equal(market.assets.find(a => a.symbol === 'TSLA').unavailable, true);
  assert.equal(market.assets.find(a => a.symbol === 'AAPL').tradable, false);
});


test('Bitcoin stays open outside stock hours but stale quotes cannot trade', async () => {
  const time = 1700000000000;
  let age = 60;
  const feed = () => createMarketFeed({ now: () => time, fetch: async () => ({ok:true,json:async()=>({chart:{result:[{
    meta:{currency:'USD',regularMarketPrice:65000,regularMarketTime:time/1000-age,
      currentTradingPeriod:{regular:{start:time/1000-7200,end:time/1000-3600}}},
    timestamp:[time/1000],indicators:{quote:[{open:[64000],high:[66000],low:[63000],close:[65000]}]}
  }]}})}) });
  const market = await feed().getMarket();
  const btc = market.assets.find(a=>a.symbol==='BTCUSD');
  assert.equal(btc.tradable,true);
  assert.equal(btc.marketClosesAt,null);
  assert.equal(btc.price,650);
  assert.equal(btc.referencePrice,6500000);
  assert.equal(btc.lotUnits,10000);
  assert.equal(btc.history[0].open,6400000);
  assert.equal(market.assets.find(a=>a.symbol==='AAPL').tradable,false);
  age=3600;
  assert.equal((await feed().getMarket()).assets.find(a=>a.symbol==='BTCUSD').tradable,false);
});
