import configs from '../slots/config.json';

export const LOCAL_DEMO = typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

const keyOf = ({ reel, row }) => `${reel}:${row}`;
const sortedCells = set => [...set].sort().map(key => {
  const [reel, row] = key.split(':').map(Number);
  return { reel, row };
});

function pickVisible(config) {
  return config.reels.map(reel => {
    const stop = Math.floor(Math.random() * reel.length);
    return [-1, 0, 1].map(offset => reel[(stop + offset + reel.length) % reel.length]);
  });
}

function evaluateWays(config, visible, bet) {
  const symbols = Object.keys(config.paytable).filter(symbol => symbol !== config.wild);
  const grouped = new Map();
  for (let r0=0;r0<3;r0++) for (let r1=0;r1<3;r1++) for (let r2=0;r2<3;r2++) {
    const prefixRows=[r0,r1,r2];
    const prefix=prefixRows.map((row,reel)=>visible[reel][row]);
    const regular=[...new Set(prefix.filter(symbol=>symbol!==config.wild))];
    if (regular.length>1) continue;
    const candidates=regular.length?regular:symbols;
    let best=null;
    for (const symbol of candidates) {
      if (!prefix.every(value=>value===symbol||value===config.wild)) continue;
      const fourthRows=[0,1,2].filter(row=>visible[3][row]===symbol||visible[3][row]===config.wild);
      const count=fourthRows.length?4:3;
      const mult=Number(config.paytable[symbol]?.[count]||0);
      if (!mult) continue;
      const score=mult*Math.max(1,fourthRows.length);
      if (!best||score>best.score) best={symbol,count,mult,fourthRows,score};
    }
    if (!best) continue;
    for (const r3 of (best.fourthRows.length?best.fourthRows:[null])) {
      const cells=prefixRows.map((row,reel)=>({reel,row}));
      if (r3!==null) cells.push({reel:3,row:r3});
      const usesWild=cells.some(({reel,row})=>visible[reel][row]===config.wild);
      const groupKey=`${best.symbol}:${best.count}`;
      let win=grouped.get(groupKey);
      if (!win) {
        win={line:-1,symbol:best.symbol,count:best.count,mult:best.mult,ways:0,payout:0,cells:[],stickyCells:[],usesWild:false,_cells:new Set(),_sticky:new Set()};
        grouped.set(groupKey,win);
      }
      win.ways++; win.payout+=bet*best.mult; win.usesWild||=usesWild;
      for (const cell of cells) {
        const k=keyOf(cell);
        if (!win._cells.has(k)) { win._cells.add(k); win.cells.push(cell); }
        if (usesWild&&!win._sticky.has(k)) { win._sticky.add(k); win.stickyCells.push(cell); }
      }
    }
  }
  const wins=[...grouped.values()].map(win=>{delete win._cells;delete win._sticky;win.payout=Number(win.payout.toFixed(4));return win;});
  return {wins,totalPayout:Number(wins.reduce((sum,win)=>sum+win.payout,0).toFixed(2))};
}

function evaluateLines(config, visible, bet) {
  const wins = [];
  const lines = config.paylines || [];
  const unit = bet / Math.max(1, lines.length);
  lines.forEach((line, lineIndex) => {
    let best = { mult: 0 };
    for (const [symbol, pays] of Object.entries(config.paytable)) {
      let count = 0;
      for (let reel = 0; reel < visible.length; reel++) {
        const value = visible[reel][line[reel]];
        if (value === symbol || (symbol !== config.wild && value === config.wild)) count++;
        else break;
      }
      const mult = Number(pays[Math.min(count, pays.length - 1)] || 0);
      if (mult > best.mult) best = { symbol, count, mult };
    }
    if (best.mult > 0) wins.push({ line: lineIndex, ...best, payout: Number((unit * best.mult).toFixed(4)) });
  });
  const scatter = config.scatter;
  if (scatter) {
    const count = visible.flat().filter(symbol => symbol === scatter).length;
    const mult = Number(config.paytable?.[scatter]?.[count] || 0);
    if (count >= 3 && mult > 0) wins.push({ line: -1, symbol: scatter, count, mult,
      payout: Number((bet * mult).toFixed(4)), scatter: true });
  }
  return { wins, totalPayout: Number(wins.reduce((sum, win) => sum + win.payout, 0).toFixed(2)) };
}

