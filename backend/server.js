require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Example route
app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.get('/api/ping', (req, res) => {
  res.json({ "message": "Yes Sir" });
});

// Provably fair dice roll endpoint
app.post('/api/roll', (req, res) => {
  const { clientSeed, winChance, nonce } = req.body;

  // Generate or use a fixed server seed for demo (in production, keep it secret and rotate per session/user)
  const serverSeed = process.env.SERVER_SEED;
  // Include nonce in the hash for uniqueness
  const hash = crypto.createHash('sha256')
    .update(serverSeed + ':' + clientSeed + ':' + nonce)
    .digest('hex');
  const roll = parseInt(hash.slice(0, 8), 16) / 0xffffffff * 100;
  const win = roll < winChance;
  res.json({
    roll: roll.toFixed(2),
    win,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    clientSeed,
    winChance,
    nonce
  });
});

// Provably fair crash calculation (Bustabit/Stake style)
app.post('/api/crash', (req, res) => {
  const { clientSeed, nonce } = req.body;
  const serverSeed = process.env.SERVER_SEED;

  const hash = crypto.createHash('sha256')
    .update(serverSeed + ':' + clientSeed + ':' + nonce)
    .digest('hex');
  const h = parseInt(hash.slice(0, 13), 16); // 52 bits

  if (h % 33 === 0) {
    return res.json({
      crashMultiplier: 0,
      serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
      clientSeed,
      nonce
    });
  }

  const X = h / Math.pow(2, 52);
  const crashMultiplier = Math.floor((1 / (1 - X)) * 100) / 100;

  res.json({
    crashMultiplier: crashMultiplier < 1.01 ? 1.01 : crashMultiplier,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    clientSeed,
    nonce
  });
});

let blackjackState = null; // In-memory state for demo (use sessions/db for real app)

function getDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getCardValue(card) {
  if (card.value === 'A') return 11;
  if (['K', 'Q', 'J'].includes(card.value)) return 10;
  return parseInt(card.value, 10);
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;
  for (let card of hand) {
    value += getCardValue(card);
    if (card.value === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

// Start a new game
app.post('/api/blackjack/deal', (req, res) => {
  const { bet } = req.body;
  const deck = getDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  blackjackState = { deck, playerHand, dealerHand, bet, finished: false };
  res.json({
    playerHand,
    dealerHand: [dealerHand[0], { value: '?', suit: '?' }], // Hide dealer's second card
    playerValue: calculateHandValue(playerHand),
    dealerValue: getCardValue(dealerHand[0]),
    finished: false
  });
});

// Player hits
app.post('/api/blackjack/hit', (req, res) => {
  if (!blackjackState || blackjackState.finished) return res.status(400).json({ error: 'No game in progress' });
  blackjackState.playerHand.push(blackjackState.deck.pop());
  const playerValue = calculateHandValue(blackjackState.playerHand);
  if (playerValue > 21) blackjackState.finished = true;
  res.json({
    playerHand: blackjackState.playerHand,
    playerValue,
    finished: blackjackState.finished
  });
});

// Player stands
app.post('/api/blackjack/stand', (req, res) => {
  if (!blackjackState || blackjackState.finished) return res.status(400).json({ error: 'No game in progress' });
  // Dealer draws
  while (calculateHandValue(blackjackState.dealerHand) < 17) {
    blackjackState.dealerHand.push(blackjackState.deck.pop());
  }
  const playerValue = calculateHandValue(blackjackState.playerHand);
  const dealerValue = calculateHandValue(blackjackState.dealerHand);
  blackjackState.finished = true;
  let result = '';
  if (dealerValue > 21 || playerValue > dealerValue) result = 'win';
  else if (playerValue === dealerValue) result = 'push';
  else result = 'lose';
  res.json({
    dealerHand: blackjackState.dealerHand,
    dealerValue,
    playerValue,
    result,
    finished: true
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});