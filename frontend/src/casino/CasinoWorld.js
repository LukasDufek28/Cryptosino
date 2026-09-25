import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthPage from '../AuthPage';
import createScene from './createScene';
import usePresence from './usePresence';
import PlayerList from './PlayerList';
import useLeaderboard from './useLeaderboard';
import useTradingMarket from './useTradingMarket';
import TradingDesk from './TradingDesk';
import useSlotMachines from './useSlotMachines';
import useBlackjackTable from './useBlackjackTable';
import layout from './worldLayout.json';
import casinoVersion from './version.json';
import { LOCAL_DEMO } from './demoCasino';
import './CasinoWorld.css';

const games = {
  slots: lazy(() => import('../SlotsGame')),
  blackjack: lazy(() => import('../BlackjackGame')),
  dice: lazy(() => import('../DiceGame')),
  crash: lazy(() => import('../CrashGame'))
};
const gameNames = { slots: 'Golden reels', blackjack: 'The twenty-one club', dice: 'Lucky pair', crash: 'Skyline' };
const API_URL = process.env.REACT_APP_API_URL || '';

function MiniMap({ status }) {
  return <div className="amber-map" aria-label={`Floor ${status.floor} map`}>
    <div className="amber-map-title"><span>YOU ARE HERE</span><span>0{status.floor}</span></div>
    <svg viewBox={status.floor === 1 ? '-16 -12 64 46' : '-16 -12 32 25'} role="img" aria-label="Your position in the casino district">
      <rect x="-14" y="-10" width="28" height="20" rx="0.6" fill="#eddcb9" opacity="0.12" stroke="#d7b875" strokeWidth="0.25" />
      <path d="M-9.5 -3.5V7.5H-13.3V-3.5Z" fill="#d7b875" opacity="0.2" />
      {status.floor === 2 && <>
        {layout.stations.map(s => <rect key={s.id} x={s.x - 1.1} y={s.z - 0.7} width="2.2" height="1.4" rx="0.3" fill={s.color} />)}
        {layout.seats.map(s => <rect key={s.id} x={s.x - 1.7} y={s.z - 0.5} width="3.4" height="1" rx="0.3" fill="#c58d65" />)}
      </>}
      {status.floor === 1 && <><rect x="18" y="-10" width="18" height="20" fill="#71a796" opacity="0.3" stroke="#d7b875" strokeWidth="0.3"/><text x="27" y="0" textAnchor="middle" fill="#ffe4ac" fontSize="2">EXCHANGE</text><path d="M-14 22H46" stroke="#9ebcb5" strokeWidth="3" opacity="0.3" /></>}
      <path d="M-14 10.5H36" stroke="#9ebcb5" strokeWidth="0.35" />
      <g transform={`translate(${Math.max(-14, Math.min(status.floor === 1 ? 46 : 14, status.x))} ${Math.max(-10, Math.min(status.floor === 1 ? 32 : 11, status.z))}) rotate(${-status.yaw * 180 / Math.PI})`}>
        <path d="M0 -1.15L0.65 0.7L0 0.35L-0.65 0.7Z" fill="#ffe4ac" />
      </g>
    </svg>
    <div className="amber-map-foot">{status.floor === 2 ? 'Casino & window lounge' : 'Casino · Street · Exchange'}</div>
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
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [receptionMessage, setReceptionMessage] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const openGameRef = useRef(null);
  const openSlotRef = useRef(null);
  const blackjackRef = useRef(null);
  const resetBalanceRef = useRef(null);
  const resetBusyRef = useRef(false);
  openGameRef.current = game => {
    if (game === 'blackjack') {
      setActiveGame(null); setPanel(null);
      if (!token && !LOCAL_DEMO) setPanel('auth');
      else blackjackRef.current?.claim?.();
      return;
    }
    setActiveGame(game);
    if (game === 'trading') setPanel(token && user ? 'trading' : 'auth');
    else setPanel(LOCAL_DEMO || (token && user) ? 'game' : 'auth');
  };
  resetBalanceRef.current = async () => {
    if (LOCAL_DEMO && !token) { setBalance(1000); setReceptionMessage('Demo balance restored to $1,000.'); return; }
    if (!token) { setActiveGame(null); setPanel('auth'); return; }
    if (Number(balance) >= 1000) return;
    if (resetBusyRef.current) return;
    resetBusyRef.current = true;
    try {
      const response = await fetch(`${API_URL}/api/reset-balance`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setBalance(Number(data.balance));
        setReceptionMessage('The receptionist restored your balance to $1,000.');
      } else if (response.status === 400) {
        setReceptionMessage('');
      } else {
        setReceptionMessage(data.error || 'The receptionist is unavailable right now.');
      }
    } catch {
      setReceptionMessage('The receptionist cannot reach the casino server right now.');
    } finally {
      resetBusyRef.current = false;
    }
  };
  useEffect(() => {
    let instance;
    try {
      instance = createScene(host.current, { onGame: game => openGameRef.current(game), onSlot: id => openSlotRef.current?.(id), onResetBalance: () => resetBalanceRef.current(), onStatus: next => setStatus(previous =>
        previous.floor === next.floor && previous.prompt === next.prompt && previous.locked === next.locked &&
        Math.abs(previous.x - next.x) < 0.15 && Math.abs(previous.z - next.z) < 0.15 && Math.abs(previous.yaw - next.yaw) < 0.05 ? previous : next
      ), onSeat: id => { setSeat(id); blackjackRef.current?.onSeatChange?.(id); }, onStats: setStats, onError: setError });
      sceneRef.current = instance; setReady(true);
    } catch {
      setError('The 3D room could not start. Enable hardware acceleration and use a browser with WebGL 2 support.');
    }
    return () => { instance?.dispose(); sceneRef.current = null; };
  }, []);
  const presence = usePresence(token, sceneRef, ready);
  useLeaderboard(sceneRef, ready);
  const tradingMarket = useTradingMarket(sceneRef, ready);
  const slots = useSlotMachines(sceneRef, ready, token, setBalance, balance);
  const blackjack = useBlackjackTable(sceneRef, ready, token, setBalance, balance);
  blackjackRef.current = blackjack;
  openSlotRef.current = id => { if (!token && !LOCAL_DEMO) { setActiveGame(null); setPanel('auth'); } else slots.claim(id); };
  // Signing out also closes any retained authenticated game screen.
  useEffect(() => { if (!token && !LOCAL_DEMO) setPanel(current => ['game', 'trading'].includes(current) ? null : current); }, [token]);
  useEffect(() => { sceneRef.current?.setEnabled(!welcome && !panel && !chatOpen && !error); }, [welcome, panel, chatOpen, error, ready]);
  useEffect(() => { sceneRef.current?.setStatsVisible(showStats); if (!showStats) setStats(null); }, [showStats, ready]);
  useEffect(() => {
    const toggleStats = event => {
      if (event.code !== 'KeyI' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
          event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      event.preventDefault(); setShowStats(value => !value);
    };
    document.addEventListener('keydown', toggleStats);
    return () => document.removeEventListener('keydown', toggleStats);
  }, []);
  useEffect(() => {
    const openChat = event => {
      if (event.code !== 'KeyT' || event.ctrlKey || event.metaKey || event.altKey || welcome || panel || chatOpen || error ||
          event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      event.preventDefault(); setChatText(''); setChatOpen(true);
    };
    document.addEventListener('keydown', openChat);
    return () => document.removeEventListener('keydown', openChat);
  }, [welcome, panel, chatOpen, error]);
  useEffect(() => { if (LOCAL_DEMO && !user && Number(balance) <= 0) setBalance(1000); }, [user, balance, setBalance]);
  const closePanel = useCallback(() => setPanel(null), []);
  const start = () => { setWelcome(false); sceneRef.current?.setEnabled(true); sceneRef.current?.lock(); };
  const Game = activeGame ? games[activeGame] : null;
  const openDirectory = () => { setWelcome(false); setPanel('directory'); };

  return <main className="amber-world">
    <div className="amber-canvas" ref={host} />
    <div className="amber-vignette" />
    <header className="amber-topbar">
      <div className="amber-brand"><span className="amber-brand-mark">A<span>H</span></span><div><strong>THE AMBER HOUSE</strong><small>A CRYPTOSINO ADDRESS · PATCH {casinoVersion.version}</small></div></div>
      <nav aria-label="Casino navigation">
        <button className="amber-nav-button" onClick={openDirectory}>The collection <span>↗</span></button>
        <button className="amber-icon-button" onClick={() => setShowMap(v => !v)} aria-label="Toggle floor map" aria-pressed={showMap}>⌖</button>
        {user ? <><span className="amber-wallet">${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><button className="amber-nav-button" onClick={() => setPanel('account')}>{user.username}</button></>
          : <>{LOCAL_DEMO && <span className="amber-wallet">DEMO ${Number(balance).toFixed(2)}</span>}<button className="amber-pill" onClick={() => { setWelcome(false); setPanel('auth'); }}>Sign in <span>↗</span></button></>}
      </nav>
    </header>
    <div className="amber-location"><span className="amber-live-dot"/><span>{presence.mode === 'shared' ? `${presence.count} guests · ${presence.role === 'host' ? 'You are hosting' : 'Browser hosted'} · 30 ms send interval` : 'Your evening, your pace'}</span><span className="amber-location-divider">/</span><span>GOLDEN HOUR</span></div>
    {showStats && <aside className="amber-debug-stats" aria-label="Performance statistics">
      <strong>PERFORMANCE <kbd>I</kbd></strong>
      {stats ? <>
        <div><span>FPS</span><b>{stats.fps}</b></div>
        <div><span>Frame CPU</span><b>{stats.frameMs.toFixed(1)} ms avg · {stats.worstMs.toFixed(1)} worst</b></div>
        <div><span>Draw calls</span><b>{stats.calls}</b></div>
        <div><span>Triangles</span><b>{stats.triangles.toLocaleString()}</b></div>
        <div><span>GPU resources</span><b>{stats.geometries} geo · {stats.textures} tex</b></div>
        <div><span>Resolution</span><b>{stats.width} × {stats.height} · {stats.pixelRatio.toFixed(1)}×</b></div>
        <div><span>Scene</span><b>Floor {stats.floor} · {stats.peers} guests</b></div>
      </> : <span>Collecting one second of frames…</span>}
      <small>Frame CPU excludes browser compositing and GPU wait. Record FPS in the same location before comparing.</small>
    </aside>}

    {welcome && !error && <section className="amber-welcome">
      <div className="amber-welcome-crest" aria-hidden="true"><span>A</span><span>H</span></div>
      <div className="amber-eyebrow">EST. 2026 <span className="amber-welcome-dot">✦</span> OPEN FOR AN EVENING</div>
      <h1>Your evening<br/><em>begins here.</em></h1>
      <button className="amber-enter" onClick={start} disabled={!ready}>
        <span>{ready ? 'Enter The Amber House' : 'Opening the doors…'}</span>
        <span className="amber-enter-light" aria-hidden="true" />
      </button>
    </section>}

    {!welcome && !panel && !error && <>
      {!blackjack.active && <div className="amber-reticle" aria-hidden="true">·</div>}
      <div className="amber-floor-label"><span>0{status.floor}</span><div><small>{status.floor === 2 ? 'UPSTAIRS' : 'GROUND FLOOR'}</small><strong>{status.floor === 2 ? 'The casino & lounge' : 'The welcome hall'}</strong></div></div>
      {status.prompt && <button className="amber-interact" onClick={() => sceneRef.current?.interact()}><kbd>E</kbd>{status.prompt}<span>↗</span></button>}
      {seat && !slots.selected && !blackjack.active && <div className="amber-seated">Take your time. Watch the city go by.</div>}
      {!status.locked && !blackjack.active && <button className="amber-resume" onClick={() => sceneRef.current?.lock()}>Click the scene to look around · or drag</button>}
      {!blackjack.active && <div className="amber-mobile-controls" aria-label="Movement controls">
        {[[0, 1, '↑'], [-1, 0, '←'], [0, -1, '↓'], [1, 0, '→']].map(([x, y, label]) => <button key={label} aria-label={`Move ${label}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); sceneRef.current?.move(x, y); }} onPointerUp={() => sceneRef.current?.move(0, 0)} onPointerCancel={() => sceneRef.current?.move(0, 0)} onLostPointerCapture={() => sceneRef.current?.move(0, 0)}>{label}</button>)}
      </div>}
    </>}

    <footer className="amber-bottom">
      <div className="amber-instructions">{blackjack.active ? <><span><kbd>MOUSE</kbd> Select</span><span><kbd>E</kbd> Leave table</span><span><kbd>I</kbd> Stats</span></> : <><span><kbd>W A S D</kbd> Move</span><span><kbd>MOUSE</kbd> Look</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>E</kbd> Interact</span><span><kbd>T</kbd> Chat</span><span><kbd>R</kbd> Reset position</span><span><kbd>I</kbd> Stats</span><span><kbd>ESC</kbd> Cursor</span></>}</div>
      <button className="amber-reset" onClick={() => sceneRef.current?.home()} title="Return upstairs (R)">Return upstairs ↗</button>
    </footer>
    {showMap && !panel && <MiniMap status={status} />}
    {presence.message && <div className="amber-presence-note" role="status">{presence.message}</div>}
    {receptionMessage && <div className="amber-reception-note" role="status">{receptionMessage}<button aria-label="Dismiss receptionist message" onClick={() => setReceptionMessage('')}>×</button></div>}
    {chatOpen && <form className="amber-chat-compose" onSubmit={event => {
      event.preventDefault(); sceneRef.current?.chat(chatText); setChatOpen(false); setChatText('');
      requestAnimationFrame(() => sceneRef.current?.lock());
    }}>
      <input autoFocus maxLength={100} value={chatText} onChange={event => setChatText(event.target.value)} onKeyDown={event => {
        if (event.code === 'Escape') { event.preventDefault(); setChatOpen(false); setChatText(''); requestAnimationFrame(() => sceneRef.current?.lock()); }
      }} placeholder="Say something…" aria-label="Chat message" />
      <span>{chatText.length}/100</span><button type="submit" disabled={!chatText.trim()}>Send</button>
    </form>}
    <PlayerList enabled={!welcome && !panel && !chatOpen && !error} presence={presence} user={user} balance={balance} sceneRef={sceneRef} />
    {error && <div className="amber-error" role="alert"><h2>A moment, please.</h2><p>{error}</p><button className="amber-pill" onClick={() => window.location.reload()}>Reload</button> <Link to="/lobby">Open classic casino</Link></div>}

    {panel === 'directory' && <Dialog title="The collection" onClose={closePanel}>
      <p className="amber-modal-intro">Four ways to make an evening. Find a station upstairs, or take a seat right here.</p>
      <div className="amber-directory">{layout.stations.map((s, i) => <button key={s.id} onClick={() => openGameRef.current(s.game)} style={{ '--station-color': s.color }}><span className="amber-game-number">0{i + 1}</span><span><strong>{s.name}</strong><small>{s.description}</small></span><span>↗</span></button>)}</div>
      <p className="amber-caption">For market-referenced trading, leave through reception and enter Amber Exchange next door: on your right when facing the casino from the street. Press E at a trading terminal.</p>
    </Dialog>}
    {panel === 'auth' && <Dialog title="Welcome to the house" onClose={closePanel}>
      <AuthPage onAuth={(u, t) => { onAuth(u, t); setPanel(activeGame === 'trading' ? 'trading' : activeGame ? 'game' : null); }} />
      <p className="amber-caption">You can explore the building without an account. Sign in to play.</p>
    </Dialog>}
    {panel === 'game' && Game && <Dialog title={gameNames[activeGame]} onClose={closePanel} large>
      <Suspense fallback={<p className="amber-caption">Preparing your table…</p>}><Game balance={balance} setBalance={setBalance} token={token} /></Suspense>
    </Dialog>}
    {panel === 'trading' && token && user && <Dialog title="Amber Exchange · Trading terminal" onClose={closePanel} large>
      <TradingDesk key={user.id} token={token} user={user} marketFeed={tradingMarket} setBalance={setBalance} />
    </Dialog>}
    {panel === 'account' && <Dialog title={`Good evening, ${user?.username || 'guest'}`} onClose={closePanel}>
      <div className="amber-account"><p>Your balance</p><h3>${Number(balance).toFixed(2)}</h3><Link to="/lobby">Open classic casino ↗</Link>{user?.is_admin && <Link to="/admin">Admin dashboard ↗</Link>}<button className="amber-pill" onClick={() => { closePanel(); onLogout(); }}>Sign out</button></div>
    </Dialog>}
  </main>;
}
