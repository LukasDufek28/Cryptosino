import React, { useEffect, useRef, useState } from 'react';
import './TradingDesk.css';
const API = process.env.REACT_APP_API_URL || '';
const dollars = cents => `$${(Number(cents) / 100).toFixed(2)}`;

export default function TradingDesk({ token, user, marketFeed, setBalance }) {
  const { market, error: marketError } = marketFeed;
  const [symbol, setSymbol] = useState('SP500'), [quantity, setQuantity] = useState('1');
  const [account, setAccount] = useState(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pendingKey = `amber-trading-order:${user.id}`;
  const [pending, setPending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(pendingKey)) || null; } catch { return null; }
  });
  const mounted = useRef(true), sending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    fetch(`${API}/api/trading/account`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Account unavailable'); return data; })
      .then(data => { if (mounted.current) { setAccount(data); setBalance(data.balance); } })
      .catch(e => { if (mounted.current) setMessage(e.message); }).finally(() => clearTimeout(timer));
    return () => { mounted.current = false; controller.abort(); clearTimeout(timer); };
  }, [token, setBalance]);
  const allAssets = [...(market?.assets || []), ...(market?.legacyAssets || [])];
  const asset = allAssets.find(a => a.symbol === symbol);
  const position = account?.positions.find(p => p.symbol === symbol);
  const stale = !market || performance.now() - market.receivedAt > 120000;
  const units = Number(quantity), valid = Number.isSafeInteger(units) && units > 0 && units <= 10000;
  async function trade(side) {
    if (sending.current || (!pending && (!account || !asset || stale || !valid || (!asset.tradable && !(asset.legacy && side === 'sell'))))) return;
    const order = pending || { requestId: crypto.randomUUID(), symbol, side, quantity: units, quoteTick: market.tick,
      limitPrice: side === 'buy' ? asset.ask : asset.bid };
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
        setMessage(`${data.order.side === 'buy' ? 'Bought' : 'Sold'} ${data.order.quantity} ${data.order.symbol} at ${dollars(data.order.price)} per unit.`);
        marketFeed.refresh();
      }
    } catch (e) {
      if (e.status >= 400 && e.status < 500) {
        sessionStorage.removeItem(pendingKey);
        if (mounted.current) { setPending(null); setMessage(e.message); marketFeed.refresh(); }
      } else if (mounted.current) setMessage('Result uncertain. Recover the same order; you will not be charged twice.');
    } finally { sending.current = false; if (mounted.current) setBusy(false); }
  }
  const history = asset?.history || [], values = history.map(p => p.price);
  const low = Math.min(...values), range = Math.max(1, Math.max(...values) - low);
  const points = history.map((p, i) => `${12 + i / Math.max(1, history.length - 1) * 716},${188 - (p.price - low) / range * 170}`).join(' ');
  const hasUnpricedHoldings = account?.positions.some(p => !allAssets.find(a => a.symbol === p.symbol)?.bid);
  const holdings = account?.positions.reduce((total, p) => total + p.quantity * (allAssets.find(a => a.symbol === p.symbol)?.bid || 0), 0) || 0;
  return <div className="exchange-desk">
    <div className="exchange-banner"><span>MARKET-REFERENCED / GAME CREDITS</span><strong>Amber Exchange</strong><p>Prices follow Yahoo Finance quotes for US stocks and indexes. Trades use casino credits only; no real securities are bought. Quotes may be delayed.</p></div>
    {marketError && <p role="alert">{marketError}</p>}
    <div className="exchange-assets">{allAssets.filter(a => !a.legacy || account?.positions.some(p => p.symbol === a.symbol)).map(a => <button key={a.symbol} disabled={busy || !!pending} aria-pressed={symbol === a.symbol} onClick={() => setSymbol(a.symbol)}><strong>{a.symbol}</strong><span>{a.name}{a.legacy ? ' · sell only' : ''}</span><b>{a.price ? dollars(a.price) : 'Unavailable'}</b><small>{a.referencePrice && a.unitScale ? `Index ${(a.referencePrice / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} pts · ` : ''}{a.legacy ? 'Retired' : a.unavailable ? 'Feed unavailable' : a.tradable ? 'Market open' : 'Market closed / delayed'}</small></button>)}</div>
    <svg className="exchange-chart" viewBox="0 0 740 205" role="img" aria-label={`${symbol} price history, up to five trading days`}><path d="M12 18V188H728" fill="none" stroke="#718e81"/><polyline points={points} fill="none" stroke="#85d8af" strokeWidth="3"/>{history.length === 1 && <circle cx="12" cy="188" r="4" fill="#85d8af"/>}</svg>
    {asset?.quotedAt && <small>Last market quote: {new Date(asset.quotedAt).toLocaleString()} · Source: {market.source}</small>}
    <div className="exchange-summary"><span>Cash <b>{account ? dollars(account.balance * 100) : 'Loading…'}</b></span><span>Holdings at bid <b>{market && account && !hasUnpricedHoldings ? dollars(holdings) : '—'}</b></span><span>Net equity <b>{market && account && !hasUnpricedHoldings ? dollars(account.balance * 100 + holdings) : '—'}</b></span></div>
    <div className="exchange-order"><label>Whole units <input type="number" min="1" max="10000" step="1" disabled={busy || !!pending} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
      <button disabled={busy || !!pending || !account || stale || !valid || !asset?.tradable} onClick={() => trade('buy')}>Buy {asset?.ask && `@ ${dollars(asset.ask)}`}</button>
      <button disabled={busy || !!pending || !account || stale || !valid || (!asset?.tradable && !asset?.legacy) || (position?.quantity || 0) < units} onClick={() => trade('sell')}>Sell {asset?.bid && `@ ${dollars(asset.bid)}`}</button>
      {pending && <button disabled={busy} onClick={() => trade(pending.side)}>Recover pending order</button>}
    </div>
    <small>Each index game unit tracks 1% of the quoted index level, so it fits a casino credit balance. Stocks track one share. Quotes refresh about once a minute while you are in the hall. Trading pauses outside regular US market hours or when quotes are delayed. Buy at ask, sell at bid (approximately 0.2% spread, rounded to cents). Your displayed price is a strict limit; adverse moves reject the order. No extra fee.</small>
    {stale && <p>Waiting for a fresh server quote…</p>}
    <p role="status">{message || 'Choose an asset and place an order at a terminal.'}</p>
    <h3>Your portfolio</h3><div className="exchange-table"><table><thead><tr><th>Asset</th><th>Units</th><th>Cost</th><th>Sell value</th><th>Unrealized P/L</th></tr></thead><tbody>{account?.positions.map(p => {
      const current = allAssets.find(a => a.symbol === p.symbol), value = (current?.bid || 0) * p.quantity;
      return <tr key={p.symbol}><td>{p.symbol}</td><td>{p.quantity}</td><td>{dollars(p.costCents)}</td><td>{current ? dollars(value) : '—'}</td><td>{current ? dollars(value - p.costCents) : '—'}</td></tr>;
    })}</tbody></table></div>
    {!account?.positions.length && <p>No open holdings.</p>}
    <h3>Recent fills</h3><div className="exchange-table"><table><thead><tr><th>Side</th><th>Asset</th><th>Units</th><th>Total</th><th>Realized P/L</th></tr></thead><tbody>{account?.orders.map(o => <tr key={o.requestId}><td>{o.side}</td><td>{o.symbol}</td><td>{o.quantity}</td><td>{dollars(o.total)}</td><td>{o.realizedPnlCents === null ? '—' : dollars(o.realizedPnlCents)}</td></tr>)}</tbody></table></div>
  </div>;
}
