import * as THREE from 'three';
import configs from '../slots/config.json';
import { box, group, sign, stool } from './models';

const icons = { JOKER: '★', '7': '7', BAR: 'BAR', BELL: '♟', WATER: '◆', CHERRY: '●●', BOOK: 'BOOK', SCARAB: '◆', ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J', TEN: '10' };
const colors = { JOKER: '#9a4dae', '7': '#c93d3d', BAR: '#345c94', BELL: '#ab7a19', WATER: '#237745', CHERRY: '#bf3544', BOOK: '#91651a', SCARAB: '#177763' };
export default function liveSlotMachine(parent, machine, floorY) {
  const config = configs[machine.variant], g = group(parent, machine.x, floorY, machine.z);
  box(g, [1.85, 2.22, 0.9], '#284b42', [0, 1.11, 0]);
  box(g, [1.94, 0.12, 1.03], '#c3a366', [0, 0.12, 0]);
  box(g, [1.9, 0.12, 1.1], '#b99558', [0, 0.95, 0.08]);
  box(g, [1.65, 1.03, 0.04], '#151c1a', [0, 1.61, 0.46]);
  sign(g, machine.name.toUpperCase(), 1.9, [0, 2.49, 0.1]);
  stool(g, 0, 0, 1.25);
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 768; labelCanvas.height = 128;
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.29), new THREE.MeshBasicMaterial({ map: labelTexture }));
  label.position.set(0, 0.72, 0.465); g.add(label);
  const reels = config.reels.map((strip, i) => {
    const width = 1.55 / config.reels.length;
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 576;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // Bow the reel face into the cabinet: a curved 3D band, not a game modal.
    const geometry = new THREE.PlaneGeometry(width - 0.025, 0.88, 1, 24);
    const vertices = geometry.attributes.position;
    for (let j = 0; j < vertices.count; j++) vertices.setZ(j, Math.sqrt(2 ** 2 - vertices.getY(j) ** 2) - 2);
    geometry.computeVertexNormals();
    const reel = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 }));
    reel.position.set((i - (config.reels.length - 1) / 2) * width, 1.61, 0.54); g.add(reel);
    return { strip, canvas, ctx: canvas.getContext('2d'), texture, key: '' };
  });
  let state = null, clockAt = 0, serverAt = 0, labelKey = '';
  function update(value, serverNow) { state = value; clockAt = performance.now(); serverAt = serverNow; }
  function frame(now) {
    const spin = state?.spin;
    const elapsed = spin ? Math.max(0, serverAt + now - clockAt - spin.startedAt) : Infinity;
    const running = spin && elapsed < spin.durationMs;
    const respinning = spin?.respin && elapsed >= 3300;
    reels.forEach((reel, i) => {
      const locked = respinning && spin.respin.lockedReels.includes(i);
      const finals = spin ? (spin.respin && !respinning ? spin.initialVisible[i] : spin.visible[i]) : reel.strip.slice(0, 3);
      const phaseTime = respinning ? elapsed - 3300 : elapsed;
      const stopAt = respinning ? 1900 + i * 180 : 2000 + i * 240;
      const rolling = running && !locked && phaseTime < stopAt;
      const offset = rolling ? Math.max(0, stopAt - phaseTime) / 70 : 0;
      // Staggered stops and a small damped bounce finish on the server's symbols.
      const bounceAge = phaseTime - stopAt;
      const bounce = !rolling && running && bounceAge >= 0 && bounceAge < 300 ? Math.sin(bounceAge / 35) * Math.exp(-bounceAge / 90) * 12 : 0;
      const key = `${finals.join(',')}:${Math.floor(offset * 12)}:${Math.round(bounce)}`;
      if (reel.key === key) return;
      reel.key = key;
      const ctx = reel.ctx; ctx.fillStyle = '#f8edcf'; ctx.fillRect(0, 0, 192, 576);
      const step = 192, shift = (offset % 1) * step + bounce;
      for (let row = -1; row < 4; row++) {
        const symbol = rolling && offset > 1 ? reel.strip[(Math.floor(offset) + row + reel.strip.length) % reel.strip.length] : finals[Math.max(0, Math.min(2, row))];
        const y = row * step + 96 + shift;
        ctx.fillStyle = colors[symbol] || '#364d65'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${symbol === 'BOOK' || symbol === 'BAR' ? 43 : 88}px Georgia`;
        ctx.fillText(icons[symbol] || symbol, 96, y, 180);
        ctx.strokeStyle = '#cebe9c'; ctx.beginPath(); ctx.moveTo(8, y + 94); ctx.lineTo(184, y + 94); ctx.stroke();
      }
      reel.texture.needsUpdate = true;
    });
    const text = running ? `${state?.username || spin.username} · ${respinning ? 'RESPIN' : 'SPINNING'}`
      : state?.username && state.userId !== spin?.userId ? `${state.username} · SEATED`
        : spin ? `${spin.username} · RETURN $${Number(spin.totalPayout).toFixed(2)}` : state?.username ? `${state.username} · SEATED` : 'TAKE A SEAT · PRESS E';
    if (text !== labelKey) {
      labelKey = text; const ctx = labelCanvas.getContext('2d');
      ctx.fillStyle = '#1b3029'; ctx.fillRect(0, 0, 768, 128); ctx.fillStyle = '#efd39d';
      ctx.font = '25px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 384, 64, 730);
      labelTexture.needsUpdate = true;
    }
  }
  frame(performance.now());
  return { id: machine.id, update, frame };
}
