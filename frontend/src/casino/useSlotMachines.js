import { useEffect, useRef, useState } from 'react';
import layout from './worldLayout.json';

const API = process.env.REACT_APP_API_URL || '';

// Peers only send refresh hints. Seats, results and money come from the API.
export default function useSlotMachines(sceneRef, ready, token, setBalance) {
  const actions = useRef({});
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [bet, setBet] = useState('10');
  useEffect(() => {
    if (!ready) return undefined;
    const scene = sceneRef.current, sessionId = crypto.randomUUID();
    let stopped = false, active = null, claiming = false, pending = null, sending = false;
    let polling = false, refreshing = false, heartbeatAt = 0, endAt = 0, resultText = '', pendingBalance = null, messageTimer = null;
    let machines = [];
    const controllers = new Set();
    const request = async (path, method = 'GET', body) => {
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${API}${path}`, { method, cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
        if (!response.ok) { const error = new Error(data.error || 'Casino server unavailable.'); error.status = response.status; throw error; }
        return data;
      } finally { clearTimeout(timer); controllers.delete(controller); }
    };
    const release = () => {
      const id = active; active = null;
      if (!stopped) { setSelected(null); setBusy(false); }
      if (id) void fetch(`${API}/api/casino/slots/${id}/${sessionId}`, { method: 'DELETE', keepalive: true,
        headers: { Authorization: `Bearer ${token}` } }).catch(() => {}).finally(() => scene.notifySlotChange());
    };
    async function refresh() {
      if (stopped || polling) return;
      polling = true;
      try {
        const data = await request('/api/casino/slots');
        if (stopped) return;
        // An in-flight poll may predate a spin response received in the meantime.
        machines = data.machines.map(row => {
          const known = machines.find(m => m.id === row.id);
          return known?.spin && (!row.spin || known.spin.startedAt > row.spin.startedAt) ? { ...row, spin: known.spin } : row;
        });
        scene.updateSlots(machines, data.serverNow);
        const spin = machines.find(m => m.id === active)?.spin;
        if (spin && spin.startedAt + spin.durationMs > data.serverNow) {
          endAt = performance.now() + spin.startedAt + spin.durationMs - data.serverNow;
          resultText = `Return $${Number(spin.totalPayout).toFixed(2)} (stake $${Number(spin.bet).toFixed(2)}).`;
          setBusy(true);
        }
      } catch (error) {
        if (!stopped && active && !pending) setMessage(error.message);
      } finally { polling = false; }
    }
    async function heartbeat() {
      if (!active || refreshing || stopped) return;
      const id = active; refreshing = true; heartbeatAt = performance.now();
      try { await request(`/api/casino/slots/${id}/claim`, 'POST', { sessionId }); }
      catch (error) {
        if (!stopped && active === id) {
          setMessage(error.message);
          if (error.status === 409 || error.status === 401) { scene.stand(); release(); }
        }
      } finally { refreshing = false; }
    }
    const showResultMessage = text => {
      if (messageTimer) clearTimeout(messageTimer);
      setMessage(text);
      messageTimer = setTimeout(() => { messageTimer = null; setMessage(''); }, 3000);
    };
    const clearMessageTimer = () => {
      if (messageTimer) { clearTimeout(messageTimer); messageTimer = null; }
    };
    actions.current = {
      async claim(id) {
        if (claiming || sending || pending || stopped || !token) return;
        if (active === id) return;
        if (active) { setMessage('Stand up before changing machines.'); return; }
        claiming = true; clearMessageTimer(); setMessage('Reserving machine…');
        try {
          await request(`/api/casino/slots/${id}/claim`, 'POST', { sessionId });
          if (stopped) return;
          active = id; heartbeatAt = performance.now(); endAt = 0; resultText = '';
          scene.sitAtSlot(id); setSelected(layout.slotMachines.find(m => m.id === id));
          setMessage('Choose your stake and spin.'); setBusy(false);
          scene.notifySlotChange(); void refresh();
        } catch (error) { if (!stopped) setMessage(error.message); }
        finally { claiming = false; }
      },
      async spin(wager) {
        if (stopped || sending || (!pending && (!active || performance.now() < endAt))) return;
        clearMessageTimer();
        const machine = layout.slotMachines.find(m => m.id === active);
        if (!pending) {
          const amount = Number(wager);
          if (!Number.isFinite(amount) || amount < 0.1 || amount > 1000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) {
            setMessage('Use a stake from $0.10 to $1,000,000, with at most two decimals.'); return;
          }
          pending = { bet: amount, variant: machine.variant, machineId: active, sessionId, requestId: crypto.randomUUID() };
        }
        sending = true; setBusy(true); setRetry(false); setMessage('Waiting for the casino…');
        try {
          const result = await request('/api/slots/spin', 'POST', pending);
          pending = null;
          if (stopped) return;
          const spin = result.spin;
          const serverNow = result.serverNow || spin.startedAt;
          machines = [...machines.filter(m => m.id !== spin.machineId), { id: spin.machineId, spin, username: spin.username, userId: spin.userId }];
          scene.updateSlots(machines, serverNow);
          endAt = performance.now() + Math.max(0, spin.startedAt + spin.durationMs - serverNow);
          pendingBalance = Number(result.newBalance);
          resultText = `Return $${Number(spin.totalPayout).toFixed(2)} (stake $${Number(spin.bet).toFixed(2)}).`;
          if (spin.startedAt + spin.durationMs <= serverNow) {
            endAt = 0; setBalance(pendingBalance); pendingBalance = null; setBusy(false); showResultMessage(resultText);
          } else setMessage('Reels spinning…');
          scene.notifySlotChange(); void refresh();
        } catch (error) {
          if (stopped) return;
          if (error.status >= 400 && error.status < 500) pending = null;
          setRetry(Boolean(pending));
          setMessage(pending ? 'Connection interrupted. Retry this same spin to recover its result—no second charge.' : error.message);
          setBusy(false);
        } finally { sending = false; }
      },
      stand() { if (!sending && !pending) { scene.stand(); release(); } },
      dismiss() { clearMessageTimer(); setMessage(''); }
    };
    const tick = setInterval(() => {
      if (active && scene.pose().seatId !== `seat-${active}`) release();
      if (active && performance.now() - heartbeatAt > 5000) void heartbeat();
      if (!sending && !pending && endAt && performance.now() >= endAt) {
        endAt = 0;
        if (pendingBalance !== null) { setBalance(pendingBalance); pendingBalance = null; }
        setBusy(false); showResultMessage(resultText);
      }
      void refresh();
    }, 1000);
    scene.setSlotRefresh(refresh); void refresh();
    window.addEventListener('pagehide', release);
    return () => {
      stopped = true; clearInterval(tick); if (messageTimer) clearTimeout(messageTimer); controllers.forEach(c => c.abort());
      scene.setSlotRefresh(null); window.removeEventListener('pagehide', release);
      scene.stand(); release(); actions.current = {}; setSelected(null); setMessage(''); setRetry(false); setBusy(false);
    };
  }, [ready, sceneRef, token, setBalance]);
  return { selected, message, busy, retry, bet, setBet,
    claim: id => actions.current.claim?.(id), spin: () => actions.current.spin?.(bet),
    stand: () => actions.current.stand?.(), dismiss: () => actions.current.dismiss?.() };
}
