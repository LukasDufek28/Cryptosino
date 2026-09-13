const express = require('express');
const { createHmac } = require('node:crypto');
const { getClient, query } = require('../db');
const world = require('../../frontend/src/casino/worldLayout.json');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function iceConfig(userId) {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const urls = (process.env.CASINO_TURN_URLS || '').split(',').map(s => s.trim()).filter(s => /^turns?:/.test(s));
  if (urls.length && process.env.CASINO_TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
    const credential = createHmac('sha1', process.env.CASINO_TURN_SECRET).update(username).digest('base64');
    iceServers.push({ urls, username, credential });
  }
  return { iceServers, relayConfigured: iceServers.length > 1 };
}

module.exports = function browserRoom(authMiddleware) {
  const router = express.Router();
  router.use(authMiddleware);
  router.post('/sync', async (req, res) => {
    const { sessionId, generation = 0, ack = '0', signals = [] } = req.body || {};
    if (!uuid(sessionId) || !Number.isInteger(generation) || generation < 0 ||
        !/^\d{1,18}$/.test(String(ack)) || !Array.isArray(signals) || signals.length > 12 ||
        signals.some(s => !s || !uuid(s.to) || !uuid(s.id) || !uuid(s.connection) ||
          !['offer', 'answer'].includes(s.type) || typeof s.sdp !== 'string' || s.sdp.length > 20000)) {
      return res.status(400).json({ error: 'Invalid room setup request.' });
    }
    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');
      await client.query('INSERT INTO casino_browser_rooms(room_id) VALUES($1) ON CONFLICT DO NOTHING', [world.id]);
      const room = (await client.query('SELECT * FROM casino_browser_rooms WHERE room_id=$1 FOR UPDATE', [world.id])).rows[0];
      await client.query("DELETE FROM casino_browser_members WHERE room_id=$1 AND updated_at < NOW() - INTERVAL '12 seconds'", [world.id]);
      await client.query("DELETE FROM casino_browser_signals WHERE room_id=$1 AND created_at < NOW() - INTERVAL '45 seconds'", [world.id]);
      const members = (await client.query('SELECT * FROM casino_browser_members WHERE room_id=$1', [world.id])).rows;
      const existing = members.find(m => m.session_id === sessionId);
      if ((existing && existing.user_id !== req.user.id) || members.some(m => m.user_id === req.user.id && m.session_id !== sessionId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This account already has a room open. Close the other tab or use a different account.' });
      }
      if (!existing && members.length >= world.capacity) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'This room is full.' });
      }
      if (existing && Date.now() - new Date(existing.updated_at).getTime() < 350) {
        await client.query('ROLLBACK'); return res.status(429).json({ error: 'Room setup is updating too quickly.' });
      }
      await client.query(`INSERT INTO casino_browser_members(session_id,room_id,user_id) VALUES($1,$2,$3)
        ON CONFLICT(session_id) DO UPDATE SET updated_at=NOW()`, [sessionId, world.id, req.user.id]);
      const roster = (await client.query(`SELECT m.session_id AS "sessionId",u.id,u.username FROM casino_browser_members m
        JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.joined_at,m.session_id`, [world.id])).rows;
      if (!roster.some(m => m.sessionId === room.host_session)) {
        room.host_session = roster[0].sessionId;
        room.generation += 1;
        await client.query('UPDATE casino_browser_rooms SET host_session=$2,generation=$3 WHERE room_id=$1', [world.id, room.host_session, room.generation]);
        await client.query('DELETE FROM casino_browser_signals WHERE room_id=$1', [world.id]);
      }
      await client.query('DELETE FROM casino_browser_signals WHERE recipient=$1 AND id <= $2::bigint', [sessionId, String(ack)]);
      if (generation === room.generation) {
        const queued = Number((await client.query('SELECT COUNT(*) FROM casino_browser_signals WHERE sender=$1', [sessionId])).rows[0].count);
        if (queued + signals.length > 96) {
          await client.query('ROLLBACK'); return res.status(429).json({ error: 'Room setup queue is full.' });
        }
        for (const signal of signals) {
          const validPair = signal.to !== sessionId && roster.some(m => m.sessionId === signal.to) &&
            (signal.type === 'offer' ? sessionId === room.host_session : signal.to === room.host_session);
          if (!validPair) continue;
          await client.query(`INSERT INTO casino_browser_signals(room_id,generation,sender,recipient,message_id,payload)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(sender,message_id) DO NOTHING`,
          [world.id, room.generation, sessionId, signal.to, signal.id, JSON.stringify({ type: signal.type, sdp: signal.sdp, connection: signal.connection })]);
        }
      }
      const inbox = (await client.query(`SELECT id::text,sender,payload FROM casino_browser_signals
        WHERE recipient=$1 AND generation=$2 ORDER BY id LIMIT 96`, [sessionId, room.generation])).rows;
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      await client.query('COMMIT');
      res.json({ sessionId, selfId: req.user.id, hostSession: room.host_session, generation: room.generation,
        roster, signals: inbox, worldSeconds: (new Date(now) - new Date(room.started_at)) / 1000, ...iceConfig(req.user.id) });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(503).json({ error: error.code === '42P01' ? 'Browser rooms need the casino database migration.' : 'Room setup unavailable; exploring solo.' });
    } finally { if (client) client.release(); }
  });
  router.delete('/:sessionId', async (req, res) => {
    if (!uuid(req.params.sessionId)) return res.sendStatus(400);
    try {
      await query('DELETE FROM casino_browser_members WHERE session_id=$1 AND user_id=$2 AND room_id=$3', [req.params.sessionId, req.user.id, world.id]);
      res.sendStatus(204);
    } catch { res.sendStatus(503); }
  });
  return router;
};
