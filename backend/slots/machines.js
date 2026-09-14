const layout = require('../../frontend/src/casino/worldLayout.json');

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const machine = id => layout.slotMachines.find(item => item.id === id);

// Seat ownership and shared animations live on the elected WebRTC lobby host.
// The API only validates the cabinet identity before its authenticated,
// transactional wager settlement; no slot-machine state touches Postgres.
async function lockMachine(client, machineId, sessionId, userId, variant) {
  if (!machineId) return;
  const selected = machine(machineId);
  if (!selected || selected.variant !== variant) {
    const error = new Error('Invalid slot machine.');
    error.status = 400;
    throw error;
  }
}

module.exports = { lockMachine, uuid };
