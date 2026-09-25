import { LANDING_CELL, PREVIEW_CELLS_PER_MS, reelFillerSymbol, reelStripSymbol, reelTravelCells } from './reelMotion';

test('81 Ways reels roll into the actual result without changing symbols at the stop', () => {
  const strip = ['A', 'B', 'C', 'D'];
  const start = ['C', 'A', 'D'];
  const result = ['B', 'D', 'A'];
  expect(reelTravelCells(0, 1200)).toBe(0);
  expect(reelTravelCells(1200, 1200)).toBeCloseTo(LANDING_CELL);
  expect(reelTravelCells(1199, 1200)).toBeLessThan(LANDING_CELL);
  expect([0, 1, 2].map(index => reelStripSymbol(strip, start, result, index, 7))).toEqual(start);
  expect([0, 1, 2].map(row => reelStripSymbol(strip, start, result, LANDING_CELL + row, 7))).toEqual(result);
  expect([0, 1, 2].map(row => reelStripSymbol(strip, start, result, LANDING_CELL + 8 + row, 7, LANDING_CELL + 8))).toEqual(result);
  expect(reelFillerSymbol(strip, start, LANDING_CELL, 7)).toBeDefined();
});

test('different viewers can see different filler while landing on the same shared symbols', () => {
  const strip = ['A', 'B', 'C', 'D', 'E'];
  const result = ['C', 'A', 'E'];
  const startTravel = 675 * PREVIEW_CELLS_PER_MS;
  const landingCell = Math.ceil(startTravel) + LANDING_CELL;
  const visibleIndex = Math.floor(startTravel) + 1;
  for (const seed of [13, 294]) {
    expect(reelStripSymbol(strip, null, result, visibleIndex, seed, landingCell))
      .toBe(reelFillerSymbol(strip, null, visibleIndex, seed));
    expect([0, 1, 2].map(row => reelStripSymbol(strip, null, result, landingCell + row, seed, landingCell)))
      .toEqual(result);
  }
  expect(reelFillerSymbol(strip, null, visibleIndex, 13)).not.toBe(reelFillerSymbol(strip, null, visibleIndex, 294));
});

test('five-row Olympus reels land on all five result symbols', () => {
  const strip = ['A', 'B', 'C', 'D', 'E', 'F'];
  const start = ['F', 'E', 'D', 'C', 'B'];
  const result = ['A', 'B', 'C', 'D', 'E'];
  expect([0, 1, 2, 3, 4].map(index => reelFillerSymbol(strip, start, index, 4))).toEqual(start);
  expect([0, 1, 2, 3, 4].map(row => reelStripSymbol(strip, start, result, LANDING_CELL + row, 4))).toEqual(result);
});
