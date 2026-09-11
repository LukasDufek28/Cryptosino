import { useEffect, useState } from 'react';

const API = process.env.REACT_APP_API_URL || '';
export default function usePresence(token, sceneRef, ready) {
  const [presence, setPresence] = useState({ mode: 'solo', count: 1, message: '' });
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !token) { setPresence({ mode: 'solo', count: 1, message: '' }); return; }
    let stopped = false, timer, controller;
    async function sync() {
      let delay = 750;
      try {
        if (document.hidden) { timer = setTimeout(sync, 3000); return; }
        const pose = scene?.pose();
        if (!pose) return;
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let res;
        try {
          res = await fetch(`${API}/api/casino/presence`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(pose), signal: controller.signal });
        } finally { clearTimeout(timeout); }
        if (stopped) return;
        if (res.status === 409) {
          const data = await res.json();
          if (stopped) return;
          scene?.stand();
          setPresence({ mode: 'solo', count: 1, message: data.error }); delay = 5000;
        } else {
          if (!res.ok) throw new Error('Room unavailable');
          const data = await res.json();
          if (stopped) return;
          scene?.updatePeers(data.players);
          setPresence({ mode: 'shared', count: data.players.length + 1, message: '' });
        }
      } catch {
        if (stopped) return;
        scene?.updatePeers([]);
        setPresence({ mode: 'solo', count: 1, message: 'Shared room offline · exploring solo' }); delay = 15000;
      }
      if (!stopped) timer = setTimeout(sync, delay);
    }
    sync();
    return () => {
      stopped = true; clearTimeout(timer); controller?.abort(); scene?.updatePeers([]);
      fetch(`${API}/api/casino/presence`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
    };
  }, [token, sceneRef, ready]);
  return presence;
}
