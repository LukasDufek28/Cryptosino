require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// Database
const { query } = require('./db');

app.use(cors());
app.use(express.json());

// Auth helpers (refresh role flags each request to avoid stale tokens)
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, is_admin: !!user.is_admin, is_owner: !!user.is_owner }, JWT_SECRET, { expiresIn: '7d' });
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid Authorization header' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Refresh role flags and username in case of promotion/demotion/name change
    const fresh = await query('SELECT id, username, is_admin, COALESCE(is_owner,false) AS is_owner FROM users WHERE id=$1', [payload.id]);
    if (!fresh.rows.length) return res.status(401).json({ error: 'User no longer exists' });
    req.user = {
      id: fresh.rows[0].id,
      username: fresh.rows[0].username,
      is_admin: !!fresh.rows[0].is_admin,
      is_owner: !!fresh.rows[0].is_owner
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || (!req.user.is_admin && !req.user.is_owner)) return res.status(403).json({ error: 'Admin only' });
  next();
}

// Example route
app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.get('/api/ping', (req, res) => {
  res.json({ "message": "Yes Sir" });
});

// DB connectivity test
app.get('/api/db-time', async (req, res) => {
  try {
    const result = await query('SELECT NOW() as now');
    res.json({ ok: true, now: result.rows[0].now });
  } catch (err) {
    console.error('DB test error', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Registration
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username & password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password too short (min 6)' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (username, password_hash) VALUES ($1,$2)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, username, balance, peak_balance, is_admin, created_at`,
      [username, hash]
    );
    if (!rows.length) return res.status(409).json({ error: 'Username already exists' });
    const user = rows[0];
    const token = signToken(user);
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username & password required' });
  try {
  const { rows } = await query('SELECT id, username, password_hash, balance, peak_balance, is_admin, created_at FROM users WHERE username=$1', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    delete user.password_hash;
    const token = signToken(user);
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Current user
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, username, balance, peak_balance, is_admin, created_at FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Peak balance leaderboard (top 10)
app.get('/api/leaderboard/peak', async (req, res) => {
  try {
    const { rows } = await query('SELECT username, peak_balance FROM users ORDER BY peak_balance DESC, id ASC LIMIT 10');
    res.json({ leaders: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Net profit leaderboard (top 10) include users even with zero bets
app.get('/api/leaderboard/net-profit', async (req, res) => {
  try {
    const sql = `SELECT u.username,
        COALESCE(SUM(b.payout),0) - COALESCE(SUM(b.wager),0) AS net_profit,
        COALESCE(SUM(b.wager),0) AS total_wagered,
        COALESCE(SUM(b.payout),0) AS total_payout
      FROM users u
      LEFT JOIN bets b ON b.user_id = u.id
      GROUP BY u.id
      ORDER BY net_profit DESC, u.id ASC
      LIMIT 10`;
    const { rows } = await query(sql);
    res.json({ leaders: rows });
  } catch (e) {
    console.error('Net profit leaderboard error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== Admin Endpoints =====================
// Stats: overall and by game
app.get('/api/admin/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const overallSql = `SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COALESCE(SUM(balance),0) FROM users) AS total_balance,
      (SELECT COALESCE(SUM(peak_balance),0) FROM users) AS total_peak_balance,
      (SELECT COUNT(*) FROM bets) AS total_bets,
      (SELECT COALESCE(SUM(wager),0) FROM bets) AS total_wagered,
      (SELECT COALESCE(SUM(payout),0) FROM bets) AS total_payout`;
    const overall = await query(overallSql);
    const byGame = await query(`SELECT game, COUNT(*) AS bets, COALESCE(SUM(wager),0) AS total_wagered, COALESCE(SUM(payout),0) AS total_payout,
        COALESCE(SUM(wager),0) - COALESCE(SUM(payout),0) AS house_profit
      FROM bets GROUP BY game ORDER BY game`);
    const row = overall.rows[0];
    const house_profit = Number(row.total_wagered) - Number(row.total_payout);
    res.json({
      overall: { ...row, house_profit },
      byGame: byGame.rows
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Users list with aggregates
app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  try {
    const { rows } = await query(`SELECT u.id, u.username, u.balance, u.peak_balance, u.is_admin, COALESCE(u.is_owner, FALSE) AS is_owner, u.created_at,
        COALESCE(SUM(b.wager),0) AS total_wagered,
        COALESCE(SUM(b.payout),0) AS total_payout,
        COALESCE(SUM(b.payout),0) - COALESCE(SUM(b.wager),0) AS net_profit
      FROM users u
      LEFT JOIN bets b ON b.user_id = u.id
      GROUP BY u.id
      ORDER BY u.balance DESC
      LIMIT $1`, [limit]);
    res.json({ users: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Promote user to admin
app.post('/api/admin/users/:id/promote', authMiddleware, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const { rows } = await query('UPDATE users SET is_admin=TRUE WHERE id=$1 RETURNING id, username, is_admin', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Demote an admin. Owners must transfer ownership before their role can change.
async function demoteAdmin(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot demote yourself' });
  try {
    const target = await query('SELECT id, username, is_admin, COALESCE(is_owner, FALSE) AS is_owner FROM users WHERE id=$1', [id]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    if (target.rows[0].is_owner) return res.status(400).json({ error: 'Owners cannot be demoted. Transfer ownership first.' });
    if (!target.rows[0].is_admin) return res.status(400).json({ error: 'User is not an admin' });
    const adminCount = await query('SELECT COUNT(*)::int AS c FROM users WHERE is_admin=TRUE');
    if (adminCount.rows[0].c <= 1) {
      return res.status(400).json({ error: 'Cannot demote the last remaining admin' });
    }
    const demoted = await query('UPDATE users SET is_admin=FALSE WHERE id=$1 RETURNING id, username, is_admin', [id]);
    res.json({ ok: true, user: demoted.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

app.use('/api/casino', require('./casino/router')(authMiddleware));

app.post('/api/admin/users/:id/demote', authMiddleware, adminOnly, demoteAdmin);
// Retained for clients that have not yet received the renamed frontend.
app.post('/api/admin/users/:id/unpromote', authMiddleware, adminOnly, demoteAdmin);

// Delete user (cannot delete last remaining admin, and optionally could block self-delete)
app.delete('/api/admin/users/:id', authMiddleware, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  try {
    const target = await query('SELECT id, username, is_admin FROM users WHERE id=$1', [id]);
    if (!target.rows.length) return res.status(404).json({ error: 'User not found' });
    if (target.rows[0].is_admin) {
      const adminCount = await query('SELECT COUNT(*)::int AS c FROM users WHERE is_admin=TRUE');
      if (adminCount.rows[0].c <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last remaining admin' });
      }
    }
    await query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset a user's peak balance back to 1000.00 (does not alter current balance)
app.post('/api/admin/users/:id/reset-peak', authMiddleware, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    const { rows } = await query('UPDATE users SET peak_balance=1000.00 WHERE id=$1 RETURNING id, username, balance, peak_balance, is_admin', [id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Wipe all bets (irreversible). Body must include { confirm: 'WIPE' }
app.post('/api/admin/bets/wipe', authMiddleware, adminOnly, async (req, res) => {
  const { confirm } = req.body || {};
  if (confirm !== 'WIPE') return res.status(400).json({ error: 'Confirmation phrase mismatch' });
  try {
    await query('DELETE FROM bets');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Adjust user balance: { amount, mode } mode: set|delta
app.post('/api/admin/users/:id/balance', authMiddleware, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  let { amount, mode } = req.body;
  amount = Number(amount);
  if (!id || isNaN(amount)) return res.status(400).json({ error: 'Invalid id or amount' });
  mode = mode === 'set' ? 'set' : 'delta';
  try {
    let row;
    if (mode === 'set') {
      const { rows } = await query('UPDATE users SET balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1 RETURNING id, username, balance, peak_balance', [id, amount]);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      row = rows[0];
    } else {
      const { rows } = await query('UPDATE users SET balance=balance + $2, peak_balance=GREATEST(peak_balance, balance + $2) WHERE id=$1 RETURNING id, username, balance, peak_balance', [id, amount]);
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      row = rows[0];
    }
    res.json({ ok: true, user: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset balance to 1000 if current balance < 1000
app.post('/api/reset-balance', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, balance FROM users WHERE id=$1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const current = Number(rows[0].balance);
    if (current >= 1000) {
      return res.status(400).json({ error: 'Balance is already 1000 or higher' });
    }
  await query('UPDATE users SET balance=1000.00, peak_balance=GREATEST(peak_balance, 1000.00) WHERE id=$1', [req.user.id]);
    res.json({ ok: true, balance: 1000.00 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dice configuration
const DICE_HOUSE_EDGE = 0.01; // 1% house edge similar to Stake
// Multiplier formula (Stake-style): (100 - house_edge_percent) / winChance
// Here house_edge_percent = 100 * DICE_HOUSE_EDGE => 1; effectively 99 / chance.

// Provably fair public dice roll endpoint (stateless)
app.post('/api/roll', (req, res) => {
  const { clientSeed, winChance, nonce, rollOver } = req.body;
  const chance = Number(winChance);
  if (isNaN(chance) || chance < 0 || chance > 100) {
    return res.status(400).json({ error: 'Invalid winChance' });
  }
  const serverSeed = process.env.SERVER_SEED;
  const hash = crypto.createHash('sha256')
    .update(serverSeed + ':' + clientSeed + ':' + nonce)
    .digest('hex');
  const roll = parseInt(hash.slice(0, 8), 16) / 0xffffffff * 100;
  // rollOver: win if roll is above the threshold (100 - chance)
  // rollUnder: win if roll is below the threshold (chance)
  const win = rollOver ? roll > (100 - chance) : roll < chance;
  const multiplier = chance > 0 ? (100 - (DICE_HOUSE_EDGE * 100)) / chance : 0;
  res.json({
    roll: roll.toFixed(2),
    win,
    multiplier: Number(multiplier.toFixed(6)),
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    clientSeed,
    winChance: chance,
    nonce
  });
});

// Persistent dice (requires auth) expects: { bet, winChance, clientSeed, rollOver }
app.post('/api/dice/roll', authMiddleware, async (req, res) => {
  const { bet, winChance, clientSeed, rollOver } = req.body;
  const wager = Number(bet);
  const chance = Number(winChance);
  if (!wager || wager <= 0) return res.status(400).json({ error: 'Invalid bet' });
  if (isNaN(chance) || chance < 0 || chance > 100) return res.status(400).json({ error: 'Invalid winChance' });
  try {
    const client = await require('./db').getClient();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query('SELECT id, balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      if (!userRows.length) throw new Error('User not found');
      const user = userRows[0];
      if (Number(user.balance) < wager) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      const nonce = Math.floor(Math.random() * 1e9);
      const serverSeed = process.env.SERVER_SEED;
      const seedToUse = clientSeed || Math.random().toString(36).slice(2);
      const hash = crypto.createHash('sha256')
        .update(serverSeed + ':' + seedToUse + ':' + nonce)
        .digest('hex');
      const rollVal = parseInt(hash.slice(0, 8), 16) / 0xffffffff * 100;
      const win = rollOver ? rollVal > (100 - chance) : rollVal < chance;
      let payoutMultiplier = 0;
      if (chance > 0) {
        payoutMultiplier = (100 - (DICE_HOUSE_EDGE * 100)) / chance; // 99 / chance
      }
      let payout = 0;
      let newBalance = Number(user.balance) - wager;
      if (win) {
        payout = Number((wager * payoutMultiplier).toFixed(2));
        newBalance += payout;
      }
  await client.query('UPDATE users SET balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1', [user.id, newBalance]);
      await client.query(
        'INSERT INTO bets (user_id, game, wager, payout, result) VALUES ($1,$2,$3,$4,$5)',
        [user.id, 'dice', wager, payout, JSON.stringify({ roll: rollVal.toFixed(2), win, winChance: chance })]
      );
      await client.query('COMMIT');
      res.json({
        roll: rollVal.toFixed(2),
        win,
        payout: payout.toFixed(2),
        multiplier: Number(payoutMultiplier.toFixed(6)),
        newBalance: newBalance.toFixed(2),
        serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
        clientSeed: seedToUse,
        winChance: chance,
        nonce
      });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      console.error('Persistent dice error', e.message);
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  } catch (outer) {
    res.status(500).json({ error: outer.message });
  }
});

// Provably fair crash calculation (Bustabit/Stake style)
// Public crash calc (stateless) retained for non-auth preview
app.post('/api/crash', (req, res) => {
  const { clientSeed, nonce } = req.body;
  const serverSeed = process.env.SERVER_SEED;
  const seed = clientSeed || 'anon';
  const n = Number(nonce) || 0;
  const hash = crypto.createHash('sha256').update(serverSeed + ':' + seed + ':' + n).digest('hex');
  const h = parseInt(hash.slice(0, 13), 16);
  let crashMultiplier;
  if (h % 33 === 0) crashMultiplier = 0; else {
    const X = h / Math.pow(2, 52);
    crashMultiplier = Math.floor((1 / (1 - X)) * 100) / 100;
    if (crashMultiplier < 1.01) crashMultiplier = 1.01;
  }
  res.json({ crashMultiplier, serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'), clientSeed: seed, nonce: n });
});

// Authenticated persistent crash round start: debit bet & pre-generate crash multiplier
// Request: { bet, clientSeed }
app.post('/api/crash/start', authMiddleware, async (req, res) => {
  const { bet, clientSeed } = req.body;
  const wager = Number(bet);
  if (!wager || wager <= 0) return res.status(400).json({ error: 'Invalid bet' });
  const serverSeed = process.env.SERVER_SEED;
  const seed = clientSeed || Math.random().toString(36).slice(2);
  const nonce = Math.floor(Math.random() * 1e9);
  // Deterministic crash point
  const hash = crypto.createHash('sha256').update(serverSeed + ':' + seed + ':' + nonce).digest('hex');
  const h = parseInt(hash.slice(0, 13), 16);
  let crashMultiplier;
  if (h % 33 === 0) crashMultiplier = 0; else {
    const X = h / Math.pow(2, 52);
    crashMultiplier = Math.floor((1 / (1 - X)) * 100) / 100;
    if (crashMultiplier < 1.01) crashMultiplier = 1.01;
  }
  try {
    const client = await require('./db').getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id, balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      if (!rows.length) throw new Error('User not found');
      const user = rows[0];
      if (Number(user.balance) < wager) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
      const newBalance = Number(user.balance) - wager;
  await client.query('UPDATE users SET balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1', [user.id, newBalance]);
      // Record bet with temporary result (cashout handled later)
      const result = { phase: 'started', crashMultiplier, clientSeed: seed, nonce };
      const betInsert = await client.query('INSERT INTO bets (user_id, game, wager, payout, result) VALUES ($1,$2,$3,$4,$5) RETURNING id', [user.id, 'crash', wager, 0, JSON.stringify(result)]);
      await client.query('COMMIT');
      res.json({ ok: true, betId: betInsert.rows[0].id, crashMultiplier, nonce, clientSeed: seed, serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'), newBalance: newBalance.toFixed(2) });
    } catch (e) { try { await client.query('ROLLBACK'); } catch {} res.status(500).json({ error: e.message }); }
    finally { client.release(); }
  } catch (outer) { res.status(500).json({ error: outer.message }); }
});

// Crash cashout: { betId, atMultiplier }
app.post('/api/crash/cashout', authMiddleware, async (req, res) => {
  const { betId, atMultiplier } = req.body;
  const m = Number(atMultiplier);
  if (!betId || !m || m < 1) return res.status(400).json({ error: 'Invalid request' });
  try {
    const client = await require('./db').getClient();
    try {
      await client.query('BEGIN');
      const betRow = await client.query('SELECT * FROM bets WHERE id=$1 AND user_id=$2 FOR UPDATE', [betId, req.user.id]);
      if (!betRow.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bet not found' }); }
      const bet = betRow.rows[0];
      if (bet.game !== 'crash') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Not a crash bet' }); }
      const r = bet.result || {}; // JSONB
      if (r.phase !== 'started') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already finalized' }); }
      const crashMultiplier = r.crashMultiplier;
      let payout = 0;
      let outcome = 'crashed';
      if (crashMultiplier === 0) {
        // Instant crash
        payout = 0;
      } else if (m < crashMultiplier) {
        payout = Number((Number(bet.wager) * m).toFixed(2));
        outcome = 'cashed';
      } else if (m >= crashMultiplier) {
        // Cashed exactly or after crash -> lose
        payout = 0;
      }
      if (payout > 0) {
  await client.query('UPDATE users SET balance = balance + $2, peak_balance=GREATEST(peak_balance, balance + $2) WHERE id=$1', [req.user.id, payout]);
      }
      const newResult = { phase: 'finished', crashMultiplier, cashedAt: outcome === 'cashed' ? m : null, outcome };
      await client.query('UPDATE bets SET payout=$2, result=$3 WHERE id=$1', [betId, payout, JSON.stringify(newResult)]);
      const balRow = await client.query('SELECT balance FROM users WHERE id=$1', [req.user.id]);
      await client.query('COMMIT');
      res.json({ ok: true, outcome, crashMultiplier, cashedAt: outcome === 'cashed' ? m : null, payout: payout.toFixed(2), newBalance: Number(balRow.rows[0].balance).toFixed(2) });
    } catch (e) { try { await client.query('ROLLBACK'); } catch {} res.status(500).json({ error: e.message }); }
    finally { client.release(); }
  } catch (outer) { res.status(500).json({ error: outer.message }); }
});

let blackjackState = null; // Deprecated for persistent mode

function getDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getCardValue(card) {
  if (card.value === 'A') return 11;
  if (['K', 'Q', 'J'].includes(card.value)) return 10;
  return parseInt(card.value, 10);
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;
  for (let card of hand) {
    value += getCardValue(card);
    if (card.value === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

// Persistent Blackjack implementation (auth required)
function dealBlackjackDeck() {
  const deck = getDeck();
  return deck;
}

// Start persistent blackjack hand: { bet }
app.post('/api/blackjack/deal', authMiddleware, async (req, res) => {
  const { bet } = req.body;
  const wager = Number(bet);
  if (!wager || wager <= 0) return res.status(400).json({ error: 'Invalid bet' });
  try {
    const client = await require('./db').getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id, balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      if (!rows.length) throw new Error('User not found');
      if (Number(rows[0].balance) < wager) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
      const newBalance = Number(rows[0].balance) - wager;
  await client.query('UPDATE users SET balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1', [req.user.id, newBalance]);
      const deck = dealBlackjackDeck();
      const playerHand = [deck.pop(), deck.pop()];
      const dealerHand = [deck.pop(), deck.pop()];
      const resultObj = { phase: 'playing', playerHand, dealerHand: [dealerHand[0], { hidden: true }], fullDealer: dealerHand, wager };
      const betInsert = await client.query('INSERT INTO bets (user_id, game, wager, payout, result) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user.id, 'blackjack', wager, 0, JSON.stringify(resultObj)]);

      // Natural blackjack detection (player and/or dealer) before returning to client
      const playerValue = calculateHandValue(playerHand);
      const dealerValueInitial = calculateHandValue(dealerHand);
      const isPlayerNatural = playerHand.length === 2 && playerValue === 21;
      const isDealerNatural = dealerHand.length === 2 && dealerValueInitial === 21;
      if (isPlayerNatural || isDealerNatural) {
        // Resolve immediately
        let outcome = 'push';
        let payout = 0;
        if (isPlayerNatural && !isDealerNatural) {
          outcome = 'blackjack';
          payout = Number((wager * 2.5).toFixed(2)); // wager + 1.5*wager
        } else if (!isPlayerNatural && isDealerNatural) {
          outcome = 'lose';
          payout = 0;
        } else if (isPlayerNatural && isDealerNatural) {
          outcome = 'push';
          payout = wager; // return wager
        }
        if (payout > 0) {
	await client.query('UPDATE users SET balance = balance + $2, peak_balance=GREATEST(peak_balance, balance + $2) WHERE id=$1', [req.user.id, payout]);
        }
        resultObj.phase = 'finished';
        resultObj.outcome = outcome;
        resultObj.dealerHandFinal = dealerHand;
        await client.query('UPDATE bets SET payout=$2, result=$3 WHERE id=$1', [betInsert.rows[0].id, payout, JSON.stringify(resultObj)]);
        const balRow = await client.query('SELECT balance FROM users WHERE id=$1', [req.user.id]);
        await client.query('COMMIT');
        return res.json({
          ok: true,
          betId: betInsert.rows[0].id,
          playerHand,
          dealerHand,
          playerValue,
          dealerValue: dealerValueInitial,
          outcome,
          naturalResolved: true,
          payout: payout.toFixed(2),
          newBalance: Number(balRow.rows[0].balance).toFixed(2)
        });
      }
      await client.query('COMMIT');
      res.json({ ok: true, betId: betInsert.rows[0].id, playerHand, dealerHand: [dealerHand[0], { value: '?', suit: '?' }], playerValue: calculateHandValue(playerHand), dealerValue: getCardValue(dealerHand[0]), newBalance: newBalance.toFixed(2) });
    } catch (e) { try { await client.query('ROLLBACK'); } catch {} res.status(500).json({ error: e.message }); }
    finally { client.release(); }
  } catch (outer) { res.status(500).json({ error: outer.message }); }
});

// Hit: { betId }
app.post('/api/blackjack/hit', authMiddleware, async (req, res) => {
  const { betId } = req.body;
  if (!betId) return res.status(400).json({ error: 'Missing betId' });
  try {
    const { getClient } = require('./db');
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const betRow = await client.query('SELECT * FROM bets WHERE id=$1 AND user_id=$2 FOR UPDATE', [betId, req.user.id]);
      if (!betRow.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bet not found' }); }
      const bet = betRow.rows[0];
      if (bet.game !== 'blackjack') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Not blackjack bet' }); }
      const r = bet.result;
      if (!r || r.phase !== 'playing') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Hand finished' }); }
      // Reconstruct deck from remaining unseen cards (simple approach: regenerate and remove known). For simplicity we store deck? If not stored, create new deck minus cards.
      // Simpler: store remaining deck inside result on first modify.
      if (!r.deck) {
        // Build new deck and remove dealt cards
        const fresh = getDeck();
        const used = [...r.playerHand, ...r.fullDealer];
        for (const u of used) {
          const idx = fresh.findIndex(card => card.value === u.value && card.suit === u.suit);
          if (idx >= 0) fresh.splice(idx, 1);
        }
        r.deck = fresh;
      }
      const nextCard = r.deck.pop();
      r.playerHand.push(nextCard);
      const playerValue = calculateHandValue(r.playerHand);
      let finished = false;
      let outcome = null;
      if (playerValue > 21) {
        // Player busts - only reveal dealer's original two cards (no drawing)
        if (!r.dealerHandFinal) {
          r.dealerHandFinal = r.fullDealer.slice(0, 2);
        }
        finished = true;
        outcome = 'bust';
        r.phase = 'finished';
        r.outcome = outcome;
      }
      await client.query('UPDATE bets SET result=$2 WHERE id=$1', [betId, JSON.stringify(r)]);
      await client.query('COMMIT');
      const payload = { ok: true, playerHand: r.playerHand, playerValue, finished, outcome };
      if (finished) {
        payload.dealerHand = r.dealerHandFinal || r.fullDealer;
        payload.dealerValue = calculateHandValue(r.dealerHandFinal || r.fullDealer);
      }
      res.json(payload);
    } catch (e) { try { await client.query('ROLLBACK'); } catch {} res.status(500).json({ error: e.message }); }
    finally { client.release(); }
  } catch (outer) { res.status(500).json({ error: outer.message }); }
});

// Stand: { betId }
app.post('/api/blackjack/stand', authMiddleware, async (req, res) => {
  const { betId } = req.body;
  if (!betId) return res.status(400).json({ error: 'Missing betId' });
  try {
    const client = await require('./db').getClient();
    try {
      await client.query('BEGIN');
      const betRow = await client.query('SELECT * FROM bets WHERE id=$1 AND user_id=$2 FOR UPDATE', [betId, req.user.id]);
      if (!betRow.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bet not found' }); }
      const bet = betRow.rows[0];
      if (bet.game !== 'blackjack') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Not blackjack bet' }); }
      const r = bet.result;
      if (!r || r.phase !== 'playing') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Hand finished' }); }
      if (!r.deck) {
        const fresh = getDeck();
        const used = [...r.playerHand, ...r.fullDealer];
        for (const u of used) {
          const idx = fresh.findIndex(card => card.value === u.value && card.suit === u.suit);
          if (idx >= 0) fresh.splice(idx, 1);
        }
        r.deck = fresh;
      }
      // Dealer reveal & draw
      const dealerHand = r.fullDealer;
      while (calculateHandValue(dealerHand) < 17) {
        dealerHand.push(r.deck.pop());
      }
      const playerValue = calculateHandValue(r.playerHand);
      const dealerValue = calculateHandValue(dealerHand);
      let outcome;
      // Natural blackjack detection (if not already resolved) - if player started with 21 in 2 cards
      const isPlayerNatural = r.playerHand.length === 2 && playerValue === 21;
      const isDealerNatural = dealerHand.length === 2 && dealerValue === 21;
      if (isPlayerNatural || isDealerNatural) {
        if (isPlayerNatural && !isDealerNatural) outcome = 'blackjack';
        else if (!isPlayerNatural && isDealerNatural) outcome = 'lose';
        else outcome = 'push';
      } else {
        if (dealerValue > 21 || playerValue > dealerValue) outcome = 'win';
        else if (playerValue === dealerValue) outcome = 'push';
        else outcome = 'lose';
      }
      if (dealerValue > 21 || playerValue > dealerValue) outcome = 'win';
      else if (playerValue === dealerValue) outcome = 'push';
      else outcome = 'lose';
      let payout = 0;
      if (outcome === 'blackjack') payout = Number((Number(bet.wager) * 2.5).toFixed(2));
      else if (outcome === 'win') payout = Number((Number(bet.wager) * 2).toFixed(2));
      else if (outcome === 'push') payout = Number(bet.wager);
      if (payout > 0) {
  await client.query('UPDATE users SET balance = balance + $2, peak_balance=GREATEST(peak_balance, balance + $2) WHERE id=$1', [req.user.id, payout]);
      }
      r.phase = 'finished';
      r.outcome = outcome;
      r.dealerHandFinal = dealerHand;
      await client.query('UPDATE bets SET payout=$2, result=$3 WHERE id=$1', [betId, payout, JSON.stringify(r)]);
      const balRow = await client.query('SELECT balance FROM users WHERE id=$1', [req.user.id]);
      await client.query('COMMIT');
      res.json({ ok: true, dealerHand, dealerValue, playerValue, outcome, payout: payout.toFixed(2), newBalance: Number(balRow.rows[0].balance).toFixed(2) });
    } catch (e) { try { await client.query('ROLLBACK'); } catch {} res.status(500).json({ error: e.message }); }
    finally { client.release(); }
  } catch (outer) { res.status(500).json({ error: outer.message }); }
});

// Development-only route inspector (do NOT enable in production without auth)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/_routes', (req, res) => {
    const collected = [];
    const pushRoute = (method, path) => collected.push({ method, path });
    try {
      if (app._router && app._router.stack) {
        app._router.stack.forEach(layer => {
          if (layer.route && layer.route.path) {
            const methods = layer.route.methods || {};
            Object.keys(methods).forEach(m => {
              if (methods[m]) pushRoute(m.toUpperCase(), layer.route.path);
            });
          } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            layer.handle.stack.forEach(sub => {
              if (sub.route && sub.route.path) {
                const methods = sub.route.methods || {};
                Object.keys(methods).forEach(m => {
                  if (methods[m]) pushRoute(m.toUpperCase(), sub.route.path);
                });
              }
            });
          }
        });
      }
      res.json({ count: collected.length, routes: collected });
    } catch (e) {
      res.status(500).json({ error: 'Failed to enumerate routes', details: e.message });
    }
  });
}

// ===================== SLOTS =====================
// Two variants: 'joker' (3×3, respin mechanic) and 'golden' (5×3, book scatter)

const { SLOTS_CONFIG, spinRound } = require('./slots/math');
const slotMachines = require('./slots/machines');

app.post('/api/slots/spin', authMiddleware, async (req, res) => {
  const { bet, clientSeed, variant = 'joker', machineId, sessionId } = req.body;
  const requestId = req.body.requestId || crypto.randomUUID();
  const wager = Number(bet);
  if (!Number.isFinite(wager) || wager < 0.1 || wager > 1000000 || Math.abs(wager * 100 - Math.round(wager * 100)) > 0.00001 || !slotMachines.uuid(requestId)) return res.status(400).json({ error: 'Invalid bet or request ID' });
  const config = Object.prototype.hasOwnProperty.call(SLOTS_CONFIG, variant) ? SLOTS_CONFIG[variant] : null;
  if (!config) return res.status(400).json({ error: 'Invalid variant' });

  const serverSeed = process.env.SERVER_SEED || 'default-server-seed';
  const seed = typeof clientSeed === 'string' ? clientSeed.slice(0, 128) : crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomInt(0, 2 ** 48 - 1);

  try {
    const client = await require('./db').getClient();
    try {
      await client.query('BEGIN');
      // Serialize retries by user/request before acquiring machine and wallet locks.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`slots:${req.user.id}:${requestId}`]);
      const previous = await client.query('SELECT response FROM casino_slot_requests WHERE user_id=$1 AND request_id=$2', [req.user.id, requestId]);
      if (previous.rows.length) {
        const current = await client.query('SELECT balance FROM users WHERE id=$1', [req.user.id]);
        await client.query('COMMIT');
        return res.json({ ...previous.rows[0].response, newBalance: String(current.rows[0].balance), serverNow: Date.now() });
      }
      await slotMachines.lockMachine(client, machineId, sessionId, req.user.id, variant);
      const { rows: userRows } = await client.query(
        'SELECT id, balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id]
      );
      if (!userRows.length) throw new Error('User not found');
      const user = userRows[0];
      if (Number(user.balance) < wager) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      const { stops, visible, wins, totalPayout, respinInfo, initialVisible } = spinRound({ variant, wager, serverSeed, seed, nonce });

      const payout = Number(totalPayout.toFixed(2));
      const newBalance = Number((Number(user.balance) - wager + payout).toFixed(2));

      await client.query(
        'UPDATE users SET balance=$2, peak_balance=GREATEST(peak_balance,$2) WHERE id=$1',
        [user.id, newBalance]
      );
      await client.query(
        'INSERT INTO bets (user_id, game, wager, payout, result) VALUES ($1,$2,$3,$4,$5)',
        [user.id, `slots_${variant}`, wager, payout, JSON.stringify({ stops, winCount: wins.length, totalPayout: payout, mathVersion: config.mathVersion, requestId, machineId })]
      );
      const startedAt = Date.now();
      const durationMs = respinInfo ? 6500 : variant === 'golden' ? 5000 : 4000;
      const publicSpin = { id: requestId, machineId: machineId || null, userId: req.user.id, username: req.user.username,
        variant, startedAt, durationMs, visible, initialVisible, respin: respinInfo, wins, bet: wager, totalPayout: payout, mathVersion: config.mathVersion };
      const response = {
        ok: true, stops, visible, wins, initialVisible, mathVersion: config.mathVersion, spin: publicSpin,
        totalPayout: payout.toFixed(2),
        newBalance: newBalance.toFixed(2),
        respin: respinInfo,
        serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
        clientSeed: seed, nonce,
      };
      await client.query('INSERT INTO casino_slot_requests(user_id,request_id,response) VALUES($1,$2,$3)', [user.id, requestId, JSON.stringify(response)]);
      if (machineId) await client.query(`UPDATE casino_slot_machines SET last_spin=$2,
        spin_ends_at=to_timestamp($3/1000.0),lease_until=GREATEST(lease_until,to_timestamp($3/1000.0)) WHERE machine_id=$1`,
      [machineId, JSON.stringify(publicSpin), startedAt + durationMs]);
      await client.query('COMMIT');
      res.json({ ...response, serverNow: Date.now() });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Unable to confirm this spin. Retry the same request.' });
    } finally {
      client.release();
    }
  } catch (outer) {
    res.status(500).json({ error: outer.message });
  }
});

// Start a local server only when this file is executed directly. Vercel imports
// the app from api/[...path].js and supplies the HTTP server itself.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
