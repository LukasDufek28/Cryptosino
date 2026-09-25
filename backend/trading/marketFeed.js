const ASSETS = [
  { symbol: 'SP500', ticker: '^GSPC', name: 'S&P 500 · 1% unit', unitScale: 0.01 },
  { symbol: 'NAS100', ticker: '^NDX', name: 'Nasdaq 100 · 1% unit', unitScale: 0.01 },
  { symbol: 'TSLA', ticker: 'TSLA', name: 'Tesla' },
  { symbol: 'AAPL', ticker: 'AAPL', name: 'Apple' },
  { symbol: 'GOOGL', ticker: 'GOOGL', name: 'Alphabet' }
];
const REFRESH_MS = 60000;
const MAX_CACHE_MS = 120000;
const MAX_QUOTE_AGE_MS = 30 * 60000;
const quote = price => ({ bid: Math.max(1, Math.floor(price * 0.999)), ask: Math.ceil(price * 1.001) });

function createMarketFeed({ fetch: request = globalThis.fetch, now = Date.now } = {}) {
  let cache = null;
  let pending = null;

  async function loadAsset(config) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.ticker)}?range=5d&interval=5m&includePrePost=false`;
    const response = await request(url, { headers: { 'User-Agent': 'Cryptosino/1.0' }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`Quote request failed for ${config.symbol}`);
    const payload = await response.json();
    const chart = payload.chart?.result?.[0];
    const meta = chart?.meta;
    const price = Number(meta?.regularMarketPrice);
    const quotedAt = Number(meta?.regularMarketTime) * 1000;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quotedAt) || quotedAt <= 0 || meta.currency !== 'USD') {
      throw new Error(`Invalid quote for ${config.symbol}`);
    }
    const history = (chart.timestamp || []).map((time, index) => ({
      time: time * 1000, price: Math.round(Number(chart.indicators?.quote?.[0]?.close?.[index]) * 100 * (config.unitScale || 1))
    })).filter(point => Number.isFinite(point.price) && point.price > 0).slice(-390);
    const cents = Math.round(price * 100 * (config.unitScale || 1));
    const period = meta.currentTradingPeriod?.regular;
    const current = now();
    const marketOpen = Boolean(period && current >= period.start * 1000 && current < period.end * 1000);
    return { ...config, price: cents, referencePrice: Math.round(price * 100), ...quote(cents), history, quotedAt,
      marketOpen, marketClosesAt: period?.end ? period.end * 1000 : null,
      tradable: marketOpen && current - quotedAt <= MAX_QUOTE_AGE_MS && quotedAt <= current + 60000 };
  }

  async function refresh() {
    const results = await Promise.allSettled(ASSETS.map(loadAsset));
    const fetchedAt = now();
    const previous = new Map(cache?.assets.map(asset => [asset.symbol, asset]) || []);
    const assets = results.map((result, index) => result.status === 'fulfilled' ? result.value : {
      ...(previous.get(ASSETS[index].symbol) || ASSETS[index]), tradable: false, unavailable: true
    });
    cache = { tick: Math.floor(fetchedAt / REFRESH_MS), serverNow: fetchedAt, fetchedAt,
      tickMs: REFRESH_MS, source: 'Yahoo Finance', synthetic: false, assets };
    if (results.every(result => result.status === 'rejected')) throw new Error('Market data provider unavailable.');
    return cache;
  }

  async function getMarket() {
    if (cache && now() - cache.fetchedAt < REFRESH_MS) return cache;
    if (!pending) pending = refresh().finally(() => { pending = null; });
    try { return await pending; }
    catch (error) {
      if (cache && now() - cache.fetchedAt < MAX_CACHE_MS) return {
        ...cache, assets: cache.assets.map(asset => ({ ...asset, tradable: false, unavailable: true }))
      };
      throw error;
    }
  }

  return { getMarket };
}

module.exports = { ASSETS, createMarketFeed };
