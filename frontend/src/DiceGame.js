import React, { useState } from 'react';

function DiceGame() {
  const [winChance, setWinChance] = useState(50);
  const [clientSeed, setClientSeed] = useState('');
  const [result, setResult] = useState(null);

  const handlePlay = async () => {
    const seed = clientSeed || Math.random().toString(36).substring(2);
    const nonce = Math.floor(Math.random() * 1e9); // Random nonce for each roll
    const response = await fetch('http://localhost:5000/api/roll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSeed: seed, winChance: Number(winChance), nonce })
    });
    const data = await response.json();
    setResult(data);
    setClientSeed(seed);
  };

  return (
    <div>
      <h2>Provably Fair Dice Game</h2>
      <label>
        Win Chance: {winChance}%
        <input
          type="range"
          min="1"
          max="99"
          value={winChance}
          onChange={e => setWinChance(e.target.value)}
        />
      </label>
      <br />
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
      <button onClick={handlePlay}>Play</button>
      {result && (
        <div>
          <p>Roll: <b>{result.roll}</b></p>
          <p><b>{result.win ? 'You Win!' : 'You Lose!'}</b></p>
          <p>Server Seed Hash: {result.serverSeedHash}</p>
          <p>Client Seed: {result.clientSeed}</p>
        </div>
      )}
    </div>
  );
}

export default DiceGame;