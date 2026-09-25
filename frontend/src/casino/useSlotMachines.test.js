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