function spinJoker(config, wager) {
  let visible = pickVisible(config);
  const initialVisible = visible.map(reel => [...reel]);
  const locked = new Set();
  const rounds = [];
  const allWins = [];
  let totalPayout = 0;
  const maxPayout = wager * Number(config.maxWinX || 1e9);
  for (let roundIndex = 0; roundIndex < 16; roundIndex++) {
    const heldCells = sortedCells(locked);
    const evaluation = evaluateWays(config, visible, wager);
    const remaining = Math.max(0, maxPayout - totalPayout);
    if (evaluation.totalPayout > remaining && evaluation.totalPayout > 0) {
      const scale = remaining / evaluation.totalPayout;
      evaluation.wins.forEach(win => { win.payout = Number((win.payout * scale).toFixed(4)); });
      evaluation.totalPayout = Number(remaining.toFixed(2));
    }
    totalPayout += evaluation.totalPayout;
    evaluation.wins.forEach(win => allWins.push({ ...win, round: roundIndex }));
    const stickyCells = evaluation.wins.flatMap(win => win.stickyCells || []);
    const newJokers = [];
    for (const cell of stickyCells) {
      if (visible[cell.reel][cell.row] === config.wild && !locked.has(keyOf(cell))) newJokers.push(cell);
    }
    const newlyLocked = [];
    if (newJokers.length) {
      for (const cell of stickyCells) {
        const key = keyOf(cell);
        if (!locked.has(key)) { locked.add(key); newlyLocked.push(cell); }
      }
    }
    rounds.push({
      visible: visible.map(reel => [...reel]),
      wins: evaluation.wins,
      roundPayout: evaluation.totalPayout,
      heldCells,
      lockedCells: sortedCells(locked),
      newlyLocked,
    });
    if (!newJokers.length || locked.size === config.reels.length * config.rows || totalPayout >= maxPayout) break;
    const nextVisible = pickVisible(config);
    for (const key of locked) {
      const [reel, row] = key.split(':').map(Number);
      nextVisible[reel][row] = visible[reel][row];
    }
    visible = nextVisible;
  }
  const respin = rounds.length > 1 ? {
    triggered: true,
    count: rounds.length - 1,
    lockedCells: rounds.at(-1).lockedCells,
    lockedReels: [],
    respunReels: config.reels.map((_, index) => index),
  } : { triggered: false, count: 0, lockedCells: [], lockedReels: [], respunReels: [] };
  return { visible, initialVisible, wins: allWins, rounds,
    totalPayout: Number(totalPayout.toFixed(2)), respin };
}

export function demoSlotSpin({ variant = 'joker', bet, balance, machineId = `demo-${variant}` }) {
  const config = configs[variant];
  const wager = Number(bet);
  const outcome = variant === 'joker'
    ? spinJoker(config, wager)
    : (() => {
        const visible = pickVisible(config);
        const evaluation = evaluateLines(config, visible, wager);
        return { visible, initialVisible: visible.map(reel => [...reel]), wins: evaluation.wins,
          rounds: [{ visible, wins: evaluation.wins, roundPayout: evaluation.totalPayout, heldCells: [], lockedCells: [], newlyLocked: [] }],
          totalPayout: evaluation.totalPayout,
          respin: { triggered: false, count: 0, lockedCells: [], lockedReels: [], respunReels: [] } };
      })();
  const startedAt = Date.now();
  const durationMs = Math.max(2800, (outcome.rounds?.length || 1) * 2850);
  const spin = {
    machineId,
    variant,
    bet: wager,
    ...outcome,
    startedAt,
    durationMs,
    username: 'Demo Player',
    userId: 'demo-local',
  };
  const newBalance = Number((Number(balance) - wager + outcome.totalPayout).toFixed(2));
  return {
    ...outcome,
    spin,
    serverNow: startedAt,
    newBalance,
    respin: outcome.respin,
  };
}
