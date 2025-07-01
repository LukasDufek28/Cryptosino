import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DiceGame from './DiceGame';

function MainPage() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('http://localhost:5000/')
      .then(res => res.text())
      .then(data => setMessage(data));
  }, []);

  return (
    <div>
      <h1>Main Page</h1>
      <p>{message}</p>
      <Link to="/dice">Go to Dice Game</Link>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/dice" element={<DiceGame />} />
      </Routes>
    </Router>
  );
}

export default App;