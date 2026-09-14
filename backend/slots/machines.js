const express = require('express');
const { getClient, query } = require('../db');
const layout = require('../../frontend/src/casino/worldLayout.json');
const uuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const machine = id => layout.slotMachines.find(m => m.id === id);

function router(auth) {
  const r = express.Router();
  r.get('/', async (req, res) => {
    try {
      const { rows } = await query(`SELECT m.machine_id AS id,
        CASE WHEN GREATEST(m.lease_until,m.spin_ends_at)>NOW() THEN u.id ELSE NULL END AS "userId",
        CASE WHEN GREATEST(m.lease_until,m.spin_ends_at)>NOW() THEN u.username ELSE NULL END AS username,
        m.last_spin AS spin FROM casino_slot_machines m LEFT JOIN users u ON u.id=m.user_id`);
      res.json({ machines: rows, serverNow: Date.now() });
    } catch { res.status(503).json({ error: 'Shared slots unavailable. The casino migration may be required.' }); }
  });
  r.post('/:id/claim', auth, async (req, res) => {
    const { sessionId } = req.body || {};
    if (!machine(req.params.id) || !uuid(sessionId)) return res.sendStatus(400);
    let client;
    try {
      client = await getClient(); await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['casino-slot-claims']);
      await client.query('INSERT INTO casino_slot_machines(machine_id) VALUES($1) ON CONFLICT DO NOTHING', [req.params.id]);
      const row = (await client.query('SELECT *, GREATEST(lease_until,spin_ends_at)>NOW() AS active FROM casino_slot_machines WHERE machine_id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (row.active && row.user_id && (row.user_id !== req.user.id || row.session_id !== sessionId)) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Someone is already using this machine.' });
      }
      const other = await client.query('SELECT 1 FROM casino_slot_machines WHERE machine_id<>$1 AND user_id=$2 AND GREATEST(lease_until,spin_ends_at)>NOW()', [req.params.id, req.user.id]);
      if (other.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Stand up from your other machine first.' }); }
      await client.query("UPDATE casino_slot_machines SET user_id=$2,session_id=$3,lease_until=NOW()+INTERVAL '15 seconds' WHERE machine_id=$1", [req.params.id, req.user.id, sessionId]);
      await client.query('COMMIT'); res.json({ ok: true });
    } catch {
      if (client) await client.query('ROLLBACK').catch(() => {});
      res.status(503).json({ error: 'Cannot reserve this machine right now.' });
    } finally { client?.release(); }
  });
  r.delete('/:id/:sessionId', auth, async (req, res) => {
    if (!machine(req.params.id) || !uuid(req.params.sessionId)) return res.sendStatus(400);
    try {
      await query('UPDATE casino_slot_machines SET lease_until=NOW() WHERE machine_id=$1 AND user_id=$2 AND session_id=$3', [req.params.id, req.user.id, req.params.sessionId]);
      res.sendStatus(204);
    } catch { res.sendStatus(503); }
  });
  return r;
}
async function lockMachine(client, machineId, sessionId, userId, variant) {
  if (!machineId) return;
  const fail = (message, status = 409) => { const error = new Error(message); error.status = status; throw error; };
  if (!machine(machineId) || machine(machineId).variant !== variant || !uuid(sessionId)) fail('Invalid slot machine.', 400);
  const row = (await client.query('SELECT *,lease_until>NOW() AS leased,spin_ends_at>NOW() AS spinning FROM casino_slot_machines WHERE machine_id=$1 FOR UPDATE', [machineId])).rows[0];
  if (!row || !row.leased || row.user_id !== userId || row.session_id !== sessionId) fail('Sit at this machine again before spinning.');
  if (row.spinning) fail('Wait for this machine to finish spinning.');
}
module.exports = { router, lockMachine, uuid };
