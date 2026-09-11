import React, { useState, useRef } from 'react';
import './CrashGame.css';

const API_URL = process.env.REACT_APP_API_URL || '';

// ── Crash Graph ───────────────────────────────────────────────
function CrashGraph({ history, gameState, crashAt }) {
  const W = 480, H = 200;
  const PAD_L = 42, PAD_B = 28, PAD_T = 12, PAD_R = 16;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const max = Math.max(...history, 2);
  const gridVals = [];
  for (let i = 1; i <= Math.ceil(max); i++) gridVals.push(i);

  const xOf = (i) => PAD_L + (i / (history.length - 1 || 1)) * innerW;
  const yOf = (v) => PAD_T + innerH - ((v - 1) / (max - 1 || 1)) * innerH;

  // Smooth the line by sampling 80 points
  const N = Math.min(80, history.length);
  const pts = [];
  for (let i = 0; i < N; i++) {
    const idx = (i / (N - 1)) * (history.length - 1);
    const l = Math.floor(idx), r = Math.ceil(idx), t = idx - l;
    const v = l === r ? history[l] : history[l] * (1 - t) + history[r] * t;
    pts.push({ x: xOf(idx), y: yOf(v), v });
  }

  const lineColor =
    gameState === 'crashed' ? '#ef4444' :
    gameState === 'cashed'  ? '#06d6a0' : '#10b981';

  const gradId = `cg-${gameState}`;
  const lastPt = pts[pts.length - 1] || { x: PAD_L, y: yOf(1) };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', margin: '0 auto', maxWidth: W }}
      className="crash-svg"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
        <clipPath id="graphClip">
          <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} />
        </clipPath>
      </defs>

      {/* Grid */}
      {gridVals.map(g => {
        const y = yOf(g);
        return (
          <g key={g}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4,4" />
            <text x={PAD_L - 6} y={y + 4} fontSize="11" fill="#374151"
              textAnchor="end" style={{ userSelect: 'none', fontFamily: 'monospace' }}>
              {g}x
            </text>
          </g>
        );
      })}

      {/* X axis */}
      <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B}
        stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B}
        stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {/* Fill area */}
      {pts.length > 1 && (
        <polygon
          clipPath="url(#graphClip)"
          fill={`url(#${gradId})`}
          points={[
            `${pts[0].x},${H - PAD_B}`,
            ...pts.map(p => `${p.x},${p.y}`),
            `${lastPt.x},${H - PAD_B}`
          ].join(' ')}
        />
      )}

      {/* Line */}
      {pts.length > 1 && (
        <polyline
          clipPath="url(#graphClip)"
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pts.map(p => `${p.x},${p.y}`).join(' ')}
        />
      )}

      {/* Dot + label at end */}
      {pts.length > 0 && (
        <g>
          <circle cx={lastPt.x} cy={lastPt.y} r="5" fill={lineColor}
            style={{ filter: `drop-shadow(0 0 6px ${lineColor})` }} />
          {lastPt.x < W - PAD_R - 40 && (
            <text x={lastPt.x + 10} y={lastPt.y + 4} fontSize="12"
              fill={lineColor} fontWeight="bold" style={{ userSelect: 'none' }}>
              {lastPt.v.toFixed(2)}x
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

// ── History Chips ─────────────────────────────────────────────
function HistoryChips({ items }) {
  if (!items.length) return null;
  return (
    <div className="crash-history-row">
      {items.slice(-10).reverse().map((v, i) => (
        <span
          key={i}
          className={`crash-chip${v < 2 ? ' chip-low' : v < 5 ? ' chip-mid' : ' chip-high'}`}
        >
          {v.toFixed(2)}x
        </span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
function CrashGame({ balance, setBalance, token }) {
  const [bet, setBet] = useState('10');
  const [gameState, setGameState] = useState('waiting');
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashAt, setCrashAt] = useState(null);
  const [cashoutAt, setCashoutAt] = useState(null);
  const [finalRevealed, setFinalRevealed] = useState(false);
  const [message, setMessage] = useState('');
  const [clientSeed] = useState('');
  const [nonce, setNonce] = useState(0);
  const [multiplierHistory, setMultiplierHistory] = useState([1.00]);
  const [roundHistory, setRoundHistory] = useState([]);
  const [betId, setBetId] = useState(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const revealTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(revealTimeoutRef.current);
    };
  }, []);

  const adjBet = (fn) => setBet(v => String(fn(Number(v) || 0)));

  const handleStart = async () => {
    const wager = Number(bet);
    if (!wager || wager <= 0 || wager > balance) { setMessage('Invalid bet amount!'); return; }
    let seed = clientSeed || Math.random().toString(36).substring(2);
    let crashPoint = null, newNonce = null;

    if (token) {
      try {
        const res = await fetch(`${API_URL}/api/crash/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ bet: wager, clientSeed: seed })
        });
        const data = await res.json();
        if (!res.ok) { setMessage(data.error || 'Crash start failed'); return; }
        crashPoint = data.crashMultiplier;
        newNonce = data.nonce;
        setBalance(Number(data.newBalance));
        setBetId(data.betId);
      } catch { setMessage('Network error'); return; }
    } else {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      newNonce = arr[0];
      try {
        const res = await fetch(`${API_URL}/api/crash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientSeed: seed, nonce: newNonce })
        });
        const data = await res.json();
        crashPoint = data.crashMultiplier;
        setBalance(prev => Number((prev - wager).toFixed(2)));
      } catch { setMessage('Network error'); return; }
    }

    if (!mountedRef.current) return;
    setNonce(newNonce);
    setCrashAt(crashPoint < 1.01 ? 1.01 : crashPoint);
    setMultiplier(1.00);
    setGameState('running');
    setCashoutAt(null);
    setFinalRevealed(false);
    setMessage('');
    setMultiplierHistory([1.00]);
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const next = Number((1.01 * Math.exp(0.10 * elapsed)).toFixed(4));
      setMultiplier(next);
      setMultiplierHistory(h => [...h, next]);
      if (next >= (crashPoint < 1.01 ? 1.01 : crashPoint)) {
        clearInterval(intervalRef.current);
        setGameState('crashed');
        // Keep the predetermined result private until the animation reaches it.
        setFinalRevealed(true);
      }
    }, 50);
  };

  const handleCashout = async () => {
    if (gameState !== 'running') return;
    clearInterval(intervalRef.current);
    setGameState('cashed');
    setCashoutAt(multiplier);
    if (token) {
      try {
        const res = await fetch(`${API_URL}/api/crash/cashout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ betId, atMultiplier: multiplier })
        });
        const data = await res.json();
        if (res.ok) {
          if (data.newBalance) setBalance(Number(data.newBalance));
          if (data.crashMultiplier) setCrashAt(data.crashMultiplier);
          if (data.payout) {
            setMessage(`💰 Cashed at ${multiplier.toFixed(2)}x — Payout: $${Number(data.payout).toFixed(2)}`);
          }
        } else { setMessage(data.error || 'Cashout failed'); }
      } catch {}
    } else {
      const payout = (Number(bet) * multiplier).toFixed(2);
      setBalance(prev => Number((prev + Number(payout)).toFixed(2)));
    }
    if (!mountedRef.current) return;
    revealTimeoutRef.current = setTimeout(() => {
      setFinalRevealed(true);
      const cp = crashAt;
      if (cp > multiplier) setMessage(`✅ Cashed at ${multiplier.toFixed(2)}x | Crashed at ${cp.toFixed(2)}x — Good call!`);
      else setMessage(`💥 Cashed at ${multiplier.toFixed(2)}x | Crashed at ${cp?.toFixed(2)}x`);
    }, 700);
  };

  React.useEffect(() => {
    if (gameState === 'crashed' || gameState === 'cashed') {
      if (crashAt) setRoundHistory(h => [...h, crashAt]);
      const t = setTimeout(() => {
        setGameState('waiting');
        setMultiplier(1.00);
        setCrashAt(null); setCashoutAt(null);
        setMessage(''); setMultiplierHistory([1.00]);
        setFinalRevealed(false); setBetId(null);
      }, 3200);
      return () => clearTimeout(t);
    }
  }, [gameState, crashAt]);

  const multClass = `crash-multiplier${
    gameState === 'running' ? ' green' :
    gameState === 'crashed' ? ' red' :
    gameState === 'cashed'  ? ' blue' : ''
  }`;

  const dispVal = gameState === 'waiting' ? null
    : gameState === 'running' ? multiplier
    : gameState === 'crashed' ? crashAt
    : finalRevealed ? crashAt : cashoutAt;

  return (
    <div className="crash-container">
      {/* Header */}
      <div className="crash-header">
        <div>
          <div className="crash-title">CRASH</div>
          <div className="crash-subtitle">Cash out before it crashes</div>
        </div>
        <div className="crash-balance-badge">
          <span className="crash-bal-label">Balance</span>
          <span className="crash-bal-value">${balance.toFixed(2)}</span>
        </div>
      </div>

      {/* Round History */}
      <HistoryChips items={roundHistory} />

      {/* Multiplier + Graph */}
      <div className="crash-display-area">
        <div className={multClass}>
          {gameState === 'waiting'
            ? <span className="crash-waiting-text">Waiting…</span>
            : <>{dispVal?.toFixed(2)}<span className="crash-x">x</span></>
          }
        </div>
        {gameState !== 'waiting' && multiplierHistory.length > 1 && (
          <CrashGraph
            history={multiplierHistory}
            gameState={gameState}
            crashAt={crashAt}
          />
        )}
      </div>

      {/* Bet Controls */}
      <div className="crash-controls">
        <div className="crash-bet-row">
          <div className="crash-input-wrap">
            <label className="crash-label">BET AMOUNT</label>
            <div className="crash-input-group">
              <span className="crash-input-prefix">$</span>
              <input
                className="crash-input"
                type="text"
                inputMode="decimal"
                value={bet}
                disabled={gameState !== 'waiting'}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '') { setBet(''); return; }
                  if (/^\d*(?:\.\d{0,2})?$/.test(v)) setBet(v);
                }}
                onBlur={() => {
                  if (bet === '' || Number(bet) <= 0) setBet('10');
                  else setBet(String(Number(bet)));
                }}
              />
            </div>
          </div>
          {gameState === 'waiting' && (
            <div className="crash-quick-bet">
              <button onClick={() => adjBet(v => Math.max(1, Math.floor(v / 2)))}>½</button>
              <button onClick={() => adjBet(v => Math.min(balance, v * 2))}>2×</button>
              <button onClick={() => setBet(String(balance))}>MAX</button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="crash-btn-area">
          {gameState === 'waiting' && (
            <button className="crash-main-btn start" onClick={handleStart}>
              Place Bet & Launch 🚀
            </button>
          )}
          {gameState === 'running' && (
            <button className="crash-main-btn cashout" onClick={handleCashout}>
              Cash Out at {multiplier.toFixed(2)}x 💰
            </button>
          )}
          {gameState === 'crashed' && (
            <button className="crash-main-btn crashed" disabled>
              💥 Crashed at {crashAt?.toFixed(2)}x
            </button>
          )}
          {gameState === 'cashed' && (
            <button className="crash-main-btn cashed" disabled>
              ✅ Cashed Out at {cashoutAt?.toFixed(2)}x
            </button>
          )}
        </div>
      </div>

      {/* Message */}
      {message && <div className="crash-message">{message}</div>}

      {/* Provable Fairness */}
      {finalRevealed && crashAt && (
        <div className="crash-fairness">
          <span>Nonce: <b>{nonce}</b></span>
          <span>Crash: <b>{crashAt?.toFixed(4)}x</b></span>
        </div>
      )}
    </div>
  );
}

export default CrashGame;
