const crypto = require('node:crypto');
const SLOTS_CONFIG = require('../../frontend/src/slots/config.json');
const { spinOlympusRound } = require('./olympus');

function slotsSpinReel(strip, reelIdx, serverSeed, clientSeed, nonce, offset = 0) {
  const hash = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:r${reelIdx + offset}`).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % strip.length;
}

function getSlotsVisible(config, stops) {
  return config.reels.map((strip, i) => {
    const s = stops[i];
    return [strip[(s - 1 + strip.length) % strip.length], strip[s], strip[(s + 1) % strip.length]];
  });
}

function evaluatePaylines(config, visible, totalBet) {
  const { paylines, wild, scatter, paytable } = config;
  const betPerLine = totalBet / paylines.length;
  const wins = [];
  let totalPayout = 0;
  for (let p = 0; p < paylines.length; p++) {
    const line = paylines[p];
    const lineSyms = line.map((row, ri) => visible[ri][row]);
    let best = { mult: 0 };
    for (const [symbol, pays] of Object.entries(paytable)) {
      let count = 0;
      for (const s of lineSyms) {
        if (s === symbol || (symbol !== wild && s === wild)) count++;
        else break;
      }
      const mult = pays[Math.min(count, pays.length - 1)] || 0;
      if (mult > best.mult) best = { symbol, count, mult };
    }
    if (best.mult > 0) {
      const payout = Number((betPerLine * best.mult).toFixed(4));
      totalPayout += payout;
      wins.push({ line: p, ...best, payout });
    }
  }
  if (scatter) {
    let count = 0;
    for (const reel of visible) for (const symbol of reel) if (symbol === scatter) count++;
    if (count >= 3) {
      const mult = ({ 3: 1, 4: 3, 5: 10 })[Math.min(count, 5)] || 5;
      const payout = Number((totalBet * mult).toFixed(4));
      totalPayout += payout;
      wins.push({ line: -1, symbol: scatter, count, mult, payout, scatter: true });
    }
  }
  return { wins, totalPayout: Number(totalPayout.toFixed(2)) };
}

// Evaluate every one of the 3^N left-to-right paths. A path receives only its best award, so
// an all-Wild prefix cannot be paid for every possible substituted symbol.
function evaluateJokerWays(config, visible, totalBet) {
  const symbols = Object.keys(config.paytable).filter(symbol => symbol !== config.wild);
  const grouped = new Map();
  for (let r0 = 0; r0 < 3; r0++) for (let r1 = 0; r1 < 3; r1++) for (let r2 = 0; r2 < 3; r2++) {
    const prefixRows = [r0, r1, r2];
    const prefix = prefixRows.map((row, reel) => visible[reel][row]);
    const regular = [...new Set(prefix.filter(symbol => symbol !== config.wild))];
    if (regular.length > 1) continue;
    const candidates = regular.length ? regular : symbols;
    let best = null;
    for (const symbol of candidates) {
      if (!prefix.every(value => value === symbol || value === config.wild)) continue;
      const fourthRows = [0, 1, 2].filter(row => visible[3][row] === symbol || visible[3][row] === config.wild);
      const count = fourthRows.length ? 4 : 3;
      const mult = Number(config.paytable[symbol]?.[count] || 0);
      if (!mult) continue;
      const score = mult * Math.max(1, fourthRows.length);
      if (!best || score > best.score) best = { symbol, count, mult, fourthRows, score };
    }
    if (!best) continue;
    const endings = best.fourthRows.length ? best.fourthRows : [null];
    for (const r3 of endings) {
      const cells = prefixRows.map((row, reel) => ({ reel, row }));
      if (r3 !== null) cells.push({ reel: 3, row: r3 });
      const usesWild = cells.some(({ reel, row }) => visible[reel][row] === config.wild);
      const key = `${best.symbol}:${best.count}`;
      let win = grouped.get(key);
      if (!win) {
        win = { line: -1, symbol: best.symbol, count: best.count, mult: best.mult, ways: 0, payout: 0,
          cells: [], stickyCells: [], usesWild: false, _cells: new Set(), _sticky: new Set() };
        grouped.set(key, win);
      }
      win.ways += 1;
      win.payout += totalBet * best.mult;
      win.usesWild ||= usesWild;
      for (const cell of cells) {
        const cellKey = `${cell.reel}:${cell.row}`;
        if (!win._cells.has(cellKey)) { win._cells.add(cellKey); win.cells.push(cell); }
        if (usesWild && !win._sticky.has(cellKey)) { win._sticky.add(cellKey); win.stickyCells.push(cell); }
      }
    }
  }
  const wins = [...grouped.values()].map(win => {
    delete win._cells; delete win._sticky; win.payout = Number(win.payout.toFixed(4)); return win;
  });
  return { wins, totalPayout: Number(wins.reduce((sum, win) => sum + win.payout, 0).toFixed(2)) };
}

function evaluateSlotsPay(config, visible, totalBet) {
  return config.ways ? evaluateJokerWays(config, visible, totalBet) : evaluatePaylines(config, visible, totalBet);
}

function sortedCells(set) {
  return [...set].sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]) || Number(a.split(':')[1]) - Number(b.split(':')[1]))
    .map(key => { const [reel, row] = key.split(':').map(Number); return { reel, row }; });
}

function spinJokerRound({ config, wager, serverSeed, seed, nonce }) {
  let stops = config.reels.map((strip, i) => slotsSpinReel(strip, i, serverSeed, seed, nonce));
  let visible = getSlotsVisible(config, stops);
  const initialVisible = visible.map(reel => [...reel]);
  const locked = new Set();
  const rounds = [];
  const allWins = [];
  let totalPayout = 0;
  const maxPayout = wager * Number(config.maxWinX || 1e9);
  for (let roundIndex = 0; roundIndex < 16; roundIndex++) {
    const heldCells = sortedCells(locked);
    const evaluation = evaluateJokerWays(config, visible, wager);
    const remaining = Math.max(0, maxPayout - totalPayout);
    if (evaluation.totalPayout > remaining && evaluation.totalPayout > 0) {
      const scale = remaining / evaluation.totalPayout;
      evaluation.wins.forEach(win => { win.payout = Number((win.payout * scale).toFixed(4)); });
      evaluation.totalPayout = Number(remaining.toFixed(2));
    }
    totalPayout += evaluation.totalPayout;
    evaluation.wins.forEach(win => allWins.push({ ...win, round: roundIndex }));
    const stickyCells = evaluation.wins.flatMap(win => win.stickyCells || []);
    const newJokers = stickyCells.filter(({ reel, row }) => visible[reel][row] === config.wild && !locked.has(`${reel}:${row}`));
    const newlyLocked = [];
    if (newJokers.length) {
      for (const { reel, row } of stickyCells) {
        const key = `${reel}:${row}`;
        if (!locked.has(key)) { locked.add(key); newlyLocked.push({ reel, row }); }
      }
    }
    rounds.push({ visible: visible.map(reel => [...reel]), wins: evaluation.wins, roundPayout: evaluation.totalPayout, heldCells, lockedCells: sortedCells(locked), newlyLocked });
    if (!newJokers.length || locked.size === config.reels.length * config.rows || totalPayout >= maxPayout) break;
    const newStops = config.reels.map((strip, reel) => slotsSpinReel(strip, reel, serverSeed, seed, nonce, (roundIndex + 1) * 1000));
    const nextVisible = getSlotsVisible(config, newStops);
    for (const key of locked) {
      const [reel, row] = key.split(':').map(Number);
      nextVisible[reel][row] = visible[reel][row];
    }
    stops = newStops;
    visible = nextVisible;
  }
  const respinInfo = rounds.length > 1 ? { triggered: true, count: rounds.length - 1,
    lockedCells: rounds.at(-1).lockedCells, lockedReels: [], respunReels: config.reels.map((_, i) => i) } : null;
  return { stops, visible, wins: allWins, totalPayout: Number(totalPayout.toFixed(2)), respinInfo, initialVisible, rounds };
}

function spinRound({ variant, wager, serverSeed, seed, nonce }) {
  const config = SLOTS_CONFIG[variant];
  if (variant === 'joker') return spinJokerRound({ config, wager, serverSeed, seed, nonce });
  if (variant === 'olympus') return spinOlympusRound({ config, wager, serverSeed, seed, nonce });
  const stops = config.reels.map((strip, i) => slotsSpinReel(strip, i, serverSeed, seed, nonce));
  const visible = getSlotsVisible(config, stops);
  const { wins, totalPayout } = evaluatePaylines(config, visible, wager);
  return { stops, visible, wins, totalPayout, respinInfo: null, initialVisible: visible.map(reel => [...reel]), rounds: null };
}

module.exports = { SLOTS_CONFIG, spinRound, getSlotsVisible, evaluateSlotsPay };
