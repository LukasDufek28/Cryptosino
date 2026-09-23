import { useEffect, useRef, useState } from 'react';
import { LOCAL_DEMO } from './demoCasino';

const API=process.env.REACT_APP_API_URL||'';

function handValue(hand){
  let total=0,aces=0;
  for(const card of hand||[]){
    if(!card||card.value==='?'||card.hidden)continue;
    if(card.value==='A'){total+=11;aces++;}
    else if(['K','Q','J'].includes(card.value))total+=10;
    else total+=Number(card.value)||0;
  }
  while(total>21&&aces){total-=10;aces--;}
  return total;
}
function shuffledDeck(){
  const suits=['♠','♥','♦','♣'],values=['A','2','3','4','5','6','7','8','9','10','J','Q','K'],deck=[];
  for(const suit of suits)for(const value of values)deck.push({value,suit});
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
}
function outcomeMessage(outcome,payout=0){
  if(outcome==='blackjack')return `Blackjack · paid $${Number(payout).toFixed(2)}`;
  if(outcome==='win')return `Player wins · paid $${Number(payout).toFixed(2)}`;
  if(outcome==='push')return `Push · $${Number(payout).toFixed(2)} returned`;
  if(outcome==='bust')return 'Bust · dealer wins';
  return 'Dealer wins';
}
const pick=items=>items[Math.floor(Math.random()*items.length)];
function totalLine(total){
  if(total===21)return pick(['Twenty-one. Very tidy.','That makes twenty-one. Lovely.','Twenty-one. Hard to improve on that.']);
  if(total>=18)return pick([`That puts you on ${total}.`,`${total}. Looking respectable.`,`You're sitting on ${total}.`]);
  if(total<=11)return pick([`${total}. Plenty of room.`,`You're on ${total}. The deck is listening.`,`${total}. Still breathing easy.`]);
  return pick([`That puts you on ${total}.`,`You're on ${total}.`,`${total}. Interesting territory.`]);
}
function dealerResolutionDelay(hand){
  const extra=Math.max(0,(hand?.length||0)-2);
  return extra ? 1060+(extra-1)*410 : 720;
}
function outcomeCue(type,dealerTotal){
  if(type==='blackjack')return pick(['Blackjack! Now that is style.','Blackjack. Very clean.','Well then. Blackjack it is.']);
  if(type==='win')return dealerTotal>21
    ? pick(['Dealer busts. That one is yours.','I went too far. Nicely done.','Dealer bust. Please pretend that was intentional.'])
    : pick(['You got me. Nice hand.','That one belongs to you.','Well played. Chips coming your way.']);
  if(type==='push')return pick(['Push. Nobody cries today.','Same total. We call that peace.','Push. The table refuses to choose sides.']);
  if(type==='bust')return pick(['Ah, over twenty-one. Tough one.','Bust. Happens to the best tables.','Too much sauce. Next hand.']);
  return pick(['Dealer takes it. Next one could be yours.','Tough break. I hope the next hand behaves.','Not this one. The table owes you a nicer hand.']);
}

