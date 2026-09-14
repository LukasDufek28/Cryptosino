import React from 'react';
import configs from '../slots/config.json';

export default function SlotControls({ slots }) {
  const { selected, message, busy, retry } = slots;
  if (!selected && !message) return null;
  const config = selected && configs[selected.variant];
  return <section className="amber-slot-controls" aria-label="Slot machine controls" onPointerDown={e => e.stopPropagation()}>
    {selected && <>
      <strong>{selected.name}</strong><small>Shared machine · custom rules · target RTP ≈96%</small>
      <div className="amber-slot-actions">
        <label>Stake $ <input type="number" min="0.1" max="1000000" step="0.1" value={slots.bet} disabled={busy || retry} onChange={e => slots.setBet(e.target.value)} /></label>
        <button disabled={busy} onClick={slots.spin}>{retry ? 'Recover spin' : busy ? 'Spinning…' : 'Spin'}</button>
        <button disabled={busy || retry} onClick={slots.stand}>Stand up</button>
      </div>
      <details><summary>Paytable & rules</summary>
        <p>Stake is split over {config.paylines.length} lines. Matching symbols pay left to right from reel 1. Wild substitutes; only the best award per line pays. Multipliers below apply to the line stake.</p>
        <table><thead><tr><th>Symbol</th><th>3</th>{selected.variant === 'golden' && <><th>4</th><th>5</th></>}</tr></thead>
          <tbody>{Object.entries(config.paytable).map(([symbol, pays]) => <tr key={symbol}><th>{symbol}</th>{pays.slice(3).map((mult, i) => <td key={i}>{mult}×</td>)}</tr>)}</tbody></table>
        <p>{selected.variant === 'joker' ? 'A center-row Joker holds its reel for one free respin. The final respin replaces the initial result; awards are not added together.' : 'BOOK is wild and scatter. 3/4/5+ books anywhere also return 1×/3×/10× the total stake. No free-spin feature.'}</p>
        <p>Return includes the stake; a return equal to your stake is not a profit. Custom games, not provider replicas.</p>
      </details>
    </>}
    <div role="status">{message}</div>
    {!selected && (retry ? <button disabled={busy} onClick={slots.spin}>Recover previous spin</button> : <button onClick={slots.dismiss}>Dismiss</button>)}
  </section>;
}
