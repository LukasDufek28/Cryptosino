const crypto = require('node:crypto');
const SLOTS_CONFIG = require('../../frontend/src/slots/config.json');

function slotsSpinReel(strip, reelIdx, serverSeed, clientSeed, nonce, offset = 0) {
  const hash = crypto.createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}:r${reelIdx + offset}`)
    .digest('hex');
  return parseInt(hash.slice(0, 8), 16) % strip.length;
}

function getSlotsVisible(config, stops) {
  // For each reel: [top=stop-1, mid=stop, bot=stop+1] wrapping
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
  const lineCount = paylines.length;
  const betPerLine = totalBet / lineCount;
  const wins = [];
  let totalPayout = 0;

  for (let p = 0; p < paylines.length; p++) {
    const line = paylines[p];
    const lineSyms = line.map((row, ri) => visible[ri][row]);
    // Award the best eligible symbol once per line, including a wild-only prefix.
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
      const linePay = Number((betPerLine * best.mult).toFixed(4));
      totalPayout += linePay;
      wins.push({ line: p, ...best, payout: linePay });
    }
  }

  // Scatter bonus (BOOK only)
  if (scatter) {
    let scatterCount = 0;
    for (const reel of visible) for (const s of reel) if (s === scatter) scatterCount++;
    if (scatterCount >= 3) {
      const scatterMults = { 3: 1, 4: 3, 5: 10 };
      const sm = scatterMults[Math.min(scatterCount, 5)] || 5;
      const scatterPay = Number((totalBet * sm).toFixed(4));
      totalPayout += scatterPay;
      wins.push({ line: -1, symbol: scatter, count: scatterCount, mult: sm, payout: scatterPay, scatter: true });
    }
  }

  return { wins, totalPayout: Number(totalPayout.toFixed(2)) };
}


function spinRound({ variant, wager, serverSeed, seed, nonce }) {
  const config = SLOTS_CONFIG[variant];
// Initial spin
      let stops = config.reels.map((strip, i) => slotsSpinReel(strip, i, serverSeed, seed, nonce));
      let visible = getSlotsVisible(config, stops);
      const initialVisible = visible.map(reel => [...reel]);
      let { wins, totalPayout } = evaluateSlotsPay(config, visible, wager);

      // Respin mechanic: Joker variant — any JOKER on the center row locks that reel, respins the rest (free)
      let respinInfo = null;
      if (variant === 'joker') {
        const midRow = 1;
        const jokerReels = stops.map((_, ri) => visible[ri][midRow] === 'JOKER' ? ri : -1).filter(i => i >= 0);
        if (jokerReels.length > 0 && jokerReels.length < config.reels.length) {
          const newStops = [...stops];
          const respunReels = [];
          config.reels.forEach((strip, ri) => {
            if (!jokerReels.includes(ri)) {
              newStops[ri] = slotsSpinReel(strip, ri, serverSeed, seed, nonce, 1000);
              respunReels.push(ri);
            }
          });
          const respinVisible = getSlotsVisible(config, newStops);
          const respinEval = evaluateSlotsPay(config, respinVisible, wager);
          // Respin always replaces the original result (Joker power!)
          stops = newStops;
          visible = respinVisible;
          wins = respinEval.wins;
          totalPayout = respinEval.totalPayout;
          respinInfo = { triggered: true, lockedReels: jokerReels, respunReels };
        }
      }

      
  return { stops, visible, wins, totalPayout, respinInfo, initialVisible };
}
module.exports = { SLOTS_CONFIG, spinRound, getSlotsVisible, evaluateSlotsPay };
