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

function BlackjackGame({ balance, setBalance, token }) {
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [bet, setBet] = useState('10');
  const [message, setMessage] = useState('');
  const [gameState, setGameState] = useState('waiting'); // waiting, playing, finished
  const [finished, setFinished] = useState(false);
  const [betId, setBetId] = useState(null);

  const [resolving, setResolving] = useState(false);

  // Hoist stand so startGame can call it (accept optional override bet id)
  const stand = async (overrideId) => {
    if (!token) { setMessage('Login for persistent blackjack.'); return; }
    const idToUse = overrideId || betId;
    if (!idToUse) { setMessage('Missing betId'); return; }
    setResolving(true);
    const res = await fetch(`${API_URL}/api/blackjack/stand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ betId: idToUse })
    });
    const data = await res.json();
  if (!res.ok) { setMessage(data.error || 'Stand failed'); setResolving(false); return; }
  setDealerHand(data.dealerHand);
  let msg = '';
  const payoutNum = data.payout ? Number(data.payout) : 0;
  if (data.outcome === 'blackjack') msg = `Blackjack! Paid $${payoutNum.toFixed(2)} (3:2)`;
  else if (data.outcome === 'win') msg = `You win! Payout $${payoutNum.toFixed(2)}`;
  else if (data.outcome === 'push') msg = `Push. Returned $${payoutNum.toFixed(2)}`;
  else msg = 'You lose.';
    setMessage(msg);
    if (data.newBalance) setBalance(Number(data.newBalance));
    setGameState('finished');
    setFinished(true);
    setResolving(false);
  };

  const startGame = async () => {
    const wager = Number(bet);
    if (!wager || wager <= 0 || wager > balance) {
      setMessage('Invalid bet amount!');
      return;
    }
    if (token) {
      const res = await fetch(`${API_URL}/api/blackjack/deal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bet: wager })
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Deal failed'); return; }
      // If backend already resolved a natural blackjack
      if (data.naturalResolved) {
        setPlayerHand(data.playerHand);
        setDealerHand(data.dealerHand);
        setBetId(data.betId);
        setBalance(Number(data.newBalance));
        const payoutNum = data.payout ? Number(data.payout) : 0;
        if (data.outcome === 'blackjack') setMessage(`Blackjack! Paid $${payoutNum.toFixed(2)} (3:2)`);
        else if (data.outcome === 'push') setMessage(`Both have blackjack! Push. Returned $${payoutNum.toFixed(2)}`);
        else if (data.outcome === 'lose') setMessage('Dealer blackjack. You lose.');
        setGameState('finished');
        setFinished(true);
        return;
      }
      setPlayerHand(data.playerHand);
      setDealerHand(data.dealerHand);
      setBetId(data.betId);
      setBalance(Number(data.newBalance));
      // Natural blackjack (fallback if backend ever changes behavior)
      if (handValue(data.playerHand) === 21 && data.playerHand.length === 2) {
        setMessage('Blackjack! Resolving...');
        setResolving(true);
        const natId = data.betId;
        setTimeout(() => stand(natId), 300);
      }
    } else {
      // Local fallback (non-persistent) simple random deal using existing public endpoint removal (simulate locally)
      const suits = ['♠','♥','♦','♣'];
      const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
      const deck = [];
      for (let s of suits) for (let v of values) deck.push({ value: v, suit: s });
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random()* (i+1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      const player = [deck.pop(), deck.pop()];
      const dealer = [deck.pop(), deck.pop()];
      setPlayerHand(player);
      setDealerHand([{...dealer[0]}, {...dealer[1]}]);
      setBalance(prev => Number((prev - wager).toFixed(2)));
      if (handValue(player) === 21 && player.length === 2) {
        setTimeout(() => {
          // For local mode we don't have server stand; just show message & refund 3:2 manually
          setMessage('Blackjack! (Demo)');
          setBalance(prev => Number((prev + wager * 2.5).toFixed(2))); // add 2.5x since we subtracted wager earlier
          setGameState('finished');
          setFinished(true);
        }, 400);
      }
    }
    setMessage('');
    setGameState('playing');
    setFinished(false);
  };

  const hit = async () => {
    if (!token) {
      // Local fallback not implemented for full logic; simple random card
      setMessage('Login for persistent blackjack.');
      return;
    }
    const res = await fetch(`${API_URL}/api/blackjack/hit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ betId })
    });
    const data = await res.json();
    if (!res.ok) { setMessage(data.error || 'Hit failed'); return; }
    setPlayerHand(data.playerHand);
    if (data.finished) {
      if (data.outcome === 'bust') {
        if (data.dealerHand) setDealerHand(data.dealerHand);
        setMessage('Bust! You lose.');
      }
      setGameState('finished');
      setFinished(true);
    } else if (data.playerValue === 21) {
      // Auto stand on 21
      setTimeout(() => {
        // Guard: only auto-stand if still playing
        if (gameState === 'playing') stand();
      }, 400);
    }
  };


  const resetGame = () => {
    setPlayerHand([]);
    setDealerHand([]);
    setMessage('');
    setGameState('waiting');
    setFinished(false);
    setBetId(null);
  };

  // Message color
  let msgClass = "blackjack-message";
  if (message.toLowerCase().includes("lose")) msgClass += " lose";
  if (message.toLowerCase().includes("push")) msgClass += " push";

  return (
    <div className="blackjack-container">
      <h2 style={{ letterSpacing: 2, marginBottom: 10 }}>Blackjack</h2>
      <div className="blackjack-balance">Balance: <b>${balance.toFixed(2)}</b></div>
      {gameState === 'waiting' && (
        <div className="blackjack-inputs">
          <label>
            Bet Amount:
            <input
              type="text"
              inputMode="decimal"
              value={bet}
              onChange={e => {
                const v = e.target.value;
                if (v === '') { setBet(''); return; }
                if (/^\d*(?:\.\d{0,2})?$/.test(v)) setBet(v);
              }}
              onBlur={() => {
                if (bet === '' || Number(bet) <= 0) setBet('10');
                else setBet(String(Number(bet)));
              }}
            />
          </label>
          <button className="blackjack-btn" onClick={startGame}>Deal</button>
        </div>
      )}
      {gameState !== 'waiting' && (
        <>
          <div className="blackjack-hands">
            <div className="blackjack-hand">
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                Your Hand <span style={{ color: '#00e1ff' }}>({handValue(playerHand)})</span>
              </div>
              <div className="blackjack-cards">
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
            <div className="blackjack-hand">
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                Dealer Hand <span style={{ color: '#00e1ff' }}>({finished ? handValue(dealerHand) : '?'})</span>
              </div>
              <div className="blackjack-cards">
                {dealerHand.map((card, i) => (
                  <span key={i} className="card-fade" style={{ fontSize: '2em', marginRight: 8, animationDelay: `${i * 0.2}s` }}>
                    {(i === 0 || finished) ? `${card.value}${card.suit}` : (!finished ? '🂠' : `${card.value}${card.suit}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {gameState === 'playing' && !resolving && (
            <div style={{ display: 'flex', gap: 16, margin: '18px 0 0 0' }}>
              <button className="blackjack-btn" onClick={hit} disabled={resolving}>Hit</button>
              <button className="blackjack-btn" onClick={() => stand()} disabled={resolving}>Stand</button>
            </div>
          )}
          {gameState === 'playing' && resolving && (
            <div style={{ marginTop: 18, fontSize: '0.9em', color: '#00e1ff' }}>Resolving...</div>
          )}
          {gameState === 'finished' && (
            <button className="blackjack-btn" style={{ marginTop: 18 }} onClick={resetGame}>Play Again</button>
          )}
        </>
      )}
      <div className={msgClass}>{message}</div>
    </div>
  );
}

export default BlackjackGame;