export default function useBlackjackTable(sceneRef,ready,token,setBalance,balance){
  const actions=useRef({}),balanceRef=useRef(balance);
  const [active,setActive]=useState(false);
  balanceRef.current=balance;

  useEffect(()=>{
    if(!ready)return undefined;
    const scene=sceneRef.current;
    let stopped=false,atTable=false,busy=false,phase='betting',bet=0,wager=0,betId=null,roundId=null;
    let playerHand=[],dealerHand=[],dealerHidden=false,outcome=null,message='Select chips to place your bet.',demoDeck=[],roundPayout=0,roundProfit=0;
    let dealerCue=null,cueSerial=(Date.now() % 1000000000) * 1000 + Math.floor(Math.random()*900);
    const controllers=new Set();
    const cue=(type,line,delayMs=0)=>{dealerCue={id:++cueSerial,type,line,delayMs};};

    const request=async(path,body)=>{
      const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),9000);
      try{
        const response=await fetch(`${API}${path}`,{method:'POST',cache:'no-store',signal:controller.signal,
          headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'Blackjack server unavailable.');
        return data;
      }finally{clearTimeout(timer);controllers.delete(controller);}
    };
    const visibleDealerValue=()=>dealerHidden?handValue(dealerHand.slice(0,1)):handValue(dealerHand);
    const publish=()=>{
      const visual={active:atTable,phase,bet,wager,balance:Number(balanceRef.current),playerHand,dealerHand,dealerHidden,outcome,message,busy,roundId,dealerCue,payout:roundPayout,profit:roundProfit,
        playerValue:playerHand.length?handValue(playerHand):null,dealerValue:dealerHand.length?visibleDealerValue():null,
        canDouble:phase==='playing'&&playerHand.length===2&&Number(balanceRef.current)>=bet&&!busy};
      scene.updateBlackjack?.(visual,Date.now());
      scene.publishBlackjack?.(visual);
    };
    const setRoundMoney=(nextOutcome,payout=0)=>{
      roundPayout=Number(payout)||0;
      roundProfit=['win','blackjack'].includes(nextOutcome)?Math.max(0,Number((roundPayout-Number(wager||bet||0)).toFixed(2))):0;
    };
    const finish=(nextOutcome,payout=0,creditBalance=false,delayMs=430)=>{
      outcome=nextOutcome;phase='finished';dealerHidden=false;busy=false;setRoundMoney(nextOutcome,payout);
      if(creditBalance&&payout>0){
        const next=Number((Number(balanceRef.current)+Number(payout)).toFixed(2));
        balanceRef.current=next;setBalance(next);
      }
      cue(nextOutcome,outcomeCue(nextOutcome,handValue(dealerHand)),delayMs);
      message=outcomeMessage(nextOutcome,payout);publish();
    };
    const resolveLocalDealer=()=>{
      dealerHidden=false;
      while(handValue(dealerHand)<17&&demoDeck.length)dealerHand=[...dealerHand,demoDeck.pop()];
      const pv=handValue(playerHand),dv=handValue(dealerHand);let next='lose',payout=0;
      if(pv<=21&&(dv>21||pv>dv)){next='win';payout=wager*2;}
      else if(pv<=21&&pv===dv){next='push';payout=wager;}
      finish(next,Number(payout.toFixed(2)),true,dealerResolutionDelay(dealerHand));
    };
    const setBusy=value=>{busy=value;publish();};

    actions.current={
      claim(){
        if(stopped||(!token&&!LOCAL_DEMO))return;
        atTable=true;setActive(true);scene.sitAtBlackjack?.();
        if(phase!=='playing')cue('count',pick([
          'Welcome to Table 21.',
          'Take a seat. Let us make some questionable decisions.',
          'Amber House blackjack. The cards are feeling dramatic tonight.'
        ]),180);
        message=phase==='playing'?'Your hand is still live.':phase==='finished'?'Place chips or deal again.':'Select chips to place your bet.';
        publish();setTimeout(()=>{if(atTable&&!stopped)publish();},120);
      },
      chip(value){
        if(!atTable||busy||!['betting','finished'].includes(phase))return;
        const amount=Number(value)||0;if(amount<=0)return;
        if(Number(bet)+amount>Number(balanceRef.current)){
          message='Not enough balance for that chip.';cue('count','That chip is a little ambitious for the balance.',80);publish();return;
        }
        const wasEmpty=bet===0;
        if(phase==='finished'){phase='betting';outcome=null;roundPayout=0;roundProfit=0;playerHand=[];dealerHand=[];dealerHidden=false;message='Place your bet.';}
        bet=Number((Number(bet)+amount).toFixed(2));wager=bet;
        if(wasEmpty&&Math.random()<.72)cue('count',pick([`$${amount} on the felt.`,`Starting with $${amount}. Nice and tidy.`,'Bet is on.']),120);
        publish();
      },
      clear(){
        if(!atTable||busy||!['betting','finished'].includes(phase))return;
        if(phase==='finished'){phase='betting';outcome=null;roundPayout=0;roundProfit=0;playerHand=[];dealerHand=[];dealerHidden=false;}
        bet=0;wager=0;message='Bet cleared.';publish();
      },
      async deal(){
        if(!atTable||busy||!['betting','finished'].includes(phase))return;
        if(!bet||bet<=0){
          message='Place at least one chip first.';cue('count','I need a bet before I can deal you anything.',60);publish();return;
        }
        if(bet>Number(balanceRef.current)){
          message='Insufficient balance.';cue('count','That wager is bigger than the stack.',60);publish();return;
        }
        busy=true;outcome=null;roundPayout=0;roundProfit=0;message='No more bets.';wager=bet;playerHand=[];dealerHand=[];dealerHidden=false;roundId=crypto.randomUUID();
        cue('shuffle',pick(['No more bets. Cards coming out.','All right. Let us see them.','Here we go.']),100);publish();
        try{
          if(LOCAL_DEMO&&!token){
            demoDeck=shuffledDeck();playerHand=[demoDeck.pop(),demoDeck.pop()];dealerHand=[demoDeck.pop(),demoDeck.pop()];
            const next=Number((Number(balanceRef.current)-bet).toFixed(2));balanceRef.current=next;setBalance(next);
            const pv=handValue(playerHand),dv=handValue(dealerHand),pn=pv===21,dn=dv===21;
            if(pn||dn){
              let nextOutcome='push',payout=bet;
              if(pn&&!dn){nextOutcome='blackjack';payout=bet*2.5;}
              else if(!pn&&dn){nextOutcome='lose';payout=0;}
              finish(nextOutcome,Number(payout.toFixed(2)),true,1320);return;
            }
            dealerHidden=true;phase='playing';busy=false;message='Hit, stand, or double.';
            cue('count',`${totalLine(pv)} Your move.`,1320);publish();return;
          }
          const data=await request('/api/blackjack/deal',{bet});
          betId=data.betId;playerHand=data.playerHand||[];dealerHand=data.dealerHand||[];dealerHidden=!data.naturalResolved;
          if(data.newBalance!=null){const next=Number(data.newBalance);balanceRef.current=next;setBalance(next);}
          if(data.naturalResolved){
            phase='finished';outcome=data.outcome;dealerHidden=false;busy=false;setRoundMoney(data.outcome,data.payout);message=outcomeMessage(data.outcome,data.payout);
            cue(data.outcome,outcomeCue(data.outcome,handValue(dealerHand)),1320);
          }else{
            phase='playing';busy=false;message='Hit, stand, or double.';
            cue('count',`${totalLine(handValue(playerHand))} Your move.`,1320);
          }
          publish();
        }catch(error){
          busy=false;phase='betting';message=error.message;cue('count','Something jammed behind the table. Give me a second.',80);publish();
        }
      },
      async hit(){
        if(!atTable||busy||phase!=='playing')return;
        cue('hit',pick(['Okay, hit it is!','Hit. One more coming your way.','Another card? Absolutely.']),30);setBusy(true);
        try{
          if(LOCAL_DEMO&&!token){
            const card=demoDeck.pop();if(card)playerHand=[...playerHand,card];
            if(handValue(playerHand)>21){dealerHidden=false;finish('bust',0,false,620);return;}
            busy=false;message=handValue(playerHand)===21?'Twenty-one. Stand to resolve.':'Hit or stand.';
            cue('count',totalLine(handValue(playerHand)),560);publish();return;
          }
          const data=await request('/api/blackjack/hit',{betId});playerHand=data.playerHand||playerHand;
          if(data.finished){dealerHand=data.dealerHand||dealerHand;dealerHidden=false;finish(data.outcome||'bust',0,false,620);return;}
          busy=false;message=data.playerValue===21?'Twenty-one. Stand to resolve.':'Hit or stand.';
          cue('count',totalLine(Number(data.playerValue)||handValue(playerHand)),560);publish();
        }catch(error){
          busy=false;message=error.message;cue('count','The shoe coughed. Try that again.',70);publish();
        }
      },
      async stand(){
        if(!atTable||busy||phase!=='playing')return;
        cue('stand',pick([
          `Standing on ${handValue(playerHand)}. Dealer's turn.`,
          `You stay on ${handValue(playerHand)}. Let me work.`,
          'Stand it is. I have to earn my salary now.'
        ]),70);
        setBusy(true);message='Dealer plays.';publish();
        try{
          if(LOCAL_DEMO&&!token){resolveLocalDealer();return;}
          const data=await request('/api/blackjack/stand',{betId});dealerHand=data.dealerHand||dealerHand;dealerHidden=false;
          if(data.newBalance!=null){const next=Number(data.newBalance);balanceRef.current=next;setBalance(next);}
          outcome=data.outcome;phase='finished';busy=false;setRoundMoney(data.outcome,data.payout);message=outcomeMessage(data.outcome,data.payout);
          cue(data.outcome,outcomeCue(data.outcome,handValue(dealerHand)),dealerResolutionDelay(dealerHand));publish();
        }catch(error){
          busy=false;message=error.message;cue('count','Dealer brain freeze. One more try.',70);publish();
        }
      },
      async double(){
        if(!atTable||busy||phase!=='playing'||playerHand.length!==2||Number(balanceRef.current)<bet)return;
        cue('double',pick(['Doubling down? Bold.','Double it is. One card, no take-backs.','I respect the confidence. Double down.']),70);
        setBusy(true);message='Double down.';publish();
        try{
          if(LOCAL_DEMO&&!token){
            const next=Number((Number(balanceRef.current)-bet).toFixed(2));balanceRef.current=next;setBalance(next);wager=Number((bet*2).toFixed(2));
            const card=demoDeck.pop();if(card)playerHand=[...playerHand,card];
            if(handValue(playerHand)>21){dealerHidden=false;finish('bust',0,false,720);return;}
            resolveLocalDealer();return;
          }
          const data=await request('/api/blackjack/double',{betId});wager=Number(data.wager||bet*2);
          playerHand=data.playerHand||playerHand;dealerHand=data.dealerHand||dealerHand;dealerHidden=false;
          if(data.newBalance!=null){const next=Number(data.newBalance);balanceRef.current=next;setBalance(next);}
          outcome=data.outcome;phase='finished';busy=false;setRoundMoney(data.outcome,data.payout);message=outcomeMessage(data.outcome,data.payout);
          cue(data.outcome,outcomeCue(data.outcome,handValue(dealerHand)),dealerResolutionDelay(dealerHand));publish();
        }catch(error){
          busy=false;message=error.message;cue('count','That double did not go through. Your chips are safe.',70);publish();
        }
      }
    };

    scene.setBlackjackAction?.(action=>{
      if(action?.startsWith('chip:'))actions.current.chip?.(Number(action.slice(5)));
      else actions.current[action]?.();
    });
    publish();
    const tick=setInterval(()=>{
      const seated=scene.pose?.().seatId==='seat-blackjack-live';
      if(atTable&&!seated){atTable=false;setActive(false);publish();}
    },180);
    return()=>{
      stopped=true;clearInterval(tick);controllers.forEach(c=>c.abort());scene.setBlackjackAction?.(null);actions.current={};setActive(false);
    };
  },[ready,sceneRef,token,setBalance]);

  return{active,claim:()=>actions.current.claim?.()};
}
