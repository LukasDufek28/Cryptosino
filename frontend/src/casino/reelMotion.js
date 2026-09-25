// The final three cells of the moving strip are the outcome. The strip stops
// at an exact cell boundary, so the landed symbols never need to be replaced.
export const LANDING_CELL = 12;
export const PREVIEW_CELLS_PER_MS = 0.013;

export function reelTravelCells(elapsed, stopAt) {
  const time = Math.max(0, Math.min(elapsed, stopAt));
  const slowMs = Math.min(260, stopAt / 2);
  const cruiseMs = stopAt - slowMs;
  const speed = LANDING_CELL / (cruiseMs + slowMs / 2);
  if (time <= cruiseMs) return time * speed;
  const slowTime = time - cruiseMs;
  return speed * (cruiseMs + slowTime - slowTime * slowTime / (2 * slowMs));
}

export function reelFillerSymbol(strip, start, index, seed) {
  if (index >= 0 && index < (start?.length || 0) && start[index]) return start[index];
  const offset = ((seed % strip.length) + strip.length) % strip.length;
  return strip[((index + offset) % strip.length + strip.length) % strip.length];
}

export function reelStripSymbol(strip, start, result, index, seed, landingCell = LANDING_CELL) {
  if (index >= landingCell && index < landingCell + (result?.length || 0)) return result[index - landingCell] || reelFillerSymbol(strip,start,index,seed);
  return reelFillerSymbol(strip,start,index,seed);
}
