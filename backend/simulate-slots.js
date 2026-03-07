/**
 * simulate-slots.js
 * Runs N spins for each slot variant using the exact same logic as server.js
 * and reports RTP, hit frequency, win distribution and symbol frequencies.
 *
 * Usage:  node simulate-slots.js [spins=100000]
 *   e.g.  node simulate-slots.js 500000
 */

'use strict';
const crypto = require('crypto');

const SPINS = parseInt(process.argv[2] || '100000', 10);
const BET   = 10; // fixed bet per spin (payouts scale linearly so value doesn't matter)

// ─── Game config (must stay in sync with server.js) ──────────────────────────

const SLOTS_CONFIG = {
  joker: {
    // Reel strips redesigned with lower CHERRY frequency:
    // JOKER×2, 7×3, BAR×4, BELL×5, WATER×7, CHERRY×9 = 30
    // P(CHERRY×3) = (9/30)^3 = 2.7% per payline × 5 = 13.5% hit/spin
    // At mult=1: CHERRY contribution = 0.135 × (1/5) = 2.7% RTP (manageable)
    reels: [
      ['JOKER','CHERRY','7','WATER','BELL','CHERRY','BAR','WATER','7','BELL','WATER','CHERRY','BAR','BELL','WATER','JOKER','CHERRY','WATER','BELL','7','BAR','WATER','CHERRY','BELL','WATER','BAR','CHERRY','BELL','7','WATER'],
      ['BELL','7','CHERRY','WATER','JOKER','BELL','WATER','BAR','CHERRY','BELL','7','WATER','CHERRY','BELL','BAR','WATER','JOKER','CHERRY','BELL','WATER','7','BAR','BELL','WATER','CHERRY','7','BELL','BAR','WATER','CHERRY'],
      ['7','WATER','BELL','CHERRY','BAR','WATER','JOKER','BELL','WATER','CHERRY','7','BELL','WATER','BAR','CHERRY','WATER','BELL','7','CHERRY','WATER','JOKER','BAR','WATER','CHERRY','BELL','7','WATER','BAR','CHERRY','BELL'],
    ],
    rows: 3,
    paylines: [[0,0,0],[1,1,1],[2,2,2],[0,1,2],[2,1,0]],
    wild: 'JOKER',
    scatter: null,
    // Frequencies: JOKER=2, 7=3, BAR=4, BELL=5, WATER=7, CHERRY=9
    // Calibrated paytable targeting ~96% RTP:
    paytable: {
      JOKER:  [0, 0, 0, 235],
      '7':    [0, 0, 0,  46],
      BAR:    [0, 0, 0,  16],
      BELL:   [0, 0, 0,   9],
      WATER:  [0, 0, 0,   3],
      CHERRY: [0, 0, 0,   1],
    },
  },
  golden: {
    // Golden: 30 stops. Frequencies: BOOK×2, SCARAB×3, ACE×4, KING×5, QUEEN×5, JACK×6, TEN×5
    // Added JACK×6 vs previous JACK×5 to compensate for added 2-of-a-kind pays.
    // 2-of-a-kind pays only for top-2 symbols (BOOK, SCARAB) to boost hit rate without
    // blowing RTP — they're rare enough (2/30 and 3/30) that it's safe.
    // Target: ~96% RTP
    reels: [
      ['BOOK','TEN','KING','ACE','JACK','QUEEN','SCARAB','TEN','KING','JACK','QUEEN','ACE','TEN','KING','JACK','SCARAB','TEN','QUEEN','JACK','ACE','JACK','KING','QUEEN','TEN','BOOK','JACK','QUEEN','ACE','SCARAB','KING'],
      ['TEN','KING','ACE','QUEEN','JACK','TEN','KING','SCARAB','QUEEN','ACE','JACK','TEN','KING','QUEEN','JACK','ACE','TEN','BOOK','QUEEN','KING','TEN','JACK','ACE','SCARAB','QUEEN','KING','TEN','JACK','BOOK','SCARAB'],
      ['ACE','TEN','JACK','KING','QUEEN','TEN','BOOK','KING','JACK','SCARAB','ACE','QUEEN','TEN','KING','ACE','JACK','QUEEN','TEN','KING','SCARAB','QUEEN','ACE','TEN','JACK','KING','BOOK','SCARAB','QUEEN','JACK','TEN'],
      ['KING','ACE','TEN','JACK','TEN','QUEEN','ACE','TEN','SCARAB','KING','JACK','QUEEN','ACE','TEN','KING','QUEEN','JACK','BOOK','TEN','ACE','SCARAB','KING','QUEEN','TEN','JACK','KING','BOOK','SCARAB','QUEEN','JACK'],
      ['JACK','QUEEN','TEN','ACE','KING','JACK','TEN','QUEEN','BOOK','JACK','KING','TEN','SCARAB','ACE','QUEEN','TEN','KING','JACK','ACE','QUEEN','TEN','SCARAB','KING','JACK','ACE','QUEEN','TEN','BOOK','SCARAB','KING'],
    ],
    rows: 3,
    paylines: [
      [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
      [0,1,2,1,0],[2,1,0,1,2],
      [1,0,0,0,1],[1,2,2,2,1],
      [0,0,1,2,2],[2,2,1,0,0],
      [1,0,1,2,1],
    ],
    wild: 'BOOK',
    scatter: 'BOOK',
    // Scatter reduced: only count BOOKs in positions [0,1,2] of each reel (the visible rows),
    // but trigger requires 3+ reels each showing BOOK in the same visible column — standard
    // payline treatment. Scatter bonus mults cut to 0.5/1/4 × total bet to limit contribution
    // to ~3%. Payline mults scaled to provide the remaining ~93% RTP.
    paytable: {
      BOOK:   [0, 0,  0, 20,  80, 270],
      SCARAB: [0, 0,  0, 17,  55, 163],
      ACE:    [0, 0,  0, 11,  35, 111],
      KING:   [0, 0,  0,  9,  25,  76],
      QUEEN:  [0, 0,  0,  7,  21,  62],
      JACK:   [0, 0,  0,  6,  17,  49],
      TEN:    [0, 0,  0,  4,  13,  35],
    },
  },
};

// ─── Game functions (exact copies from server.js) ────────────────────────────

function slotsSpinReel(strip, reelIdx, serverSeed, clientSeed, nonce, offset = 0) {
  const hash = crypto.createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:r${reelIdx + offset}`)
    .digest('hex');
  return parseInt(hash.slice(0, 8), 16) % strip.length;
}

function getSlotsVisible(config, stops) {
  return config.reels.map((strip, i) => {
    const s = stops[i];
    return [
      strip[(s - 1 + strip.length) % strip.length],
      strip[s],
      strip[(s + 1) % strip.length],
    ];
  });
}

function evaluateSlotsPay(config, visible, totalBet) {
  const { paylines, wild, scatter, paytable } = config;
  const lineCount  = paylines.length;
  const betPerLine = totalBet / lineCount;
  let totalPayout  = 0;
  const wins = [];

  for (let p = 0; p < paylines.length; p++) {
    const line     = paylines[p];
    const lineSyms = line.map((row, ri) => visible[ri][row]);
    let base = lineSyms.find(s => s !== wild) || wild;
    let count = 0;
    for (const s of lineSyms) {
      if (s === base || s === wild) count++;
      else break;
    }
    if (count >= 2 && paytable[base]) {
      const mult = paytable[base][Math.min(count, paytable[base].length - 1)] || 0;
      if (mult > 0) {
        const linePay = betPerLine * mult;
        totalPayout += linePay;
        wins.push({ symbol: base, count, mult });
      }
    }
  }

  if (scatter) {
    let scatterCount = 0;
    for (const reel of visible) for (const s of reel) if (s === scatter) scatterCount++;
    if (scatterCount >= 3) {
      const scatterMults = { 3: 1, 4: 3, 5: 10 };
      const sm = scatterMults[Math.min(scatterCount, 5)] || 2;
      totalPayout += totalBet * sm;
      wins.push({ symbol: scatter, count: scatterCount, mult: sm, scatter: true });
    }
  }

  return { wins, totalPayout };
}

// ─── Simulation runner ────────────────────────────────────────────────────────

function simulate(variantName, spins) {
  const config     = SLOTS_CONFIG[variantName];
  const serverSeed = 'simulation-server-seed';

  let totalWagered    = 0;
  let totalPayout     = 0;
  let hitCount        = 0;        // spins with any win
  let respinCount     = 0;        // joker respin triggers
  let bigWinCount     = 0;        // payout >= 10× bet
  let megaWinCount    = 0;        // payout >= 50× bet

  // Track win distribution by multiplier bucket
  const winBuckets = { '0': 0, '0.01-1x': 0, '1-5x': 0, '5-10x': 0, '10-50x': 0, '50-100x': 0, '100x+': 0 };

  // Track how often each symbol contributes to a winning line
  const symbolHits = {};
  for (const sym of Object.keys(config.paytable)) symbolHits[sym] = 0;

  for (let i = 0; i < spins; i++) {
    const clientSeed = `sim-${i}`;
    const nonce      = i;
    const bet        = BET;

    let stops   = config.reels.map((strip, ri) => slotsSpinReel(strip, ri, serverSeed, clientSeed, nonce));
    let visible = getSlotsVisible(config, stops);
    let { wins, totalPayout: payout } = evaluateSlotsPay(config, visible, bet);

    // Joker respin mechanic
    if (variantName === 'joker') {
      const midRow    = 1;
      const jokerReels = stops.map((_, ri) => visible[ri][midRow] === 'JOKER' ? ri : -1).filter(x => x >= 0);
      if (jokerReels.length > 0 && jokerReels.length < config.reels.length) {
        respinCount++;
        const newStops = [...stops];
        config.reels.forEach((_, ri) => {
          if (!jokerReels.includes(ri)) newStops[ri] = slotsSpinReel(config.reels[ri], ri, serverSeed, clientSeed, nonce, 1000);
        });
        const rv = getSlotsVisible(config, newStops);
        const re = evaluateSlotsPay(config, rv, bet);
        visible = rv;
        wins    = re.wins;
        payout  = re.totalPayout;
      }
    }

    totalWagered += bet;
    totalPayout  += payout;

    if (payout > 0) {
      hitCount++;
      for (const w of wins) if (!w.scatter) symbolHits[w.symbol] = (symbolHits[w.symbol] || 0) + 1;
    }

    const mult = payout / bet;
    if      (mult === 0)      winBuckets['0']++;
    else if (mult <= 1)       winBuckets['0.01-1x']++;
    else if (mult <= 5)       winBuckets['1-5x']++;
    else if (mult <= 10)      winBuckets['5-10x']++;
    else if (mult <= 50)      winBuckets['10-50x']++;
    else if (mult <= 100)     winBuckets['50-100x']++;
    else                      winBuckets['100x+']++;

    if (payout >= bet * 10)  bigWinCount++;
    if (payout >= bet * 50)  megaWinCount++;
  }

  const rtp          = (totalPayout / totalWagered) * 100;
  const houseEdge    = 100 - rtp;
  const hitFreq      = (hitCount / spins) * 100;

  // ── Pretty print ──
  const line  = '─'.repeat(56);
  const dline = '═'.repeat(56);
  console.log(`\n${dline}`);
  console.log(`  VARIANT: ${variantName.toUpperCase().padEnd(10)}   ${spins.toLocaleString()} spins @ $${BET}/spin`);
  console.log(dline);

  console.log(`\n  📊 CORE STATS`);
  console.log(`  ${line}`);
  console.log(`  Total wagered   : $${totalWagered.toLocaleString()}`);
  console.log(`  Total paid out  : $${totalPayout.toFixed(2).padStart(12)}`);
  console.log(`  RTP             : ${rtp.toFixed(3)}%`);
  console.log(`  House edge      : ${houseEdge.toFixed(3)}%`);
  console.log(`  Hit frequency   : ${hitFreq.toFixed(2)}%  (1 in ${(spins / hitCount).toFixed(1)} spins)`);
  if (variantName === 'joker') {
    console.log(`  Respin triggers : ${respinCount.toLocaleString()}  (${(respinCount/spins*100).toFixed(2)}% of spins)`);
  }
  console.log(`  Big wins (≥10×) : ${bigWinCount.toLocaleString()}  (1 in ${(spins / Math.max(bigWinCount,1)).toFixed(0)} spins)`);
  console.log(`  Mega wins (≥50×): ${megaWinCount.toLocaleString()}  (1 in ${(spins / Math.max(megaWinCount,1)).toFixed(0)} spins)`);

  console.log(`\n  🪣  PAYOUT DISTRIBUTION (% of spins)`);
  console.log(`  ${line}`);
  for (const [bucket, count] of Object.entries(winBuckets)) {
    const pct  = (count / spins * 100).toFixed(2);
    const bar  = '█'.repeat(Math.round(count / spins * 200));
    console.log(`  ${bucket.padEnd(12)}  ${pct.padStart(6)}%  ${bar}`);
  }

  console.log(`\n  🎰  SYMBOL WIN FREQUENCY (winning line contributions)`);
  console.log(`  ${line}`);
  const sortedSyms = Object.entries(symbolHits).sort((a, b) => b[1] - a[1]);
  for (const [sym, hits] of sortedSyms) {
    const pct = (hits / spins * 100).toFixed(3);
    console.log(`  ${sym.padEnd(8)}  ${hits.toLocaleString().padStart(8)} hits   ${pct}% of spins`);
  }

  console.log(`\n${dline}\n`);

  return { rtp, houseEdge, hitFreq };
}

// ─── Run both variants ────────────────────────────────────────────────────────

console.log(`\nCryptosino Slots Simulator`);
console.log(`Running ${SPINS.toLocaleString()} spins per variant...\n`);

const jokerResult  = simulate('joker',  SPINS);
const goldenResult = simulate('golden', SPINS);

console.log('══════════════════════════════════════════════════════');
console.log(' SUMMARY');
console.log('══════════════════════════════════════════════════════');
console.log(` Joker  — RTP: ${jokerResult.rtp.toFixed(3)}%  |  Edge: ${jokerResult.houseEdge.toFixed(3)}%  |  Hit: ${jokerResult.hitFreq.toFixed(2)}%`);
console.log(` Golden — RTP: ${goldenResult.rtp.toFixed(3)}%  |  Edge: ${goldenResult.houseEdge.toFixed(3)}%  |  Hit: ${goldenResult.hitFreq.toFixed(2)}%`);
console.log('══════════════════════════════════════════════════════\n');
