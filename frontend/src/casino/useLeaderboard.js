import { useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || '';
export default function useLeaderboard(sceneRef, ready) {
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !scene) return;
    let stopped = false, timer, controller, lastLeaders = [], updatedAt = '';
    async function refresh() {
      if (stopped) return;
      if (document.hidden) { timer = setTimeout(refresh, 5000); return; }
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${API}/api/casino/leaderboard`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const data = await response.json();
        if (!Array.isArray(data.leaders)) throw new Error('Invalid leaderboard');
        if (stopped) return;
        lastLeaders = data.leaders.slice(0, 10);
        updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        scene.updateLeaderboard({ leaders: lastLeaders, message: '', updatedAt });
      } catch {
        if (!stopped) scene.updateLeaderboard({ leaders: lastLeaders, updatedAt,
          message: updatedAt ? `OFFLINE · SHOWING LAST UPDATE AT ${updatedAt}` : 'Leaderboard unavailable · retrying shortly' });
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(refresh, 30000);
      }
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  }, [sceneRef, ready]);
}
