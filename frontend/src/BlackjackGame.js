import React, { useState, useEffect } from 'react';
import './BlackjackGame.css';

const API_URL = process.env.REACT_APP_API_URL || '';

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

const RED_SUITS = ['♥', '♦'];

// mode: 'deal' = arc-in from deck  |  'flip' = hole-card reveal  |  null = no animation
function PlayingCard({ card, hidden, delay = 0, mode = 'deal', slow = false, onReveal }) {
  const animClass = mode === 'deal' ? ` bj-card-deal${slow ? ' bj-card-deal--slow' : ''}`
                  : mode === 'flip' ? ' bj-card-flip'
                  : '';
  const style = delay ? { animationDelay: `${delay}s` } : undefined;
  if (hidden) {
    return (
      <div
        className={`bj-card bj-card--back${animClass}`}
        style={style}
        onAnimationEnd={onReveal}
      >
        <span className="bj-card-back-pattern">🂠</span>
      </div>
    );
  }
  const isRed = RED_SUITS.includes(card.suit);
  return (
    <div
      className={`bj-card${isRed ? ' bj-card--red' : ''}${animClass}`}
      style={style}
      onAnimationEnd={onReveal}
    >
      <span className="bj-card-tl">{card.value}<br />{card.suit}</span>
      <span className="bj-card-center">{card.suit}</span>
      <span className="bj-card-br">{card.value}<br />{card.suit}</span>
    </div>
  );
}

function QuickBet({ bet, setBet, balance }) {
  return (
    <div className="bj-quick-bet">
      <button onClick={() => setBet(v => String(Math.max(1, Math.floor(Number(v) / 2))))} type="button">½</button>
      <button onClick={() => setBet(v => String(Math.min(balance, Number(v) * 2)))} type="button">2×</button>
      <button onClick={() => setBet(String(balance))} type="button">MAX</button>
    </div>
  );
}

