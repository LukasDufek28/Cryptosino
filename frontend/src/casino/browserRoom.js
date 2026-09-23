import layout from './worldLayout.json';
import casinoVersion from './version.json';
import slotConfigs from '../slots/config.json';

const API = process.env.REACT_APP_API_URL || '';
const TICK_MS = 30;
const MAX_BUFFER = 262144;
const validSequence = n => Number.isSafeInteger(n) && n >= 0;
const cleanChat = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100 ? value.trim() : null;
const slotMachine = id => layout.slotMachines.find(machine => machine.id === id);
const cleanSlotSpin = (spin, member, machine) => {
  const config = slotConfigs[machine.variant];
  const cols = Number(config?.cols || config?.reels?.length || 0);
  const rows = Number(config?.rows || 0);
  if (!spin || typeof spin !== 'object' || !cols || !rows || spin.machineId !== machine.id || spin.variant !== machine.variant ||
      spin.userId !== member.id || spin.username !== member.username || typeof spin.id !== 'string' ||
      !Number.isFinite(spin.startedAt) || !Number.isFinite(spin.durationMs) || spin.durationMs < 1000 || spin.durationMs > 65000 ||
      !Number.isFinite(Number(spin.bet)) || !Number.isFinite(Number(spin.totalPayout)) || !Number.isFinite(Number(spin.balanceBefore)) ||
      !Array.isArray(spin.visible) || spin.visible.length !== cols || spin.visible.some(reel => !Array.isArray(reel) || reel.length !== rows)) return null;
  return spin;
};
const BLACKJACK_SEAT = 'seat-blackjack-live';
const cleanBlackjackCard = card => {
  if (!card || typeof card !== 'object') return null;
  const value = String(card.value || ''), suit = String(card.suit || '');
  if (value === '?' && suit === '?') return { value, suit };
  if (!['A','2','3','4','5','6','7','8','9','10','J','Q','K'].includes(value) || !['♠','♥','♦','♣'].includes(suit)) return null;
  return { value, suit };
};
const cleanBlackjackVisual = raw => {
  if (!raw || typeof raw !== 'object' || !['betting','playing','finished'].includes(raw.phase)) return null;
  const playerHand = Array.isArray(raw.playerHand) && raw.playerHand.length <= 12 ? raw.playerHand.map(cleanBlackjackCard) : null;
  const dealerHand = Array.isArray(raw.dealerHand) && raw.dealerHand.length <= 12 ? raw.dealerHand.map(cleanBlackjackCard) : null;
  if (!playerHand || !dealerHand || playerHand.some(v => !v) || dealerHand.some(v => !v)) return null;
  const bet = Number(raw.bet || 0), wager = Number(raw.wager || 0), payout = Number(raw.payout || 0), profit = Number(raw.profit || 0);
  if (![bet, wager, payout, profit].every(Number.isFinite) || bet < 0 || wager < 0 || payout < 0 || profit < 0 ||
      bet > 1000000 || wager > 2000000 || payout > 10000000 || profit > 10000000) return null;
  const playerValue = raw.playerValue == null ? null : Number(raw.playerValue), dealerValue = raw.dealerValue == null ? null : Number(raw.dealerValue);
  if ((playerValue != null && (!Number.isFinite(playerValue) || playerValue < 0 || playerValue > 100)) ||
      (dealerValue != null && (!Number.isFinite(dealerValue) || dealerValue < 0 || dealerValue > 100))) return null;
  const outcome = raw.outcome == null ? null : String(raw.outcome);
  if (outcome && !['blackjack','win','push','lose','bust'].includes(outcome)) return null;
  let dealerCue = null;
  if (raw.dealerCue && typeof raw.dealerCue === 'object') {
    const cueId = Number(raw.dealerCue.id), cueType = String(raw.dealerCue.type || 'count');
    const cueLine = typeof raw.dealerCue.line === 'string' ? raw.dealerCue.line.trim().slice(0, 100) : '';
    const delayMs = Math.max(0, Math.min(5000, Number(raw.dealerCue.delayMs) || 0));
    if (Number.isSafeInteger(cueId) && cueId >= 0 && cueLine &&
        ['shuffle','deal','hit','stand','double','count','win','blackjack','lose','bust','push'].includes(cueType)) {
      dealerCue = { id: cueId, type: cueType, line: cueLine, delayMs };
    }
  }
  return { phase: raw.phase, bet, wager, playerHand, dealerHand, dealerHidden: Boolean(raw.dealerHidden),
    outcome, message: typeof raw.message === 'string' ? raw.message.slice(0, 120) : '', busy: Boolean(raw.busy),
    roundId: typeof raw.roundId === 'string' ? raw.roundId.slice(0, 100) : null, playerValue, dealerValue, dealerCue, payout, profit,
    canDouble: Boolean(raw.canDouble), active: Boolean(raw.active) };
};

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
  const slotMachines = new Map(), slotRequests = new Map();
  let blackjackVisual = null;
  let roster = new Map(), host = null, generation = 0, selfId = null;
  let stopped = false, timer, controller, inSync = false;
  let outbox = [], ack = '0', lastSync = 0, packetSeq = 0, snapshotSeq = -1;
  let iceServers = [], relayConfigured = false, lastStatus = '', errorMessage = '';
  let worldAnchor = 0, worldAt = performance.now(), worldReady = false;
  let lastSnapshot = 0, lastUI = 0, lastEventRevision = -1;
  let lastChatAt = 0;
  let slotServerOffset = 0;
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
        id: member.id, username: member.username,
        balance: (() => {
          const activeSpin = [...slotMachines.values()].find(machine => machine.spin?.userId === member.id &&
            machine.spin.startedAt + machine.spin.durationMs > Date.now() + slotServerOffset);
          return activeSpin?.spin?.balanceBefore ?? member.balance;
        })(), version: member.version || 'legacy',
        isAdmin: Boolean(member.is_admin), isOwner: Boolean(member.is_owner),
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
  function slotState() {
    return { machines: layout.slotMachines.map(machine => slotMachines.get(machine.id) || { id: machine.id }),
      serverNow: Date.now() + slotServerOffset };
  }
  function applyBlackjackVisual(value) {
    const clean = cleanBlackjackVisual(value?.state);
    if (!clean) return;
    blackjackVisual = { sessionId: typeof value.sessionId === 'string' ? value.sessionId : null, state: clean, serverNow: Number(value.serverNow) || Date.now() };
    scene.updateBlackjack?.(clean, blackjackVisual.serverNow);
  }
  function publishBlackjackVisual(target = null) {
    if (!isHost() || !blackjackVisual) return;
    const packet = { type: 'blackjackState', generation, ...blackjackVisual };
    scene.updateBlackjack?.(blackjackVisual.state, blackjackVisual.serverNow);
    if (target) send(links.get(target)?.events, packet);
    else for (const link of links.values()) send(link.events, packet);
  }
  function sendBlackjackVisual(raw) {
    if (!active()) return;
    const clean = cleanBlackjackVisual(raw);
    if (!clean) return;
    if (isHost()) {
      if (states.get(sessionId)?.pose?.seatId !== BLACKJACK_SEAT) return;
      blackjackVisual = { sessionId, state: clean, serverNow: Date.now() };
      publishBlackjackVisual();
    } else {
      send(links.get(host)?.events, { type: 'blackjackVisual', generation, state: clean });
    }
  }
  function applySlotState(value) {
    if (!value || !Array.isArray(value.machines) || value.machines.length > layout.slotMachines.length || !Number.isFinite(value.serverNow)) return;
    slotServerOffset = value.serverNow - Date.now();
    slotMachines.clear();
    for (const state of value.machines) {
      const machine = state && slotMachine(state.id);
      if (!machine) continue;
      const occupant = roster.get(state.sessionId);
      const spinMember = [...roster.values()].find(member => member.id === state.spin?.userId);
      const spin = spinMember ? cleanSlotSpin(state.spin, spinMember, machine) : null;
      const presentationOffsetMs = spin && Number.isFinite(Number(state.presentationOffsetMs))
        ? Math.max(0, Math.min(Number(state.presentationOffsetMs), Math.max(0, spin.durationMs - 250))) : 0;
      slotMachines.set(machine.id, { id: machine.id,
        ...(occupant && occupant.id === state.userId && occupant.username === state.username
          ? { sessionId: state.sessionId, userId: occupant.id, username: occupant.username } : {}),
        spin, presentationOffsetMs });
    }
    scene.receiveSlotState(slotState()); status();
  }
  function publishSlotState(target = null) {
    if (!isHost()) return;
    const value = slotState();
    scene.receiveSlotState(value); status();
    const packet = { type: 'slotState', generation, ...value };
    if (target) send(links.get(target)?.events, packet);
    else for (const link of links.values()) send(link.events, packet);
  }
  function pruneSlotOccupants() {
    let changed = false;
    for (const [id, state] of slotMachines) {
      if (state.sessionId && !roster.has(state.sessionId)) {
        slotMachines.set(id, { id, spin: state.spin || null, presentationOffsetMs: state.presentationOffsetMs || 0 }); changed = true;
      }
    }
    if (changed) publishSlotState();
  }
  function handleSlotCommand(sender, packet) {
    const member = roster.get(sender);
    if (!member) return { ok: false, error: 'Unknown lobby member.' };
    if (packet.action === 'sync') { publishSlotState(); return { ok: true, state: slotState() }; }
    const machine = slotMachine(packet.machineId);
    if (!machine) return { ok: false, error: 'Unknown slot machine.' };
    const current = slotMachines.get(machine.id);
    if (packet.action === 'claim') {
      if (current?.sessionId && current.sessionId !== sender) return { ok: false, error: 'Someone is already using this machine.' };
      if ([...slotMachines.values()].some(state => state.id !== machine.id && state.sessionId === sender)) return { ok: false, error: 'Stand up from your other machine first.' };
      slotMachines.set(machine.id, { id: machine.id, userId: member.id, username: member.username, sessionId: sender,
        spin: current?.spin || null, presentationOffsetMs: current?.presentationOffsetMs || 0 });
    } else if (packet.action === 'release') {
      if (current?.sessionId === sender) slotMachines.set(machine.id, { id: machine.id, spin: current.spin || null,
        presentationOffsetMs: current.presentationOffsetMs || 0 });
    } else if (packet.action === 'spin') {
      if (current?.sessionId !== sender) return { ok: false, error: 'Sit at this machine again before spinning.' };
      const spin = cleanSlotSpin(packet.spin, member, machine);
      if (!spin) return { ok: false, error: 'Invalid shared spin result.' };
      if (Number.isFinite(packet.serverNow)) slotServerOffset = packet.serverNow - Date.now();
      slotMachines.set(machine.id, { ...current, spin, presentationOffsetMs: 0 });
    } else if (packet.action === 'hurry') {
      if (current?.sessionId !== sender || !current?.spin) return { ok: false, error: 'No active spin to speed up.' };
      const serverNow = Date.now() + slotServerOffset;
      const effectiveElapsed = serverNow - current.spin.startedAt + Number(current.presentationOffsetMs || 0);
      if (effectiveElapsed >= current.spin.durationMs - 250) return { ok: true, state: slotState() };
      const amount = Math.max(250, Math.min(1000, Number(packet.amountMs) || 650));
      const maxOffset = Math.max(0, current.spin.durationMs - 250);
      slotMachines.set(machine.id, { ...current, presentationOffsetMs: Math.min(maxOffset, Number(current.presentationOffsetMs || 0) + amount) });
    } else return { ok: false, error: 'Invalid slot command.' };
    publishSlotState();
    return { ok: true, state: slotState() };
  }
  function requestSlot(action, payload = {}) {
    if (!active()) return Promise.reject(new Error('Lobby host is not connected.'));
    const packet = { ...payload, type: 'slotCommand', generation, requestId: window.crypto.randomUUID(), action };
    if (isHost()) return Promise.resolve(handleSlotCommand(sessionId, packet)).then(result => {
      if (!result.ok) throw new Error(result.error); return result;
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { slotRequests.delete(packet.requestId); reject(new Error('Lobby host did not answer.')); }, 5000);
      slotRequests.set(packet.requestId, { resolve, reject, timeout });
      if (!send(links.get(host)?.events, packet)) {
        clearTimeout(timeout); slotRequests.delete(packet.requestId); reject(new Error('Lobby host is reconnecting.'));
      }
    });
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
    if (!active() || links.get(link.id) !== link || typeof raw !== 'string' || raw.length > 196608) return;
    const now = performance.now();
    if (now - link.rateAt > 1000) { link.rateAt = now; link.received = 0; }
    if (++link.received > 150) return;
    let packet;
    try { packet = JSON.parse(raw); } catch { return; }
    if (!packet || packet.generation !== generation) return;
    link.lastReceived = now;
    if (packet.type === 'slotChanged') return; // Pre-hosted-slot clients.
    if (isHost() && packet.type === 'slotCommand') {
      const result = handleSlotCommand(link.id, packet);
      send(link.events, { type: 'slotReply', generation, requestId: packet.requestId, ...result });
      return;
    }
    if (isHost() && packet.type === 'blackjackVisual') {
      if (states.get(link.id)?.pose?.seatId !== BLACKJACK_SEAT) return;
      const clean = cleanBlackjackVisual(packet.state);
      if (!clean) return;
      blackjackVisual = { sessionId: link.id, state: clean, serverNow: Date.now() };
      publishBlackjackVisual();
      return;
    }
    if (isHost()) {
      if (packet.type === 'chat') {
        const text = cleanChat(packet.text);
        if (!text || now - link.lastChatAt < 750) return;
        link.lastChatAt = now;
        const member = roster.get(link.id);
        if (member) scene.showPeerChat(member.id, text);
        for (const [id, peer] of links) if (id !== link.id) send(peer.events, { type: 'chat', generation, sender: link.id, text });
        return;
      }
      if (packet.type === 'pose' || packet.type === 'event') acceptPose(link.id, packet.pose, packet.seq);
      return;
    }
    if (link.id !== host) return;
    if (packet.type === 'slotState') { applySlotState(packet); return; }
    if (packet.type === 'blackjackState') { applyBlackjackVisual(packet); return; }
    if (packet.type === 'slotReply') {
      const pending = slotRequests.get(packet.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout); slotRequests.delete(packet.requestId);
      if (packet.ok) { if (packet.state) applySlotState(packet.state); pending.resolve(packet); }
      else pending.reject(new Error(packet.error || 'Slot request was rejected.'));
      return;
    }
    if (packet.type === 'chat') {
      const text = cleanChat(packet.text), member = roster.get(packet.sender);
      if (text && member && packet.sender !== sessionId) scene.showPeerChat(member.id, text);
      return;
    }
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
    channel.onopen = () => { lastEventRevision = -1; if (isHost() && channel.label === 'events') { publishSlotState(link.id); publishBlackjackVisual(link.id); } };
  }
  function newLink(id, connection) {
    closeLink(id);
    const pc = new RTCPeerConnection({ iceServers });
    const link = { id, connection, pc, created: performance.now(), lastReceived: 0, received: 0, rateAt: performance.now(), lastChatAt: 0 };
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
      if (isHost()) { scene.setWorldClock(worldSeconds); pruneSlotOccupants(); }
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
  function sendChat(message) {
    const text = cleanChat(message), now = performance.now();
    if (!text || !active() || now - lastChatAt < 750) return;
    lastChatAt = now;
    if (isHost()) {
      for (const link of links.values()) send(link.events, { type: 'chat', generation, sender: sessionId, text });
    } else send(links.get(host)?.events, { type: 'chat', generation, text });
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
  scene.setSlotCommand(requestSlot);
  scene.setBlackjackPublisher?.(sendBlackjackVisual);
  scene.setChatSender(sendChat);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', leave);
  void sync();
  return () => {
    stopped = true; clearTimeout(timer); clearInterval(tickTimer); controller?.abort();
    document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave);
    for (const pending of slotRequests.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Lobby closed.')); }
    slotRequests.clear(); scene.setChatSender(null); scene.setSlotCommand(null); scene.setBlackjackPublisher?.(null); disconnect(); void leave();
  };
}
