import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import DiceGame from './DiceGame';
import CrashGame from './CrashGame';
import BlackjackGame from './BlackjackGame';
import AdminDashboard from './AdminDashboard';
import AuthPage from './AuthPage';
import NavBar from './NavBar';
import './NavBar.css';
import './MainPage.css';

const API_URL = process.env.REACT_APP_API_URL;

function MainPage({ balance, token, setBalance }) {
  const [pingTime, setPingTime] = useState(null);
  const [pingMsg, setPingMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaders, setLeaders] = useState([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);
  const [profitLeaders, setProfitLeaders] = useState([]);
  const [loadingProfit, setLoadingProfit] = useState(false);

  useEffect(() => {
    async function loadLeaders() {
      setLoadingLeaders(true);
      try {
        const res = await fetch(`${API_URL}/api/leaderboard/peak`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.leaders)) setLeaders(data.leaders);
      } catch (e) { /* ignore */ }
      setLoadingLeaders(false);
    }
    async function loadProfit() {
      setLoadingProfit(true);
      try {
        const res = await fetch(`${API_URL}/api/leaderboard/net-profit`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.leaders)) setProfitLeaders(data.leaders);
      } catch (e) { /* ignore */ }
      setLoadingProfit(false);
    }
    loadLeaders();
    loadProfit();
    const interval = setInterval(() => { loadLeaders(); loadProfit(); }, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

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

  const handleReset = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/reset-balance`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(Number(data.balance));
      } else {
        alert(data.error || 'Reset failed');
      }
    } catch (e) {
      alert('Network error');
    }
  };

  return (
    <div className="home-layout">
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
      {balance < 1000 && (
        <button
          onClick={handleReset}
          style={{ marginTop: 16, padding: '10px 16px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 6, cursor: 'pointer' }}
        >
          Reset Balance to 1000
        </button>
      )}
      </div>
      <div className="leaderboard card-right">
        <div className="leaderboard-title">🏆 Top Peak Balances</div>
        {loadingLeaders && leaders.length === 0 && (
          <div className="leaderboard-empty">Loading...</div>
        )}
        {!loadingLeaders && leaders.length === 0 && (
          <div className="leaderboard-empty">No data yet</div>
        )}
        <ul className="leaderboard-list">
          {leaders.map((l, idx) => (
            <li key={l.username} className="leader-item">
              <span className="rank">{idx + 1}</span>
              <span className="lname">{l.username}</span>
              <span className="lbal">${Number(l.peak_balance).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="leaderboard-title" style={{ marginTop: 28 }}>💰 Net Profit</div>
        {loadingProfit && profitLeaders.length === 0 && (
          <div className="leaderboard-empty">Loading...</div>
        )}
        {!loadingProfit && profitLeaders.length === 0 && (
          <div className="leaderboard-empty">No data yet</div>
        )}
        <ul className="leaderboard-list">
          {profitLeaders.map((l, idx) => {
            const v = Number(l.net_profit);
            const cls = 'lbal' + (v < 0 ? ' neg' : '');
            return (
              <li key={l.username} className="leader-item">
                <span className="rank">{idx + 1}</span>
                <span className="lname">{l.username}</span>
                <span className={cls}>{v < 0 ? '-' : ''}${Math.abs(v).toFixed(2)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [balance, setBalance] = useState(1000);
  const [loadingUser, setLoadingUser] = useState(false);

  useEffect(() => {
    async function loadMe() {
      if (!token) return;
      setLoadingUser(true);
      try {
        const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setBalance(Number(data.user.balance));
        } else {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (e) {
        // ignore
      }
      setLoadingUser(false);
    }
    loadMe();
  }, [token]);

  const handleAuth = (userData, jwt) => {
    setUser(userData);
    setToken(jwt);
    setBalance(Number(userData.balance));
  };

  if (!token || !user) {
    if (loadingUser) {
      return <div style={{ color: '#fff', padding: 40 }}>Loading...</div>;
    }
    return <AuthPage onAuth={handleAuth} />;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    // Do not auto-reset balance on logout; leave it or set to 0 for a neutral state
    setBalance(0);
  };

  return (
    <Router>
      <NavBar user={user} balance={balance} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<MainPage balance={balance} token={token} setBalance={setBalance} />} />
        <Route path="/dice" element={<DiceGame balance={balance} setBalance={setBalance} token={token} />} />
        <Route path="/crash" element={<CrashGame balance={balance} setBalance={setBalance} token={token} />} />
        <Route path="/blackjack" element={<BlackjackGame balance={balance} setBalance={setBalance} token={token} />} />
        {user?.is_admin && (
          <Route path="/admin" element={<AdminDashboard token={token} currentUserId={user.id} />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;