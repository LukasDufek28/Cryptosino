import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DiceGame from './DiceGame';
import CrashGame from './CrashGame';
import BlackjackGame from './BlackjackGame';
import './MainPage.css';

const API_URL = process.env.REACT_APP_API_URL;

function MainPage({ balance }) {
  const [pingTime, setPingTime] = useState(null);
  const [pingMsg, setPingMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async () => {
    setLoading(true);
    setPingMsg('');
    setPingTime(null);
    const start = Date.now();
    try {
      const res = await fetch(`${API_URL}/api/ping`);
      const data = await res.json();
      setPingTime(Date.now() - start);
      setPingMsg(data.message || 'Backend is awake!');
    } catch (e) {
      setPingMsg('Failed to reach backend.');
    }
    setLoading(false);
  };

  return (
    <div className="main-container">
      <div className="main-title">Cryptosino</div>
      <div className="main-balance">Balance: <b>${balance.toFixed(2)}</b></div>
      <Link className="main-link" to="/dice">🎲 Dice Game</Link>
      <Link className="main-link" to="/crash">🚀 Crash Game</Link>
      <Link className="main-link" to="/blackjack">🃏 Blackjack Game</Link>
      <button
        className="main-activate-btn"
        onClick={handleActivate}
        disabled={loading}
        style={{ margin: '32px 0 0 0' }}
      >
        {loading ? 'Waking up slave...' : 'Get back to work blud!'}
      </button>
      <div style={{ minHeight: 28, marginTop: 10 }}>
        {pingTime !== null && (
          <div style={{ color: '#00e1ff' }}>
            Response in {pingTime} ms
          </div>
        )}
      </div>
      <div style={{ minHeight: 28 }}>
        {pingMsg && (
          <div style={{ color: '#00ffb0', fontWeight: 'bold' }}>
            {pingMsg}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [balance, setBalance] = useState(1000);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainPage balance={balance} />} />
        <Route path="/dice" element={<DiceGame balance={balance} setBalance={setBalance} />} />
        <Route path="/crash" element={<CrashGame balance={balance} setBalance={setBalance} />} />
        <Route path="/blackjack" element={<BlackjackGame balance={balance} setBalance={setBalance} />} />
      </Routes>
    </Router>
  );
}

export default App;