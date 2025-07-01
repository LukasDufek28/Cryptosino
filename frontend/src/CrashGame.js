import React, { useState, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL;

function CrashGame({ balance, setBalance }) {
  const [bet, setBet] = useState(10);
  const [gameState, setGameState] = useState('waiting'); // waiting, running, crashed, cashed
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashAt, setCrashAt] = useState(null);
  const [cashoutAt, setCashoutAt] = useState(null);
  const [message, setMessage] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState(0);
  const intervalRef = useRef(null);

  const handleStart = async () => {
    if (bet > balance || bet <= 0) {
      setMessage('Invalid bet amount!');
      return;
    }
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    const newNonce = array[0];
    setNonce(newNonce); // <-- Make sure to update the nonce state!
    const seed = clientSeed || Math.random().toString(36).substring(2);

    // Fetch crash multiplier from backend
    const response = await fetch(`${API_URL}/api/crash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSeed: seed, nonce: newNonce })
    });
    const data = await response.json();
    const crashPoint = data.crashMultiplier;

    setCrashAt(crashPoint < 1.01 ? 1.01 : crashPoint);
    setMultiplier(1.00);
    setGameState('running');
    setCashoutAt(null);
    setMessage('');
    setBalance(prev => Number((prev - bet).toFixed(2)));

    intervalRef.current = setInterval(() => {
      setMultiplier(prev => {
        // Slow start, then accelerate
        let increment = 0.005 + prev * 0.008; // slower than before
        if (prev > 2) increment += prev * 0.01;
        if (prev > 5) increment += prev * 0.015;
        const next = Number((prev + increment).toFixed(2));
        if (next >= (crashPoint < 1.01 ? 1.01 : crashPoint)) {
          clearInterval(intervalRef.current);
          setGameState('crashed');
          setMessage('💥 Crashed at ' + (crashPoint < 1.01 ? 1.01 : crashPoint).toFixed(2) + 'x');
        }
        return next;
      });
    }, 50);
  };

  const handleCashout = () => {
    if (gameState !== 'running') return;
    clearInterval(intervalRef.current);
    setGameState('cashed');
    setCashoutAt(multiplier);
    const payout = (bet * multiplier).toFixed(2);
    setBalance(prev => Number((prev + Number(payout)).toFixed(2)));
    setMessage('You cashed out at ' + multiplier.toFixed(2) + 'x! Won $' + payout);
  };

  // Reset game after crash or cashout
  React.useEffect(() => {
    if (gameState === 'crashed' || gameState === 'cashed') {
      const timer = setTimeout(() => {
        setGameState('waiting');
        setMultiplier(1.00);
        setCrashAt(null);
        setCashoutAt(null);
        setMessage('');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState]);

  return (
    <div>
      <h2>Crash Game</h2>
      <p>Balance: <b>${balance.toFixed(2)}</b></p>
      <label>
        Bet Amount:
        <input
          type="number"
          min="1"
          value={bet}
          disabled={gameState !== 'waiting'}
          onChange={e => setBet(Number(e.target.value))}
        />
      </label>
      <br />
      <label>
        Client Seed (optional):
        <input
          type="text"
          value={clientSeed}
          disabled={gameState !== 'waiting'}
          onChange={e => setClientSeed(e.target.value)}
          placeholder="Random if left blank"
        />
      </label>
      <br />
      {gameState === 'waiting' && (
        <button onClick={handleStart}>Start</button>
      )}
      {gameState === 'running' && (
        <button onClick={handleCashout}>Cash Out</button>
      )}
      <div style={{ fontSize: '2em', margin: '20px 0' }}>
        {gameState === 'waiting' && 'Waiting...'}
        {gameState === 'running' && <span style={{ color: 'green' }}>{multiplier.toFixed(2)}x</span>}
        {gameState === 'crashed' && <span style={{ color: 'red' }}>💥 {crashAt && crashAt.toFixed(2)}x</span>}
        {gameState === 'cashed' && <span style={{ color: 'blue' }}>{cashoutAt && cashoutAt.toFixed(2)}x</span>}
      </div>
      <p>{message}</p>
      {crashAt && (
        <div>
          <p>Nonce: {nonce}</p>
          <p>Client Seed: {clientSeed || '(random)'}</p>
        </div>
      )}
    </div>
  );
}

export default CrashGame;