function BlackjackGame({ balance, setBalance, token }) {
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [bet, setBet] = useState('10');
  const [message, setMessage] = useState('');
  const [gameState, setGameState] = useState('waiting');
  const [finished, setFinished] = useState(false);
  const [betId, setBetId] = useState(null);
  const [resolving, setResolving] = useState(false);
  // Track how many cards have finished their deal animation
  const [revealedPlayer, setRevealedPlayer] = useState(0);
  const [revealedDealer, setRevealedDealer] = useState(0);
  // Pending result — deferred until all card animations complete
  const [pendingResult, setPendingResult] = useState(null);
  const [pendingStand, setPendingStand] = useState(null);
  // When true, dealer cards use flip/deal animations for the stand reveal sequence
  const [standMode, setStandMode] = useState(false);

  // Apply a hit result once the new card has landed
  useEffect(() => {
    if (!pendingResult) return;
    if (revealedPlayer >= pendingResult.targetCount) {
      if (pendingResult.dealerHand) setDealerHand(pendingResult.dealerHand);
      if (pendingResult.newBalance != null) setBalance(Number(pendingResult.newBalance));
      setMessage(pendingResult.message);
      setGameState('finished');
      setFinished(true);
      setPendingResult(null);
    }
  }, [revealedPlayer, pendingResult, setBalance]);

  // Apply stand result once all dealer cards have landed
  useEffect(() => {
    if (!pendingStand) return;
    if (revealedDealer >= pendingStand.targetCount) {
      setMessage(pendingStand.message);
      if (pendingStand.newBalance != null) setBalance(Number(pendingStand.newBalance));
      setGameState('finished');
      setResolving(false);
      setStandMode(false);
      setPendingStand(null);
    }
  }, [revealedDealer, pendingStand, setBalance]);

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
    const payoutNum = data.payout ? Number(data.payout) : 0;
    let msg = '';
    if (data.outcome === 'blackjack') msg = `🎉 Blackjack! Paid $${payoutNum.toFixed(2)} (3:2)`;
    else if (data.outcome === 'win') msg = `✅ You win! Payout $${payoutNum.toFixed(2)}`;
    else if (data.outcome === 'push') msg = `🤝 Push. Returned $${payoutNum.toFixed(2)}`;
    else msg = `💀 You lose.`;
    // Enter stand mode: flip hole card, deal any extra cards, then show result
    setStandMode(true);
    setFinished(true);          // render hole card face-up so flip shows the real card
    setDealerHand(data.dealerHand);
    setRevealedDealer(1);       // card 0 stays mounted (no re-animation), pre-count it
    setPendingStand({
      message: msg,
      newBalance: data.newBalance ?? null,
      targetCount: data.dealerHand.length,
    });
  };

  const startGame = async () => {
    const wager = Number(bet);
    if (!wager || wager <= 0 || wager > balance) { setMessage('Invalid bet amount!'); return; }
    // Reset revealed counters at start of every new game
    setRevealedPlayer(0);
    setRevealedDealer(0);
    setPendingResult(null);
    setPendingStand(null);
    if (token) {
      const res = await fetch(`${API_URL}/api/blackjack/deal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bet: wager })
      });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Deal failed'); return; }
      if (data.naturalResolved) {
        setPlayerHand(data.playerHand);
        setDealerHand(data.dealerHand);
        setBetId(data.betId);
        setBalance(Number(data.newBalance));
        const payoutNum = data.payout ? Number(data.payout) : 0;
        if (data.outcome === 'blackjack') setMessage(`🎉 Blackjack! Paid $${payoutNum.toFixed(2)} (3:2)`);
        else if (data.outcome === 'push') setMessage(`🤝 Both have blackjack! Push. Returned $${payoutNum.toFixed(2)}`);
        else if (data.outcome === 'lose') setMessage('💀 Dealer blackjack. You lose.');
        setGameState('finished');
        setFinished(true);
        return;
      }
      setPlayerHand(data.playerHand);
      setDealerHand(data.dealerHand);
      setBetId(data.betId);
      setBalance(Number(data.newBalance));
      if (handValue(data.playerHand) === 21 && data.playerHand.length === 2) {
        setMessage('Blackjack! Resolving...');
        setResolving(true);
        const natId = data.betId;
        setTimeout(() => stand(natId), 300);
      }
    } else {
      const suits = ['♠', '♥', '♦', '♣'];
      const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
      const deck = [];
      for (let s of suits) for (let v of values) deck.push({ value: v, suit: s });
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const player = [deck.pop(), deck.pop()];
      const dealer = [deck.pop(), deck.pop()];
      setPlayerHand(player);
      setDealerHand(dealer);
      setBalance(prev => Number((prev - wager).toFixed(2)));
    }
    setMessage('');
    setGameState('playing');
    setFinished(false);
  };

  const hit = async () => {
    if (!token) { setMessage('Login for persistent blackjack.'); return; }
    const res = await fetch(`${API_URL}/api/blackjack/hit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ betId })
    });
    const data = await res.json();
    if (!res.ok) { setMessage(data.error || 'Hit failed'); return; }
    setPlayerHand(data.playerHand);
    if (data.finished) {
      // Defer the result message until the new card's animation lands
      let msg = '';
      if (data.outcome === 'bust') msg = '💥 Bust! You lose.';
      setPendingResult({
        message: msg,
        dealerHand: data.dealerHand || null,
        newBalance: null,
        targetCount: data.playerHand.length,
      });
    } else if (data.playerValue === 21) {
      setTimeout(() => { stand(); }, 400);
    }
  };

  const resetGame = () => {
    setPlayerHand([]); setDealerHand([]);
    setMessage(''); setGameState('waiting');
    setFinished(false); setBetId(null);
    setRevealedPlayer(0); setRevealedDealer(0);
    setPendingResult(null); setPendingStand(null);
    setStandMode(false);
  };

  let msgClass = 'bj-message';
  if (message.includes('lose') || message.includes('Lose') || message.includes('Bust') || message.includes('💀') || message.includes('💥')) msgClass += ' lose';
  if (message.includes('Push') || message.includes('push') || message.includes('🤝')) msgClass += ' push';

  // Dealer score only counts face-up cards that have finished animating.
  // During play (not standMode/finished), card 1 is face-down so cap visible count at 1.
  const dealerVisibleCount = (standMode || finished) ? revealedDealer : Math.min(revealedDealer, 1);
  const playerScore = handValue(playerHand.slice(0, revealedPlayer));
  const dealerScore = handValue(dealerHand.slice(0, dealerVisibleCount));

  return (
    <div className="blackjack-container">
      {/* Header */}
      <div className="bj-header">
        <div className="bj-header-left">
          <span className="bj-title">BLACKJACK</span>
          <span className="bj-subtitle">Beat the dealer to 21</span>
        </div>
        <div className="bj-balance-badge">
          <span className="bj-balance-label">Balance</span>
          <span className="bj-balance-value">${balance.toFixed(2)}</span>
        </div>
      </div>

      {/* Bet Controls */}
      {gameState === 'waiting' && (
        <div className="bj-bet-section">
          <div className="bj-bet-row">
            <div className="bj-input-wrap">
              <label className="bj-label">BET AMOUNT</label>
              <div className="bj-input-group">
                <span className="bj-input-prefix">$</span>
                <input
                  className="bj-input"
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
              </div>
            </div>
            <QuickBet bet={bet} setBet={setBet} balance={balance} />
          </div>
          <div className="bj-payout-info">
            Blackjack pays <span>3:2</span> &nbsp;·&nbsp; Dealer stands on soft 17
          </div>
          <button className="bj-deal-btn" onClick={startGame}>
            Deal Cards
          </button>
        </div>
      )}

      {/* Game Table */}
      {gameState !== 'waiting' && (
        <div className="bj-table">
          {/* Dealer */}
          <div className="bj-side bj-dealer">
            <div className="bj-side-label">
              Dealer
              <span className="bj-score">
                {dealerVisibleCount > 0 ? dealerScore : '?'}
              </span>
            </div>
            <div className="bj-cards-row">
              {dealerHand.map((card, i) => {
                const isHidden = i === 1 && !finished;

                // Stand-mode: card 0 stays mounted (no re-animation, pre-counted)
                //             card 1 gets a flip-in to reveal the hole card
                //             card 2+ deal from deck after the flip
                let mode, delay, key;
                if (standMode) {
                  if (i === 0) {
                    mode = null;  delay = 0;
                    key = `d-${i}-${card.value}${card.suit}`; // stable — React reuses it
                  } else if (i === 1) {
                    mode = 'flip'; delay = 0;
                    key = `d-flip-${card.value}${card.suit}`; // new key → remount → flip anim
                  } else {
                    // Each extra dealer card deals slowly one-at-a-time.
                    // flip duration = 0.38s, then 0.65s per card.
                    mode = 'deal'; delay = 0.50 + (i - 2) * 0.75;
                    key = `d-new-${i}-${card.value}${card.suit}`;
                  }
                } else {
                  mode = 'deal'; delay = i * 0.18;
                  key = isHidden ? `d-${i}-back` : `d-${i}-${card.value}${card.suit}`;
                }

                return (
                  <PlayingCard
                    key={key}
                    card={card}
                    hidden={isHidden}
                    delay={delay}
                    mode={mode}
                    slow={standMode && i >= 2}
                    onReveal={mode ? () => setRevealedDealer(p => Math.max(p, i + 1)) : undefined}
                  />
                );
              })}
            </div>
          </div>

          <div className="bj-vs-divider"><span>VS</span></div>

          {/* Player */}
          <div className="bj-side bj-player">
            <div className="bj-side-label">
              Your Hand
              <span className={`bj-score${playerScore > 21 ? ' bust' : playerScore === 21 && revealedPlayer === playerHand.length ? ' blackjack' : ''}`}>
                {revealedPlayer > 0 ? playerScore : '—'}
              </span>
            </div>
            <div className="bj-cards-row">
              {playerHand.map((card, i) => (
                <PlayingCard
                  key={`p-${i}-${card.value}${card.suit}`}
                  card={card}
                  delay={i * 0.18 + 0.09}
                  onReveal={() => setRevealedPlayer(p => Math.max(p, i + 1))}
                />
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {gameState === 'playing' && !resolving && (
            <div className="bj-actions">
              <button className="bj-action-btn bj-hit" onClick={hit}>Hit</button>
              <button className="bj-action-btn bj-stand" onClick={() => stand()}>Stand</button>
            </div>
          )}
          {gameState === 'playing' && resolving && (
            <div className="bj-resolving">
              <span className="bj-spinner" /> Resolving…
            </div>
          )}
          {gameState === 'finished' && (
            <button className="bj-deal-btn" style={{ marginTop: 24 }} onClick={resetGame}>
              Play Again
            </button>
          )}
        </div>
      )}

      {/* Message */}
      {message && <div className={msgClass}>{message}</div>}
    </div>
  );
}

export default BlackjackGame;
