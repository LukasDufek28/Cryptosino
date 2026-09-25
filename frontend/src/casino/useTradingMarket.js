import { useEffect, useRef, useState } from 'react';
const API = process.env.REACT_APP_API_URL || '';

export default function useTradingMarket(sceneRef, ready) {
  const [market, setMarket] = useState(null), [error, setError] = useState('');
  const refreshRef = useRef(null);
  useEffect(() => {
    if (!ready) return undefined;
    const scene = sceneRef.current;
    let stopped = false, controller = null, inFlight = false, lastRefresh = 0;
    async function refresh() {
      if (stopped || inFlight || document.hidden) return;
      inFlight = true; controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch(`${API}/api/trading/market`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Market unavailable');
        if (!stopped) { lastRefresh = performance.now(); setMarket({ ...data, receivedAt: lastRefresh }); setError(''); scene.updateTrading(data); }
      } catch (e) { if (!stopped) setError(e.message); }
      finally { clearTimeout(timeout); inFlight = false; }
    }
    refreshRef.current = refresh;
    const tick = () => {
      const pose = scene.pose();
      if (pose.floor === 1 && pose.x > 16 && performance.now() - lastRefresh >= 60000) void refresh();
    };
    tick(); const timer = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', tick); controller?.abort(); refreshRef.current = null; };
  }, [ready, sceneRef]);
  return { market, error, refresh: () => refreshRef.current?.() };
}
