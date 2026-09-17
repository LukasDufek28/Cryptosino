import React, {
  useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle,
} from 'react';
import './SlotsGame.css';
import configs from './slots/config.json';

const API_URL = process.env.REACT_APP_API_URL || '';

// ─── Symbol definitions (icon + colour) ─────────────────────────────────────
const SYMBOL_DEFS = {
  joker: {
    JOKER:  { icon: '🃏', label: 'JOKER',  color: '#f0b429' },
    BELL:   { icon: '🔔', label: 'BELL',   color: '#fbbf24' },
    CHERRY: { icon: '🍒', label: 'CHERRY', color: '#f87171' },
    LEMON:  { icon: '🍋', label: 'LEMON',  color: '#facc15' },
    ORANGE: { icon: '🍊', label: 'ORANGE', color: '#fb923c' },
    PLUM:   { icon: '🟣', label: 'PLUM',   color: '#c084fc' },
    GRAPES: { icon: '🍇', label: 'GRAPES', color: '#a78bfa' },
    MELON:  { icon: '🍉', label: 'MELON',  color: '#10b981' },
  },
  golden: {
    BOOK:   { icon: '📖', label: 'BOOK',   color: '#f0b429' },
    ACE:    { icon: 'A',  label: 'ACE',    color: '#a78bfa' },
    KING:   { icon: 'K',  label: 'KING',   color: '#60a5fa' },
    QUEEN:  { icon: 'Q',  label: 'QUEEN',  color: '#f472b6' },
    JACK:   { icon: 'J',  label: 'JACK',   color: '#34d399' },
    TEN:    { icon: '10', label: '10',     color: '#9ca3af' },
    SCARAB: { icon: '🪲', label: 'SCARAB', color: '#10b981' },
  },
};

const PAYTABLE = Object.fromEntries(Object.entries(configs).map(([variant, config]) => [variant,
  Object.entries(config.paytable).map(([symbol, pays]) => ({ symbol,
    pays: pays.map((mult, n) => ({ n, mult })).filter(pay => pay.mult > 0) }))]));

// Payline definitions (mirror of server) for client-side win highlighting
const PAYLINES_CLIENT = {
  joker:  [],
  golden: [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
    [0,1,2,1,0],[2,1,0,1,2],
    [1,0,0,0,1],[1,2,2,2,1],
    [0,0,1,2,2],[2,2,1,0,0],
    [1,0,1,2,1],
  ],
};

const NUM_REELS    = { joker: 4, golden: 5 };
const CELL_H       = 72;    // px – one symbol cell height
const LOOP_ROWS    = 22;    // random rows above the result in the strip
const SPIN_PX      = 20;    // px moved per animation frame (~1200 px/s @60fps)
const LOOP_RESET_Y = -3  * CELL_H;
const LOOP_GUARD_Y = -(LOOP_ROWS - 5) * CELL_H;
const LAND_TARGET  = -(LOOP_ROWS * CELL_H);
const MIN_SPIN_MS  = 1300;  // minimum visual spin time
const REEL_GAP_MS  = 380;   // stagger between reel stops
const LAND_DUR_MS  = 680;   // CSS landing transition ms

// ─── Symbol cell renderer ─────────────────────────────────────────────────────
function SymCell({ sym, def, isWin }) {
  const isSpecial = sym === 'JOKER' || sym === 'BOOK';
  const isCard    = ['ACE','KING','QUEEN','JACK','TEN'].includes(sym);
  return (
    <div className={`slots-cell${isWin ? ' win-cell' : ''}`}>
      <span
        className={`slots-sym${isSpecial ? ' special' : ''}${isWin ? ' win-sym' : ''}`}
        style={{ '--sc': def.color }}
      >
        {sym === '7'
          ? <span className="slots-seven" style={{ color: def.color }}>7</span>
          : sym === 'BAR'
            ? <span className="slots-bar">BAR</span>
            : isCard
              ? <span className="slots-card-sym" style={{ color: def.color }}>{def.icon}</span>
              : def.icon}
      </span>
    </div>
  );
}

