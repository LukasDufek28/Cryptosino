import { useEffect, useRef, useState } from 'react';
import layout from './worldLayout.json';

const API = process.env.REACT_APP_API_URL || '';

// The lobby host owns seats and shared reel presentation. The API remains the
// only authority for wagers, RNG and balances.
export default function useSlotMachines(sceneRef, ready, token, setBalance) {
  const actions = useRef({});
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [bet, setBet] = useState('10');
  const betRef = useRef(bet);
  betRef.current = bet;
  useEffect(() => {
    if (!ready) return undefined;
    const scene = sceneRef.current;
    let stopped = false, active = null, claiming = false, pending = null, sending = false, autoSpinning = false, autoTimer = null;
    let endAt = 0, resultText = '', pendingBalance = null, messageTimer = null, machines = [];
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
    void scene.requestSlot('sync').catch(() => {});
    const release = () => {
      const id = active; active = null;
      autoSpinning = false; setAutoSpin(false); if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      if (!stopped) { setSelected(null); setBusy(false); }
      if (id) void scene.requestSlot('release', { machineId: id }).catch(() => {});
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
      autoTimer = setTimeout(() => {
        autoTimer = null;
        if (autoSpinning && active && scene.pose().seatId === `seat-${active}` && !stopped) actions.current.spin?.(betRef.current);
      }, 650);
    };
    actions.current = {
      async claim(id) {
        if (claiming || sending || pending || stopped || !token) return;
        if (active === id) return;
        if (active) { setMessage('Stand up before changing machines.'); return; }
        claiming = true; clearMessageTimer(); setMessage('Reserving machine…');
        try {
          await scene.requestSlot('claim', { machineId: id });
          if (stopped) return;
          active = id; endAt = 0; resultText = '';
          scene.sitAtSlot(id); setSelected(layout.slotMachines.find(machine => machine.id === id));
          setMessage('Choose your stake and spin.'); setBusy(false);
        } catch (error) { if (!stopped) setMessage(error.message); }
        finally { claiming = false; }
      },
      async spin(wager) {
        if (stopped || sending || (!pending && (!active || performance.now() < endAt))) return;
        clearMessageTimer();
        const machine = layout.slotMachines.find(item => item.id === active);
        if (!pending) {
          const amount = Number(wager);
          if (!Number.isFinite(amount) || amount < 0.1 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) {
            setMessage('Use a stake from $0.10 to $1,000,000, with at most two decimals.'); return;
          }
          pending = { bet: amount, variant: machine.variant, machineId: active, requestId: crypto.randomUUID() };
        }
        sending = true; setBusy(true); setRetry(false); setMessage('Waiting for the casino…');
        try {
          const result = await request('/api/slots/spin', pending);
          pending = null;
          if (stopped) return;
          const spin = result.spin, serverNow = result.serverNow || spin.startedAt;
          machines = [...machines.filter(item => item.id !== spin.machineId), { id: spin.machineId, spin, username: spin.username, userId: spin.userId }];
          scene.updateSlots(machines, serverNow);
          void scene.requestSlot('spin', { machineId: active, spin, serverNow }).catch(() => {});
          endAt = performance.now() + Math.max(0, spin.startedAt + spin.durationMs - serverNow);
          pendingBalance = Number(result.newBalance);
          resultText = `Return $${Number(spin.totalPayout).toFixed(2)} (stake $${Number(spin.bet).toFixed(2)}).`;
          if (spin.startedAt + spin.durationMs <= serverNow) {
            endAt = 0; setBalance(pendingBalance); pendingBalance = null; setBusy(false); showResultMessage(resultText); queueAutoSpin();
          } else setMessage('Reels spinning…');
        } catch (error) {
          if (stopped) return;
          autoSpinning = false; setAutoSpin(false);
          if (error.status >= 400 && error.status < 500) pending = null;
          setRetry(Boolean(pending));
          setMessage(pending ? 'Connection interrupted. Retry this same spin to recover its result—no second charge.' : error.message);
          setBusy(false);
        } finally { sending = false; }
      },
      toggleAuto() {
        autoSpinning = !autoSpinning; setAutoSpin(autoSpinning);
        if (!autoSpinning && autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
        if (autoSpinning && active && !sending && !pending && performance.now() >= endAt) actions.current.spin?.(betRef.current);
      },
      stand() {
        autoSpinning = false; setAutoSpin(false); if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
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
    }, 250);
    window.addEventListener('pagehide', release);
    return () => {
      stopped = true; clearInterval(tick); if (messageTimer) clearTimeout(messageTimer); if (autoTimer) clearTimeout(autoTimer);
      controllers.forEach(controller => controller.abort()); scene.setSlotStateReceiver(null);
      window.removeEventListener('pagehide', release); scene.stand(); release(); actions.current = {};
      setSelected(null); setMessage(''); setRetry(false); setBusy(false);
    };
  }, [ready, sceneRef, token, setBalance]);
  return { selected, message, busy, retry, autoSpin, bet, setBet,
    claim: id => actions.current.claim?.(id), spin: () => actions.current.spin?.(bet),
    toggleAuto: () => actions.current.toggleAuto?.(), stand: () => actions.current.stand?.(), dismiss: () => actions.current.dismiss?.() };
}
