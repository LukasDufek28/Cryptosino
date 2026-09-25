import { useEffect, useRef, useState } from 'react';
import layout from './worldLayout.json';
import { LOCAL_DEMO, demoSlotSpin } from './demoCasino';
import { startSlotAmbience, stopSlotAmbience } from './slotAudio';

const API = process.env.REACT_APP_API_URL || '';
const BET_STEPS = [0.1,0.2,0.5,1,2,5,10,20,50,100,200,500,1000];
function stepBet(value, direction) { const n=Number(value)||0.1; const i=direction>0?BET_STEPS.findIndex(v=>v>n):[...BET_STEPS].reverse().findIndex(v=>v<n); if(direction>0) return String(BET_STEPS[i<0?BET_STEPS.length-1:i]); const idx=i<0?0:BET_STEPS.length-1-i; return String(BET_STEPS[idx]); }

// The lobby host owns seats and shared reel presentation. The API remains the
// only authority for wagers, RNG and balances.
export default function useSlotMachines(sceneRef, ready, token, setBalance, balance) {
  const actions = useRef({});
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [bet, setBet] = useState('10');
  const betRef = useRef(bet), balanceRef = useRef(balance);
  betRef.current = bet; balanceRef.current = balance;
  useEffect(() => {
    if (!ready) return undefined;
    const scene = sceneRef.current;
    const localOnly = LOCAL_DEMO && !token;
    let stopped = false, active = null, claiming = false, pending = null, sending = false, autoSpinning = false, autoTimer = null;
    let endAt = 0, resultText = '', pendingBalance = null, messageTimer = null, machines = [], autoDelayMs = 650;
    const controllers = new Set();
    const request = async (path, body) => {
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${API}${path}`, { method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.error || 'Casino server unavailable.'); error.status = response.status; throw error; }
        return data;
      } finally { clearTimeout(timer); controllers.delete(controller); }
    };
    const receiveState = state => {
      if (stopped || !state?.machines || !Number.isFinite(state.serverNow)) return;
      machines = state.machines;
      scene.updateSlots(machines, state.serverNow);
    };
    scene.setSlotStateReceiver(receiveState);
    scene.setSlotAction(action => {
      if (action === 'spin') actions.current.spin?.(betRef.current);
      else actions.current[action]?.();
    });
    void scene.requestSlot('sync').catch(() => {});
    const release = () => {
      const id = active; active = null;
      autoSpinning = false; setAutoSpin(false); setShowPaytable(false); stopSlotAmbience(); if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      if (!stopped) { setSelected(null); setBusy(false); }
      if (id && !localOnly) void scene.requestSlot('release', { machineId: id }).catch(() => {});
    };
    const showResultMessage = text => {
      if (messageTimer) clearTimeout(messageTimer);
      setMessage(text);
      messageTimer = setTimeout(() => { messageTimer = null; setMessage(''); }, 3000);
    };
    const clearMessageTimer = () => {
      if (messageTimer) { clearTimeout(messageTimer); messageTimer = null; }
    };
    const queueAutoSpin = () => {
      if (!autoSpinning || stopped || !active || autoTimer) return;
      const delay=autoDelayMs;autoDelayMs=650;
      autoTimer = setTimeout(() => {
        autoTimer = null;
        if (autoSpinning && active && scene.pose().seatId === `seat-${active}` && !stopped) actions.current.spin?.(betRef.current);
      }, delay);
    };
    actions.current = {
      betDown() { if (!sending && !pending && active) setBet(value => stepBet(value, -1)); },
      betUp() { if (!sending && !pending && active) setBet(value => stepBet(value, 1)); },
      maxBet() {
        if (sending || pending || !active) return;
        const affordable = BET_STEPS.filter(value => value <= Number(balanceRef.current || 0));
        setBet(String(affordable.at(-1) || 0.1));
      },
      async claim(id) {

        if (claiming || sending || pending || stopped || (!token && !LOCAL_DEMO)) return;
        if (active === id) return;
        if (active) { setMessage('Stand up before changing machines.'); return; }
        claiming = true; clearMessageTimer(); setMessage('Reserving machine…');
        try {
          if (!localOnly) await scene.requestSlot('claim', { machineId: id });
          if (stopped) return;
          active = id; endAt = 0; resultText = ''; setShowPaytable(false);
          const selectedMachine = layout.slotMachines.find(machine => machine.id === id);
          scene.sitAtSlot(id); startSlotAmbience(); setSelected(selectedMachine);
          setMessage('Choose your stake and spin.'); setBusy(false);
        } catch (error) { if (!stopped) setMessage(error.message); }
        finally { claiming = false; }
      },
      async spin(wager) {
        if (stopped || sending) return;
        const now = performance.now();
        if (!pending && active && now < endAt) {
          if (localOnly) {
            endAt = Math.max(now + 250, endAt - 650);
            machines = machines.map(item => item.id === active
              ? { ...item, presentationOffsetMs: Math.min(Math.max(0, item.spin?.durationMs - 250), Number(item.presentationOffsetMs || 0) + 650) }
              : item);
            scene.updateSlots(machines, Date.now());
          } else {
            const previousEnd = endAt;
            endAt = Math.max(now + 250, endAt - 650);
            void scene.requestSlot('hurry', { machineId: active, amountMs: 650 }).catch(() => { endAt = Math.max(endAt, previousEnd); });
          }
          return;
        }
        if (!pending && !active) return;
        setShowPaytable(false);
        clearMessageTimer();
        const machine = layout.slotMachines.find(item => item.id === active);
        if (!pending) {
          const amount = Number(wager);
          if (!Number.isFinite(amount) || amount < 0.1 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) {
            setMessage('Use a stake from $0.10 to $1,000,000, with at most two decimals.'); return;
          }
          if (localOnly && amount > Number(balanceRef.current)) { setMessage('Insufficient demo balance.'); return; }
          pending = { bet: amount, variant: machine.variant, machineId: active, requestId: crypto.randomUUID() };
        }
        sending = true; setBusy(true); setRetry(false); setMessage('Waiting for the casino…');
        let previewStarted = false;
        try {
          if (!localOnly) {
            await scene.requestSlot('start', { machineId: active, previewId: pending.requestId, bet: pending.bet });
            previewStarted = true;
          }
          const result = localOnly
            ? demoSlotSpin({ variant: machine.variant, bet: pending.bet, balance: balanceRef.current, machineId: active })
            : await request('/api/slots/spin', pending);
          const previewId = pending.requestId;
          pending = null;
          if (stopped) return;
          const spin = result.spin, serverNow = result.serverNow || spin.startedAt;
          let shared = false;
          if (!localOnly) {
            try { await scene.requestSlot('spin', { machineId: active, spin, serverNow, previewId }); shared = true; }
            catch { /* Show the settled result locally if the room connection drops. */ }
          }
          if (stopped) return;
          if (!shared) {
            const previousMachine = machines.find(item => item.id === spin.machineId);
            machines = [...machines.filter(item => item.id !== spin.machineId), { id: spin.machineId, spin,
              preview: previousMachine?.preview || null, presentationStartedAt: serverNow,
              username: spin.username, userId: spin.userId }];
            scene.updateSlots(machines, serverNow);
          }
          endAt = performance.now() + spin.durationMs;
          pendingBalance = Number(result.newBalance);
          resultText = `Return $${Number(spin.totalPayout).toFixed(2)} (stake $${Number(spin.bet).toFixed(2)}).`;
          const multiple=Number(spin.totalPayout||0)/Math.max(.01,Number(spin.bet||1));
          const maxWinX=Number(layout.slotMachines.find(item=>item.id===active)?.variant==='joker'?486:500);
          autoDelayMs=multiple>=maxWinX*.98?6900:multiple>=50?5800:multiple>=25?5000:multiple>=10?4000:multiple>=3?3100:(spin.respin?.count?1500:700);
          setMessage('Reels spinning…');
        } catch (error) {
          if (stopped) return;
          if (previewStarted && pending && !localOnly) void scene.requestSlot('cancel', { machineId: active, previewId: pending.requestId }).catch(() => {});
          autoSpinning = false; setAutoSpin(false);
          if (error.status >= 400 && error.status < 500) pending = null;
          setRetry(Boolean(pending));
          setMessage(pending ? 'Connection interrupted. Retry this same spin to recover its result—no second charge.' : error.message);
          setBusy(false);
        } finally { sending = false; }
      },
      info() { if (!active || sending || pending) return; setShowPaytable(value => !value); },
      toggleAuto() {
        autoSpinning = !autoSpinning; setAutoSpin(autoSpinning);
        if (!autoSpinning && autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        if (autoSpinning && active && !sending && !pending && performance.now() >= endAt) actions.current.spin?.(betRef.current);
      },
      stand() {
        autoSpinning = false; setAutoSpin(false); setShowPaytable(false); stopSlotAmbience(); if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        if (!sending && !pending) { scene.stand(); release(); }
      },
      dismiss() { clearMessageTimer(); setMessage(''); }
    };
    const tick = setInterval(() => {
      if (active && scene.pose().seatId !== `seat-${active}`) release();
      if (!sending && !pending && endAt && performance.now() >= endAt) {
        endAt = 0;
        if (pendingBalance !== null) { setBalance(pendingBalance); pendingBalance = null; }
        setBusy(false); showResultMessage(resultText); queueAutoSpin();
      }
    }, 100);
    window.addEventListener('pagehide', release);
    return () => {
      stopped = true; clearInterval(tick); if (messageTimer) clearTimeout(messageTimer); if (autoTimer) clearTimeout(autoTimer);
      controllers.forEach(controller => controller.abort()); scene.setSlotStateReceiver(null); scene.setSlotAction(null);
      window.removeEventListener('pagehide', release); scene.stand(); release(); actions.current = {};
      setSelected(null); setMessage(''); setRetry(false); setBusy(false);
    };
  }, [ready, sceneRef, token, setBalance]);
  useEffect(() => {
    if (!ready || !selected) return;
    sceneRef.current?.updateSlotControlState(selected.id, {
      bet: Number(bet) || 0.1, autoSpin, showPaytable, busy, retry, balance: Number(balance), message
    });
  }, [ready, sceneRef, selected, bet, autoSpin, showPaytable, busy, retry, balance, message]);
  return { selected, message, busy, retry, autoSpin, bet, setBet,
    claim: id => actions.current.claim?.(id), spin: () => actions.current.spin?.(bet),
    toggleAuto: () => actions.current.toggleAuto?.(), stand: () => actions.current.stand?.(), dismiss: () => actions.current.dismiss?.() };
}
