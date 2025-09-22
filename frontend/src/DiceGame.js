import React, { useState, useRef, useCallback } from 'react';
import './DiceGame.css';

const API_URL = process.env.REACT_APP_API_URL;

function DiceGame({ balance, setBalance, token }) {
  const [winChance, setWinChance] = useState(50);
  const [clientSeed, setClientSeed] = useState('');
  const [result, setResult] = useState(null);
  const [bet, setBet] = useState(10);
  const [autoRolling, setAutoRolling] = useState(false);
  const autoRollRef = useRef(null);

  // Calculate potential payout based on bet and winChance
  const payoutMultiplier = (99 / winChance) * 0.99;
  const potentialPayout = (bet * payoutMultiplier).toFixed(2);

  const handlePlay = useCallback(async () => {
    if (bet > balance || bet <= 0) {
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
        body: JSON.stringify({ bet, winChance: Number(winChance), clientSeed })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Error');
        setAutoRolling(false);
        return;
      }
      setBalance(Number(data.newBalance));
      setResult({ roll: data.roll, win: data.win, payout: data.payout, clientSeed: data.clientSeed, nonce: data.nonce });
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
      let newBalance = balance - bet;
      if (data.win) newBalance += bet * payoutMultiplier;
      setBalance(Number(newBalance.toFixed(2)));
      setResult({ ...data, payout: data.win ? (bet * payoutMultiplier).toFixed(2) : 0 });
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
            type="number"
            min="1"
            value={bet}
            onChange={e => setBet(Number(e.target.value))}
          />
        </label>
        <label>
          Win Chance: <b>{winChance}%</b>
          <input
            className="dice-slider"
            type="range"
            min="2"
            max="98"
            value={winChance}
            onChange={e => setWinChance(e.target.value)}
          />
        </label>
        <div style={{ margin: '10px 0 0 0' }}>
          Potential Payout: <b>${potentialPayout}</b>
        </div>
      </div>
      <button className="dice-btn" onClick={handlePlay} disabled={bet > balance || bet <= 0 || autoRolling}>Play</button>
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
          <p>Payout: <b>${result.payout}</b></p>
          <p>Client Seed: <span style={{ color: '#aaa' }}>{result.clientSeed}</span></p>
          <p>Nonce: <span style={{ color: '#aaa' }}>{result.nonce}</span></p>
        </div>
      )}
    </div>
  );
}

export default DiceGame;