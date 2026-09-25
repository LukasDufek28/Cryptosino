import { act, renderHook, waitFor } from '@testing-library/react';
import useBlackjackTable from './useBlackjackTable';

test('leaving preserves an active hand but clears a completed hand before rejoining', async () => {
  const originalFetch = global.fetch;
  const originalCrypto = global.crypto;
  Object.defineProperty(global, 'crypto', { configurable: true, value: { ...originalCrypto, randomUUID: () => 'test-round' } });
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => url.endsWith('/deal') ? {
    betId: 42, playerHand: [{ value: '10', suit: '♠' }, { value: '7', suit: '♥' }],
    dealerHand: [{ value: '9', suit: '♣' }, { value: '?', suit: '?' }], newBalance: '995.00'
  } : { outcome: 'lose', dealerHand: [{ value: '9', suit: '♣' }, { value: '10', suit: '♦' }], payout: 0, newBalance: '995.00' } }));
  let seatId = null, dispatch = null, visual = null;
  const scene = {
    pose: () => ({ seatId }),
    sitAtBlackjack: () => { seatId = 'seat-blackjack-live'; },
    setBlackjackAction: action => { dispatch = action; },
    updateBlackjack: next => { visual = next; },
    publishBlackjack: () => {}
  };
  const sceneRef = { current: scene };
  const setBalance = jest.fn();
  try {
    const { result, unmount } = renderHook(() => useBlackjackTable(sceneRef, true, 'test-token', setBalance, 1000));
    act(() => result.current.claim());
    act(() => dispatch('chip:5'));
    act(() => dispatch('deal'));
    await waitFor(() => expect(visual.phase).toBe('playing'));
    expect(visual.playerHand).toHaveLength(2);

    seatId = null;
    act(() => result.current.onSeatChange(null));
    expect(visual.active).toBe(false);
    act(() => result.current.claim());
    expect(visual.phase).toBe('playing');
    expect(visual.playerHand).toHaveLength(2);

    act(() => dispatch('stand'));
    await waitFor(() => expect(visual.phase).toBe('finished'));
    seatId = null;
    act(() => result.current.onSeatChange(null));
    act(() => result.current.claim());
    expect(visual.phase).toBe('betting');
    expect(visual.playerHand).toHaveLength(0);
    expect(visual.dealerHand).toHaveLength(0);
    expect(visual.bet).toBe(0);
    unmount();
  } finally {
    global.fetch = originalFetch;
    Object.defineProperty(global, 'crypto', { configurable: true, value: originalCrypto });
  }
});
