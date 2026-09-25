import { act, renderHook } from '@testing-library/react';
import useSlotMachines from './useSlotMachines';

jest.mock('./demoCasino', () => ({ LOCAL_DEMO: true, demoSlotSpin: jest.fn() }));
jest.mock('./slotAudio', () => ({ startSlotAmbience: jest.fn(), stopSlotAmbience: jest.fn() }));

test('signed-in localhost players still claim a shared WebRTC slot seat', async () => {
  const scene = {
    requestSlot: jest.fn(async () => ({ ok: true })),
    setSlotStateReceiver: jest.fn(), setSlotAction: jest.fn(), updateSlotControlState: jest.fn(),
    sitAtSlot: jest.fn(), stand: jest.fn(), pose: () => ({ seatId: 'seat-amber-joker' })
  };
  const sceneRef = { current: scene };
  const { result, unmount } = renderHook(() => useSlotMachines(sceneRef, true, 'signed-in-token', jest.fn(), 100));
  await act(async () => { await result.current.claim('amber-joker'); });
  expect(scene.requestSlot).toHaveBeenCalledWith('claim', { machineId: 'amber-joker' });
  expect(scene.sitAtSlot).toHaveBeenCalledWith('amber-joker');
  unmount();
});

test('a failed room share retries the saved Olympus result without another wager', async () => {
  const originalFetch = global.fetch;
  const originalCrypto = global.crypto;
  global.crypto = { randomUUID: () => 'request-1' };
  const spin = { id: 'result-1', machineId: 'amber-olympus', variant: 'olympus', userId: 1,
    username: 'Player', startedAt: Date.now(), durationMs: 450, bet: 5, totalPayout: 0,
    balanceBefore: 100, visible: Array.from({ length: 6 }, () => Array(5).fill('BLUE')) };
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ spin, serverNow: Date.now(), newBalance: 95 }) }));
  let shareAttempts = 0;
  const scene = {
    requestSlot: jest.fn(async action => {
      if (action === 'spin' && ++shareAttempts === 1) throw new Error('Reply lost');
      return { ok: true };
    }),
    setSlotStateReceiver: jest.fn(), setSlotAction: jest.fn(), updateSlotControlState: jest.fn(), updateSlots: jest.fn(),
    sitAtSlot: jest.fn(), stand: jest.fn(), pose: () => ({ seatId: 'seat-amber-olympus' })
  };
  const sceneRef = { current: scene }, setBalance = jest.fn();
  const { result, unmount } = renderHook(() => useSlotMachines(sceneRef, true, 'signed-in-token', setBalance, 100));
  try {
    await act(async () => { await result.current.claim('amber-olympus'); });
    await act(async () => { await result.current.spin(); });
    expect(result.current.retry).toBe(true);
    await act(async () => { await result.current.spin(); });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(scene.requestSlot.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1);
    expect(scene.requestSlot.mock.calls.filter(([action]) => action === 'spin')).toHaveLength(2);
    expect(scene.requestSlot.mock.calls.filter(([action]) => action === 'spin')[0][1].spin.durationMs).toBe(1000);
    expect(result.current.retry).toBe(false);
  } finally {
    unmount();
    global.fetch = originalFetch;
    global.crypto = originalCrypto;
  }
});
