import browserRoom, { poseSignature } from './browserRoom';
import slotConfigs from '../slots/config.json';

test('idle pose suppression still sends movement and discrete state changes', () => {
  const pose = { x: 1, z: 2, yaw: 0, jumpHeight: 0, floor: 2, seatId: null, faceSeed: 1, revision: 0 };
  const idle = poseSignature(pose);
  expect(poseSignature({ ...pose })).toBe(idle);
  for (const change of [{ x: 1.1 }, { yaw: 0.1 }, { floor: 1 },
    { seatId: 'seat-blackjack-live' }, { faceSeed: 2 }, { revision: 1 }, { jumpHeight: 0.1 }]) {
    expect(poseSignature({ ...pose, ...change })).not.toBe(idle);
  }
});

test('the room host shares a spin preview before the validated final result', async () => {
  const originalFetch = global.fetch;
  const originalCrypto = window.crypto;
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => 'session-a' } });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({
    selfId: 42, hostSession: 'session-a', generation: 1, roster: [
      { sessionId: 'session-a', id: 42, username: 'Player', balance: 100, version: '0.0.28' }
    ], iceServers: [], relayConfigured: false, signals: [], worldSeconds: 10
  }) }));
  const states = [];
  const scene = {
    pose: () => ({ x: 1, z: 2, yaw: 0, floor: 2, jumpHeight: 0, faceSeed: 1, seatId: null, revision: 0 }),
    setSlotCommand: callback => { scene.request = callback; },
    setBlackjackPublisher: jest.fn(), setChatSender: jest.fn(), setWorldClock: jest.fn(),
    updatePeers: jest.fn(), peerCount: () => 0, receiveSlotState: state => states.push(state)
  };
  const leave = browserRoom('token', scene, () => {});
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    await scene.request('claim', { machineId: 'amber-joker' });
    await scene.request('start', { machineId: 'amber-joker', previewId: 'preview-1', bet: 5 });
    const preview = states.at(-1).machines.find(machine => machine.id === 'amber-joker');
    expect(preview.spin).toBeNull();
    expect(preview.preview).toMatchObject({ id: 'preview-1', bet: 5 });

    const spin = { id: 'result-1', machineId: 'amber-joker', variant: 'joker', userId: 42,
      username: 'Player', startedAt: Date.now(), durationMs: 2850, bet: 5, totalPayout: 0,
      balanceBefore: 100, visible: slotConfigs.joker.reels.map(reel => reel.slice(0, 3)) };
    await scene.request('spin', { machineId: 'amber-joker', previewId: 'preview-1', spin, serverNow: Date.now() });
    const final = states.at(-1).machines.find(machine => machine.id === 'amber-joker');
    expect(final.spin.id).toBe('result-1');
    expect(final.preview.id).toBe('preview-1');
    expect(Number.isFinite(final.presentationStartedAt)).toBe(true);

    await scene.request('release', { machineId: 'amber-joker' });
    await scene.request('claim', { machineId: 'amber-olympus' });
    await scene.request('start', { machineId: 'amber-olympus', previewId: 'preview-2', bet: 5 });
    const olympusSpin = { ...spin, id: 'result-2', machineId: 'amber-olympus', variant: 'olympus',
      durationMs: 450, visible: Array.from({ length: 6 }, () => Array(5).fill('BLUE')) };
    await scene.request('spin', { machineId: 'amber-olympus', previewId: 'preview-2', spin: olympusSpin, serverNow: Date.now() });
    const olympusFinal = states.at(-1).machines.find(machine => machine.id === 'amber-olympus');
    expect(olympusFinal.spin.id).toBe('result-2');
    await scene.request('spin', { machineId: 'amber-olympus', previewId: 'preview-2', spin: olympusSpin, serverNow: Date.now() });
    expect(states.at(-1).machines.find(machine => machine.id === 'amber-olympus').presentationStartedAt)
      .toBe(olympusFinal.presentationStartedAt);
  } finally {
    leave();
    global.fetch = originalFetch;
    Object.defineProperty(window, 'crypto', { configurable: true, value: originalCrypto });
  }
});
