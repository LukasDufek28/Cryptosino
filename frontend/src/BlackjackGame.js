import React, { useState } from 'react';
import './BlackjackGame.css';

const API_URL = process.env.REACT_APP_API_URL;

function handValue(hand) {
  let value = 0, aces = 0;
  for (let card of hand) {
    if (card.value === 'A') { value += 11; aces++; }
    else if (['K', 'Q', 'J'].includes(card.value)) value += 10;
    else value += parseInt(card.value, 10);
  }
  while (value > 21 && aces > 0) { value -= 10; aces--; }
  return value;
}

function BlackjackGame({ balance, setBalance }) {
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [bet, setBet] = useState(10);
  const [message, setMessage] = useState('');
  const [gameState, setGameState] = useState('waiting'); // waiting, playing, finished
  const [finished, setFinished] = useState(false);

  const startGame = async () => {
    if (bet > balance || bet <= 0) {
      setMessage('Invalid bet amount!');
      return;
    }
    const res = await fetch(`${API_URL}/api/blackjack/deal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bet })
    });
    const data = await res.json();
    setPlayerHand(data.playerHand);
    setDealerHand(data.dealerHand);
    setBalance(prev => Number((prev - bet).toFixed(2)));
    setMessage('');
    setGameState('playing');
    setFinished(false);

    // Auto-stand if player has 21 after deal
    if (handValue(data.playerHand) === 21) {
      setTimeout(() => stand(), 500); // slight delay for UI update
    }
  };

  const hit = async () => {
    const res = await fetch(`${API_URL}/api/blackjack/hit`, {
      method: 'POST'
    });
    const data = await res.json();
    setPlayerHand(data.playerHand);
    const value = handValue(data.playerHand);
    if (data.finished) {
      setMessage('Bust! You lose.');
      setGameState('finished');
      setFinished(true);
    } else if (value === 21) {
      setTimeout(() => stand(), 500); // auto-stand on 21
    }
  };

  const stand = async () => {
    const res = await fetch(`${API_URL}/api/blackjack/stand`, {
      method: 'POST'
    });
    const data = await res.json();
    setDealerHand(data.dealerHand);
    let msg = '';
    let payout = 0;
    if (data.result === 'win') {
      msg = 'You win!';
      payout = bet * 2;
    } else if (data.result === 'push') {
      msg = 'Push! Bet returned.';
      payout = bet;
    } else {
      msg = 'You lose!';
    }
    setMessage(msg);
    setBalance(prev => Number((prev + payout).toFixed(2)));
    setGameState('finished');
    setFinished(true);
  };

  const resetGame = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setMessage('');
    setGameState('waiting');
    setFinished(false);
  };

  return (
    <div>
      <h2>Blackjack</h2>
      <p>Balance: <b>${balance.toFixed(2)}</b></p>
      {gameState === 'waiting' && (
        <>
          <label>
            Bet Amount:
            <input
              type="number"
              min="1"
              value={bet}
              onChange={e => setBet(Number(e.target.value))}
            />
          </label>
          <br />
          <button onClick={startGame}>Deal</button>
        </>
      )}
      {gameState !== 'waiting' && (
        <>
          <div>
            <h4>Your Hand ({handValue(playerHand)})</h4>
            <div>
              {playerHand.map((card, i) => (
                <span
                  key={i}
                  className="card-fade"
                  style={{ fontSize: '2em', marginRight: 8, animationDelay: `${i * 0.2}s` }}
                >
                  {card.value}{card.suit}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h4>Dealer Hand ({finished ? handValue(dealerHand) : '?'})</h4>
            <div>
              {dealerHand.map((card, i) => (
                <span key={i} style={{ fontSize: '2em', marginRight: 8 }}>
                  {(i === 0 || finished) ? `${card.value}${card.suit}` : (!finished ? '🂠' : `${card.value}${card.suit}`)}
                </span>
              ))}
            </div>
          </div>
          <br />
          {gameState === 'playing' && (
            <>
              <button onClick={hit}>Hit</button>
              <button onClick={stand}>Stand</button>
            </>
          )}
          {gameState === 'finished' && (
            <button onClick={resetGame}>Play Again</button>
          )}
        </>
      )}
      <p>{message}</p>
    </div>
  );
}

export default BlackjackGame;