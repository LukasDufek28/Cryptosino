import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './NavBar.css';

export default function NavBar({ user, balance, onLogout }) {
  const navigate = useNavigate();
  const handleLogout = () => {
    onLogout();
    navigate('/');
  };
  return (
    <div className="nav-bar">
      <div className="nav-left">
        <span className="nav-logo">Cryptosino</span>
        <Link to="/" className="nav-link">3D Casino</Link>
        <Link to="/lobby" className="nav-link">Classic lobby</Link>
        <Link to="/dice" className="nav-link">Dice</Link>
        <Link to="/crash" className="nav-link">Crash</Link>
        <Link to="/blackjack" className="nav-link">Blackjack</Link>
        <Link to="/slots" className="nav-link">Slots</Link>
  {user?.is_admin && <Link to="/admin" className="nav-link">Admin</Link>}
      </div>
      <div className="nav-right">
        <span className="nav-user">{user?.username}</span>
        <span className="nav-balance">${Number(balance).toFixed(2)}</span>
        <button className="nav-logout" onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}
