import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthPage from '../AuthPage';
import createScene from './createScene';
import usePresence from './usePresence';
import PlayerList from './PlayerList';
import useLeaderboard from './useLeaderboard';
import layout from './worldLayout.json';
import './CasinoWorld.css';

const games = {
  slots: lazy(() => import('../SlotsGame')),
  blackjack: lazy(() => import('../BlackjackGame')),
  dice: lazy(() => import('../DiceGame')),
  crash: lazy(() => import('../CrashGame'))
};
const gameNames = { slots: 'Golden reels', blackjack: 'The twenty-one club', dice: 'Lucky pair', crash: 'Skyline' };

function MiniMap({ status }) {
  return <div className="amber-map" aria-label={`Floor ${status.floor} map`}>
    <div className="amber-map-title"><span>YOU ARE HERE</span><span>0{status.floor}</span></div>
    <svg viewBox="-16 -12 32 25" role="img" aria-label="Your position inside the casino">
      <rect x="-14" y="-10" width="28" height="20" rx="0.6" fill="#eddcb9" opacity="0.12" stroke="#d7b875" strokeWidth="0.25" />
      <path d="M-9.5 -3.5V7.5H-13.3V-3.5Z" fill="#d7b875" opacity="0.2" />
      {status.floor === 2 && <>
        {layout.stations.map(s => <rect key={s.id} x={s.x - 1.1} y={s.z - 0.7} width="2.2" height="1.4" rx="0.3" fill={s.color} />)}
        {layout.seats.map(s => <rect key={s.id} x={s.x - 1.7} y={s.z - 0.5} width="3.4" height="1" rx="0.3" fill="#c58d65" />)}
      </>}
      <path d="M-14 10.5H14" stroke="#9ebcb5" strokeWidth="0.35" />
      <g transform={`translate(${Math.max(-14, Math.min(14, status.x))} ${Math.max(-10, Math.min(11, status.z))}) rotate(${-status.yaw * 180 / Math.PI})`}>
        <path d="M0 -1.15L0.65 0.7L0 0.35L-0.65 0.7Z" fill="#ffe4ac" />
      </g>
    </svg>
    <div className="amber-map-foot">{status.floor === 2 ? 'Casino & window lounge' : 'Reception & street'}</div>
  </div>;
}

