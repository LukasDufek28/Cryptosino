import * as THREE from 'three';
import layout from './worldLayout.json';
import buildWorld from './buildWorld';
import { avatar, clearMaterialCache } from './models';

export default function createScene(host, events) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9d5f2');
  scene.fog = new THREE.Fog('#bfdcf0', 42, 105);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 180);
  camera.rotation.order = 'YXZ';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', 'Explore the two-story Amber House casino');
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  const hemi = new THREE.HemisphereLight('#fff0d7', '#827861', 2.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe0ac', 3.2);
  sun.position.set(-22, 25, 32); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 0.5, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.03; scene.add(sun);
  const world = buildWorld(scene);
  const peers = new Map();
  const pos = new THREE.Vector3(layout.spawn.x, layout.spawn.y, layout.spawn.z);
  let yaw = layout.spawn.yaw, pitch = -0.05, floor = 2, seat = null;
  let jumpHeight = 0, jumpVelocity = 0;
  const gravity = 18, jumpSpeed = 5.5;
  let enabled = true, disposed = false, last = 0, uiAt = 0, nearest = null;
  let dragging = false, lastX = 0, lastY = 0, moved = false;
  const keys = new Set();
  const direction = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const touch = { x: 0, y: 0 };
  const clamp = THREE.MathUtils.clamp;
  function unlock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function look(dx, dy) {
    yaw -= dx * 0.0025; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    pitch = clamp(pitch - dy * 0.0025, -1.22, 1.22);
  }
  function lock() {
    if (!enabled || disposed) return;
    canvas.focus();
    if (!canvas.requestPointerLock || window.matchMedia('(pointer: coarse)').matches) return;
    try { const request = canvas.requestPointerLock(); if (request?.catch) request.catch(() => {}); } catch { /* drag-to-look remains available */ }
  }
  function stand() {
    if (!seat) return;
    pos.set(seat.exitX, layout.upperFloor, seat.exitZ); seat = null;
    events.onSeat(null);
  }
  function jump() {
    if (!enabled || seat || jumpHeight > 0 || jumpVelocity > 0) return;
    jumpVelocity = jumpSpeed;
  }
  function interact() {
    if (!enabled) return;
    if (jumpHeight > 0 || jumpVelocity > 0) return;
    if (seat) { stand(); return; }
    if (!nearest) return;
    if (nearest.kind === 'seat') {
      seat = nearest.item; pos.set(seat.x, layout.upperFloor, seat.z); yaw = seat.yaw; pitch = -0.03;
      events.onSeat(seat.id);
    } else {
      keys.clear(); unlock(); events.onGame(nearest.item.game);
    }
  }
  function keyDown(e) {
    if (!enabled || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space' && !e.target.closest('button, a, [contenteditable="true"]')) {
      e.preventDefault();
      if (!e.repeat) jump();
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      e.preventDefault(); keys.add(e.code);
    }
    if (e.code === 'KeyE' && !e.repeat) interact();
  }
  function keyUp(e) { keys.delete(e.code); }
  function clearInput() { keys.clear(); dragging = false; touch.x = 0; touch.y = 0; }
  function pointerDown(e) { if (!enabled || e.button !== 0 || document.pointerLockElement === canvas) return; dragging = true; lastX = e.clientX; lastY = e.clientY; moved = false; canvas.setPointerCapture(e.pointerId); }
  function pointerMove(e) {
    if (!enabled) return;
    if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
    else if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      look(dx, dy); lastX = e.clientX; lastY = e.clientY;
    }
  }
  function pointerUp(e) { dragging = false; if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId); if (!moved && e.pointerType !== 'touch') lock(); }
  function canMove(x, z) {
    if (Math.abs(x) > 45 || z > 32 || z < -9.4) return false;
    const s = layout.stairs;
    const stairLane = x > s.minX + 0.25 && x < s.maxX - 0.05;
    const stairRun = z < s.bottomZ && z > s.topZ;
    if (floor === 2 && (x > 13.4 || x < -13.4 || z > 9.35)) return false;
    if (z < 10 && Math.abs(x) > 13.4) return false;
    // Glazing is solid except for the reception entrance.
    if (floor === 1 && z > 9.35 && z < 10.6 && Math.abs(x) > 1.75) return false;
    // Rail beside the stairwell: enter the staircase only at its landings.
    if (stairRun && (stairLane !== (pos.x < s.maxX))) return false;
    if (floor === 2 && stairRun && x < -9.4 && !stairLane) return false;
    if (world.obstacles.some(o => o.floor === floor && Math.abs(x - o.x) < o.w / 2 + 0.24 && Math.abs(z - o.z) < o.d / 2 + 0.24)) return false;
    return true;
  }
  function updateFloor() {
    const s = layout.stairs;
    if (pos.x > s.minX && pos.x < s.maxX) {
      if (pos.z <= s.topZ + 0.05) { floor = 2; pos.y = layout.upperFloor; }
      else if (pos.z >= s.bottomZ - 0.05) { floor = 1; pos.y = 0; }
      else {
        pos.y = layout.upperFloor * (s.bottomZ - pos.z) / (s.bottomZ - s.topZ);
      }
    } else pos.y = floor === 2 ? layout.upperFloor : 0;
  }
  function updateNearest() {
    nearest = null;
    if (!seat && pos.y > layout.upperFloor - 0.1) {
      camera.getWorldDirection(direction);
      let best = 3.4;
      const options = [...layout.stations.map(item => ({ kind: 'game', item })), ...layout.seats.map(item => ({ kind: 'seat', item }))];
      options.forEach(option => {
        const s = option.item;
        const distance = Math.hypot(pos.x - s.x, pos.z - s.z);
        focus.set(s.x - pos.x, 0, s.z - pos.z).normalize();
        if (distance < best && direction.dot(focus) > 0.12) { nearest = option; best = distance; }
      });
    }
    events.onStatus({ floor, x: pos.x, z: pos.z, yaw, prompt: seat ? 'Stand up' : nearest ? nearest.kind === 'seat' ? `Sit · ${nearest.item.name}` : `Play · ${nearest.item.name}` : '', locked: document.pointerLockElement === canvas });
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  document.addEventListener('keydown', keyDown);
  document.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearInput);
  canvas.addEventListener('pointerdown', pointerDown);
  document.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', clearInput);
  function contextLost(e) { e.preventDefault(); events.onError('The 3D view lost its graphics connection. Reload the page to return to the casino.'); }
  canvas.addEventListener('webglcontextlost', contextLost);
  camera.position.copy(pos); camera.position.y += 1.65;
  renderer.setAnimationLoop(now => {
    if (disposed) return;
    const dt = Math.min((now - (last || now)) / 1000, 0.045); last = now;
    if (!document.hidden) {
      if (enabled && !seat) {
        const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + touch.y;
        const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + touch.x;
        if (keys.has('ArrowLeft')) yaw += dt * 1.5;
        if (keys.has('ArrowRight')) yaw -= dt * 1.5;
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        const len = Math.max(1, Math.hypot(forward, right));
        const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.2 : 3.1) * dt;
        const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) / len * speed;
        const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) / len * speed;
        if (canMove(pos.x + dx, pos.z)) pos.x += dx;
        if (canMove(pos.x, pos.z + dz)) pos.z += dz;
        updateFloor();
      }
      if (jumpHeight > 0 || jumpVelocity > 0) {
        jumpHeight += jumpVelocity * dt - 0.5 * gravity * dt * dt;
        jumpVelocity -= gravity * dt;
        if (jumpHeight <= 0) { jumpHeight = 0; jumpVelocity = 0; }
      }
      camera.position.set(pos.x, THREE.MathUtils.lerp(camera.position.y, pos.y + jumpHeight + (seat ? 1.55 : 1.65), Math.min(dt * 12, 1)), pos.z);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      world.cars.forEach(c => { c.group.position.x += dt * c.direction * c.speed; if (c.group.position.x > 64) c.group.position.x = -64; if (c.group.position.x < -64) c.group.position.x = 64; });
      peers.forEach(p => {
        p.group.position.lerp(p.target, 1 - Math.exp(-dt * 7));
        p.group.rotation.y += Math.atan2(Math.sin(p.yaw - p.group.rotation.y), Math.cos(p.yaw - p.group.rotation.y)) * Math.min(dt * 8, 1);
        p.name.quaternion.copy(camera.quaternion).premultiply(p.group.quaternion.clone().invert());
      });
      if (now - uiAt > 150) { updateNearest(); uiAt = now; }
      renderer.render(scene, camera);
    }
  });
  function disposeObject(object) {
    object.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.map) m.map.dispose(); /* Shared base materials disposed with the scene. */ if (m.map) m.dispose(); }
    });
  }
  return {
    lock, interact, stand, jump,
    setEnabled(value) { enabled = value; if (!value) { clearInput(); unlock(); } },
    move(x, y) { touch.x = x; touch.y = y; },
    home() { stand(); jumpHeight = 0; jumpVelocity = 0; pos.set(layout.spawn.x, layout.spawn.y, layout.spawn.z); floor = 2; yaw = layout.spawn.yaw; pitch = -0.05; },
    pose() { return { x: pos.x, z: pos.z, yaw, floor, seatId: seat?.id || null }; },
    updatePeers(players) {
      const live = new Set(players.map(p => p.id));
      for (const [id, peer] of peers) if (!live.has(id)) { scene.remove(peer.group); disposeObject(peer.group); peers.delete(id); }
      players.forEach(p => {
        if (!peers.has(p.id)) {
          const a = avatar(scene, p.username, ['#769b87', '#ba856b', '#bbac80'][p.id % 3]);
          a.group.position.set(p.x, p.y, p.z); peers.set(p.id, { ...a, target: new THREE.Vector3(), yaw: p.yaw });
        }
        const peer = peers.get(p.id); peer.target.set(p.x, p.y - (p.seatId ? 0.4 : 0), p.z); peer.yaw = p.yaw;
      });
    },
    dispose() {
      disposed = true; unlock(); renderer.setAnimationLoop(null); observer.disconnect();
      document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp);
      document.removeEventListener('pointermove', pointerMove); window.removeEventListener('blur', clearInput);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', clearInput); canvas.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set(), mats = new Set(), textures = new Set();
      scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { mats.add(m); if (m.map) textures.add(m.map); }); });
      geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose()); clearMaterialCache();
      renderer.dispose(); canvas.remove();
    }
  };
}