// ─── Single reel (imperative API via forwardRef) ─────────────────────────────
const SlotReel = forwardRef(function SlotReel({ variant, winRows, locked }, ref) {
  const defs    = SYMBOL_DEFS[variant];
  const symKeys = Object.keys(defs);

  const innerRef   = useRef(null);
  const outerRef   = useRef(null);
  const rAFRef     = useRef(null);
  const phaseRef   = useRef('idle');   // 'idle' | 'spinning' | 'landing'
  const yRef       = useRef(0);
  const stopTimRef = useRef(null);

  const makeStrip = useCallback((finals = null) => {
    const s = Array.from({ length: LOOP_ROWS + 3 },
      () => symKeys[Math.floor(Math.random() * symKeys.length)]);
    if (finals) {
      s[LOOP_ROWS]     = finals[0];
      s[LOOP_ROWS + 1] = finals[1];
      s[LOOP_ROWS + 2] = finals[2];
    }
    return s;
  }, [variant]); // eslint-disable-line react-hooks/exhaustive-deps

  const [strip, setStrip] = useState(() => makeStrip());

  // Direct DOM helpers — avoid React re-renders inside the rAF loop
  const applyTransform = (y, blurPx = 0) => {
    if (!innerRef.current) return;
    innerRef.current.style.transform = `translateY(${y}px)`;
    innerRef.current.style.filter    = blurPx > 0 ? `blur(${blurPx.toFixed(1)}px)` : '';
  };
  const setTransition = (on) => {
    if (!innerRef.current) return;
    innerRef.current.style.transition = on
      ? `transform ${LAND_DUR_MS}ms cubic-bezier(0.22, 1.28, 0.36, 1)`
      : 'none';
  };

  const startSpinLoop = useCallback(() => {
    cancelAnimationFrame(rAFRef.current);
    const tick = () => {
      if (phaseRef.current !== 'spinning') return;
      yRef.current -= SPIN_PX;
      if (yRef.current < LOOP_GUARD_Y) yRef.current = LOOP_RESET_Y;
      applyTransform(yRef.current, 3.5);
      rAFRef.current = requestAnimationFrame(tick);
    };
    rAFRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── spin(): start the rAF scrolling animation ─────────────────────────────
  const spin = useCallback(() => {
    clearTimeout(stopTimRef.current);
    cancelAnimationFrame(rAFRef.current);
    phaseRef.current = 'spinning';
    yRef.current = 0;
    setStrip(makeStrip());
    requestAnimationFrame(() => {
      setTransition(false);
      applyTransform(0, 0);
      startSpinLoop();
    });
  }, [makeStrip, startSpinLoop]);

  // ── stop(finals, delayMs): decelerate and land on result ─────────────────
  const stop = useCallback((finals, delayMs = 0) => {
    clearTimeout(stopTimRef.current);
    stopTimRef.current = setTimeout(() => {
      cancelAnimationFrame(rAFRef.current);
      phaseRef.current = 'landing';
      // Patch result symbols into the end of the strip
      setStrip(prev => {
        const next = [...prev];
        next[LOOP_ROWS]     = finals[0];
        next[LOOP_ROWS + 1] = finals[1];
        next[LOOP_ROWS + 2] = finals[2];
        return next;
      });
      // Two rAF frames so React paints the new cells before we animate
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!innerRef.current) return;
        applyTransform(yRef.current, 0);
        setTransition(true);
        innerRef.current.style.transform = `translateY(${LAND_TARGET}px)`;
        yRef.current = LAND_TARGET;
        // Brief brightness flash on landing
        outerRef.current?.classList.add('reel-land-flash');
        setTimeout(() => outerRef.current?.classList.remove('reel-land-flash'), 260);
        setTimeout(() => {
          phaseRef.current = 'idle';
          setTransition(false);
        }, LAND_DUR_MS + 100);
      }));
    }, delayMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── reset(): return to idle (used on variant change / error) ─────────────
  const reset = useCallback(() => {
    clearTimeout(stopTimRef.current);
    cancelAnimationFrame(rAFRef.current);
    phaseRef.current = 'idle';
    yRef.current = 0;
    if (innerRef.current) {
      innerRef.current.style.transform  = 'translateY(0)';
      innerRef.current.style.filter     = '';
      innerRef.current.style.transition = 'none';
    }
    setStrip(makeStrip());
  }, [makeStrip]);

  useImperativeHandle(ref, () => ({ spin, stop, reset }), [spin, stop, reset]);

  // Re-init when variant switches
  useEffect(() => { reset(); }, [variant]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rAFRef.current);
    clearTimeout(stopTimRef.current);
  }, []);

  return (
    <div ref={outerRef} className={`slots-reel-outer${locked ? ' locked' : ''}`}>
      {locked && <div className="slots-lock-badge">🔒 LOCKED</div>}
      <div ref={innerRef} className="slots-reel-inner">
        {strip.map((sym, i) => {
          const def   = defs[sym] || { icon: sym, color: '#fff' };
          const isRes = i >= LOOP_ROWS;
          const row   = isRes ? i - LOOP_ROWS : -1;
          const isWin = row >= 0 && winRows && winRows.has(row);
          return (
            <SymCell key={i} sym={sym} def={def} isWin={isWin} />
          );
        })}
      </div>
    </div>
  );
});

