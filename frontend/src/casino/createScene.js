import * as THREE from 'three';
import layout from './worldLayout.json';
import buildWorld from './buildWorld';
import freezeStaticTransforms from './freezeStaticTransforms';
import { avatar, clearMaterialCache } from './models';

// One face per page visit; remains stable through scene remounts and sign-in.
let visitFaceSeed = Math.floor(Math.random() * 2147483647);

export default function createScene(host, events) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9d5f2');
  scene.fog = new THREE.Fog('#bfdcf0', 42, 105);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 180);
  camera.rotation.order = 'YXZ';
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  const animatedRoots = new Set([
    ...world.cars.map(car => car.group), world.receptionist.group,
    ...world.liveSlots.map(machine => machine.group), world.liveBlackjack?.group
  ]);
  freezeStaticTransforms(scene, animatedRoots);
  const carStarts = world.cars.map(c => c.group.position.x);
  let worldClock = null, localWorldSeconds = 0, poseRevision = 0;
  const self = avatar(scene, '', '#769b87', visitFaceSeed);
  self.name.visible = false;
  self.group.traverse(object => object.layers.set(1));
  const peers = new Map();
  const pos = new THREE.Vector3(layout.spawn.x, layout.spawn.y, layout.spawn.z);
  let yaw = layout.spawn.yaw, pitch = -0.05, floor = 2, seat = null;
  let slotCommand = null, slotStateReceiver = null, slotAction = null, slotHover = null;
  let blackjackAction = null, blackjackHover = null, blackjackPublisher = null;
  let traversingStairs = false;
  let jumpHeight = 0, jumpVelocity = 0;
  const gravity = 18, jumpSpeed = 5.5;
  const playerRadius = 0.45;
  let enabled = true, disposed = false, last = 0, uiAt = 0, nearest = null;
  let statsVisible = false, statsStart = 0, statsFrames = 0, statsFrameTotal = 0, statsFrameWorst = 0;
  let chatSender = null;
  let dragging = false, lastX = 0, lastY = 0, moved = false, cursorX = null, cursorY = null;
  let dragPointer = null, skipLockedMove = true;
  const keys = new Set();
  const direction = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(); raycaster.far = 4.6;
  const pointer = new THREE.Vector2();
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const slotSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
  const slotLocations = new Map(layout.slotMachines.map(item => [item.id, item]));
  const occupiedSlots = new Set();
  const seatAvailable = item => item.kind !== 'slot' || !occupiedSlots.has(item.machineId);
  const groundInteractions = [{ kind: 'face', item: world.faceButton }, { kind: 'reset', item: world.resetButton },
    ...world.trading.terminals.map(item => ({ kind: 'game', item }))];
  const upperInteractions = [...layout.stations.filter(item => item.game !== 'slots').map(item => ({ kind: 'game', item })),
    ...layout.seats.filter(item => item.kind !== 'blackjack').map(item => ({ kind: 'seat', item }))];
  const inverseRotation = new THREE.Quaternion();
  const nearbyPlayers = [self.group.position];
  const touch = { x: 0, y: 0 };
  const clamp = THREE.MathUtils.clamp;
  function unlock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function look(dx, dy) {
    if (seat?.kind === 'blackjack') return;
    yaw -= dx * 0.0025; yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    pitch = clamp(pitch - dy * 0.0025, -1.22, 1.22);
  }
  function lock() {
    if (!enabled || disposed || seat?.kind === 'blackjack' || seat?.kind === 'slot') return;
    canvas.focus();
    if (!canvas.requestPointerLock || window.matchMedia('(pointer: coarse)').matches) return;
    try { const request = canvas.requestPointerLock(); if (request?.catch) request.catch(() => {}); } catch { /* drag-to-look remains available */ }
  }
  function activeSlotMachine() {
    return seat?.kind === 'slot' ? world.liveSlots.find(machine => machine.id === seat.machineId) : null;
  }
  function setSlotHover(action) {
    if (slotHover === action) return;
    slotHover = action || null;
    world.liveSlots.forEach(machine => machine.setHover(machine.id === seat?.machineId ? slotHover : null));
  }
  function updateSlotHover(clientX = null, clientY = null) {
    const machine = activeSlotMachine();
    if (!machine) { setSlotHover(null); return; }
    if (document.pointerLockElement === canvas || (clientX === null && cursorX === null)) pointer.set(0, 0);
    else {
      const rect = canvas.getBoundingClientRect(), px = clientX ?? cursorX, py = clientY ?? cursorY;
      pointer.set(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    }
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(machine.controls, false)[0];
    setSlotHover(hit?.object?.userData?.slotAction || null);
  }
  function triggerSlotControl() {
    const machine = activeSlotMachine();
    if (!machine || !slotHover || !slotAction) return false;
    machine.press(slotHover); slotAction(slotHover); return true;
  }
  function activeBlackjackTable() { return seat?.kind === 'blackjack' ? world.liveBlackjack : null; }
  function setBlackjackHover(action) {
    if (blackjackHover === action) return;
    blackjackHover = action || null;
    world.liveBlackjack?.setHover(blackjackHover);
  }
  function updateBlackjackHover(clientX = null, clientY = null) {
    const table = activeBlackjackTable();
    if (!table) { setBlackjackHover(null); return; }
    if (document.pointerLockElement === canvas || (clientX === null && cursorX === null)) pointer.set(0, 0);
    else {
      const rect = canvas.getBoundingClientRect(), px = clientX ?? cursorX, py = clientY ?? cursorY;
      pointer.set(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    }
    raycaster.setFromCamera(pointer, camera);
    const visibleControls = table.controls.filter(object => {
      const action = object.userData?.blackjackAction;
      if (!action || !table.enabled?.(action)) return false;
      for (let node = object; node; node = node.parent) if (node.visible === false) return false;
      return true;
    });
    const hit = raycaster.intersectObjects(visibleControls, false)[0];
    setBlackjackHover(hit?.object?.userData?.blackjackAction || null);
  }
  function triggerBlackjackControl() {
    const table = activeBlackjackTable();
    if (!table || !blackjackHover || !blackjackAction || !table.press(blackjackHover)) return false;
    blackjackAction(blackjackHover); return true;
  }
  function stand() {
    if (!seat) return;
    pos.set(seat.exitX, layout.upperFloor, seat.exitZ); seat = null; setSlotHover(null); setBlackjackHover(null);
    poseRevision += 1;
    events.onSeat(null);
  }
  function jump() {
    if (!enabled || seat || jumpHeight > 0 || jumpVelocity > 0) return;
    jumpVelocity = jumpSpeed;
    poseRevision += 1;
  }
  function interact() {
    if (!enabled) return;
    if (jumpHeight > 0 || jumpVelocity > 0) return;
    if (seat) {
      const leavingGame = seat.kind === 'slot' || seat.kind === 'blackjack';
      stand();
      if (leavingGame) lock();
      return;
    }
    if (!nearest) return;
    if (nearest.kind === 'reset') {
      keys.clear(); events.onResetBalance(); return;
    }
    if (nearest.kind === 'face') {
      visitFaceSeed = (visitFaceSeed + 1 + Math.floor(Math.random() * 2147483646)) % 2147483647;
      self.setFace(visitFaceSeed);
      poseRevision += 1;
      return;
    }
    if (nearest.kind === 'seat') {
      if (!seatAvailable(nearest.item)) return;
      if (nearest.item.kind === 'slot') { clearInput(); unlock(); events.onSlot(nearest.item.machineId); return; }
      seat = nearest.item; pos.set(seat.x, layout.upperFloor, seat.z); yaw = seat.yaw; pitch = -0.03;
      poseRevision += 1;
      events.onSeat(seat.id);
    } else {
      keys.clear(); unlock(); events.onGame(nearest.item.game);
    }
  }
  function home() {
    stand(); clearInput(); jumpHeight = 0; jumpVelocity = 0;
    pos.set(layout.spawn.x, layout.spawn.y, layout.spawn.z);
    floor = 2; traversingStairs = false; yaw = layout.spawn.yaw; pitch = -0.05;
    poseRevision += 1;
    camera.position.set(pos.x, pos.y + 1.65, pos.z);
    nearest = null;
  }
  function keyDown(e) {
    if (!enabled || e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!e.repeat) home();
    }
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
  function clearInput() {
    keys.clear(); dragging = false; touch.x = 0; touch.y = 0;
    if (dragPointer !== null && canvas.hasPointerCapture(dragPointer)) canvas.releasePointerCapture(dragPointer);
    dragPointer = null;
  }
  function lockChanged() {
    clearInput(); skipLockedMove = true;
    if ((seat?.kind === 'blackjack' || seat?.kind === 'slot') && document.pointerLockElement === canvas) unlock();
  }
  function visibilityChanged() { if (document.hidden) { clearInput(); statsStart = 0; statsFrames = 0; statsFrameTotal = 0; statsFrameWorst = 0; } skipLockedMove = true; }
  function pointerDown(e) {
    if (!enabled || !e.isPrimary || e.button !== 0) return;
    cursorX = e.clientX; cursorY = e.clientY;
    if (seat?.kind === 'slot') { updateSlotHover(e.clientX, e.clientY); triggerSlotControl(); e.preventDefault(); return; }
    if (seat?.kind === 'blackjack') { updateBlackjackHover(e.clientX, e.clientY); triggerBlackjackControl(); e.preventDefault(); return; }
    if (document.pointerLockElement === canvas) return;
    dragging = true; dragPointer = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = false; canvas.setPointerCapture(e.pointerId);
  }
  function pointerMove(e) {
    if (!enabled || document.hidden) return;
    cursorX = e.clientX; cursorY = e.clientY;
    if (seat?.kind === 'slot') {
      if (document.pointerLockElement === canvas) unlock();
      else updateSlotHover(e.clientX, e.clientY);
      return;
    }
    if (seat?.kind === 'blackjack') {
      if (document.pointerLockElement === canvas) unlock();
      else updateBlackjackHover(e.clientX, e.clientY);
      return;
    }
    if (document.pointerLockElement === canvas) {
      if (skipLockedMove) { skipLockedMove = false; return; }
      look(e.movementX, e.movementY);
    }
    else if (dragging && e.pointerId === dragPointer) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      look(dx, dy); lastX = e.clientX; lastY = e.clientY;
    }
  }
  function pointerUp(e) {
    if (e.pointerId !== dragPointer) return;
    dragging = false; dragPointer = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!moved && e.pointerType !== 'touch') lock();
  }
  function captureLost(e) { if (e.pointerId === dragPointer) { dragging = false; dragPointer = null; } }
  function canMove(x, z) {
    if (Math.abs(x) > 45 || z > 32 || z < -9.4) return false;
    const s = layout.stairs;
    const inStairLane = value => value > s.walkMinX && value < s.walkMaxX;
    const inStairRun = value => value < s.bottomZ && value > s.topZ;
    const nextOnStairs = inStairLane(x) && inStairRun(z);
    const sideBarrierDepth = (px, pz) => {
      const top = s.topZ - playerRadius, bottom = s.bottomZ + playerRadius;
      if (pz <= top || pz >= bottom) return 0;
      let left, right;
      if (px > s.minX - playerRadius && px <= s.walkMinX) {
        left = s.minX - playerRadius; right = s.walkMinX;
      } else if (px >= s.walkMaxX && px < s.maxX + playerRadius) {
        left = s.walkMaxX; right = s.maxX + playerRadius;
      } else return 0;
      return Math.min(px - left, right - px, pz - top, bottom - pz);
    };
    if (floor === 2 && (x > 13.4 || x < -13.4 || z > 9.35)) return false;
    const inTrading = floor === 1 && x > 18.6 && x < 35.4;
    if (z < 10 && Math.abs(x) > 13.4 && !inTrading) return false;
    // Glazing is solid except for the reception entrance.
    if (floor === 1 && z > 9.35 && z < 10.6 && Math.abs(x) > 1.75 && Math.abs(x - 27) > 1.35) return false;
    // The rails are solid along the whole flight. A player can enter only from
    // the landing that belongs to their current floor, never from the side or
    // from the small ground-floor space beneath the upper landing.
    // Extend both side barriers around the end corners. This seals the narrow
    // wall-side pocket and prevents diagonal movement around either rail end.
    const nextBarrierDepth = sideBarrierDepth(x, z);
    if (nextBarrierDepth > 0) {
      const currentBarrierDepth = sideBarrierDepth(pos.x, pos.z);
      // A player left in an old invalid position may move toward the nearest
      // exit, but can never move farther into the barrier.
      if (currentBarrierDepth <= 0 || nextBarrierDepth >= currentBarrierDepth) return false;
    }
    // The highest riser is a solid wall when approached from the downstairs
    // room beneath the upper landing. Include the player's full radius so the
    // avatar cannot visibly enter its front face before its center is stopped.
    const acrossTopRiser = x > s.minX - playerRadius && x < s.maxX + playerRadius;
    const touchesTopRiser = acrossTopRiser && z > s.topZ - playerRadius && z <= s.topZ;
    if (floor === 1 && !traversingStairs && touchesTopRiser) {
      const currentlyTouching = pos.x > s.minX - playerRadius && pos.x < s.maxX + playerRadius &&
        pos.z > s.topZ - playerRadius && pos.z <= s.topZ;
      if (!currentlyTouching || z > pos.z) return false;
    }
    if (traversingStairs && inStairRun(z) && !inStairLane(x)) return false;
    if (nextOnStairs && !traversingStairs) {
      const entersFromBottom = floor === 1 && inStairLane(pos.x) && pos.z >= s.bottomZ;
      const entersFromTop = floor === 2 && inStairLane(pos.x) && pos.z <= s.topZ;
      if (!entersFromBottom && !entersFromTop) return false;
      traversingStairs = true;
    }
    if (world.obstacles.some(o => o.floor === floor && Math.abs(x - o.x) < o.w / 2 + 0.24 && Math.abs(z - o.z) < o.d / 2 + 0.24)) return false;
    return true;
  }
  function updateFloor() {
    const s = layout.stairs;
    const inLane = pos.x > s.walkMinX && pos.x < s.walkMaxX;
    const onStairs = inLane && pos.z > s.topZ && pos.z < s.bottomZ;
    if (traversingStairs && onStairs) {
      floor = 1;
      pos.y = layout.upperFloor * (s.bottomZ - pos.z) / (s.bottomZ - s.topZ);
    } else {
      // Only an explicitly started traversal can change height or floors.
      // The room beneath the upper landing therefore remains entirely flat.
      if (traversingStairs && inLane && pos.z <= s.topZ) floor = 2;
      else if (traversingStairs && inLane && pos.z >= s.bottomZ) floor = 1;
      pos.y = floor === 2 ? layout.upperFloor : 0;
      traversingStairs = false;
    }
  }
  function updateNearest() {
    nearest = null;
    if (!seat && floor === 1 && pos.y < 0.1) {
      camera.getWorldDirection(direction);
      let best = 3.4;
      groundInteractions.forEach(option => {
        const item = option.item;
        const distance = Math.hypot(pos.x - item.x, pos.z - item.z);
        focus.set(item.x - pos.x, 0, item.z - pos.z).normalize();
        if (distance < best && direction.dot(focus) > 0.12) { nearest = option; best = distance; }
      });
    }
    if (!seat && pos.y > layout.upperFloor - 0.1) {
      camera.getWorldDirection(direction);
      let best = 3.4;
      upperInteractions.forEach(option => {
        const s = option.item;
        if (option.kind === 'seat' && !seatAvailable(s)) return;
        const distance = Math.hypot(pos.x - s.x, pos.z - s.z);
        focus.set(s.x - pos.x, 0, s.z - pos.z).normalize();
        if (distance < best && direction.dot(focus) > 0.12) { nearest = option; best = distance; }
      });
    }
    let prompt = '';
    if (seat?.kind === 'slot' || seat?.kind === 'blackjack') prompt = '';
    else if (seat) prompt = 'Stand up';
    else if (nearest) prompt = nearest.kind === 'face' ? 'Randomize face' : nearest.kind === 'reset' ? 'Ask for $1,000 reset' : nearest.kind === 'seat' ? `Sit · ${nearest.item.name}` : `Play · ${nearest.item.name}`;
    events.onStatus({ floor, x: pos.x, z: pos.z, yaw, prompt, locked: document.pointerLockElement === canvas });
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
  document.addEventListener('pointerlockchange', lockChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('lostpointercapture', captureLost);
  canvas.addEventListener('pointerdown', pointerDown);
  document.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', clearInput);
  function contextLost(e) { e.preventDefault(); events.onError('The 3D view lost its graphics connection. Reload the page to return to the casino.'); }
  canvas.addEventListener('webglcontextlost', contextLost);
  camera.position.copy(pos); camera.position.y += 1.65;
  renderer.setAnimationLoop(now => {
    if (disposed) return;
    const frameStart = statsVisible ? performance.now() : 0;
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
      const blackjackView = seat?.kind === 'blackjack';
      const seatedEye = seat?.kind === 'slot' ? 1.9 : blackjackView ? 2.5 : seat ? 1.55 : 1.65;
      const cameraBack = blackjackView ? .32 : 0;
      const targetX = pos.x + Math.sin(yaw) * cameraBack;
      const targetZ = pos.z + Math.cos(yaw) * cameraBack;
      camera.position.set(
        THREE.MathUtils.lerp(camera.position.x, targetX, Math.min(dt * 12, 1)),
        THREE.MathUtils.lerp(camera.position.y, pos.y + jumpHeight + seatedEye, Math.min(dt * 12, 1)),
        THREE.MathUtils.lerp(camera.position.z, targetZ, Math.min(dt * 12, 1))
      );
      const targetFov = blackjackView ? 58 : 68;
      if (Math.abs(camera.fov - targetFov) > .01) { camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(dt * 8, 1)); camera.updateProjectionMatrix(); }
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      self.group.position.set(pos.x, pos.y + jumpHeight + (seat?.kind === 'slot' || seat?.kind === 'blackjack' ? 0.25 : seat ? -0.4 : 0), pos.z);
      self.setSeated(Boolean(seat));
      self.group.rotation.y = yaw;
      self.chatBubble.quaternion.copy(camera.quaternion).premultiply(inverseRotation.copy(self.group.quaternion).invert());
      self.updateChat(now);
      nearbyPlayers.length = 1;
      for (const peer of peers.values()) nearbyPlayers.push(peer.group.position);
      world.receptionist.trackNearest(nearbyPlayers);
      world.mirror.visible = floor === 1;
      if (seat?.kind === 'slot') updateSlotHover(); else setSlotHover(null);
      if (seat?.kind === 'blackjack') updateBlackjackHover(); else setBlackjackHover(null);
      if (floor === 2) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        world.liveSlots.forEach(machine => {
          const location = slotLocations.get(machine.id);
          slotSphere.center.set(location.x, layout.upperFloor + 1.5, location.z);
          if (frustum.intersectsSphere(slotSphere)) machine.frame(now);
        });
        world.liveBlackjack?.frame(now, camera);
      }
      localWorldSeconds = worldClock ? worldClock() : localWorldSeconds + dt;
      world.cars.forEach((c, i) => {
        const distance = carStarts[i] + localWorldSeconds * c.direction * c.speed;
        c.group.position.x = ((distance + 64) % 128 + 128) % 128 - 64;
      });
      peers.forEach(p => {
        p.group.position.lerp(p.target, 1 - Math.exp(-dt * 25));
        p.group.rotation.y += Math.atan2(Math.sin(p.yaw - p.group.rotation.y), Math.cos(p.yaw - p.group.rotation.y)) * (1 - Math.exp(-dt * 25));
        inverseRotation.copy(p.group.quaternion).invert();
        p.name.quaternion.copy(camera.quaternion).premultiply(inverseRotation);
        p.chatBubble.quaternion.copy(camera.quaternion).premultiply(inverseRotation);
        p.updateChat(now);
      });
      if (enabled && now - uiAt > 150) { updateNearest(); uiAt = now; }
      renderer.render(scene, camera);
      if (statsVisible) {
        const frameMs = performance.now() - frameStart;
        statsFrames += 1; statsFrameTotal += frameMs; statsFrameWorst = Math.max(statsFrameWorst, frameMs);
        if (!statsStart) statsStart = now;
        const elapsed = now - statsStart;
        if (elapsed >= 1000) {
          const info = renderer.info;
          events.onStats?.({ fps: Math.round(statsFrames * 1000 / elapsed), frameMs: statsFrameTotal / statsFrames,
            worstMs: statsFrameWorst, calls: info.render.calls, triangles: info.render.triangles,
            geometries: info.memory.geometries, textures: info.memory.textures,
            width: canvas.width, height: canvas.height, pixelRatio: renderer.getPixelRatio(), floor, peers: peers.size });
          statsStart = now; statsFrames = 0; statsFrameTotal = 0; statsFrameWorst = 0;
        }
      }
    }
  });
  function disposeObject(object) {
    object.traverse(o => {
      if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
      if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.map) m.map.dispose(); /* Shared base materials disposed with the scene. */ if (m.map) m.dispose(); }
    });
  }
  return {
    lock, interact, stand, jump,
    setStatsVisible(value) { statsVisible = value; statsStart = 0; statsFrames = 0; statsFrameTotal = 0; statsFrameWorst = 0; },
    sitAtSlot(id) {
      const s = layout.seats.find(item => item.machineId === id);
      if (!s || disposed) return;
      clearInput(); unlock(); skipLockedMove = true; canvas.focus({ preventScroll: true });
      seat = s; floor = 2; jumpHeight = 0; jumpVelocity = 0;
      pos.set(s.x, layout.upperFloor, s.z); yaw = s.yaw; pitch = -0.34;
      poseRevision += 1; events.onSeat(s.id);
    },
    sitAtBlackjack() {
      const s = layout.seats.find(item => item.kind === 'blackjack');
      if (!s || disposed) return;
      clearInput(); unlock(); skipLockedMove = true; canvas.focus({ preventScroll: true });
      seat = s; floor = 2; jumpHeight = 0; jumpVelocity = 0;
      pos.set(s.x, layout.upperFloor, s.z); yaw = s.yaw; pitch = -0.57;
      poseRevision += 1; events.onSeat(s.id);
    },
    updateSlots(machines, serverNow) {
      if (disposed) return;
      occupiedSlots.clear();
      machines.forEach(machine => { if (machine.sessionId) occupiedSlots.add(machine.id); });
      world.liveSlots.forEach(m => m.update(machines.find(state => state.id === m.id) || null, serverNow));
    },
    setSlotCommand(callback) { slotCommand = callback; },
    setSlotAction(callback) { slotAction = callback; },
    updateSlotControlState(machineId, value) { world.liveSlots.find(machine => machine.id === machineId)?.updateControls(value); },
    requestSlot(action, payload) {
      return slotCommand ? slotCommand(action, payload) : Promise.reject(new Error('Lobby host is not connected.'));
    },
    setSlotStateReceiver(callback) { slotStateReceiver = callback; },
    receiveSlotState(state) { slotStateReceiver?.(state); },
    setBlackjackAction(callback) { blackjackAction = callback; },
    setBlackjackPublisher(callback) { blackjackPublisher = callback; },
    publishBlackjack(value) { blackjackPublisher?.(value); },
    updateBlackjack(value, serverNow) { if (!disposed) world.liveBlackjack?.update(value, serverNow); },
    focus() { if (enabled && !disposed) canvas.focus({ preventScroll: true }); },
    setEnabled(value) { enabled = value; if (!value) { clearInput(); unlock(); } },
    move(x, y) { touch.x = x; touch.y = y; },
    home,
    pose() { return { x: pos.x, z: pos.z, yaw, floor, jumpHeight, revision: poseRevision, seatId: seat?.id || null, faceSeed: visitFaceSeed }; },
    peerCount() { return peers.size; },
    updateTrading(data) { if (!disposed) world.trading.update(data); },
    updateLeaderboard(data) {
      if (!disposed) {
        world.leaderboard.update(data);
        world.peakLeaderboard.update({ ...data.peak, message: data.message, updatedAt: data.updatedAt });
      }
    },
    setChatSender(sender) { chatSender = sender; },
    chat(message) {
      const text = String(message || '').trim().slice(0, 100);
      if (!disposed && text) { self.showChat(text); chatSender?.(text); }
    },
    showPeerChat(id, message) { if (!disposed) peers.get(id)?.showChat(message); },
    setWorldClock(clock) { if (!disposed) worldClock = clock; },
    rejectSeat(id, revision) { if (!disposed && seat?.id === id && poseRevision === revision) stand(); },
    updatePeers(players) {
      if (disposed) return;
      const live = new Set(players.map(p => p.id));
      for (const [id, peer] of peers) if (!live.has(id)) { scene.remove(peer.group); disposeObject(peer.group); peers.delete(id); }
      players.forEach(p => {
        if (!peers.has(p.id)) {
          const a = avatar(scene, p.username, ['#769b87', '#ba856b', '#bbac80'][p.id % 3]);
          a.group.position.set(p.x, p.y, p.z); peers.set(p.id, { ...a, target: new THREE.Vector3(), yaw: p.yaw });
        }
        const peer = peers.get(p.id), peerSeat = layout.seats.find(s => s.id === p.seatId);
        peer.target.set(p.x, p.y + (peerSeat?.kind === 'slot' || peerSeat?.kind === 'blackjack' ? 0.25 : p.seatId ? -0.4 : 0), p.z); peer.yaw = p.yaw;
        peer.setSeated(Boolean(p.seatId));
        peer.setFace(p.faceSeed || 0);
      });
    },
    dispose() {
      disposed = true; unlock(); renderer.setAnimationLoop(null); observer.disconnect();
      world.mirror.getRenderTarget().dispose();
      document.removeEventListener('keydown', keyDown); document.removeEventListener('keyup', keyUp);
      document.removeEventListener('pointermove', pointerMove); window.removeEventListener('blur', clearInput);
      document.removeEventListener('pointerlockchange', lockChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('lostpointercapture', captureLost);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', clearInput); canvas.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set(), mats = new Set(), textures = new Set();
      scene.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { mats.add(m); if (m.map) textures.add(m.map); }); });
      geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); mats.forEach(m => m.dispose()); clearMaterialCache();
      renderer.dispose(); canvas.remove();
    }
  };
}
