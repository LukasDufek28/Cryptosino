import React, { useState, useRef, useCallback, useEffect } from 'react';
import './DiceGame.css';

const API_URL = process.env.REACT_APP_API_URL;

// --- Stake-style Dice Track (result + animated needle + draggable threshold) ---
// threshold: the cutoff position on the 0-100 scale (preserved when toggling Under/Over)
function DiceTrack({ threshold, onChange, rollOver, result, rolling }) {
  const pct = Number(threshold);

  // Win zone: Under = fill left side, Over = fill right side
  const winZoneStyle = rollOver
    ? { left: `${pct}%`, right: 0 }
    : { left: 0, width: `${pct}%` };

  const hasResult = result !== null;
  const markerPct = hasResult ? result.roll : null;

  return (
    <div className="dice-track-section">
      {/* Result info strip */}
      <div className="dice-result-strip">
        {hasResult ? (
          <div className={`dice-result-row${result.win ? ' win' : ' lose'}`}>
            <span className="dice-rolled-num">{result.roll}</span>
            <div className="dice-result-meta">
              <span className={`dice-outcome-badge${result.win ? ' win' : ' lose'}`}>
                {result.win ? 'WIN' : 'LOSE'}
              </span>
              {result.win && (
                <span className="dice-payout-display">
                  +${Number(result.payout).toFixed(2)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="dice-idle-strip">
            <span className="dice-idle-text">Place a bet to roll</span>
          </div>
        )}
      </div>

      {/* Visual 0-100 track */}
      <div className="dice-track-outer">
        <div className="dice-track">
          {/* Win zone shading */}
          <div className="dice-win-zone" style={winZoneStyle} />

          {/* Animated result needle */}
          {hasResult && (
            <div
              className={`dice-roll-needle${result.win ? ' win' : ' lose'}`}
              style={{ left: `${markerPct}%` }}
            >
              <div className="dice-needle-bubble">{result.roll}</div>
              <div className="dice-needle-pin" />
            </div>
          )}

          {/* Pulsing needle shown while rolling (before first result) */}
          {rolling && !hasResult && (
            <div className="dice-roll-needle spinning" style={{ left: '50%' }}>
              <div className="dice-needle-bubble">?</div>
              <div className="dice-needle-pin" />
            </div>
          )}

          {/* Draggable threshold handle */}
          <div className="dice-threshold-knob" style={{ left: `${pct}%` }}>
            <div className="dice-knob-handle" />
          </div>

          {/* Invisible range input for mouse/touch dragging */}
          <input
            className="dice-track-range"
            type="range"
            min="0"
            max="100"
            value={threshold}
            onChange={e => onChange(Math.min(98, Math.max(2, Number(e.target.value))))}
          />
        </div>

        <div className="dice-track-labels">
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}

// --- Quick Bet -----------------------------------------------------------
function QuickBet({ bet, setBet, balance }) {
  return (
    <div className="dice-quick-bet">
      <button type="button" onClick={() => setBet(v => String(Math.max(1, Math.floor(Number(v) / 2))))}>1/2</button>
      <button type="button" onClick={() => setBet(v => String(Math.min(balance, Number(v) * 2)))}>2x</button>
      <button type="button" onClick={() => setBet(String(balance))}>ALL IN</button>
    </div>
  );
}

// --- Info Panel ----------------------------------------------------------
function InfoPanel({ payoutMultiplier, winProb, threshold, profit, result, rollOver }) {
  return (
    <div className="dice-info-panel">
      <div className="dice-info-stats">
        <div className="dice-info-row">
          <span>Multiplier</span>
          <strong>{payoutMultiplier.toFixed(4)}x</strong>
        </div>
        <div className="dice-info-row">
          <span>Win chance</span>
          <strong className="purple">{winProb}%</strong>
        </div>
        <div className="dice-info-row">
          <span>Profit if win</span>
          <strong className="green">+${profit}</strong>
        </div>
        <div className="dice-info-row">
          <span>House edge</span>
          <strong className="muted">1.00%</strong>
        </div>
        <div className="dice-info-row">
          <span>Win condition</span>
          <strong>{rollOver ? `Roll > ${threshold}` : `Roll < ${threshold}`}</strong>
        </div>
      </div>

      <div className="dice-info-divider">Provably Fair</div>

      <div className="dice-info-stats">
        <div className="dice-info-row">
          <span>Client seed</span>
          <code>{result?.clientSeed || '-'}</code>
        </div>
        <div className="dice-info-row">
          <span>Nonce</span>
          <code>{result?.nonce ?? '-'}</code>
        </div>
        <div className="dice-info-row">
          <span>Roll result</span>
          <code>{result?.roll ?? '-'}</code>
        </div>
      </div>

      <div className="dice-info-divider">How it works</div>
      <p className="dice-info-text">
        Each roll is derived from an HMAC-SHA256 hash of your client seed + a server seed + a per-game
        nonce. You can verify any roll by hashing <code>clientSeed:nonce</code> with the server seed
        revealed after the round. The house edge is exactly 1% (payout = 99 / winChance%).
      </p>
    </div>
  );
}

// --- Main Component ------------------------------------------------------
function DiceGame({ balance, setBalance, token }) {
  // threshold = the cutoff position on the track (stays fixed when toggling Under/Over)
  const [threshold, setThreshold] = useState(50);
  const [rollOver, setRollOver] = useState(false);
  const [clientSeed, setClientSeed] = useState('');
  const [result, setResult] = useState(null);
  const [bet, setBet] = useState('10');
  const [autoRolling, setAutoRolling] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const autoRollRef = useRef(null);

  const numericBet = Number(bet) || 0;
  // winProb = actual win probability, derived from threshold + direction
  const winProb = rollOver ? (100 - Number(threshold)) : Number(threshold);
  const payoutMultiplier = winProb > 0 ? 99 / winProb : 0;
  const potentialPayout = numericBet > 0 ? (numericBet * payoutMultiplier).toFixed(2) : '0.00';
  const profit = numericBet > 0 ? ((numericBet * payoutMultiplier) - numericBet).toFixed(2) : '0.00';

  const handlePlay = useCallback(async () => {
    const wager = Number(bet);
    if (!wager || wager <= 0 || wager > balance) {
      setAutoRolling(false);
      return;
    }
    setRolling(true);
    if (token) {
      const response = await fetch(`${API_URL}/api/dice/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bet: wager, winChance: winProb, clientSeed, rollOver })
      });
      const data = await response.json();
      if (!response.ok) { setAutoRolling(false); setRolling(false); return; }
      setBalance(Number(data.newBalance));
      setResult({ roll: data.roll, win: data.win, payout: data.payout, clientSeed: data.clientSeed, nonce: data.nonce, multiplier: data.multiplier });
      setClientSeed(data.clientSeed);
    } else {
      const seed = clientSeed || Math.random().toString(36).substring(2);
      const nonce = Math.floor(Math.random() * 1e9);
      const response = await fetch(`${API_URL}/api/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSeed: seed, winChance: winProb, nonce, rollOver })
      });
      const data = await response.json();
      let newBalance = balance - wager;
      if (data.win) newBalance += wager * payoutMultiplier;
      setBalance(Number(newBalance.toFixed(2)));
      setResult({ ...data, payout: data.win ? (wager * payoutMultiplier).toFixed(2) : 0, multiplier: payoutMultiplier });
      setClientSeed(seed);
    }
    setRolling(false);
  }, [balance, bet, clientSeed, payoutMultiplier, rollOver, setBalance, threshold, token, winProb]);

  useEffect(() => {
    if (autoRolling) {
      autoRollRef.current = setInterval(handlePlay, 600);
    } else {
      clearInterval(autoRollRef.current);
    }
    return () => clearInterval(autoRollRef.current);
  }, [autoRolling, handlePlay]);

  return (
    <div className="dice-container">
      {/* Header */}
      <div className="dice-header">
        <div>
          <div className="dice-title">DICE</div>
          <div className="dice-subtitle">Roll the odds in your favour</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="dice-info-btn"
            onClick={() => setInfoOpen(o => !o)}
            title="Game info & provably fair"
            aria-label="Info"
          >
            {infoOpen ? 'x' : 'i'}
          </button>
          <div className="dice-balance-badge">
            <span className="dice-bal-label">Balance</span>
            <span className="dice-bal-value">${balance.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Info Panel */}
      {infoOpen && (
        <InfoPanel
          payoutMultiplier={payoutMultiplier}
          winProb={winProb}
          threshold={threshold}
          profit={profit}
          result={result}
          rollOver={rollOver}
        />
      )}

      {/* Stake-style track: result strip + animated needle + draggable slider */}
      <DiceTrack
        threshold={threshold}
        onChange={setThreshold}
        rollOver={rollOver}
        result={result}
        rolling={rolling}
      />

      {/* Controls */}
      <div className="dice-controls">
        {/* Bet */}
        <div className="dice-control-row">
          <div className="dice-input-wrap">
            <label className="dice-label">BET AMOUNT</label>
            <div className="dice-input-group">
              <span className="dice-input-prefix">$</span>
              <input
                className="dice-input"
                type="text"
                inputMode="decimal"
                value={bet}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '') { setBet(''); return; }
                  if (/^\d*(?:\.\d{0,2})?$/.test(v)) setBet(v);
                }}
                onBlur={() => {
                  if (bet === '' || Number(bet) <= 0) setBet('10');
                  else setBet(String(Number(bet)));
                }}
                placeholder="0.00"
              />
            </div>
          </div>
          <QuickBet bet={bet} setBet={setBet} balance={balance} />
        </div>

        {/* Win chance + direction toggle */}
        <div className="dice-direction-row">
          <label className="dice-label">
            WIN CHANCE&nbsp;<span style={{ color: '#a78bfa' }}>{winProb}%</span>
          </label>
          <div className="dice-direction-toggle">
            <button
              type="button"
              className={`dice-dir-btn${!rollOver ? ' active' : ''}`}
              onClick={() => setRollOver(false)}
            >
              Under
            </button>
            <button
              type="button"
              className={`dice-dir-btn${rollOver ? ' active' : ''}`}
              onClick={() => setRollOver(true)}
            >
              Over
            </button>
          </div>
        </div>

        {/* Payout preview */}
        <div className="dice-payout-row">
          <div>Payout: <b style={{ color: '#10b981' }}>${potentialPayout}</b></div>
          <div>
            Target:{' '}
            <b style={{ color: '#a78bfa' }}>
              {rollOver ? `Above ${Number(threshold)}` : `Below ${Number(threshold)}`}
            </b>
          </div>
        </div>

        {/* Buttons */}
        <div className="dice-btn-row">
          <button
            className="dice-play-btn"
            onClick={handlePlay}
            disabled={numericBet > balance || numericBet <= 0 || autoRolling || rolling}
          >
            {rolling ? <span className="dice-spinning" /> : 'Roll Dice'}
          </button>
          <button
            className={`dice-auto-btn${autoRolling ? ' active' : ''}`}
            onClick={() => setAutoRolling(a => !a)}
          >
            {autoRolling ? 'Stop' : 'Auto'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DiceGame;