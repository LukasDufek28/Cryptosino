import React, { useEffect, useState } from 'react';

const money = value => Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function PlayerList({ enabled, presence, user, balance }) {
  const [held, setHeld] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!enabled) { setHeld(false); setPinned(false); return; }
    const down = e => {
      // Preserve normal Tab navigation in forms, menus and with modifier keys.
      if (e.code !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ||
          e.target.isContentEditable || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(e.target.tagName)) return;
      e.preventDefault(); setHeld(true);
    };
    const up = e => { if (e.code === 'Tab') setHeld(false); };
    const clear = () => { setHeld(false); setPinned(false); };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      document.removeEventListener('keydown', down); document.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear);
    };
  }, [enabled]);
  if (!enabled) return null;
  const players = presence.players?.length ? presence.players : user ? [{ id: user.id, username: user.username, balance, isSelf: true, isHost: false }] : [];
  return <>
    <button className="amber-roster-toggle" aria-expanded={held || pinned} aria-controls="amber-player-list" onClick={() => setPinned(value => !value)}><kbd>TAB</kbd> Players</button>
    {(held || pinned) && <section id="amber-player-list" className="amber-roster" aria-label="Players in the house">
      <header><div><span className="amber-eyebrow">THE AMBER HOUSE / LIVE ROOM</span><h2>Good company.</h2></div><span>{players.length} / 24 GUESTS</span></header>
      <div className="amber-roster-scroll"><table>
        <thead><tr><th>Player</th><th>Balance</th><th>Room role</th></tr></thead>
        <tbody>{players.map(player => <tr key={player.id} className={player.isSelf ? 'amber-roster-self' : ''}>
          <td><span className="amber-roster-avatar" aria-hidden="true">{player.username?.slice(0, 1).toUpperCase()}</span>{player.username}{player.isSelf && <small>YOU</small>}</td>
          <td>{money(player.balance)}</td><td>{player.isHost ? <span className="amber-host-badge">HOST</span> : 'Guest'}</td>
        </tr>)}</tbody>
      </table></div>
      {!players.length && <p>Sign in to join the browser-hosted room.</p>}
      <footer><span>Balances come from the casino server · refresh about every 3 seconds</span><span>Release TAB to close</span></footer>
    </section>}
  </>;
}
