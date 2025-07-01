import React, { useState, useRef } from 'react';
import './CrashGame.css';

const API_URL = process.env.REACT_APP_API_URL;

function CrashGame({ balance, setBalance }) {
  const [bet, setBet] = useState(10);
  const [gameState, setGameState] = useState('waiting'); // waiting, running, crashed, cashed
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashAt, setCrashAt] = useState(null);
  const [cashoutAt, setCashoutAt] = useState(null);
  const [message, setMessage] = useState('');
  const [clientSeed] = useState('');
  const [nonce, setNonce] = useState(0);
  const [multiplierHistory, setMultiplierHistory] = useState([]);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const handleStart = async () => {
    if (bet > balance || bet <= 0) {
      setMessage('Invalid bet amount!');
      return;
    }
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    const newNonce = array[0];
    setNonce(newNonce);
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

    setMultiplierHistory([1.00]);
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000; // seconds
      // Exponential growth: multiplier = 1.01 * e^(k * elapsed)
      // k controls the speed, try 0.18 for a smooth curve
      const k = 0.10;
      const next = Number((1.01 * Math.exp(k * elapsed)).toFixed(4));
      setMultiplier(next);
      setMultiplierHistory(hist => [...hist, next]);
      if (next >= (crashPoint < 1.01 ? 1.01 : crashPoint)) {
        clearInterval(intervalRef.current);
        setGameState('crashed');
      }
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

  React.useEffect(() => {
    if (gameState === 'crashed' || gameState === 'cashed') {
      const timer = setTimeout(() => {
        setGameState('waiting');
        setMultiplier(1.00);
        setCrashAt(null);
        setCashoutAt(null);
        setMessage('');
        setMultiplierHistory([1.00]); // <-- Reset the graph here
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState]);

  let multiplierClass = 'crash-multiplier';
  if (gameState === 'running') multiplierClass += ' green';
  if (gameState === 'crashed') multiplierClass += ' red';
  if (gameState === 'cashed') multiplierClass += ' blue';

  return (
    <div className="crash-container">
      <h2 style={{ letterSpacing: 2, marginBottom: 10 }}>Crash Game</h2>
      <div className="crash-balance">Balance: <b>${balance.toFixed(2)}</b></div>
      <div className="crash-inputs">
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
      </div>
      {gameState === 'waiting' && (
        <button className="crash-btn" onClick={handleStart}>Start</button>
      )}
      {gameState === 'running' && (
        <button className="crash-btn" onClick={handleCashout}>Cash Out</button>
      )}
      {gameState === 'crashed' && (
        <button className="crash-btn red" disabled style={{ marginTop: 12 }}>
          Crashed!
        </button>
      )}
      {gameState === 'cashed' && (
        <button className="crash-btn blue" disabled style={{ marginTop: 12 }}>
          Cashed Out!
        </button>
      )}
      <div className={multiplierClass} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {gameState === 'waiting' && 'Waiting...'}
        {(gameState === 'running' || gameState === 'crashed' || gameState === 'cashed') && (
          <>
            <span>{(gameState === 'running' ? multiplier : (gameState === 'crashed' ? crashAt : cashoutAt)).toFixed(2)}x</span>
            <CrashGraph history={multiplierHistory} />
          </>
        )}
      </div>
      <div className="crash-message">{message}</div>
      {crashAt && (
        <div className="crash-details">
          <div>Nonce: {nonce}</div>
          <div>Client Seed: {clientSeed || '(random)'}</div>
        </div>
      )}
    </div>
  );
}

function CrashGraph({ history }) {
  const width = 320;
  const height = 170;
  const topPad = 10;
  const bottomPad = 18;
  const max = Math.max(...history, 2);

  // Grid lines: every integer from 1 up to Math.ceil(max)
  const grid = [];
  for (let i = 1; i <= Math.ceil(max); i++) {
    grid.push(i);
  }

  // Helper for y position
  const yFromValue = (val) =>
    height - bottomPad - ((val - 1) / (max - 1 || 1)) * (height - topPad - bottomPad);

  // Smooth curve points
  const N = 80;
  const len = history.length;
  const points = [];
  for (let i = 0; i < N; i++) {
    const idx = (i / (N - 1)) * (len - 1);
    const left = Math.floor(idx);
    const right = Math.ceil(idx);
    const t = idx - left;
    const yVal =
      left === right
        ? history[left]
        : history[left] * (1 - t) + history[right] * t;
    const x = (i / (N - 1)) * width;
    const y = yFromValue(yVal);
    points.push({ x, y, yVal });
  }

  // Last point for label
  const last = points[points.length - 1];

  return (
    <svg width={width + 40} height={height} style={{ marginLeft: 32, verticalAlign: 'middle', background: 'none' }}>
      {/* Grid lines and labels */}
      {grid.map((g) => {
        const y = yFromValue(g);
        return (
          <g key={g}>
            <line
              x1={36}
              x2={width + 36}
              y1={y}
              y2={y}
              stroke="#444"
              strokeDasharray="4,4"
              strokeWidth="1"
            />
            <text
              x={32}
              y={y + 5}
              fontSize="13"
              fill="#aaa"
              textAnchor="end"
              style={{ userSelect: 'none' }}
            >
              {g}
            </text>
          </g>
        );
      })}
      {/* Crash line */}
      <polyline
        fill="none"
        stroke="#00e1ff"
        strokeWidth="3"
        points={points.map(p => `${p.x + 36},${p.y}`).join(' ')}
      />
      {/* Current value label at end of line */}
      <g>
        <circle cx={last.x + 36} cy={last.y} r="5" fill="#00e1ff" />
        <text
          x={last.x + 46}
          y={last.y + 5}
          fontSize="15"
          fill="#00e1ff"
          fontWeight="bold"
          style={{ userSelect: 'none' }}
        >
          {last.yVal.toFixed(2)}x
        </text>
      </g>
      {/* Border */}
      <rect x="36" y="0" width={width} height={height} fill="none" stroke="#23262f" strokeWidth="2"/>
    </svg>
  );
}

export default CrashGame;