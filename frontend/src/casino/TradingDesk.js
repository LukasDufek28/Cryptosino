import React, { useEffect, useRef, useState } from 'react';
import './TradingDesk.css';
import { LOCAL_DEMO } from './demoCasino';
import { DEMO_TRADING_KEY, newDemoAccount, settleDemoOrder } from './demoTrading';
import { lotQuantity, aggregateCandles } from './tradingMath';
const API = process.env.REACT_APP_API_URL || '';
const dollars = cents => `$${(Number(cents) / 100).toFixed(2)}`;

export default function TradingDesk({ token, user, marketFeed, setBalance }) {
  const isDemo = LOCAL_DEMO && !token;
  const demoAccount = useRef(null);
  const refreshMarket = useRef(marketFeed.refresh);
  refreshMarket.current = marketFeed.refresh;
  useEffect(() => { refreshMarket.current(); }, []);
  const { market, error: marketError } = marketFeed;
  const [symbol, setSymbol] = useState('SP500'), [quantity, setQuantity] = useState('0.01');
  const [timeframe, setTimeframe] = useState(15), [tab, setTab] = useState('positions');
  const [clock, setClock] = useState(() => performance.now());
  useEffect(() => { const timer = setInterval(() => setClock(performance.now()), 1000); return () => clearInterval(timer); }, []);
  const [account, setAccount] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pendingKey = `amber-trading-order:${user?.id || 'local-demo'}`;
  const [pending, setPending] = useState(() => {
    if (isDemo) return null;
    try { return JSON.parse(sessionStorage.getItem(pendingKey)) || null; } catch { return null; }
  });
  const mounted = useRef(true), sending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (isDemo) {
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(DEMO_TRADING_KEY)); } catch {}
      const initial = saved && Number.isFinite(saved.balance) && saved.balance >= 0 && Array.isArray(saved.positions) && Array.isArray(saved.orders) ? saved : newDemoAccount();
      demoAccount.current = initial; setAccount(initial);
      return () => { mounted.current = false; };
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    fetch(`${API}/api/trading/account`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Account unavailable'); return data; })
      .then(data => { if (mounted.current) { setAccount(data); setBalance(data.balance); } })
      .catch(e => { if (mounted.current) setMessage(e.message); }).finally(() => clearTimeout(timer));
    return () => { mounted.current = false; controller.abort(); clearTimeout(timer); };
  }, [token, setBalance, isDemo]);
  const allAssets = [...(market?.assets || []), ...(market?.legacyAssets || [])].map(a =>
    isDemo && !a.legacy ? { ...a, tradable: !a.unavailable && Boolean(a.bid && a.ask) } : a);
  const asset = allAssets.find(a => a.symbol === symbol);
  const position = account?.positions.find(p => p.symbol === symbol);
  const stale = !market || clock - market.receivedAt > 120000;
  const units = lotQuantity(quantity, asset), valid = units !== null;
  const lotUnits = asset?.lotUnits || 1;
  const selectAsset = next => { setSymbol(next.symbol); setQuantity(String(next.defaultLots || 1)); };
  const lotsOf = (symbol, units) => Number((units / (allAssets.find(a => a.symbol === symbol)?.lotUnits || 1)).toFixed(4));
  const reference = (a, side) => a?.[side] ? dollars(a[side] / (a.unitScale || 1)) : '—';
  async function trade(side) {
    if (sending.current || (!pending && (!account || !asset || stale || !valid || (!asset.tradable && !(asset.legacy && side === 'sell'))))) return;
    const order = pending || { requestId: crypto.randomUUID(), symbol, side, quantity: units, quoteTick: market.tick,
      limitPrice: side === 'buy' ? asset.ask : asset.bid };
    if (isDemo) {
      sending.current = true;
      try {
        const next = settleDemoOrder(demoAccount.current, order, asset);
        demoAccount.current = next; setAccount(next);
        try { sessionStorage.setItem(DEMO_TRADING_KEY, JSON.stringify(next)); } catch {}
        setMessage(`Demo ${side}: ${lotsOf(symbol, units)} lots of ${symbol} · Total ${dollars(next.order.total)}.`);
      } catch (error) { setMessage(error.message); }
      finally { sending.current = false; }
      return;
    }
    // Save before transmission so closing/reloading can recover uncertain orders.
    try { sessionStorage.setItem(pendingKey, JSON.stringify(order)); }
    catch { setMessage('Browser storage is unavailable. Enable it before placing orders.'); return; }
    setPending(order); sending.current = true; setBusy(true); setMessage('Submitting order…');
    try {
      const response = await fetch(`${API}/api/trading/orders`, { method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(order) });
      const data = await response.json();
      if (!response.ok) { const error = new Error(data.error || 'Order unavailable'); error.status = response.status; throw error; }
      sessionStorage.removeItem(pendingKey);
      if (mounted.current) {
        setPending(null); setAccount(data); setBalance(data.balance);
        setMessage(`${data.order.side === 'buy' ? 'Bought' : 'Sold'} ${lotsOf(data.order.symbol, data.order.quantity)} lots of ${data.order.symbol} · Total ${dollars(data.order.total)}.`);
        marketFeed.refresh();
      }
    } catch (e) {
      if (e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(pendingKey);
        if (mounted.current) { setPending(null); setMessage(e.message); marketFeed.refresh(); }
      } else if (mounted.current) setMessage('Result uncertain. Recover the same order; you will not be charged twice.');
    } finally { sending.current = false; if (mounted.current) setBusy(false); }
  }
  const history = aggregateCandles(asset?.history || [], timeframe).slice(-90);
  const values = history.flatMap(p => [p.high, p.low]);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const padding = Math.max((high - low) * .08, 1), range = Math.max(high - low + 2 * padding, 1);
  const y = price => 260 - (price - low + padding) / range * 230;
  const candleWidth = Math.min(10, 690 / Math.max(history.length, 1) * .65);
  const hasUnpricedHoldings = account?.positions.some(p => !allAssets.find(a => a.symbol === p.symbol)?.bid);
  const holdings = account?.positions.reduce((total, p) => total + p.quantity * (allAssets.find(a => a.symbol === p.symbol)?.bid || 0), 0) || 0;
  const profit = account?.positions.reduce((total,p) => total + p.quantity * (allAssets.find(a=>a.symbol===p.symbol)?.bid || 0) - p.costCents,0) || 0;
  const disabled = busy || !!pending || !account || stale || !valid;
  const buyCost = valid && asset?.ask ? units * asset.ask : null;
  const canSell = asset && (asset.tradable || asset.legacy) && (position?.quantity || 0) >= units;
  return <div className="exchange-desk">
    <header className="exchange-toolbar"><strong>AMBER TERMINAL</strong><span>{isDemo ? 'LOCAL DEMO · $100,000 practice account' : 'USD · Cash account · Game credits'}</span>{isDemo && <button onClick={() => {
      const fresh = newDemoAccount(); demoAccount.current = fresh; setAccount(fresh);
      try { sessionStorage.setItem(DEMO_TRADING_KEY, JSON.stringify(fresh)); } catch {}
      setMessage('Demo account reset to $100,000.');
    }}>Reset demo</button>}<span className={stale ? 'exchange-offline' : 'exchange-online'}>{stale ? 'Waiting for quotes' : 'Quote feed connected'}</span><button onClick={() => marketFeed.refresh()} disabled={busy}>Refresh quotes</button></header>
    {isDemo && <p>Local practice only · No account required · Separate virtual balance · Market hours bypassed for testing using the latest available quotes.</p>}
    <div className="exchange-workspace">
      <aside className="exchange-watch"><h3>Market Watch <small>Bid / Ask</small></h3>
        <div className="exchange-watch-head"><span>Symbol</span><span>Bid</span><span>Ask</span></div>
        {allAssets.filter(a => !a.legacy || account?.positions.some(p => p.symbol === a.symbol)).map(a => <button key={a.symbol} disabled={busy || !!pending} aria-pressed={symbol === a.symbol} onClick={() => selectAsset(a)}>
          <span><strong>{a.symbol}</strong><small>{a.legacy ? 'Sell only' : a.unavailable ? 'Unavailable' : a.tradable ? isDemo ? 'Demo' : a.continuous ? '24/7' : 'Open' : 'Closed / delayed'}</small></span><span>{reference(a,'bid')}</span><span>{reference(a,'ask')}</span>
        </button>)}
        <div className="exchange-contract"><h4>Specification · {symbol}</h4><p>{asset?.name || 'Loading instrument…'}</p><p>{asset?.contract || '1 lot = 1 legacy unit'}</p><p>Min / step: {asset?.lotStep || 1} lots<br/>Max: {10000 / lotUnits} lots per order</p><p>{asset?.continuous ? 'Bitcoin · 24/7 session' : 'Regular US market session'}<br/>Fully funded · No leverage<br/>Sell closes owned holdings</p><p>Simulated spread: {asset?.spreadRate ? `${(asset.spreadRate * 100).toFixed(2)}% plus cent rounding` : 'Legacy quote spread'}</p></div>
      </aside>
      <section className="exchange-chart-pane" aria-label="Chart and one-click trading">
        <div className="exchange-chart-toolbar"><strong>{symbol} <small>{asset?.name}</small></strong><label>Interval <select value={timeframe} onChange={e=>setTimeframe(Number(e.target.value))}><option value={1}>M1</option><option value={5}>M5</option><option value={15}>M15</option><option value={30}>M30</option><option value={60}>H1</option><option value={240}>H4</option><option value={1440}>D1</option></select></label></div>
        <div className="exchange-oneclick" aria-label="One-click order panel">
          <button className="exchange-sell" disabled={disabled || !canSell} onClick={()=>trade('sell')}><span>SELL</span><strong>{reference(asset,'bid')}</strong><small>Close holdings at bid</small></button>
          <label>Volume · lots<input aria-label="Order volume in lots" type="number" min={asset?.lotStep || 1} max={10000/lotUnits} step={asset?.lotStep || 1} value={quantity} disabled={busy || !!pending} onChange={e=>setQuantity(e.target.value)}/><small>{asset?.contract || '1 lot = 1 unit'}</small></label>
          <button className="exchange-buy" disabled={disabled || !asset?.tradable || buyCost > (account?.balance || 0)*100} onClick={()=>trade('buy')}><span>BUY</span><strong>{reference(asset,'ask')}</strong><small>Open holdings at ask</small></button>
        </div>
        <div className="exchange-order-estimate"><span>Order value: <b>{buyCost !== null ? dollars(buyCost) : '—'}</b></span><span>Owned: {lotsOf(symbol,position?.quantity || 0)} lots</span><span>{asset?.tradable ? 'One click submits immediately' : asset?.legacy ? 'Sell only' : 'Trading paused · closed or delayed quote'}</span></div>
        {!valid && <p role="alert">Enter a positive volume in {asset?.lotStep || 1} lot steps, up to {10000 / lotUnits} lots.</p>}
        {buyCost > (account?.balance || 0)*100 && account && <p>Not enough cash for this volume.</p>}
        <svg className="exchange-chart" viewBox="0 0 820 300" role="img" aria-label={`${symbol} ${timeframe}-minute candlestick chart, most recent ${history.length} bars`}>
          {[0,1,2,3,4].map(i=>{const price=low-padding+range*i/4;return <g key={i}><path d={`M12 ${y(price)}H724`} stroke="#263945" strokeDasharray="3 4"/><text x="733" y={y(price)+4} fill="#91a7b5" fontSize="11">{(price/100).toFixed(2)}</text></g>;})}
          {history.map((bar,i)=>{const x=18+i*690/Math.max(history.length-1,1), color=bar.close>=bar.open?'#36bca0':'#ed6b72';return <g key={bar.time}><title>{new Date(bar.time).toLocaleString()} · O {(bar.open/100).toFixed(2)} H {(bar.high/100).toFixed(2)} L {(bar.low/100).toFixed(2)} C {(bar.close/100).toFixed(2)}</title><path d={`M${x} ${y(bar.high)}V${y(bar.low)}`} stroke={color}/><rect x={x-candleWidth/2} y={Math.min(y(bar.open),y(bar.close))} width={candleWidth} height={Math.max(1,Math.abs(y(bar.open)-y(bar.close)))} fill={color}/></g>;})}
          {!history.length && <text x="350" y="150" textAnchor="middle" fill="#91a7b5">Waiting for price history</text>}
          {!!history.length && <><text x="12" y="290" fill="#91a7b5" fontSize="10">{new Date(history[0].time).toLocaleString()}</text><text x="720" y="290" textAnchor="end" fill="#91a7b5" fontSize="10">{new Date(history[history.length-1].time).toLocaleString()}</text></>}
        </svg>
        <div className="exchange-quote-time">{asset?.quotedAt ? `Quote: ${new Date(asset.quotedAt).toLocaleString()}` : 'Quote unavailable'} · {market?.source || 'Market feed'} · Refresh: 5s · May be delayed</div>
      </section>
    </div>
    <div className="exchange-summary"><span>Balance <b>{account ? dollars(account.balance*100) : 'Loading…'}</b></span><span>Holdings at bid <b>{account && market && !hasUnpricedHoldings ? dollars(holdings) : '—'}</b></span><span>Equity <b>{account && market && !hasUnpricedHoldings ? dollars(account.balance*100+holdings) : '—'}</b></span><span>Floating P/L <b className={profit>=0?'exchange-positive':'exchange-negative'}>{account && market && !hasUnpricedHoldings ? dollars(profit) : '—'}</b></span></div>
    <div className="exchange-tabs" role="group" aria-label="Terminal tables"><button aria-pressed={tab==='positions'} onClick={()=>setTab('positions')}>Trade · Positions</button><button aria-pressed={tab==='history'} onClick={()=>setTab('history')}>Account History</button></div>
    <div className="exchange-table"><table><thead><tr>{(tab==='positions'?['Symbol','Volume (lots)','Cost','Value at bid','Profit']:['Time','Side','Symbol','Volume (lots)','Total','Realized P/L']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
      {tab==='positions' ? account?.positions.map(p=>{const current=allAssets.find(a=>a.symbol===p.symbol), value=current?.bid ? current.bid*p.quantity : null;return <tr key={p.symbol}><td>{p.symbol}</td><td>{lotsOf(p.symbol,p.quantity)}</td><td>{dollars(p.costCents)}</td><td>{value!==null?dollars(value):'—'}</td><td className={value!==null&&value-p.costCents>=0?'exchange-positive':'exchange-negative'}>{value!==null?dollars(value-p.costCents):'—'}</td></tr>;}) : account?.orders.map(o=><tr key={o.requestId}><td>{new Date(o.time).toLocaleString()}</td><td className={o.side==='buy'?'exchange-positive':'exchange-negative'}>{o.side.toUpperCase()}</td><td>{o.symbol}</td><td>{lotsOf(o.symbol,o.quantity)}</td><td>{dollars(o.total)}</td><td>{o.realizedPnlCents===null?'—':dollars(o.realizedPnlCents)}</td></tr>)}
    </tbody></table>{account && !(tab==='positions'?account.positions:account.orders).length && <p>No {tab==='positions'?'open holdings':'fills yet'}.</p>}</div>
    {pending && <button disabled={busy} onClick={()=>trade(pending.side)}>Recover pending order</button>}
    {marketError && <p role="alert">{marketError}</p>}{stale && <p>Waiting for a fresh server quote. Orders are disabled.</p>}
    <p className="exchange-message" role="status">{message || 'Select a symbol, set your lot volume, then click SELL or BUY.'}</p>
    <details className="exchange-notes"><summary>Contract & execution details</summary><p>This is a game-credit cash simulation. No real securities or Bitcoin are bought. Stocks use one share per lot. Index lots represent $1 per point, with 0.01-lot increments; existing scaled holdings are preserved. Bitcoin uses 1 BTC per lot, with 0.0001-lot increments. These are Amber contract definitions; broker specifications vary. No leverage or short selling.</p><p>Quotes refresh every five seconds while this chart is open, may be delayed, and pause when stale. BTC trades around the clock when a fresh quote is available; stocks and indexes trade during their regular session. Displayed spreads are simulated, not exchange bid/ask quotes. Orders use the displayed price as a strict limit; adverse changes reject the order. Settlement rounds each internal unit to cents; the displayed bid/ask reflects that executable price. No extra fee.</p></details>
  </div>;
}
