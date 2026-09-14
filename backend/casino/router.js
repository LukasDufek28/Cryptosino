const express = require('express');
const world = require('../../frontend/src/casino/worldLayout.json');
const { getClient, query } = require('../db');

// Durable presence for multiple API instances. Replace this transport with a
// dedicated room server for high-frequency movement; never settle bets here.
module.exports = function casinoRouter(authMiddleware) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/world', (req, res) => res.json(world));
  router.get('/leaderboard', async (req, res) => {
    try {
      const [current, peak] = await Promise.all([
        query('SELECT username, balance FROM users ORDER BY balance DESC, id ASC LIMIT 10'),
        query('SELECT username, peak_balance FROM users ORDER BY peak_balance DESC, id ASC LIMIT 10')
      ]);
      res.json({ leaders: current.rows, peakLeaders: peak.rows });
    } catch { res.status(503).json({ error: 'Leaderboard unavailable.' }); }
  });
  router.get('/leaderboard/peak', async (req, res) => {
    try {
      const { rows } = await query('SELECT username, peak_balance FROM users ORDER BY peak_balance DESC, id ASC LIMIT 10');
      res.json({ leaders: rows });
    } catch { res.status(503).json({ error: 'Peak balance leaderboard unavailable.' }); }
  });
  router.use('/browser-room', require('./browserRoom')(authMiddleware));
  router.put('/presence', authMiddleware, async (req, res) => {
    const { x, z, yaw, seatId = null } = req.body;
    const faceSeed = req.body.faceSeed ?? 0;
    if (!Number.isInteger(faceSeed) || faceSeed < 0 || faceSeed > 2147483647) {
      return res.status(400).json({ error: 'Invalid face.' });
    }
    if (![x, z, yaw].every(v => typeof v === 'number' && Number.isFinite(v)) ||
        Math.abs(x) > 55 || z < -10 || z > 35 || Math.abs(yaw) > Math.PI * 2 + 0.01) {
      return res.status(400).json({ error: 'Invalid player position.' });
    }
    const seat = world.seats.find(s => s.id === seatId);
    if (seatId !== null && !seat) return res.status(400).json({ error: 'Unknown seat.' });
    if (seat && Math.hypot(x - seat.x, z - seat.z) > 3.2) {
      return res.status(400).json({ error: 'Move closer to the couch.' });
    }
    const upper = req.body.floor === 2;
    if (seat && !upper) return res.status(400).json({ error: 'The lounge is upstairs.' });
    const stairs = world.stairs;
    const onStairs = x > stairs.walkMinX && x < stairs.walkMaxX && z > stairs.topZ && z < stairs.bottomZ;
    const y = seat ? world.upperFloor : onStairs
      ? world.upperFloor * (stairs.bottomZ - z) / (stairs.bottomZ - stairs.topZ)
      : upper ? world.upperFloor : 0;
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [world.id]);
      await client.query("DELETE FROM casino_presence WHERE updated_at < NOW() - INTERVAL '12 seconds'");
      const count = await client.query('SELECT COUNT(*)::int AS count FROM casino_presence WHERE room_id=$1 AND user_id<>$2', [world.id, req.user.id]);
      if (count.rows[0].count >= world.capacity) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This room is full.' });
      }
      await client.query(`INSERT INTO casino_presence (room_id,user_id,x,y,z,yaw,seat_id,face_seed)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (room_id,user_id) DO UPDATE SET
        x=EXCLUDED.x,y=EXCLUDED.y,z=EXCLUDED.z,yaw=EXCLUDED.yaw,seat_id=EXCLUDED.seat_id,face_seed=EXCLUDED.face_seed,updated_at=NOW()`,
      [world.id, req.user.id, seat ? seat.x : x, y, seat ? seat.z : z, seat ? seat.yaw : yaw, seatId, faceSeed]);
      const peers = await client.query(`SELECT p.user_id AS id,u.username,u.is_admin,COALESCE(u.is_owner,FALSE) AS is_owner,p.x,p.y,p.z,p.yaw,p.seat_id AS "seatId",p.face_seed AS "faceSeed"
        FROM casino_presence p JOIN users u ON u.id=p.user_id WHERE room_id=$1 AND user_id<>$2`, [world.id, req.user.id]);
      await client.query('COMMIT');
      res.json({ roomId: world.id, players: peers.rows, capacity: world.capacity });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return res.status(409).json({ code: 'SEAT_OCCUPIED', error: 'That seat is occupied.' });
      res.status(503).json({ error: 'Shared room unavailable. You can keep exploring solo.' });
    } finally { if (client) client.release(); }
  });
  router.delete('/presence', authMiddleware, async (req, res) => {
    try {
      await query('DELETE FROM casino_presence WHERE room_id=$1 AND user_id=$2', [world.id, req.user.id]);
      res.sendStatus(204);
    } catch { res.status(503).json({ error: 'Room unavailable.' }); }
  });
  return router;
};
