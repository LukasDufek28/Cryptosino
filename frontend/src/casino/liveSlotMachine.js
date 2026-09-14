import * as THREE from 'three';
import configs from '../slots/config.json';
import { box, group, sign, stool } from './models';

const icons = { JOKER: '🃏', CHERRY: '🍒', LEMON: '🍋', ORANGE: '🍊', PLUM: '🟣', GRAPES: '🍇', MELON: '🍉', BELL: '🔔', BOOK: 'BOOK', SCARAB: '◆', ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J', TEN: '10' };
const colors = { JOKER: '#d09ade', CHERRY: '#dd7180', LEMON: '#e8cf67', ORANGE: '#e98d55', PLUM: '#ad72c7', GRAPES: '#9474c8', MELON: '#70b88b', BELL: '#e0b55d', BOOK: '#dfbd70', SCARAB: '#72b9a7', ACE: '#e3c887', KING: '#d6bd83', QUEEN: '#d6bd83', JACK: '#d6bd83', TEN: '#d6bd83' };
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
  function winningCells(spin, wins = spin?.wins, visible = spin?.visible) {
    const cells = new Set();
    for (const win of wins || []) {
      if (win.cells) {
        win.cells.forEach(({ reel, row }) => cells.add(`${reel}:${row}`));
        continue;
      }
      if (win.scatter) {
        (visible || []).forEach((symbols, reel) => (symbols || []).forEach((symbol, row) => {
          if (symbol === win.symbol) cells.add(`${reel}:${row}`);
        }));
      } else {
        const line = config.paylines[win.line] || [];
        for (let reel = 0; reel < Math.min(win.count, line.length); reel++) cells.add(`${reel}:${line[reel]}`);
      }
    }
    return cells;
  }
  function frame(now) {
    const spin = state?.spin;
    const elapsed = spin ? Math.max(0, serverAt + now - clockAt - spin.startedAt) : Infinity;
    const running = spin && elapsed < spin.durationMs;
    const roundLength = 4000;
    const spinRounds = spin?.rounds?.length ? spin.rounds : spin ? [{ visible: spin.visible, wins: spin.wins, heldCells: [] }] : [];
    const roundIndex = spinRounds.length ? Math.min(spinRounds.length - 1, Math.floor(elapsed / roundLength)) : 0;
    const activeRound = spinRounds[roundIndex];
    const roundElapsed = elapsed - roundIndex * roundLength;
    const respinning = running && roundIndex > 0;
    const celebrating = spin && !running && elapsed < spin.durationMs + 5000 && Number(spin.totalPayout) > 0;
    const revealRoundWin = running && roundElapsed >= 3000;
    const wins = celebrating ? winningCells(spin, activeRound?.wins, activeRound?.visible) : revealRoundWin ? winningCells(spin, activeRound?.wins, activeRound?.visible) : new Set();
    const held = new Set((activeRound?.heldCells || []).map(cell => `${cell.reel}:${cell.row}`));
    const glow = celebrating ? (Math.sin(now / 170) + 1) / 2 : 0;
    reels.forEach((reel, i) => {
      // Persisted pre-0.0.9 Joker spins only contain three reels. Fall back to
      // this reel's strip until a new five-reel result replaces that old state.
      const finals = activeRound?.visible?.[i] ?? spin?.visible?.[i] ?? reel.strip.slice(0, 3);
      const rowStates = finals.map((symbol, row) => {
        const stopAt = 2050 + i * 135 + row * 55;
        const isHeld = held.has(`${i}:${row}`);
        const rolling = running && !isHeld && roundElapsed < stopAt;
        const cycle = Math.floor(Math.max(0, stopAt - roundElapsed) / 72);
        return { symbol: rolling ? reel.strip[(cycle + row * 3 + i) % reel.strip.length] : symbol, rolling, isHeld };
      });
      const key = `${rowStates.map(s => `${s.symbol}:${s.rolling}:${s.isHeld}`).join(',')}:${celebrating || revealRoundWin ? Math.floor(now / 90) : 0}`;
      if (reel.key === key) return;
      reel.key = key;
      const ctx = reel.ctx; ctx.fillStyle = '#172a24'; ctx.fillRect(0, 0, 192, 576);
      for (let row = 0; row < 3; row++) {
        const { symbol, rolling, isHeld } = rowStates[row];
        const y = row * 192 + 96;
        const isWin = !rolling && wins.has(`${i}:${row}`);
        ctx.fillStyle = isWin ? `rgba(215, 174, 91, ${0.16 + glow * 0.2})` : row % 2 ? '#1c3029' : '#20372f';
        ctx.fillRect(8, y - 86, 176, 172);
        if (isHeld) { ctx.strokeStyle = '#f0c86e'; ctx.lineWidth = 5; ctx.strokeRect(10, y - 84, 172, 168); }
        ctx.fillStyle = colors[symbol] || '#364d65'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const fruitStyle = ['JOKER', 'CHERRY', 'LEMON', 'ORANGE', 'PLUM', 'GRAPES', 'MELON', 'BELL'].includes(symbol);
        ctx.font = fruitStyle ? `${rolling ? 52 : 60}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
          : `bold ${symbol === 'BOOK' ? 30 : rolling ? 56 : 64}px Georgia`;
        ctx.globalAlpha = rolling ? 0.72 : 1;
        ctx.shadowColor = isWin ? '#ffd878' : 'transparent'; ctx.shadowBlur = isWin ? 12 + glow * 24 : 0;
        ctx.fillText(icons[symbol] || symbol, 96, y, 180);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        ctx.strokeStyle = isWin ? '#e3bd6f' : '#786846'; ctx.lineWidth = isWin ? 3 : 1;
        ctx.beginPath(); ctx.moveTo(12, y + 94); ctx.lineTo(180, y + 94); ctx.stroke();
      }
      reel.texture.needsUpdate = true;
    });
    const text = running ? `${state?.username || spin.username} · ${respinning ? `RESPIN ${roundIndex}/${spinRounds.length - 1}` : 'SPINNING'}`
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
