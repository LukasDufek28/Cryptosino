import React, { useEffect, useState } from 'react';
import './AdminDashboard.css';

const API_URL = process.env.REACT_APP_API_URL;

export default function AdminDashboard({ token, currentUserId }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [promoteBusy, setPromoteBusy] = useState(null); // track id for promote/demote toggle
  const [deleteBusy, setDeleteBusy] = useState(null);
  const [balanceBusy, setBalanceBusy] = useState(null);
  const [balanceEdit, setBalanceEdit] = useState({});
  const [peakBusy, setPeakBusy] = useState(null);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [wipeBusy, setWipeBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const statsData = await statsRes.json();
      const usersData = await usersRes.json();
      if (!statsRes.ok) throw new Error(statsData.error || 'Stats load failed');
      if (!usersRes.ok) throw new Error(usersData.error || 'Users load failed');
      setStats(statsData);
      setUsers(usersData.users || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const handlePromote = async (id) => {
    setPromoteBusy(id);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}/promote`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Promote failed');
      setUsers(u => u.map(x => x.id === id ? { ...x, is_admin: true } : x));
    } catch (e) { alert(e.message); }
    setPromoteBusy(null);
  };

  const handleToggleAdmin = async (user) => {
    const id = user.id;
    const makingAdmin = !user.is_admin;
    if (!makingAdmin) {
      if (!window.confirm('Remove admin privileges from this user?')) return;
    }
    setPromoteBusy(id);
    try {
      const endpoint = makingAdmin ? 'promote' : 'unpromote';
      const res = await fetch(`${API_URL}/api/admin/users/${id}/${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setUsers(u => u.map(x => x.id === id ? { ...x, is_admin: makingAdmin } : x));
    } catch (e) { alert(e.message); }
    setPromoteBusy(null);
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    setDeleteBusy(user.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${user.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setUsers(u => u.filter(x => x.id !== user.id));
    } catch (e) { alert(e.message); }
    setDeleteBusy(null);
  };

  const handleBalanceUpdate = async (id, mode) => {
    const raw = balanceEdit[id];
    const amt = Number(raw);
    if (isNaN(amt)) return alert('Enter number');
    setBalanceBusy(id + mode);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ amount: amt, mode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Balance update failed');
      setUsers(u => u.map(x => x.id === id ? { ...x, balance: data.user.balance, peak_balance: data.user.peak_balance } : x));
      setBalanceEdit(edit => ({ ...edit, [id]: '' }));
    } catch (e) { alert(e.message); }
    setBalanceBusy(null);
  };

  const handleResetPeak = async (user) => {
    if (!window.confirm(`Reset peak balance for ${user.username} back to 1000.00?`)) return;
    setPeakBusy(user.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${user.id}/reset-peak`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset peak failed');
      setUsers(u => u.map(x => x.id === user.id ? { ...x, peak_balance: data.user.peak_balance } : x));
    } catch (e) { alert(e.message); }
    setPeakBusy(null);
  };

  const handleWipeBets = async () => {
    if (wipeConfirm !== 'WIPE') { alert('Type WIPE to confirm'); return; }
    if (!window.confirm('This will permanently delete ALL bets. Continue?')) return;
    setWipeBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/bets/wipe`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirm: 'WIPE' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Wipe failed');
      // Refresh stats & users after wipe
      await loadAll();
      setWipeConfirm('');
      alert('All bets deleted.');
    } catch (e) { alert(e.message); }
    setWipeBusy(false);
  };

  if (loading) return <div className="admin-wrap"><h2>Admin Dashboard</h2><div>Loading...</div></div>;
  if (error) return <div className="admin-wrap"><h2>Admin Dashboard</h2><div className="err">{error}</div></div>;

  return (
    <div className="admin-wrap">
      <h2>Admin Dashboard</h2>
      {stats && (
        <div className="cards-row">
          <div className="stat-card">
            <div className="label">Total Users</div>
            <div className="value">{stats.overall.total_users}</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Balance</div>
            <div className="value">${Number(stats.overall.total_balance).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="label">House Profit</div>
            <div className={`value ${Number(stats.overall.house_profit) >= 0 ? 'profit' : 'neg'}`}>${Number(stats.overall.house_profit).toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Bets</div>
            <div className="value">{stats.overall.total_bets}</div>
          </div>
          <div className="stat-card">
            <div className="label">Total Wagered</div>
            <div className="value">${Number(stats.overall.total_wagered).toFixed(2)}</div>
          </div>
          <div className="stat-card danger-card">
            <div className="label">Danger Zone</div>
            <div style={{fontSize:'0.65rem', lineHeight:1.2, color:'#f88', marginBottom:6}}>Wipe all bets</div>
            <input
              type="text"
              placeholder="Type WIPE"
              value={wipeConfirm}
              onChange={e=>setWipeConfirm(e.target.value.toUpperCase())}
              style={{width:'100%',background:'#221',border:'1px solid #443',color:'#fff',padding:'4px 6px',borderRadius:4,fontSize:'0.7rem',marginBottom:6}}
            />
            <button
              className="danger"
              style={{width:'100%',padding:'6px 8px',fontSize:'0.65rem'}}
              disabled={wipeConfirm !== 'WIPE' || wipeBusy}
              onClick={handleWipeBets}
            >{wipeBusy ? 'WIPING...' : 'WIPE BETS'}</button>
          </div>
        </div>
      )}
      {stats && (
        <div className="game-table-block">
          <h3>Game Breakdown</h3>
          <table className="admin-table compact">
            <thead>
              <tr>
                <th>Game</th>
                <th>Bets</th>
                <th>Wagered</th>
                <th>Payout</th>
                <th>House Profit</th>
              </tr>
            </thead>
            <tbody>
              {stats.byGame.map(g => (
                <tr key={g.game}>
                  <td>{g.game}</td>
                  <td>{g.bets}</td>
                  <td>${Number(g.total_wagered).toFixed(2)}</td>
                  <td>${Number(g.total_payout).toFixed(2)}</td>
                  <td className={Number(g.house_profit) >= 0 ? 'pos' : 'neg'}>${Number(g.house_profit).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="user-table-block">
        <h3>Users</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Bal</th>
              <th>Peak</th>
              <th>Total Wagered</th>
              <th>Total Payout</th>
              <th>Net Profit</th>
              <th>Admin</th>
              <th>Adjust</th>
              <th>Admin Action</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>${Number(u.balance).toFixed(2)}</td>
                <td>
                  ${Number(u.peak_balance).toFixed(2)}{' '}
                  <button
                    style={{padding:'2px 6px', fontSize:11, marginLeft:4}}
                    disabled={peakBusy===u.id}
                    onClick={()=>handleResetPeak(u)}
                    title="Reset peak balance to 1000.00"
                  >↺</button>
                </td>
                <td>${Number(u.total_wagered).toFixed(2)}</td>
                <td>${Number(u.total_payout).toFixed(2)}</td>
                <td className={Number(u.net_profit) >= 0 ? 'pos':'neg'}>${Number(u.net_profit).toFixed(2)}</td>
                <td>{u.is_admin ? '✔' : ''}</td>
                <td>
                  <div className="adjust-box">
                    <input type="number" value={balanceEdit[u.id] || ''} onChange={e=>setBalanceEdit(ed=>({...ed,[u.id]:e.target.value}))} placeholder="amt" />
                    <button disabled={balanceBusy===u.id+'delta'} onClick={()=>handleBalanceUpdate(u.id,'delta')}>Δ</button>
                    <button disabled={balanceBusy===u.id+'set'} onClick={()=>handleBalanceUpdate(u.id,'set')}>Set</button>
                  </div>
                </td>
                <td>
                  {u.id === currentUserId ? (
                    <button disabled title="Cannot change your own admin status">Self</button>
                  ) : (
                    <button disabled={promoteBusy===u.id} onClick={()=>handleToggleAdmin(u)}>
                      {u.is_admin ? 'Unpromote' : 'Promote'}
                    </button>
                  )}
                </td>
                <td>
                  {u.id === currentUserId ? (
                    <button disabled className="danger" title="Cannot delete your own account">Self</button>
                  ) : (
                    <button className="danger" disabled={deleteBusy===u.id} onClick={()=>handleDeleteUser(u)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:20}}>
        <button onClick={loadAll}>Refresh</button>
      </div>
    </div>
  );
}
