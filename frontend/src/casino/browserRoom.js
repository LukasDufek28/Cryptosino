import layout from './worldLayout.json';
import casinoVersion from './version.json';

const API = process.env.REACT_APP_API_URL || '';
const TICK_MS = 30;
const MAX_BUFFER = 32768;
const validSequence = n => Number.isSafeInteger(n) && n >= 0;

// Cosmetic world state only. Never accept wallet, bet or payout messages here.
function cleanPose(p) {
  if (!p || ![p.x, p.z, p.yaw, p.jumpHeight].every(Number.isFinite) ||
      Math.abs(p.x) > 55 || p.z < -10 || p.z > 35 || Math.abs(p.yaw) > Math.PI * 2 ||
      p.jumpHeight < 0 || p.jumpHeight > 1.2 || ![1, 2].includes(p.floor) ||
      !Number.isInteger(p.faceSeed) || p.faceSeed < 0 || p.faceSeed > 2147483647 || !validSequence(p.revision)) return null;
  const seat = layout.seats.find(s => s.id === p.seatId);
  if (p.seatId !== null && (!seat || p.floor !== 2 || Math.hypot(p.x - seat.x, p.z - seat.z) > 3.2)) return null;
  const s = layout.stairs;
  const onStairs = p.x > s.walkMinX && p.x < s.walkMaxX && p.z > s.topZ && p.z < s.bottomZ;
  const baseY = onStairs ? layout.upperFloor * (s.bottomZ - p.z) / (s.bottomZ - s.topZ) : p.floor === 2 ? layout.upperFloor : 0;
  return { x: seat ? seat.x : p.x, z: seat ? seat.z : p.z, yaw: p.yaw,
    y: (seat ? layout.upperFloor : baseY) + (seat ? 0 : p.jumpHeight),
    floor: p.floor, jumpHeight: p.jumpHeight, faceSeed: p.faceSeed, seatId: p.seatId, revision: p.revision };
}

