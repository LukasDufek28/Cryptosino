import * as THREE from 'three';
import { group, box, sign, plant, couch, pendant, stool } from './models';

export default function tradingFacility(scene, block) {
  // Right of the casino when looking toward its entrance from the street.
  const g = group(scene, 27, 0, 0);
  box(g, [18, .25, 20], '#acb2a3', [0, -.14, 0]);
  box(g, [18.5, .35, 20.5], '#354d4a', [0, 5.8, 0]);
  box(g, [18, 5.8, .3], '#abc0b5', [0, 2.9, -10]);
  [-9, 9].forEach(x => box(g, [.3, 5.8, 20], '#abc0b5', [x, 2.9, 0]));
  for (let x = -8.5; x <= 8.5; x += .7) box(g, [.66, .025, 19.5], '#bd9a74', [x, .008, 0]);
  [-7, -3.8, 3.8, 7].forEach(x => {
    box(g, [3.1, 3.7, .03], '#badcdf', [x, 2.1, 9.98], { transparent: true, opacity: .14, depthWrite: false });
    box(g, [3.2, .45, .2], '#304f49', [x, .24, 10]);
  });
  [-9, -5.5, -1.8, 1.8, 5.5, 9].forEach(x => box(g, [.16, 5.8, .3], '#997b49', [x, 2.9, 10]));
  box(g, [18, 1.5, .3], '#304f49', [0, 5.05, 10]);
  sign(g, 'AMBER EXCHANGE', 10, [0, 5.03, 10.18], { color: '#e8ce92', background: '#304f49', serif: true });
  box(g, [5, .18, 2], '#977e54', [0, 3.8, 10.8]);
  box(g, [3.4, .03, 7], '#345d56', [0, .04, 8.5]);
  sign(g, 'SYNTHETIC MARKETS · GAME CREDITS', 5, [0, 3.1, 8.9], { fontSize: 44 });
  const terminals = [-5, 0, 5].map((x, i) => {
    box(g, [3.6, .16, 1.35], '#d8ba86', [x, 1.05, -2]);
    [-1.5, 1.5].forEach(dx => box(g, [.12, 1, 1.1], '#34514b', [x + dx, .5, -2]));
    box(g, [.15, .45, .14], '#283f3b', [x, 1.36, -2.25]);
    box(g, [2.25, 1.05, .15], '#233b37', [x, 1.8, -2.25]);
    sign(g, ['AMBR / INDEX', 'NEON / ENERGY', 'FLUX / LABS'][i], 2.06, [x, 1.8, -2.15], { background: '#152d29', color: '#9bddbd', fontSize: 58 });
    box(g, [1.05, .06, .35], '#3a5047', [x, 1.17, -1.62]);
    stool(g, x, 0, -.6); block(27 + x, -2, 3.6, 1.4, 1); pendant(g, x, 5.5, -2);
    return { x: 27 + x, z: -1.2, name: 'Trading terminal', game: 'trading' };
  });
  couch(g, -5.8, 0, 5.2); block(21.2, 5.2, 4, 1.4, 1);
  plant(g, -7.5, 0, -7.5, 1.4); plant(g, 7.5, 0, -7.5, 1.4); plant(g, 7.4, 0, 7.6, 1.3);
  const light = new THREE.PointLight('#ffe1aa', 65, 24, 2); light.position.set(0, 4.8, 1); g.add(light);
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 640;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  box(g, [12.3, 5.1, .18], '#a88f60', [0, 2.85, -9.68]);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0, 2.85, -9.55); g.add(screen);
  function update(market) {
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#112d2b'; ctx.fillRect(0, 0, 1536, 640);
    ctx.fillStyle = '#ecd5a5'; ctx.font = '48px Georgia'; ctx.fillText('AMBER EXCHANGE', 65, 80);
    ctx.font = '23px sans-serif'; ctx.fillStyle = '#a8c8bc'; ctx.fillText('SYNTHETIC DATA / SHARED MARKET / NO GUARANTEED RETURNS', 65, 130);
    if (!market) { ctx.fillText('Approach a terminal to connect to the market.', 65, 300); texture.needsUpdate = true; return; }
    market.assets.forEach((asset, i) => {
      const x = 65 + i * 490, history = asset.history;
      ctx.fillStyle = '#ecd5a5'; ctx.font = '36px sans-serif'; ctx.fillText(asset.symbol, x, 215);
      ctx.font = '44px sans-serif'; ctx.fillText(`$${(asset.price / 100).toFixed(2)}`, x, 278);
      const prices = history.map(p => p.price), low = Math.min(...prices), range = Math.max(1, Math.max(...prices) - low);
      ctx.beginPath(); ctx.strokeStyle = '#91d9b5'; ctx.lineWidth = 4;
      history.forEach((p, n) => { const px = x + n / Math.max(1, history.length - 1) * 405, py = 485 - (p.price - low) / range * 155; if (!n) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke();
      ctx.font = '23px sans-serif'; ctx.fillStyle = '#a8c8bc'; ctx.fillText(`BID ${(asset.bid / 100).toFixed(2)} / ASK ${(asset.ask / 100).toFixed(2)}`, x, 555);
    });
    texture.needsUpdate = true;
  }
  update(null);
  return { terminals, update };
}
