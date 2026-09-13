import { useEffect, useState } from 'react';
import browserRoom from './browserRoom';

export default function usePresence(token, sceneRef, ready) {
  const [presence, setPresence] = useState({ mode: 'solo', count: 1, message: '' });
  useEffect(() => {
    const scene = sceneRef.current;
    if (!ready || !token || !scene) {
      setPresence({ mode: 'solo', count: 1, message: '' });
      return;
    }
    if (!window.RTCPeerConnection || !window.crypto?.randomUUID) {
      setPresence({ mode: 'solo', count: 1, message: 'Browser multiplayer needs WebRTC and HTTPS (or localhost).' });
      return;
    }
    return browserRoom(token, scene, setPresence);
  }, [token, sceneRef, ready]);
  return presence;
}
