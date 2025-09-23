import React, { useState, useRef, useCallback } from 'react';
import './DiceGame.css';

const API_URL = process.env.REACT_APP_API_URL;

function DiceGame({ balance, setBalance, token }) {
  const [winChance, setWinChance] = useState(50);
  const [clientSeed, setClientSeed] = useState('');
  const [result, setResult] = useState(null);
  const [bet, setBet] = useState('10');
  const [autoRolling, setAutoRolling] = useState(false);
  const autoRollRef = useRef(null);

  // Calculate potential payout based on bet and winChance
  const numericBet = Number(bet) || 0;
  // Stake-style: multiplier = 99 / chance; treat 0% as no possible win (multiplier 0)
  const payoutMultiplier = winChance > 0 ? 99 / winChance : 0;
  const potentialPayout = (numericBet > 0 && payoutMultiplier > 0)
    ? (numericBet * payoutMultiplier).toFixed(2)
    : '0.00';

  const handlePlay = useCallback(async () => {
    const wager = Number(bet);
    if (!wager || wager <= 0 || wager > balance) {
      alert('Invalid bet amount!');
      setAutoRolling(false); // Stop auto roll if invalid
      return;
    }
    if (token) {
      // Use persistent backend endpoint
      const response = await fetch(`${API_URL}/api/dice/roll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bet: wager, winChance: Number(winChance), clientSeed })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Error');
        setAutoRolling(false);
        return;
      }
  setBalance(Number(data.newBalance));
  setResult({ roll: data.roll, win: data.win, payout: data.payout, clientSeed: data.clientSeed, nonce: data.nonce, multiplier: data.multiplier });
      setClientSeed(data.clientSeed);
    } else {
      // Fallback local simulation (no persistence)
      const seed = clientSeed || Math.random().toString(36).substring(2);
      const nonce = Math.floor(Math.random() * 1e9);
      const response = await fetch(`${API_URL}/api/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSeed: seed, winChance: Number(winChance), nonce })
      });
      const data = await response.json();
  let newBalance = balance - wager;
  if (data.win) newBalance += wager * payoutMultiplier;
      setBalance(Number(newBalance.toFixed(2)));
  setResult({ ...data, payout: data.win ? (wager * payoutMultiplier).toFixed(2) : 0, multiplier: payoutMultiplier });
      setClientSeed(seed);
    }
  }, [API_URL, balance, bet, clientSeed, payoutMultiplier, setBalance, token, winChance]);

  // Auto roll logic
  React.useEffect(() => {
    if (autoRolling) {
      autoRollRef.current = setInterval(() => {
        handlePlay();
      }, 500);
    } else {
      clearInterval(autoRollRef.current);
    }
    return () => clearInterval(autoRollRef.current);
  }, [autoRolling, handlePlay]);

  const handleAutoRoll = () => {
    setAutoRolling(ar => !ar);
  };

  return (
    <div className="dice-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ letterSpacing: 2, margin: 0 }}>Dice Game</h2>
        <button
          className={`dice-auto-btn${autoRolling ? ' active' : ''}`}
          onClick={handleAutoRoll}
        >
          Auto Roll
        </button>
      </div>
      <div className="dice-balance" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Balance: <b>${balance.toFixed(2)}</b></span>
      </div>
      <div className="dice-inputs">
        <label>
          Bet Amount:
          <input
            type="text"
            inputMode="decimal"
            value={bet}
            onChange={e => {
              const v = e.target.value;
              if (v === '') { setBet(''); return; }
              if (/^\d*(?:\.\d{0,2})?$/.test(v)) { setBet(v); }
            }}
            onBlur={() => {
              if (bet === '' || Number(bet) <= 0) setBet('10');
              else setBet(String(Number(bet))); // normalize remove leading zeros
            }}
            placeholder="Bet"
          />
        </label>
        <label>
          Win Chance: <b>{winChance}%</b>
          <input
            className="dice-slider"
            type="range"
            min="0"
            max="100"
            value={winChance}
            onChange={e => setWinChance(e.target.value)}
          />
        </label>
        <div style={{ margin: '10px 0 0 0' }}>
          Multiplier: <b>{payoutMultiplier.toFixed(4)}x</b> | Potential Payout: <b>${potentialPayout}</b>
        </div>
        <div style={{ fontSize: '0.7em', color: '#888', marginTop: 4 }}>House edge: 1.00%</div>
      </div>
  <button className="dice-btn" onClick={handlePlay} disabled={numericBet > balance || numericBet <= 0 || autoRolling}>Play</button>
      {result && (
        <div className="dice-result">
          <p>
            Roll: <b>{result.roll}</b>
          </p>
          <p>
            <b className={result.win ? 'win' : 'lose'}>
              {result.win ? 'You Win!' : 'You Lose!'}
            </b>
          </p>
          <p>Payout: <b>${result.payout}</b> {result.multiplier && (<span style={{ color:'#888', fontSize:'0.8em' }}>({result.multiplier.toFixed(4)}x)</span>)}</p>
          <p>Client Seed: <span style={{ color: '#aaa' }}>{result.clientSeed}</span></p>
          <p>Nonce: <span style={{ color: '#aaa' }}>{result.nonce}</span></p>
        </div>
      )}
    </div>
  );
}

export default DiceGame;