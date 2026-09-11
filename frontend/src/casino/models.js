import * as THREE from 'three';

// Every asset is built from geometry here: no remote models or texture downloads.
const materials = new Map();
export function material(color, extra = {}) {
  const key = JSON.stringify([color, extra]);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true, ...extra }));
  return materials.get(key);
}
export function mesh(parent, geometry, color, position = [0, 0, 0], extra) {
  const m = new THREE.Mesh(geometry, material(color, extra));
  m.position.set(...position); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
export function box(parent, size, color, position, extra) {
  return mesh(parent, new THREE.BoxGeometry(...size), color, position, extra);
}
export function cylinder(parent, top, bottom, height, color, position, sides = 10, extra) {
  return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, sides), color, position, extra);
}
export function group(parent, x = 0, y = 0, z = 0, yaw = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g); return g;
}
export function sign(parent, text, width, position, options = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = options.background || '#23463e'; ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = options.color || '#edd4a2'; ctx.lineWidth = 4; ctx.strokeRect(12, 12, 1000, 232);
  ctx.fillStyle = options.color || '#edd4a2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${options.serif ? '' : '600 '}70px ${options.serif ? 'Georgia' : 'sans-serif'}`;
  ctx.fillText(text, 512, 130, 930);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  panel.position.set(...position); parent.add(panel); return panel;
}
export function plant(parent, x, y, z, scale = 1) {
  const g = group(parent, x, y, z); g.scale.setScalar(scale);
  cylinder(g, 0.4, 0.28, 0.65, '#b77354', [0, 0.32, 0]);
  cylinder(g, 0.035, 0.06, 1.4, '#654632', [0, 1, 0], 6);
  [[0, 1.8, 0], [-0.35, 1.45, 0.1], [0.33, 1.6, -0.15]].forEach((p, i) => {
    const leaf = mesh(g, new THREE.IcosahedronGeometry(0.65, 0), ['#597451', '#8e9d64', '#66825c'][i], p);
    leaf.scale.set(0.75, 1.1, 0.72);
  }); return g;
}
export function couch(parent, x, y, z) {
  const g = group(parent, x, y, z);
  [-1.6, 1.6].forEach(a => [-0.4, 0.4].forEach(b => box(g, [0.12, 0.3, 0.12], '#583d2e', [a, 0.15, b])));
  box(g, [3.8, 0.45, 1.25], '#a65e3f', [0, 0.48, 0]);
  box(g, [3.8, 0.85, 0.28], '#bd7954', [0, 1, -0.52]);
  [-1.78, 1.78].forEach(a => box(g, [0.32, 0.6, 1.3], '#bb7450', [a, 0.8, 0]));
  [-1.1, 0, 1.1].forEach(a => box(g, [1.02, 0.23, 1], '#d69a6b', [a, 0.79, 0.08]));
  [-1.25, 1.25].forEach((a, i) => {
    const pillow = box(g, [0.55, 0.6, 0.24], i ? '#e5c995' : '#788569', [a, 1.08, -0.23]); pillow.rotation.z = a * 0.12;
  }); return g;
}
export function floorLamp(parent, x, y, z) {
  const g = group(parent, x, y, z);
  cylinder(g, 0.36, 0.4, 0.12, '#a88851', [0, 0.06, 0]);
  cylinder(g, 0.035, 0.035, 2.2, '#c3a46a', [0, 1.14, 0]);
  cylinder(g, 0.32, 0.62, 0.7, '#ffdeb0', [0, 2.3, 0], 8, { emissive: '#f8c481', emissiveIntensity: 0.45 });
}
export function pendant(parent, x, y, z) {
  const g = group(parent, x, y, z);
  cylinder(g, 0.025, 0.025, 0.8, '#b49869', [0, -0.4, 0], 6);
  cylinder(g, 0.35, 0.95, 0.45, '#b2884e', [0, -0.95, 0], 10);
  cylinder(g, 0.85, 0.85, 0.035, '#ffe4a6', [0, -1.19, 0], 10, { emissive: '#ffc76d', emissiveIntensity: 1.3 });
}
export function slotMachine(parent, x, y, z, label = 'GOLDEN REELS') {
  const g = group(parent, x, y, z);
  box(g, [1.35, 2.1, 0.85], '#2c5149', [0, 1.05, 0]);
  box(g, [1.5, 0.15, 1.03], '#b99957', [0, 0.12, 0]);
  box(g, [1.32, 0.15, 1.08], '#c6a166', [0, 1.02, 0.12]);
  box(g, [1.1, 0.85, 0.04], '#d6b972', [0, 1.58, 0.45]);
  sign(g, '7   7   7', 1, [0, 1.64, 0.48], { background: '#192d2a', color: '#ffc977' });
  sign(g, label, 1.45, [0, 2.35, 0.04]);
  cylinder(g, 0.09, 0.09, 0.045, '#f4bd67', [0.3, 1.11, 0.49], 10, { emissive: '#e5a447', emissiveIntensity: 0.5 });
  cylinder(g, 0.04, 0.04, 0.55, '#bda47c', [0.79, 1.5, 0], 8);
  mesh(g, new THREE.IcosahedronGeometry(0.12, 1), '#c58052', [0.79, 1.8, 0]);
  stool(g, 0, 0, 1.4); return g;
}
export function stool(parent, x, y, z) {
  cylinder(parent, 0.38, 0.4, 0.18, '#6f453c', [x, y + 0.9, z]);
  cylinder(parent, 0.045, 0.055, 0.8, '#b09a6c', [x, y + 0.43, z]);
  cylinder(parent, 0.32, 0.37, 0.06, '#b09a6c', [x, y + 0.03, z]);
}
export function gameTable(parent, x, y, z, dice = false) {
  const g = group(parent, x, y, z);
  const rim = cylinder(g, 1, 1, 0.2, '#ad8651', [0, 1.04, 0], 12); rim.scale.set(2.1, 1, 1.22);
  const felt = cylinder(g, 1, 1, 0.025, '#315b48', [0, 1.15, 0], 12); felt.scale.set(1.98, 1, 1.11);
  [-1.3, 1.3].forEach(a => cylinder(g, 0.15, 0.27, 0.95, '#533e32', [a, 0.5, 0], 8));
  [-1.45, 0, 1.45].forEach(a => stool(g, a, 0, 1.7));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) cylinder(g, 0.1, 0.1, 0.035, i % 2 ? '#e3bb76' : '#c77461', [-1.1 + i * 0.4, 1.19 + j * 0.04, -0.4], 10);
  }
  if (dice) {
    [-0.35, 0.35].forEach((a, i) => {
      const die = box(g, [0.4, 0.4, 0.4], '#eee1c7', [a, 1.36, 0.1]); die.rotation.y = i * 0.7;
      cylinder(g, 0.045, 0.045, 0.012, '#674537', [a, 1.57, 0.1], 8);
    });
  } else {
    [-0.45, 0, 0.45].forEach(a => { const card = box(g, [0.28, 0.015, 0.42], '#efe5cd', [a, 1.175, 0.1]); card.rotation.y = a; });
  } return g;
}
export function car(parent, x, z, color, direction) {
  const g = group(parent, x, 0.22, z, direction > 0 ? 0 : Math.PI);
  box(g, [3.5, 0.65, 1.6], color, [0, 0.55, 0]);
  box(g, [1.7, 0.65, 1.4], color, [-0.2, 1.15, 0]);
  [-0.715, 0.715].forEach(a => box(g, [1.5, 0.43, 0.035], '#91b1b6', [-0.2, 1.23, a]));
  box(g, [0.035, 0.44, 1.2], '#adc6c6', [0.67, 1.23, 0]);
  [-1.05, 1.05].forEach(a => [-0.82, 0.82].forEach(b => {
    const wheel = cylinder(g, 0.34, 0.34, 0.2, '#3c3938', [a, 0.35, b], 10); wheel.rotation.x = Math.PI / 2;
  }));
  [-0.5, 0.5].forEach(a => box(g, [0.06, 0.18, 0.32], '#fff1ba', [1.77, 0.65, a], { emissive: '#ffd67a', emissiveIntensity: 0.8 }));
  return { group: g, direction, speed: 5 };
}
export function avatar(parent, username, color) {
  const g = group(parent);
  cylinder(g, 0.24, 0.3, 0.65, color, [0, 1.03, 0], 6);
  mesh(g, new THREE.IcosahedronGeometry(0.24, 1), '#d3a082', [0, 1.65, 0]);
  [-0.13, 0.13].forEach(a => box(g, [0.2, 0.55, 0.22], '#3d4d4c', [a, 0.42, 0]));
  [-0.36, 0.36].forEach(a => box(g, [0.16, 0.55, 0.19], color, [a, 1.02, 0]));
  const name = sign(g, username.slice(0, 22), 1.7, [0, 2.17, 0]);
  return { group: g, name };
}
export function clearMaterialCache() { materials.clear(); }
