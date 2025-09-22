import React, { useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL;

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed');
      } else {
        localStorage.setItem('token', data.token);
        onAuth(data.user, data.token);
      }
    } catch (e) {
      setError('Network error');
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, background: '#111', border: '1px solid #333', borderRadius: 8, color: '#eee' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>Cryptosino</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMode('login')} disabled={mode==='login'}>Login</button>
        <button onClick={() => setMode('register')} disabled={mode==='register'}>Register</button>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <button type="submit" disabled={loading}>{loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Create Account')}</button>
        {error && <div style={{ color: '#f66', fontSize: 14 }}>{error}</div>}
      </form>
    </div>
  );
}