function Dialog({ title, onClose, children, large = false }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    const key = e => {
      if (e.code === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const nodes = Array.from(dialog.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
        if (!nodes.length) { e.preventDefault(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, [onClose]);
  return <div className="amber-modal-shade">
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`amber-modal ${large ? 'amber-modal-large' : ''}`}>
      <header><div><span className="amber-eyebrow">THE AMBER HOUSE</span><h2>{title}</h2></div><button onClick={onClose} className="amber-close" aria-label="Close and return to casino">×</button></header>
      <div className="amber-modal-content">{children}</div>
    </section>
  </div>;
}

export default function CasinoWorld({ token, user, balance, setBalance, onAuth, onLogout }) {
  const host = useRef(null), sceneRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [welcome, setWelcome] = useState(true);
  const [panel, setPanel] = useState(null);
  const [seat, setSeat] = useState(null);
  const [status, setStatus] = useState({ floor: 2, x: layout.spawn.x, z: layout.spawn.z, yaw: layout.spawn.yaw, prompt: '', locked: false });
  const [activeGame, setActiveGame] = useState(null);
  const [showMap, setShowMap] = useState(true);
  const openGameRef = useRef(null);
  openGameRef.current = game => { setActiveGame(game); setPanel(token && user ? 'game' : 'auth'); };
  useEffect(() => {
    let instance;
    try {
      instance = createScene(host.current, { onGame: game => openGameRef.current(game), onStatus: setStatus, onSeat: setSeat, onError: setError });
      sceneRef.current = instance; setReady(true);
    } catch {
      setError('The 3D room could not start. Enable hardware acceleration and use a browser with WebGL 2 support.');
    }
    return () => { instance?.dispose(); sceneRef.current = null; };
  }, []);
  const presence = usePresence(token, sceneRef, ready);
  useLeaderboard(sceneRef, ready);
  // Signing out also closes any retained authenticated game screen.
  useEffect(() => { if (!token) setPanel(current => current === 'game' ? null : current); }, [token]);
  useEffect(() => { sceneRef.current?.setEnabled(!welcome && !panel && !error); }, [welcome, panel, error, ready]);
  const closePanel = useCallback(() => setPanel(null), []);
  const start = () => { setWelcome(false); sceneRef.current?.setEnabled(true); sceneRef.current?.lock(); };
  const Game = activeGame ? games[activeGame] : null;
  const openDirectory = () => { setWelcome(false); setPanel('directory'); };

  return <main className="amber-world">
    <div className="amber-canvas" ref={host} />
    <div className="amber-vignette" />
    <header className="amber-topbar">
      <div className="amber-brand"><span className="amber-brand-mark">A<span>H</span></span><div><strong>THE AMBER HOUSE</strong><small>A CRYPTOSINO ADDRESS</small></div></div>
      <nav aria-label="Casino navigation">
        <button className="amber-nav-button" onClick={openDirectory}>The collection <span>↗</span></button>
        <button className="amber-icon-button" onClick={() => setShowMap(v => !v)} aria-label="Toggle floor map" aria-pressed={showMap}>⌖</button>
        {user ? <><span className="amber-wallet">${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><button className="amber-nav-button" onClick={() => setPanel('account')}>{user.username}</button></>
          : <button className="amber-pill" onClick={() => { setWelcome(false); setPanel('auth'); }}>Sign in <span>↗</span></button>}
      </nav>
    </header>
    <div className="amber-location"><span className="amber-live-dot"/><span>{presence.mode === 'shared' ? `${presence.count} guests · ${presence.role === 'host' ? 'You are hosting' : 'Browser hosted'} · 30 ms send interval` : 'Your evening, your pace'}</span><span className="amber-location-divider">/</span><span>GOLDEN HOUR</span></div>

    {welcome && !error && <section className="amber-welcome">
      <div className="amber-eyebrow"><span/> EST. 2026 · AN EVENING WELL SPENT</div>
      <h1>A little luck.<br/>A lovely evening.</h1>
      <p>Leave the city behind. Find your favorite table,<br className="amber-desktop"/> settle into the lounge, and stay a little longer.</p>
      <button className="amber-enter" onClick={start} disabled={!ready}>{ready ? 'Make yourself at home' : 'Opening the doors…'} <span>↗</span></button>
      <div className="amber-welcome-foot"><span>02 FLOORS</span><i/><span>04 GAMES</span><i/><span>ONE GOOD EVENING</span></div>
    </section>}

    {!welcome && !panel && !error && <>
      <div className="amber-reticle" aria-hidden="true">·</div>
      <div className="amber-floor-label"><span>0{status.floor}</span><div><small>{status.floor === 2 ? 'UPSTAIRS' : 'GROUND FLOOR'}</small><strong>{status.floor === 2 ? 'The casino & lounge' : 'The welcome hall'}</strong></div></div>
      {status.prompt && <button className="amber-interact" onClick={() => sceneRef.current?.interact()}><kbd>E</kbd>{status.prompt}<span>↗</span></button>}
      {seat && <div className="amber-seated">Take your time. Watch the city go by.</div>}
      {!status.locked && <button className="amber-resume" onClick={() => sceneRef.current?.lock()}>Click the scene to look around · or drag</button>}
      <div className="amber-mobile-controls" aria-label="Movement controls">
        {[[0, 1, '↑'], [-1, 0, '←'], [0, -1, '↓'], [1, 0, '→']].map(([x, y, label]) => <button key={label} aria-label={`Move ${label}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); sceneRef.current?.move(x, y); }} onPointerUp={() => sceneRef.current?.move(0, 0)} onPointerCancel={() => sceneRef.current?.move(0, 0)} onLostPointerCapture={() => sceneRef.current?.move(0, 0)}>{label}</button>)}
      </div>
    </>}

    <footer className="amber-bottom">
      <div className="amber-instructions"><span><kbd>W A S D</kbd> Move</span><span><kbd>MOUSE</kbd> Look</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>E</kbd> Interact</span><span><kbd>R</kbd> Reset position</span><span><kbd>ESC</kbd> Cursor</span></div>
      <button className="amber-reset" onClick={() => sceneRef.current?.home()} title="Return upstairs (R)">Return upstairs ↗</button>
    </footer>
    {showMap && !panel && <MiniMap status={status} />}
    {presence.message && <div className="amber-presence-note" role="status">{presence.message}</div>}
    <PlayerList enabled={!welcome && !panel && !error} presence={presence} user={user} balance={balance} />
    {error && <div className="amber-error" role="alert"><h2>A moment, please.</h2><p>{error}</p><button className="amber-pill" onClick={() => window.location.reload()}>Reload</button> <Link to="/lobby">Open classic casino</Link></div>}

    {panel === 'directory' && <Dialog title="The collection" onClose={closePanel}>
      <p className="amber-modal-intro">Four ways to make an evening. Find a station upstairs, or take a seat right here.</p>
      <div className="amber-directory">{layout.stations.map((s, i) => <button key={s.id} onClick={() => openGameRef.current(s.game)} style={{ '--station-color': s.color }}><span className="amber-game-number">0{i + 1}</span><span><strong>{s.name}</strong><small>{s.description}</small></span><span>↗</span></button>)}</div>
      <p className="amber-caption">The tables open the original game screens. Fully 3D games are coming in a later chapter.</p>
    </Dialog>}
    {panel === 'auth' && <Dialog title="Welcome to the house" onClose={closePanel}>
      <AuthPage onAuth={(u, t) => { onAuth(u, t); setPanel(activeGame ? 'game' : null); }} />
      <p className="amber-caption">You can explore the building without an account. Sign in to play.</p>
    </Dialog>}
    {panel === 'game' && Game && <Dialog title={gameNames[activeGame]} onClose={closePanel} large>
      <Suspense fallback={<p className="amber-caption">Preparing your table…</p>}><Game balance={balance} setBalance={setBalance} token={token} /></Suspense>
    </Dialog>}
    {panel === 'account' && <Dialog title={`Good evening, ${user?.username || 'guest'}`} onClose={closePanel}>
      <div className="amber-account"><p>Your balance</p><h3>${Number(balance).toFixed(2)}</h3><Link to="/lobby">Open classic casino ↗</Link>{user?.is_admin && <Link to="/admin">Admin dashboard ↗</Link>}<button className="amber-pill" onClick={() => { closePanel(); onLogout(); }}>Sign out</button></div>
    </Dialog>}
  </main>;
}
