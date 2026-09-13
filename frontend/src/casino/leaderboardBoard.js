import * as THREE from 'three';
import { box, cylinder, group } from './models';

export default function leaderboardBoard(parent) {
  // Right-hand interior wall when entering from the street; normal faces -X.
  const frame = group(parent, 13.62, 2.15, 0.6, -Math.PI / 2);
  box(frame, [5.2, 3.44, 0.18], '#b79860', [0, 0, 0]);
  const canvas = document.createElement('canvas');
  canvas.width = 1240; canvas.height = 800;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.96, 3.2), new THREE.MeshBasicMaterial({ map: texture }));
  panel.position.z = 0.101; frame.add(panel);
  [-2.5, 2.5].forEach(x => [-1.62, 1.62].forEach(y => {
    const bolt = cylinder(frame, 0.035, 0.035, 0.02, '#e5c994', [x, y, 0.1], 8);
    bolt.rotation.x = Math.PI / 2;
  }));
  let previous = '';
  function update({ leaders = [], message = 'Connecting to the casino…', updatedAt = '' } = {}) {
    const key = JSON.stringify([leaders, message, updatedAt]);
    if (key === previous) return;
    previous = key;
    ctx.fillStyle = '#203b32'; ctx.fillRect(0, 0, 1240, 800);
    ctx.strokeStyle = '#b99b66'; ctx.lineWidth = 2; ctx.strokeRect(20, 20, 1200, 760);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#d9bd85'; ctx.font = '600 19px sans-serif';
    ctx.fillText('THE AMBER HOUSE / HOUSE LEADERBOARD', 60, 64);
    ctx.fillStyle = '#f2dfb9'; ctx.font = '48px Georgia'; ctx.fillText('The high rollers', 60, 119);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#b9c7b5';
    ctx.fillText('TOP 10 · CURRENT CASINO BALANCE', 60, 166);
    ctx.fillStyle = '#112b23'; ctx.fillRect(42, 198, 1156, 42);
    ctx.fillStyle = '#c7d1bc'; ctx.font = '600 17px sans-serif';
    ctx.fillText('RANK', 60, 219); ctx.fillText('PLAYER', 168, 219);
    ctx.textAlign = 'right'; ctx.fillText('BALANCE', 1170, 219);
    leaders.slice(0, 10).forEach((entry, index) => {
      const y = 267 + index * 44;
      ctx.fillStyle = index === 0 ? '#4d614445' : index % 2 ? '#ffffff06' : '#ffffff00';
      ctx.fillRect(42, y - 21, 1156, 43);
      ctx.textAlign = 'left'; ctx.font = '25px Georgia';
      ctx.fillStyle = index < 3 ? '#efd19a' : '#b6c5b2'; ctx.fillText(String(index + 1).padStart(2, '0'), 60, y);
      ctx.font = '25px sans-serif'; ctx.fillStyle = '#f0e4ce';
      ctx.fillText(String(entry.username).slice(0, 32), 168, y, 620);
      ctx.textAlign = 'right'; ctx.font = '24px monospace';
      const amount = Number(entry.balance);
      ctx.fillText(Number.isFinite(amount) ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', 1170, y, 345);
    });
    if (!leaders.length) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#d7cba9'; ctx.font = '25px Georgia';
      ctx.fillText(message || 'A new evening. Your name could be here.', 620, 450, 1100);
    }
    ctx.textAlign = 'left'; ctx.font = '17px sans-serif'; ctx.fillStyle = '#c1ceb9';
    ctx.fillText(message || `SERVER VERIFIED · UPDATED ${updatedAt} · REFRESHES EVERY 30 SECONDS`, 60, 746, 1120);
    texture.needsUpdate = true;
  }
  update();
  return { update };
}
