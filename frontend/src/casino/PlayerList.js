import React, { useEffect, useState } from 'react';
import casinoVersion from './version.json';

function CasinoLogo() {
  return <span className="amber-brand-mark amber-roster-logo" aria-hidden="true">A<span>H</span></span>;
}

const money = value => Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

export default function PlayerList({ enabled, presence, user, balance, sceneRef }) {
  const [held, setHeld] = useState(false);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!enabled) { setHeld(false); setPinned(false); return; }
    const down = e => {
      // During gameplay, HUD button focus must not turn Tab into page navigation.
      if (e.code !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ||
          e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      e.preventDefault(); e.stopPropagation(); sceneRef.current?.focus(); setHeld(true);
    };
    const up = e => { if (e.code === 'Tab') setHeld(false); };
    const clear = () => { setHeld(false); setPinned(false); };
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      document.removeEventListener('keydown', down, true); document.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear);
    };
  }, [enabled, sceneRef]);
  if (!enabled) return null;
  const players = presence.players?.length ? presence.players : user ? [{ id: user.id, username: user.username, balance, version: casinoVersion.version, isAdmin: user.is_admin, isOwner: user.is_owner, isSelf: true, isHost: false }] : [];
  return <>
    <button className="amber-roster-toggle" aria-expanded={held || pinned} aria-controls="amber-player-list" onClick={() => setPinned(value => !value)}><kbd>TAB</kbd> Players</button>
    {(held || pinned) && <section id="amber-player-list" className="amber-roster" aria-label="Players in the house">
      <header><div><span className="amber-eyebrow">THE AMBER HOUSE / LIVE ROOM / PATCH {casinoVersion.version}</span><h2>Good company.</h2></div><span>{players.length} / 24 GUESTS</span></header>
      <div className="amber-roster-scroll"><table>
        <thead><tr><th>Player</th><th>Balance</th><th>Patch</th><th>Room role</th></tr></thead>
        <tbody>{players.map(player => <tr key={player.id} className={player.isSelf ? 'amber-roster-self' : ''}>
          <td><span className={`amber-roster-avatar${player.isAdmin || player.isOwner ? ' amber-roster-avatar-admin' : ''}`}>{player.isAdmin || player.isOwner ? <CasinoLogo /> : player.username?.slice(0, 1).toUpperCase()}</span>{player.username}{player.isOwner && <small>OWNER</small>}{player.isAdmin && !player.isOwner && <small>ADMIN</small>}{player.isSelf && <small>YOU</small>}</td>
          <td>{money(player.balance)}</td><td><span className={player.version === casinoVersion.version ? 'amber-patch-match' : 'amber-patch-mismatch'}>{player.version || 'legacy'}</span></td><td>{player.isHost ? <span className="amber-host-badge">HOST</span> : 'Guest'}</td>
        </tr>)}</tbody>
      </table></div>
      {!players.length && <p>Sign in to join the browser-hosted room.</p>}
      <footer><span>Patch versions come from the server roster even if WebRTC cannot connect</span><span>Release TAB to close</span></footer>
    </section>}
  </>;
}
