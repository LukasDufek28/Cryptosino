'use strict';

// Read-only audit: executes the actual shared slot engine with synthetic seeds.
// Does not import server.js, load .env, connect to a database, or place bets.
const fs = require('node:fs');
const path = require('node:path');
const { SLOTS_CONFIG, spinRound } = require('./slots/math');
const crypto = require('node:crypto');
const rounds = Number(process.argv[2] || 1000000);
if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 10000000) throw new Error('Use 1–10,000,000 rounds');
const mathSource = fs.readFileSync(path.join(__dirname, 'slots/math.js'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '../frontend/src/slots/config.json'), 'utf8');
const report = { roundsPerVariant: rounds, bet: Number(process.argv[4] || 10), seed: process.argv[3] || 'cryptosino-public-audit-v1',
  sourceSha256: crypto.createHash('sha256').update(mathSource + configSource).digest('hex'),
  note: 'Measured custom backend rules, not provider-certified RTP. Confidence interval is a normal approximation.', variants: {} };
if (!Number.isFinite(report.bet) || report.bet < 0.1 || report.bet > 1000000 || Math.abs(report.bet * 100 - Math.round(report.bet * 100)) > 0.00001) throw new Error('Use a valid stake in cents, $0.10–$1,000,000');
for (const variant of Object.keys(SLOTS_CONFIG)) {
  let sum = 0, sumSquares = 0, hits = 0, profits = 0, respins = 0, max = 0;
  const combinations = {}, buckets = { zero: 0, belowBet: 0, breakEven: 0, upTo5x: 0, upTo10x: 0, upTo50x: 0, above50x: 0 };
  for (let i = 0; i < rounds; i++) {
    const result = spinRound({ variant, nonce: i, wager: report.bet, serverSeed: report.seed, seed: 'audit-' + i });
    const ratio = result.totalPayout / report.bet;
    sum += ratio; sumSquares += ratio * ratio;
    if (ratio > 0) hits++;
    if (ratio > 1) profits++;
    if (result.respinInfo) respins++;
    max = Math.max(max, ratio);
    buckets[ratio === 0 ? 'zero' : ratio < 1 ? 'belowBet' : ratio === 1 ? 'breakEven' : ratio <= 5 ? 'upTo5x' : ratio <= 10 ? 'upTo10x' : ratio <= 50 ? 'upTo50x' : 'above50x']++;
    for (const win of result.wins) {
      const key = `${win.scatter ? 'scatter' : 'line'}:${win.symbol}:${win.count}`;
      const entry = combinations[key] || (combinations[key] = { awards: 0, payout: 0 });
      entry.awards++; entry.payout += win.payout;
    }
  }
  const mean = sum / rounds;
  const variance = rounds > 1 ? Math.max(0, (sumSquares - rounds * mean * mean) / (rounds - 1)) : 0;
  const margin = 1.96 * Math.sqrt(variance / rounds) * 100;
  report.variants[variant] = {
    rtpPercent: mean * 100, approximate95PercentCI: [mean * 100 - margin, mean * 100 + margin],
    hitPercent: hits / rounds * 100, profitableSpinPercent: profits / rounds * 100,
    respinPercent: respins / rounds * 100, maxObservedBetMultiple: max, buckets, combinations,
    initialReelSymbolProbabilities: SLOTS_CONFIG[variant].reels.map(strip => {
      const counts = {};
      strip.forEach(symbol => { counts[symbol] = (counts[symbol] || 0) + 1; });
      return Object.fromEntries(Object.entries(counts).map(([symbol, count]) => [symbol, { stops: count, totalStops: strip.length, probability: count / strip.length }]));
    })
  };
  process.stderr.write(`${variant}: ${rounds.toLocaleString()} rounds finished\n`);
}
console.log(JSON.stringify(report, null, 2));
