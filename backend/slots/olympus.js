const crypto = require('node:crypto');

const NORMAL_SYMBOLS = ['BLUE','GREEN','YELLOW','PURPLE','RED','CHALICE','RING','HOURGLASS','CROWN'];
const cellKey = (reel, row) => `${reel}:${row}`;
const cloneGrid = grid => grid.map(column => [...column]);

function makeRng(serverSeed, clientSeed, nonce) {
  let counter = 0;
  return () => {
    const digest = crypto.createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}:olympus:${counter++}`).digest();
    return digest.readUInt32BE(0) / 0x100000000;
  };
}

function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
  let roll = rng() * total;
  for (const [symbol, weight] of entries) {
    roll -= Number(weight);
    if (roll < 0) return symbol;
  }
  return entries.at(-1)?.[0] || 'BLUE';
}

function pickMultiplier(config, rng) {
  const values = config.multiplierValues || [2];
  const weights = config.multiplierWeights || values.map(() => 1);
  let roll = rng() * weights.reduce((sum, value) => sum + Number(value), 0);
  for (let i = 0; i < values.length; i++) {
    roll -= Number(weights[i] || 0);
    if (roll < 0) return Number(values[i]);
  }
  return Number(values.at(-1) || 2);
}
function pickCell(config, rng, free = false) {
  const symbol = weightedPick(free && config.freeWeights ? config.freeWeights : config.weights, rng);
  return symbol === 'MULT' ? `MULT:${pickMultiplier(config, rng)}` : symbol;
}

function createGrid(config, rng, free = false) {
  return Array.from({ length: config.cols }, () =>
    Array.from({ length: config.rows }, () => pickCell(config, rng, free)));
}

function payTier(paytable, count) {
  if (count >= 12) return Number(paytable?.[2] || 0);
  if (count >= 10) return Number(paytable?.[1] || 0);
  if (count >= 8) return Number(paytable?.[0] || 0);
  return 0;
}

function evaluateGrid(config, grid, wager) {
  const wins = [];
  const removed = new Set();
  let basePayout = 0;
  for (const symbol of NORMAL_SYMBOLS) {
    const cells = [];
    for (let reel = 0; reel < grid.length; reel++) {
      for (let row = 0; row < grid[reel].length; row++) {
        if (grid[reel][row] === symbol) cells.push({ reel, row });
      }
    }
    const mult = payTier(config.paytable[symbol], cells.length);
    if (!mult) continue;
    const payout = Number((wager * mult).toFixed(4));
    basePayout += payout;
    cells.forEach(({ reel, row }) => removed.add(cellKey(reel, row)));
    wins.push({ line: -1, symbol, count: cells.length, mult, payout, cells });
  }
  return { wins, removed, basePayout: Number(basePayout.toFixed(4)) };
}

function collapse(config, grid, removed, rng, free) {
  const next = [];
  for (let reel = 0; reel < config.cols; reel++) {
    const kept = grid[reel].filter((_, row) => !removed.has(cellKey(reel, row)));
    const add = config.rows - kept.length;
    next[reel] = [...Array.from({ length: add }, () => pickCell(config, rng, free)), ...kept];
  }
  return next;
}
function multiplierValues(grid) {
  const values = [];
  for (let reel = 0; reel < grid.length; reel++) {
    for (let row = 0; row < grid[reel].length; row++) {
      const value = grid[reel][row];
      if (typeof value === 'string' && value.startsWith('MULT:')) {
        values.push({ reel, row, value: Number(value.slice(5)) || 2 });
      }
    }
  }
  return values;
}

function scatterCount(grid) {
  return grid.reduce((sum, column) => sum + column.filter(value => value === 'SCATTER').length, 0);
}

function scatterAward(config, count, wager) {
  if (count < 3) return 0;
  const table = config.scatterPays || {};
  const key = String(Math.min(count, 6));
  return Number((wager * Number(table[key] || 0)).toFixed(4));
}

function runSequence({ config, wager, rng, free = false, featureSpin = 0, featureMultiplier = 0 }) {
  let grid = createGrid(config, rng, free);
  const initialVisible = cloneGrid(grid);
  const rounds = [];
  let baseTotal = 0;
  let maxScatters = scatterCount(grid);
  for (let tumble = 0; tumble < Number(config.maxTumbles || 40); tumble++) {
    maxScatters = Math.max(maxScatters, scatterCount(grid));
    const evaluation = evaluateGrid(config, grid, wager);
    const mults = multiplierValues(grid);
    rounds.push({
      kind: 'olympus', mode: free ? 'free' : 'base', featureSpin, tumble,
      visible: cloneGrid(grid), wins: evaluation.wins,
      roundPayout: evaluation.basePayout,
      removedCells: [...evaluation.removed].map(key => {
        const [reel, row] = key.split(':').map(Number); return { reel, row };
      }),
      multipliers: mults, scatterCount: scatterCount(grid), featureMultiplier
    });
    if (!evaluation.wins.length) break;
    baseTotal += evaluation.basePayout;
    grid = collapse(config, grid, evaluation.removed, rng, free);
  }
  const endingMultipliers = multiplierValues(grid);
  maxScatters = Math.max(maxScatters, scatterCount(grid));
  return { initialVisible, visible: cloneGrid(grid), rounds, baseTotal: Number(baseTotal.toFixed(4)),
    endingMultipliers, scatterCount: maxScatters };
}
function applyCap(value, remaining) {
  return Number(Math.max(0, Math.min(value, remaining)).toFixed(2));
}

function spinOlympusRound({ config, wager, serverSeed, seed, nonce }) {
  const rng = makeRng(serverSeed, seed, nonce);
  const maxPayout = wager * Number(config.maxWinX || 5000);
  const allRounds = [], allWins = [];
  let totalPayout = 0;

  const base = runSequence({ config, wager, rng });
  const baseMultiplier = base.baseTotal > 0 && base.endingMultipliers.length
    ? base.endingMultipliers.reduce((sum, item) => sum + item.value, 0) : 1;
  const baseScatter = scatterAward(config, base.scatterCount, wager);
  const baseSequencePayout = applyCap(base.baseTotal * baseMultiplier + baseScatter, maxPayout);
  totalPayout += baseSequencePayout;
  base.rounds.forEach((round, index) => {
    const settled = index === base.rounds.length - 1;
    allRounds.push({ ...round,
      sequenceMultiplier: settled ? baseMultiplier : 1,
      sequencePayout: settled ? baseSequencePayout : 0,
      scatterPayout: settled ? baseScatter : 0 });
  });
  base.rounds.forEach(round => round.wins.forEach(win => allWins.push({ ...win, mode: 'base', tumble: round.tumble })));

  const featureTriggered = base.scatterCount >= 4;
  let spinsRemaining = featureTriggered ? Number(config.freeSpins || 15) : 0;
  let spinsPlayed = 0, retriggers = 0, featureMultiplier = 0;
  const initialFreeSpins = spinsRemaining;

  while (spinsRemaining > 0 && totalPayout < maxPayout && spinsPlayed < Number(config.maxFreeSpins || 60)) {
    spinsRemaining -= 1; spinsPlayed += 1;
    const seq = runSequence({ config, wager, rng, free: true, featureSpin: spinsPlayed, featureMultiplier });
    if (seq.baseTotal > 0 && seq.endingMultipliers.length) {
      featureMultiplier += seq.endingMultipliers.reduce((sum, item) => sum + item.value, 0);
    }
    const activeMultiplier = Math.max(1, featureMultiplier);
    const scatterPayout = scatterAward(config, seq.scatterCount, wager);
    const remainingCap = Math.max(0, maxPayout - totalPayout);
    const sequencePayout = applyCap(seq.baseTotal * activeMultiplier + scatterPayout, remainingCap);
    totalPayout += sequencePayout;
    let retriggeredSpins = 0;
    if (seq.scatterCount >= Number(config.retriggerScatters || 3)) {
      retriggeredSpins = Number(config.retriggerSpins || 5);
      spinsRemaining += retriggeredSpins; retriggers += retriggeredSpins;
    }
    const previousMultiplier = Math.max(1, Number(seq.rounds[0]?.featureMultiplier || 0));
    seq.rounds.forEach((round, index) => {
      const settled = index === seq.rounds.length - 1;
      allRounds.push({ ...round,
        featureMultiplier: settled ? activeMultiplier : previousMultiplier,
        sequenceMultiplier: settled ? activeMultiplier : previousMultiplier,
        sequencePayout: settled ? sequencePayout : 0,
        scatterPayout: settled ? scatterPayout : 0,
        retriggeredSpins: settled ? retriggeredSpins : 0,
        freeSpinsRemaining: spinsRemaining });
    });
    seq.rounds.forEach(round => round.wins.forEach(win => allWins.push({ ...win,
      mode: 'free', featureSpin: spinsPlayed, tumble: round.tumble })));
  }
  const finalRound = allRounds.at(-1);
  if (finalRound) finalRound.finalTotalPayout = Number(totalPayout.toFixed(2));
  const durationMs = Math.min(60000, Math.max(Number(config.minimumSpinDurationMs || 450),
    allRounds.reduce((duration, round) => duration + (round.wins.length
      ? Number(config.roundDurationMs || 2000)
      : round.sequencePayout > 0 || round.scatterPayout > 0
        ? Number(config.payoutRoundDurationMs || 850)
        : Number(config.noWinRoundDurationMs || 180)), 0) + Number(config.spinSettleMs || 150)));

  return {
    stops: [],
    visible: base.visible,
    initialVisible: base.initialVisible,
    wins: allWins,
    rounds: allRounds,
    totalPayout: Number(totalPayout.toFixed(2)),
    respinInfo: null,
    durationMs,
    olympus: {
      triggeredFreeSpins: featureTriggered,
      initialFreeSpins,
      freeSpinsPlayed: spinsPlayed,
      retriggeredSpins: retriggers,
      finalMultiplier: featureMultiplier,
      baseMultiplier,
      baseScatterCount: base.scatterCount,
      maxWinReached: totalPayout >= maxPayout
    }
  };
}

module.exports = { spinOlympusRound, evaluateGrid, createGrid, runSequence };
