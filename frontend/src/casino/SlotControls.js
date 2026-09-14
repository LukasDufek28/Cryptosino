import React from 'react';
import configs from '../slots/config.json';

export default function SlotControls({ slots }) {
  const { selected, message, busy, retry, autoSpin } = slots;
  if (!selected && !message) return null;
  const config = selected && configs[selected.variant];
  return <section className="amber-slot-controls" aria-label="Slot machine controls" onPointerDown={e => e.stopPropagation()}>
    {selected && <>
      <strong>{selected.name}</strong><small>Shared machine · server-synchronised result</small>
      <div className="amber-slot-actions">
        <label>Stake $ <input type="number" min="0.1" max="1000000" step="0.1" value={slots.bet} disabled={busy || retry} onChange={e => slots.setBet(e.target.value)} /></label>
        <button disabled={busy} onClick={slots.spin}>{retry ? 'Recover spin' : busy ? 'Spinning…' : 'Spin'}</button>
        <button className={autoSpin ? 'amber-auto-on' : ''} disabled={retry} onClick={slots.toggleAuto}>{autoSpin ? 'Stop auto spin' : 'Auto spin'}</button>
      </div>
      <details><summary>Paytable & rules</summary>
        <p>{selected.variant === 'joker' ? 'All 243 paths pay left to right from reel 1. Joker substitutes for every fruit; only the best award on each path pays. Listed multipliers apply to one ways-unit of the total stake.' : `Stake is split over ${config.paylines.length} lines. Matching symbols pay left to right from reel 1. Wild substitutes; only the best award per line pays.`}</p>
        <table><thead><tr><th>Symbol</th><th>3</th>{selected.variant === 'golden' && <><th>4</th><th>5</th></>}</tr></thead>
          <tbody>{Object.entries(config.paytable).map(([symbol, pays]) => <tr key={symbol}><th>{symbol}</th>{pays.slice(3).map((mult, i) => <td key={i}>{mult}×</td>)}</tr>)}</tbody></table>
        <p>{selected.variant === 'joker' ? 'When a winning path uses a Joker, every symbol in that winning path sticks and all other positions respin free. A new Joker in another win extends the chain. Every spin and respin award is added to the return.' : 'BOOK is wild and scatter. 3/4/5+ books anywhere also return 1×/3×/10× the total stake. No free-spin feature.'}</p>
        <p>Return includes the stake; a return equal to your stake is not a profit. Custom games, not provider replicas.</p>
      </details>
    </>}
    <div role="status">{message}</div>
    {!selected && (retry ? <button disabled={busy} onClick={slots.spin}>Recover previous spin</button> : <button onClick={slots.dismiss}>Dismiss</button>)}
  </section>;
}
