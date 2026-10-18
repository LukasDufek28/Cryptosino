export function lotQuantity(lots, asset) {
  if (!asset) return null;
  const value = Number(lots), raw = value * (asset.lotUnits || 1), units = Math.round(raw);
  const steps = value / (asset.lotStep || 1);
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(units) || units < 1 || units > 10000 ||
      Math.abs(raw - units) > 1e-7 || Math.abs(steps - Math.round(steps)) > 1e-7) return null;
  return units;
}

export function aggregateCandles(history, minutes) {
  const buckets = new Map(), interval = minutes * 60000;
  for (const bar of history) {
    const close = bar.close || bar.referencePrice;
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(bar.time)) continue;
    const time = Math.floor(bar.time / interval) * interval;
    const open = bar.open || close, high = bar.high || close, low = bar.low || close;
    const current = buckets.get(time);
    if (current) { current.high = Math.max(current.high, high); current.low = Math.min(current.low, low); current.close = close; }
    else buckets.set(time, {time, open, high, low, close});
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