export default function browserRoom(token, scene, onStatus) {
  const sessionId = window.crypto.randomUUID();
  const links = new Map(), states = new Map();
  let roster = new Map(), host = null, generation = 0, selfId = null;
  let stopped = false, timer, controller, inSync = false;
  let outbox = [], ack = '0', lastSync = 0, packetSeq = 0, snapshotSeq = -1;
  let iceServers = [], relayConfigured = false, lastStatus = '', errorMessage = '';
  let worldAnchor = 0, worldAt = performance.now(), worldReady = false;
  let lastSnapshot = 0, lastUI = 0, lastEventRevision = -1;
  const isHost = () => host === sessionId;
  const worldSeconds = () => worldAnchor + (performance.now() - worldAt) / 1000;
  const active = () => !stopped && lastSync > 0 && performance.now() - lastSync < 10000;
  function status() {
    const count = isHost() ? states.size : (scene.peerCount?.() || 0) + 1;
    const connected = active() && (isHost() || (lastSnapshot > 0 && performance.now() - lastSnapshot < 3000));
    const message = errorMessage || (!connected ? 'Connecting browser room…' : '');
    const state = { mode: connected ? 'shared' : 'solo', count: Math.max(1, count),
      role: connected ? isHost() ? 'host' : 'guest' : 'connecting', message,
      players: active() ? [...roster.values()].map(member => ({
        id: member.id, username: member.username, balance: member.balance, version: member.version || 'legacy',
        isSelf: member.sessionId === sessionId, isHost: member.sessionId === host
      })) : [] };
    const key = JSON.stringify(state);
    if (key !== lastStatus) { lastStatus = key; onStatus(state); }
  }
  function closeLink(id) {
    const link = links.get(id);
    if (!link) return;
    links.delete(id); states.delete(id);
    outbox = outbox.filter(message => message.to !== id);
    link.cancelGather?.();
    link.pc.close();
  }
  function disconnect() {
    for (const id of [...links.keys()]) closeLink(id);
    states.clear(); outbox = []; lastSnapshot = 0;
    scene.updatePeers([]); scene.setWorldClock(null);
  }
  function send(channel, packet) {
    if (channel?.readyState !== 'open' || channel.bufferedAmount > MAX_BUFFER) return false;
    try { channel.send(JSON.stringify(packet)); return true; } catch { return false; }
  }
  function rejectSeat(id, pose) {
    const packet = { type: 'seatRejected', generation, seatId: pose.seatId, revision: pose.revision };
    if (id === sessionId) scene.rejectSeat(packet.seatId, packet.revision);
    else send(links.get(id)?.events, packet);
  }
  function acceptPose(id, raw, seq) {
    const member = roster.get(id), pose = cleanPose(raw), previous = states.get(id);
    if (!member || !pose || !validSequence(seq) || (previous && seq <= previous.seq)) return;
    if (pose.seatId && [...states.entries()].some(([other, state]) => other !== id && state.pose.seatId === pose.seatId)) {
      rejectSeat(id, pose);
      // Do not move the guest's camera. Exclude the rejected seated pose until it stands.
      return;
    }
    states.set(id, { pose, seq, at: performance.now() });
  }
  function players() {
    return [...states.entries()].filter(([id]) => roster.has(id)).map(([id, state]) => ({
      ...state.pose, sessionId: id, id: roster.get(id).id, username: roster.get(id).username
    }));
  }
  function receive(link, raw) {
    if (!active() || links.get(link.id) !== link || typeof raw !== 'string' || raw.length > 24576) return;
    const now = performance.now();
    if (now - link.rateAt > 1000) { link.rateAt = now; link.received = 0; }
    if (++link.received > 150) return;
    let packet;
    try { packet = JSON.parse(raw); } catch { return; }
    if (!packet || packet.generation !== generation) return;
    link.lastReceived = now;
    if (isHost()) {
      if (packet.type === 'pose' || packet.type === 'event') acceptPose(link.id, packet.pose, packet.seq);
      return;
    }
    if (link.id !== host) return;
    if (packet.type === 'seatRejected' && validSequence(packet.revision)) {
      scene.rejectSeat(packet.seatId, packet.revision); return;
    }
    if (packet.type !== 'snapshot' || !validSequence(packet.seq) || packet.seq <= snapshotSeq ||
        !Number.isFinite(packet.worldSeconds) || packet.worldSeconds < 0 || packet.worldSeconds > 1e12 ||
        !Array.isArray(packet.players) || packet.players.length > layout.capacity) return;
    const seen = new Set(), peers = [];
    for (const p of packet.players) {
      const member = roster.get(p?.sessionId), pose = cleanPose(p);
      if (!member || !pose || seen.has(p.sessionId)) continue;
      seen.add(p.sessionId);
      // The host never echoes corrections into the local player or camera.
      if (p.sessionId !== sessionId) peers.push({ ...pose, id: member.id, username: member.username });
    }
    snapshotSeq = packet.seq; lastSnapshot = now; errorMessage = '';
    // Smooth clock corrections so traffic does not jump with network jitter.
    const predicted = worldSeconds();
    worldAnchor = worldReady && Math.abs(predicted - packet.worldSeconds) < 2
      ? predicted + (packet.worldSeconds - predicted) * 0.1 : packet.worldSeconds;
    worldAt = now; worldReady = true;
    scene.setWorldClock(worldSeconds); scene.updatePeers(peers);
  }
  function attach(link, channel) {
    if (!['movement', 'events'].includes(channel.label) || link[channel.label]) { channel.close(); return; }
    link[channel.label] = channel;
    channel.onmessage = e => receive(link, e.data);
    channel.onopen = () => { lastEventRevision = -1; };
  }
  function newLink(id, connection) {
    closeLink(id);
    const pc = new RTCPeerConnection({ iceServers });
    const link = { id, connection, pc, created: performance.now(), lastReceived: 0, received: 0, rateAt: performance.now() };
    links.set(id, link);
    pc.ondatachannel = e => attach(link, e.channel);
    return link;
  }
  async function gather(link) {
    const pc = link.pc;
    if (pc.iceGatheringState === 'complete') return;
    await new Promise(resolve => {
      let timeout;
      const finish = () => { clearTimeout(timeout); link.cancelGather = null; pc.removeEventListener('icegatheringstatechange', changed); pc.removeEventListener('connectionstatechange', changed); resolve(); };
      const changed = () => { if (pc.iceGatheringState === 'complete' || pc.connectionState === 'closed') finish(); };
      timeout = setTimeout(finish, 7000);
      link.cancelGather = finish;
      pc.addEventListener('icegatheringstatechange', changed);
      pc.addEventListener('connectionstatechange', changed);
    });
  }
  async function describe(link, type, remote) {
    const savedGeneration = generation;
    try {
      if (remote) await link.pc.setRemoteDescription(remote);
      if (type === 'offer') {
        attach(link, link.pc.createDataChannel('movement', { ordered: false, maxRetransmits: 0 }));
        attach(link, link.pc.createDataChannel('events', { ordered: true }));
      }
      await link.pc.setLocalDescription(type === 'offer' ? await link.pc.createOffer() : await link.pc.createAnswer());
      await gather(link);
      if (!stopped && savedGeneration === generation && links.get(link.id) === link) {
        outbox.push({ id: window.crypto.randomUUID(), to: link.id, connection: link.connection,
          type, sdp: link.pc.localDescription.sdp });
      }
    } catch { if (links.get(link.id) === link) closeLink(link.id); }
  }
  async function signal(message) {
    const { sender, payload } = message;
    if (!roster.has(sender) || sender === sessionId) return;
    if (!isHost() && sender === host && payload.type === 'offer') {
      if (links.get(sender)?.connection === payload.connection) return;
      const link = newLink(sender, payload.connection);
      // Gathering runs outside the HTTP heartbeat so the host lease stays alive.
      void describe(link, 'answer', { type: 'offer', sdp: payload.sdp });
    } else if (isHost() && payload.type === 'answer') {
      const link = links.get(sender);
      if (link?.connection === payload.connection && link.pc.signalingState === 'have-local-offer') {
        try { await link.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp }); } catch { closeLink(sender); }
      }
    }
  }
  async function sync() {
    if (stopped || inSync) return;
    inSync = true;
    let delay = 1000;
    // Keep SDP batches below Express's default JSON request size limit.
    const batch = outbox.slice(0, 3);
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${API}/api/casino/browser-room/sync`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId, generation, ack, signals: batch, version: casinoVersion.version }), signal: controller.signal });
      const data = await response.json();
      if (stopped) return;
      if (!response.ok) throw new Error(data.error || 'Room setup unavailable.');
      lastSync = performance.now(); errorMessage = '';
      outbox = outbox.filter(s => !batch.some(b => b.id === s.id));
      roster = new Map(data.roster.map(m => [m.sessionId, m])); selfId = data.selfId;
      iceServers = data.iceServers; relayConfigured = data.relayConfigured;
      if (generation !== data.generation || host !== data.hostSession) {
        disconnect(); generation = data.generation; host = data.hostSession; snapshotSeq = -1;
        if (!worldReady) { worldAnchor = data.worldSeconds; worldAt = performance.now(); worldReady = true; }
      }
      if (isHost()) scene.setWorldClock(worldSeconds);
      for (const id of [...links.keys()]) if (!roster.has(id) || (!isHost() && id !== host)) closeLink(id);
      for (const message of data.signals) {
        await signal(message);
        ack = message.id;
      }
      if (isHost()) {
        for (const id of roster.keys()) {
          if (id === sessionId) continue;
          const link = links.get(id);
          const healthy = link?.movement?.readyState === 'open' && link?.events?.readyState === 'open' &&
            link.lastReceived > 0 && performance.now() - link.lastReceived < 6000;
          if (!link || (!healthy && performance.now() - link.created > 20000)) {
            void describe(newLink(id, window.crypto.randomUUID()), 'offer');
          }
        }
      }
      const connected = [...links.values()].every(l => l.movement?.readyState === 'open' && l.events?.readyState === 'open');
      delay = connected && (isHost() || links.size) && !outbox.length ? 3000 : 800;
      if (!connected && [...links.values()].some(l => performance.now() - l.created > 12000)) {
        errorMessage = relayConfigured ? 'Peer connection interrupted; reconnecting…' : 'Direct connection failed. These networks may need a TURN relay.';
      }
      status();
    } catch (error) {
      if (!stopped) { errorMessage = error.message || 'Room setup unavailable; exploring solo.'; status(); }
      delay = 4000;
    } finally {
      clearTimeout(timeout); inSync = false;
      if (!stopped) timer = setTimeout(sync, delay);
    }
  }
  function tick() {
    if (!active()) {
      if (lastSync && performance.now() - lastSync >= 10000) { disconnect(); lastSync = 0; status(); }
      return;
    }
    const now = performance.now(), pose = scene.pose(), seq = ++packetSeq;
    if (isHost()) {
      for (const [id, state] of states) if (id !== sessionId && now - state.at > 3000) states.delete(id);
      acceptPose(sessionId, pose, seq);
      const all = players();
      scene.updatePeers(all.filter(p => p.id !== selfId));
      const packet = { type: 'snapshot', generation, seq, players: all, worldSeconds: worldSeconds() };
      for (const link of links.values()) send(link.movement, packet);
    } else {
      const link = links.get(host);
      send(link?.movement, { type: 'pose', generation, seq, pose });
      // Discrete changes also go reliably: seat/stand, face, reset, jump.
      if (pose.revision !== lastEventRevision && send(link?.events, { type: 'event', generation, seq, pose })) lastEventRevision = pose.revision;
      if (lastSnapshot && now - lastSnapshot > 3000) { scene.updatePeers([]); lastSnapshot = 0; }
    }
    if (now - lastUI > 500) { status(); lastUI = now; }
  }
  function leave() {
    return fetch(`${API}/api/casino/browser-room/${sessionId}`, { method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
  }
  function visibility() {
    // Alt-Tab is not leaving the room. Keep healthy channels and heartbeats.
    // Browsers can still suspend long-hidden tabs; leases handle actual freezes.
    if (!document.hidden && !stopped && !inSync) {
      clearTimeout(timer); timer = setTimeout(sync, 500);
    }
  }
  const tickTimer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', leave);
  void sync();
  return () => {
    stopped = true; clearTimeout(timer); clearInterval(tickTimer); controller?.abort();
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave);
    disconnect(); void leave();
  };
}