// ─── Main game component ──────────────────────────────────────────────────────
export default function SlotsGame({ balance, setBalance, token }) {
  const [variant,      setVariant]      = useState('joker');
  const [bet,          setBet]          = useState('5');
  const [canSpin,      setCanSpin]      = useState(true);
  const [lockedReels,  setLockedReels]  = useState(new Set());
  const [winCells,     setWinCells]     = useState({});
  const [outcome,      setOutcome]      = useState(null);
  const [message,      setMessage]      = useState('');
  const [showRespin,   setShowRespin]   = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [autoSpin,     setAutoSpin]     = useState(false);
  const [recovering, setRecovering] = useState(false);
  const pendingRequest = useRef(null);

  const autoRef       = useRef(false);
  const spinRef       = useRef(null);
  const pendingTimers = useRef([]);

  const numReels = NUM_REELS[variant];

  // Grow stable ref array as needed (never shrink — old refs just go unused)
  const reelRefsArr = useRef([]);
  while (reelRefsArr.current.length < numReels) {
    reelRefsArr.current.push(React.createRef());
  }

  useEffect(() => { autoRef.current = autoSpin; }, [autoSpin]);
  useEffect(() => () => { pendingTimers.current.forEach(clearTimeout); }, []);

  // Reset visuals on variant change
  useEffect(() => {
    setOutcome(null); setWinCells({}); setMessage(''); setShowRespin(false);
    setLockedReels(new Set());
    reelRefsArr.current.forEach(r => r.current?.reset());
  }, [variant]);

  const buildWinCells = useCallback((res, v) => {
    const cells = {};
    (res.wins || []).forEach(w => {
      if (w.cells) {
        w.cells.forEach(({ reel, row }) => {
          if (!cells[reel]) cells[reel] = new Set();
          cells[reel].add(row);
        });
        return;
      }
      if (w.line < 0) return;
      const pl = PAYLINES_CLIENT[v][w.line];
      if (!pl) return;
      for (let ri = 0; ri < w.count; ri++) {
        if (!cells[ri]) cells[ri] = new Set();
        cells[ri].add(pl[ri]);
      }
    });
    return cells;
  }, []);

  const addTimer = (fn, ms) => {
    const t = setTimeout(fn, ms);
    pendingTimers.current.push(t);
    return t;
  };

  const handleSpin = useCallback(async () => {
    if (!canSpin) return;
    const wager = pendingRequest.current?.bet ?? Number(bet);
    if (!wager || wager <= 0) { setMessage('⚠ Enter a valid bet'); return; }
    if (!pendingRequest.current && wager > balance) { setMessage('⚠ Insufficient balance'); return; }
    pendingRequest.current ||= { bet: wager, variant, requestId: crypto.randomUUID() };

    setCanSpin(false);
    setOutcome(null); setWinCells({}); setMessage(''); setShowRespin(false);
    setLockedReels(new Set());
    pendingTimers.current = [];

    // Only the server settles money; a failed response is not evidence of a refund.

    // Start all reels spinning immediately
    for (let i = 0; i < numReels; i++) reelRefsArr.current[i]?.current?.spin();

    // Fetch result AND enforce minimum visual spin time in parallel
    let result;
    try {
      const [data] = await Promise.all([
        fetch(`${API_URL}/api/slots/spin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(pendingRequest.current),
          signal: AbortSignal.timeout(12000),
        }).then(async r => {
          const d = await r.json();
          if (!r.ok) { const error = new Error(d.error || 'Spin failed'); error.status = r.status; throw error; }
          return d;
        }),
        new Promise(resolve => setTimeout(resolve, MIN_SPIN_MS)),
      ]);
      result = data;
      pendingRequest.current = null; setRecovering(false);
    } catch (e) {
      if (e.status >= 400 && e.status < 500) pendingRequest.current = null;
      setRecovering(Boolean(pendingRequest.current));
      setMessage(pendingRequest.current ? 'Connection interrupted. Press Spin to recover the same round without another charge.' : e.message || 'Network error');
      setAutoSpin(false);
      for (let i = 0; i < numReels; i++) reelRefsArr.current[i]?.current?.reset();
      setCanSpin(true);
      return;
    }

    const phase1Finals = result.respin?.triggered ? result.initialVisible : result.visible;

    // Stop reels one by one with stagger
    for (let i = 0; i < numReels; i++) {
      reelRefsArr.current[i]?.current?.stop(phase1Finals[i], i * REEL_GAP_MS);
    }

    const phase1DoneMs = (numReels - 1) * REEL_GAP_MS + LAND_DUR_MS + 220;

    if (result.respin?.triggered) {
      addTimer(() => {
        setShowRespin(true);
        setLockedReels(new Set(result.respin.lockedReels));
        result.respin.respunReels.forEach(ri => reelRefsArr.current[ri]?.current?.spin());

        addTimer(() => {
          result.respin.respunReels.forEach((ri, idx) =>
            reelRefsArr.current[ri]?.current?.stop(result.visible[ri], idx * REEL_GAP_MS)
          );
          const respinDone =
            Math.max(0, result.respin.respunReels.length - 1) * REEL_GAP_MS + LAND_DUR_MS + 300;
          addTimer(() => showResult(result, variant), respinDone);
        }, 750);
      }, phase1DoneMs);
    } else {
      addTimer(() => showResult(result, variant), phase1DoneMs);
    }

    function showResult(res, v) {
      // Apply final balance only now — winnings land with the reels
      setBalance(Number(res.newBalance));
      setOutcome(res);
      setWinCells(buildWinCells(res, v));
      setLockedReels(new Set());
      const pay = Number(res.totalPayout);
      setMessage(pay > 0 ? `🎉 YOU WIN $${pay.toFixed(2)}!` : '');
      setCanSpin(true);
      if (autoRef.current) addTimer(() => { if (autoRef.current) spinRef.current?.(); }, 650);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpin, bet, balance, variant, token, setBalance, numReels, buildWinCells]);

  spinRef.current = handleSpin;

  useEffect(() => {
    if (autoSpin && canSpin) {
      const t = setTimeout(() => spinRef.current?.(), 400);
      return () => clearTimeout(t);
    }
  }, [autoSpin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`slots-container variant-${variant}`}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="slots-header">
        <div>
          <div className="slots-title">
            {variant === 'joker' ? '🃏 AMBER JOKER' : '📖 AMBER BOOK'}
          </div>
          <div className="slots-subtitle">
            {variant === 'joker'
              ? '4 Reels · 81 Ways · Joker Wild · Sticky Respins'
              : '5 Reels · 10 Paylines · Book Wild & Scatter'}
          </div>
        </div>
        <div className="slots-balance-badge">
          <span className="slots-bal-label">BALANCE</span>
          <span className="slots-bal-value">${balance.toFixed(2)}</span>
        </div>
      </div>

      {/* ── Variant tabs ────────────────────────────────────────────────── */}
      <div className="slots-tabs">
        {['joker','golden'].map(v => (
          <button key={v} className={`slots-tab${variant === v ? ' active' : ''}`}
            onClick={() => canSpin && !recovering && setVariant(v)} disabled={!canSpin || recovering}>
            {v === 'joker' ? '🃏 Amber Joker' : '📖 Amber Book'}
          </button>
        ))}
      </div>

      {/* ── Machine ─────────────────────────────────────────────────────── */}
      <div className="slots-machine">
        <div className="slots-line-badge">
          {variant === 'joker' ? '81 WAYS' : '10 PAYLINES'}
        </div>

        <div className={`slots-reels-wrap num-${numReels}`}>
          {/* Centre-row payline highlight */}
          <div className="slots-payline-row" />

          {Array.from({ length: numReels }, (_, ri) => (
            <SlotReel
              key={`${variant}-${ri}`}
              ref={reelRefsArr.current[ri]}
              variant={variant}
              winRows={winCells[ri]}
              locked={lockedReels.has(ri)}
            />
          ))}
        </div>

        {showRespin && (
          <div className="slots-respin-flash" key={String(showRespin)}>🔄 FREE RESPIN!</div>
        )}

        {message && (
          <div className={`slots-msg${message.startsWith('🎉') ? ' win' : ' err'}`} key={message}>
            {message}
          </div>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="slots-controls">
        <div className="slots-bet-box">
          <label className="slots-bet-label">BET AMOUNT</label>
          <div className="slots-bet-row">
            <input className="slots-bet-input" type="number" min="0.10" step="0.50"
              value={bet} onChange={e => setBet(e.target.value)} disabled={!canSpin} />
            <div className="slots-quick">
              <button onClick={() => setBet(v => String(Math.max(0.1, +(+v/2).toFixed(2))))}  disabled={!canSpin}>½</button>
              <button onClick={() => setBet(v => String(Math.min(balance, +(+v*2).toFixed(2))))} disabled={!canSpin}>2×</button>
              <button onClick={() => setBet(balance.toFixed(2))} disabled={!canSpin}>MAX</button>
            </div>
          </div>
          <div className="slots-bet-info">
            <span>{variant === 'joker' ? 'Ways: 81' : 'Lines: 10'}</span><span>{variant === 'joker' ? 'Bet is distributed across 81 ways' : 'Bet is split over 10 lines'}</span>
          </div>
        </div>

        <div className="slots-buttons">
          <button className={`slots-spin-btn${!canSpin ? ' busy' : ''}`}
            onClick={handleSpin} disabled={!canSpin}>
            {!canSpin ? '⏳ SPINNING…' : '🎰  SPIN'}
          </button>
          <button className={`slots-auto-btn${autoSpin ? ' on' : ''}`}
            onClick={() => setAutoSpin(a => !a)}>
            {autoSpin ? '⏹ STOP AUTO' : '▶▶ AUTO SPIN'}
          </button>
        </div>
      </div>

      {/* ── Paytable ────────────────────────────────────────────────────── */}
      <div className="slots-pt-section">
        <button className="slots-pt-toggle" onClick={() => setShowPaytable(p => !p)}>
          {showPaytable ? '▲ Hide Paytable' : '▼ Show Paytable'}
        </button>
        {showPaytable && (
          <div className="slots-pt">
            <div className="slots-pt-header"><span>Symbol</span><span>Payouts (× ways/line unit)</span></div>
            {PAYTABLE[variant].map(row => {
              const def = SYMBOL_DEFS[variant][row.symbol];
              return (
                <div key={row.symbol} className="slots-pt-row">
                  <span className="slots-pt-icon" style={{ color: def?.color }}>{def?.icon}</span>
                  <span className="slots-pt-name">{def?.label}</span>
                  <div className="slots-pt-pays">
                    {row.pays.map(p => (
                      <span key={p.n} className="slots-pt-entry">{p.n}× <b>{p.mult}x</b></span>
                    ))}
                  </div>
                </div>
              );
            })}
            {variant === 'joker' && (
              <p className="slots-pt-note">
                🃏 JOKER substitutes for every fruit across all 81 ways.<br />
                A win containing a new Joker sticks its full combination and grants another <b>free respin</b>. All round awards are added together.<br />
                Server-authoritative custom implementation; not provider-certified math.
              </p>
            )}
            {variant === 'golden' && (
              <p className="slots-pt-note">
                📖 BOOK is both wild and scatter.<br />
                3 · 4 · 5 BOOKs anywhere = <b>1× · 3× · 10×</b> total-bet bonus!<br />
                Custom rules · measured return 96.27% in a 1,000,000-round audit; not provider-certified RTP.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Last spin breakdown ──────────────────────────────────────────── */}
      {outcome && outcome.wins && outcome.wins.length > 0 && (
        <div className="slots-breakdown">
          <div className="slots-bd-title">Last Spin</div>
          {outcome.wins.map((w, i) => {
            const def = SYMBOL_DEFS[variant][w.symbol];
            return (
              <div key={i} className="slots-bd-row">
                <span className="slots-bd-icon" style={{ color: def?.color }}>{def?.icon}</span>
                <span className="slots-bd-desc">{w.count}× {def?.label}{w.scatter ? ' SCATTER' : ''}</span>
                <span className="slots-bd-mult">{w.mult}×</span>
                <span className="slots-bd-pay">+${Number(w.payout).toFixed(2)}</span>
              </div>
            );
          })}
          <div className="slots-bd-total">Total: <b>${Number(outcome.totalPayout).toFixed(2)}</b></div>
        </div>
      )}

    </div>
  );
}
