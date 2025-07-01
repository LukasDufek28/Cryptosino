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

// Provably fair dice roll endpoint
app.post('/api/roll', (req, res) => {
  const { clientSeed, winChance, nonce } = req.body;

  // Generate or use a fixed server seed for demo (in production, keep it secret and rotate per session/user)
  const serverSeed = 'super-secret-server-seed';
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});