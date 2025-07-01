import React, { useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL;

function DiceGame({ balance, setBalance }) {
  const [winChance, setWinChance] = useState(50);
  const [clientSeed, setClientSeed] = useState('');
  const [result, setResult] = useState(null);
  const [bet, setBet] = useState(10);

  // Calculate potential payout based on bet and winChance
  const payoutMultiplier = (99 / winChance) * 0.999;
  const potentialPayout = (bet * payoutMultiplier).toFixed(2);

  const handlePlay = async () => {
    if (bet > balance || bet <= 0) {
      alert('Invalid bet amount!');
      return;
    }
    const seed = clientSeed || Math.random().toString(36).substring(2);
    const nonce = Math.floor(Math.random() * 1e9);
    const response = await fetch(`${API_URL}/api/roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSeed: seed, winChance: Number(winChance), nonce })
    });
    const data = await response.json();

    let newBalance = balance - bet;
    if (data.win) {
      newBalance += bet * payoutMultiplier;
    }
    setBalance(Number(newBalance.toFixed(2)));
    setResult({ ...data, payout: data.win ? (bet * payoutMultiplier).toFixed(2) : 0 });
    setClientSeed(seed);
  };

  return (
    <div>
      <h2>Provably Fair Dice Game</h2>
      <p>Balance: <b>${balance.toFixed(2)}</b></p>
      <label>
        Bet Amount:
        <input
          type="number"
          min="1"
          value={bet}
          onChange={e => setBet(Number(e.target.value))}
        />
      </label>
      <br />
      <label>
        Win Chance: {winChance}%
        <input
          type="range"
          min="1"
          max="97"
          value={winChance}
          onChange={e => setWinChance(e.target.value)}
        />
      </label>
      <br />
      <p>Potential Payout: <b>${potentialPayout}</b></p>
      <label>
        Client Seed (optional):
        <input
          type="text"
          value={clientSeed}
          onChange={e => setClientSeed(e.target.value)}
          placeholder="Random if left blank"
        />
      </label>
      <br />
      <button onClick={handlePlay} disabled={bet > balance || bet <= 0}>Play</button>
      {result && (
        <div>
          <p>Roll: <b>{result.roll}</b></p>
          <p><b>{result.win ? 'You Win!' : 'You Lose!'}</b></p>
          <p>Payout: <b>${result.payout}</b></p>
          <p>Server Seed Hash: {result.serverSeedHash}</p>
          <p>Client Seed: {result.clientSeed}</p>
          <p>Nonce: {result.nonce}</p>
        </div>
      )}
    </div>
  );
}

export default DiceGame;