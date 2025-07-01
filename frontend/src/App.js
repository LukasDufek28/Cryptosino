import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DiceGame from './DiceGame';
import CrashGame from './CrashGame';
import BlackjackGame from './BlackjackGame';

function MainPage({ balance }) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('https://cryptosino-0noq.onrender.com')
      .then(res => res.text())
      .then(data => setMessage(data));
  }, []);

  return (
    <div>
      <h1>Main Page</h1>
      <p>{message}</p>
      <p>Balance: <b>${balance.toFixed(2)}</b></p>
      <Link to="/dice">Go to Dice Game</Link>
      <br />
      <Link to="/crash">Go to Crash Game</Link>
      <br />
      <Link to="/blackjack">Go to Blackjack Game</Link>
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