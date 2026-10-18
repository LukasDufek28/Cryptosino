const ASSETS = [
  { symbol: 'SP500', ticker: '^GSPC', name: 'S&P 500', unitScale: 0.01, lotUnits: 100, lotStep: 0.01, defaultLots: 0.01, contract: '1 lot = 1 index point exposure ($1 per point)', spreadRate: 0.0001 },
  { symbol: 'NAS100', ticker: '^NDX', name: 'Nasdaq 100', unitScale: 0.01, lotUnits: 100, lotStep: 0.01, defaultLots: 0.01, contract: '1 lot = 1 index point exposure ($1 per point)', spreadRate: 0.0001 },
  { symbol: 'TSLA', ticker: 'TSLA', name: 'Tesla', lotUnits: 1, lotStep: 1, defaultLots: 1, contract: '1 lot = 1 share', spreadRate: 0.0005 },
  { symbol: 'AAPL', ticker: 'AAPL', name: 'Apple', lotUnits: 1, lotStep: 1, defaultLots: 1, contract: '1 lot = 1 share', spreadRate: 0.0002 },
  { symbol: 'GOOGL', ticker: 'GOOGL', name: 'Alphabet', lotUnits: 1, lotStep: 1, defaultLots: 1, contract: '1 lot = 1 share', spreadRate: 0.0003 },
  { symbol: 'BTCUSD', ticker: 'BTC-USD', name: 'Bitcoin / US Dollar', unitScale: 0.0001, lotUnits: 10000, lotStep: 0.0001, defaultLots: 0.001, contract: '1 lot = 1 BTC', spreadRate: 0.001, continuous: true }
];
const REFRESH_MS = 60000;
const CHART_REFRESH_MS = 5000;
const MAX_CACHE_MS = 120000;
const MAX_QUOTE_AGE_MS = 30 * 60000;
const quote = (price, spreadRate) => ({ bid: Math.max(1, Math.floor(price * (1 - spreadRate / 2))), ask: Math.ceil(price * (1 + spreadRate / 2)) });

function createMarketFeed({ fetch: request = globalThis.fetch, now = Date.now } = {}) {
  let cache = null;
  let pending = null;

  async function loadAsset(config) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.ticker)}?range=5d&interval=1m&includePrePost=false`;
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
    const bars = chart.indicators?.quote?.[0] || {};
    const history = (chart.timestamp || []).map((time, index) => {
      const close = Number(bars.close?.[index]);
      const toCents = value => Math.round(value * 100);
      const ohlc = ['open', 'high', 'low', 'close'].map(key => Number(bars[key]?.[index]));
      const candle = ohlc.every(value => Number.isFinite(value) && value > 0);
      return { time: time * 1000, price: toCents(close * (config.unitScale || 1)),
        referencePrice: toCents(close), ...(candle ? { open: toCents(ohlc[0]), high: toCents(ohlc[1]), low: toCents(ohlc[2]), close: toCents(close) } : {}) };
    }).filter(point => Number.isFinite(point.referencePrice) && point.referencePrice > 0 && point.price > 0).slice(-10000);
    const cents = Math.round(price * 100 * (config.unitScale || 1));
    const period = meta.currentTradingPeriod?.regular;
    const current = now();
    const marketOpen = Boolean(config.continuous || (period && current >= period.start * 1000 && current < period.end * 1000));
    return { ...config, price: cents, referencePrice: Math.round(price * 100), ...quote(cents, config.spreadRate), history, quotedAt,
      marketOpen, marketClosesAt: !config.continuous && period?.end ? period.end * 1000 : null,
      tradable: marketOpen && current - quotedAt <= MAX_QUOTE_AGE_MS && quotedAt <= current + 60000 };
  }

  async function refresh() {
    const results = await Promise.allSettled(ASSETS.map(loadAsset));
    const fetchedAt = now();
    const previous = new Map(cache?.assets.map(asset => [asset.symbol, asset]) || []);
    const assets = results.map((result, index) => result.status === 'fulfilled' ? result.value : {
      ...(previous.get(ASSETS[index].symbol) || ASSETS[index]), tradable: false, unavailable: true
    });
    cache = { tick: Math.floor(fetchedAt / CHART_REFRESH_MS), serverNow: fetchedAt, fetchedAt,
      tickMs: CHART_REFRESH_MS, source: 'Yahoo Finance', synthetic: false, assets };
    if (results.every(result => result.status === 'rejected')) throw new Error('Market data provider unavailable.');
    return cache;
  }

  async function getMarket({ activeChart = false } = {}) {
    const refreshMs = activeChart ? CHART_REFRESH_MS : REFRESH_MS;
    if (cache && now() - cache.fetchedAt < refreshMs) return cache;
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
