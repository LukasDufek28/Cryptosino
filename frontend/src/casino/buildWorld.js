import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import layout from './worldLayout.json';
import leaderboardBoard from './leaderboardBoard';
import { box, cylinder, group, mesh, sign, plant, couch, floorLamp, pendant, slotMachine, gameTable, car, receptionist as receptionistModel } from './models';

export default function buildWorld(scene) {
  const upper = layout.upperFloor;
  const obstacles = [];
  const block = (x, z, w, d, floor) => obstacles.push({ x, z, w, d, floor });
  const building = group(scene);
  // The street and sunset neighborhood remain visible through actual glazing.
  box(scene, [170, 0.25, 110], '#a7ad84', [0, -0.35, 22]);
  box(scene, [150, 0.12, 9], '#797c7a', [0, -0.09, 22]);
  box(scene, [150, 0.16, 4.5], '#d7c7aa', [0, -0.06, 14]);
  box(scene, [150, 0.16, 3.6], '#d7c7aa', [0, -0.06, 29]);
  for (let x = -70; x < 75; x += 7) box(scene, [3.6, 0.025, 0.1], '#e4d6ab', [x, 0.02, 22]);
  for (let z = 18.5; z < 26; z += 0.85) box(scene, [2.4, 0.03, 0.45], '#e8ddbd', [18, 0.025, z]);
  const facades = ['#c59175', '#879f92', '#d8b186', '#d6c5a2', '#a49185'];
  for (let i = 0; i < 9; i++) {
    const x = -48 + i * 12, h = 7 + (i % 3) * 3;
    const g = group(scene, x, 0, 39);
    box(g, [10, h, 9], facades[i % facades.length], [0, h / 2, 0]);
    box(g, [10.5, 0.3, 9.6], '#786c60', [0, h + 0.1, 0]);
    for (let wx = -3; wx <= 3; wx += 3) for (let wy = 5.4; wy < h - 0.6; wy += 2.7) {
      box(g, [1.4, 1.8, 0.08], '#4e6764', [wx, wy, -4.56]);
      box(g, [1.65, 0.12, 0.3], '#efd4ac', [wx, wy - 0.95, -4.66]);
    }
    // Real shopfronts leave a dedicated sign band above the doors and awning.
    [-2.9, 2.9].forEach(wx => {
      box(g, [2.5, 2.5, 0.08], '#e1c59d', [wx, 1.5, -4.55]);
      box(g, [2.25, 2.25, 0.06], '#56736c', [wx, 1.5, -4.62]);
    });
    box(g, [1.5, 2.5, 0.1], '#344e45', [0, 1.25, -4.57]);
    box(g, [0.09, 0.3, 0.08], '#d4b174', [0.5, 1.2, -4.66]);
    box(g, [6.8, 0.15, 1.2], '#4e6551', [0, 2.78, -4.95]);
    box(g, [6.4, 1.76, 0.16], '#b39564', [0, 3.76, -4.59]);
    sign(g, ['CAFÉ MIEL', 'RECORDS', 'FLOWERS'][i % 3], 6, [0, 3.76, -4.69], { background: '#5b6857', serif: true }).rotation.y = Math.PI;
    [-3.08, 3.08].forEach(bx => [3.02, 4.5].forEach(by => {
      const fixing = cylinder(g, 0.045, 0.045, 0.035, '#e5c997', [bx, by, -4.69], 8);
      fixing.rotation.x = Math.PI / 2;
    }));
    plant(scene, x + 5, 0, 31.4, 1.9);
  }
  for (let x = -36; x <= 36; x += 12) {
    cylinder(scene, 0.055, 0.12, 4.7, '#58625c', [x, 2.35, 15.1]);
    cylinder(scene, 0.48, 0.16, 0.3, '#58625c', [x, 4.75, 15.1]);
    mesh(scene, new THREE.IcosahedronGeometry(0.22, 1), '#ffe5ad', [x, 4.5, 15.1], { emissive: '#f5ca7e', emissiveIntensity: 1 });
  }
  const cars = [car(scene, -34, 20, '#ba7859', 1), car(scene, -4, 20, '#dfc485', 1), car(scene, 26, 24, '#71958c', -1), car(scene, -24, 24, '#ddd2b3', -1)];

  // Two real floors, an open stairwell on the west, and street-facing windows.
  box(building, [28, 0.25, 20], '#d9c09b', [0, -0.14, 0]);
  box(building, [23.4, 0.25, 20], '#9c7855', [2.3, upper - 0.14, 0]);
  // Landings meet the first and last stair exactly, without a visible slit.
  box(building, [4.6, 0.25, 6.5], '#9c7855', [-11.7, upper - 0.14, -6.75]);
  box(building, [4.6, 0.25, 2.5], '#9c7855', [-11.7, upper - 0.14, 8.75]);
  for (let x = -8.8; x < 14; x += 0.8) box(building, [0.76, 0.025, 19.7], Math.round(x * 5) % 2 ? '#bd946b' : '#c59f77', [x, upper + 0.005, 0]);
  box(building, [28, 0.25, 20], '#dfcaa6', [0, 9.25, 0]);
  [0, upper].forEach((y, floor) => {
    // Each wall is exactly one storey tall, so adjacent storeys share an edge.
    box(building, [28, upper, 0.3], '#e0cfaf', [0, y + upper / 2, -10]);
    box(building, [0.3, upper, 20], '#d5bd98', [-14, y + upper / 2, 0]);
    box(building, [0.3, upper, 20], '#d5bd98', [14, y + upper / 2, 0]);
    box(building, [27.5, 1.05, 0.13], '#3d5848', [0, y + 0.55, -9.8]);
    box(building, [0.12, 1.05, 19.7], '#3d5848', [13.79, y + 0.55, 0]);
    box(building, [27.6, 0.07, 0.17], '#c6a773', [0, y + 1.1, -9.75]);
    // Leave the ground-floor staircase clear of hanging lamps.
    (floor === 0 ? [-5, 0, 5, 10] : [-10, -5, 0, 5, 10]).forEach(x => pendant(building, x, y + 4.35, -2));
    for (let x = -14; x <= 14; x += 4.65) box(building, [0.16, 4.5, 0.25], '#b39870', [x, y + 2.25, 9.95]);
    // Lower center stays open as the entrance; upper panes are continuous.
    [-10.5, -7, -3.5, 0, 3.5, 7, 10.5].forEach(x => {
      if (!floor && x === 0) return;
      const glass = box(building, [3.45, 3.95, 0.025], '#d5e9de', [x, y + 2.15, 9.97], { transparent: true, opacity: 0.12, depthWrite: false });
      glass.castShadow = false;
    });
    box(building, [28, 0.2, 0.4], '#b0966c', [0, y + 4.4, 9.95]);
    if (floor) box(building, [28, 0.25, 0.3], '#b0966c', [0, y + 0.25, 9.95]);
    [-7.7, 7.7].forEach(x => {
      const light = new THREE.PointLight('#ffd498', 36, 17, 2); light.position.set(x, y + 3.5, 1); building.add(light);
    });
  });
  const entry = sign(building, 'THE AMBER HOUSE', 9, [0, 3.7, 10.2], { serif: true });
  entry.rotation.y = 0;
  box(building, [6, 0.18, 2.3], '#36564a', [0, 3.1, 11]);
  for (let x = -2.7; x <= 2.7; x += 0.6) box(building, [0.3, 0.03, 2.2], '#d9c49b', [x, 3.2, 11]);
  [-2.2, 2.2].forEach(x => box(building, [0.12, 3, 0.16], '#a88e5c', [x, 1.5, 10]));

  const stair = layout.stairs;
  const length = stair.bottomZ - stair.topZ;
  for (let i = 0; i < 23; i++) {
    const height = (i + 1) * upper / 23;
    box(building, [3.65, height, length / 23 + 0.02], '#d3ba95', [-11.45, height / 2, stair.bottomZ - (i + 0.5) * length / 23]);
    box(building, [2.6, 0.025, length / 23], '#886453', [-11.45, height + 0.013, stair.bottomZ - (i + 0.5) * length / 23]);
  }
  [-13.4, -9.5].forEach(x => {
    for (let i = 0; i <= 10; i++) cylinder(building, 0.035, 0.035, 1.1, '#b09261', [x, upper * i / 10 + 0.55, stair.bottomZ - length * i / 10], 6);
    const rail = box(building, [0.08, 0.08, Math.hypot(length, upper)], '#b09261', [x, upper / 2 + 1.1, (stair.bottomZ + stair.topZ) / 2]);
    rail.rotation.x = Math.atan2(upper, length);
  });
  sign(building, '02  /  CASINO UPSTAIRS', 3.4, [-11.5, 2.9, -9.7]);
  sign(building, '01  /  WELCOME HOME', 3.5, [-11.5, upper + 2.1, -9.7]);
  // Ground-floor reception, entrance runner, waiting area.
  box(building, [5, 0.035, 14], '#6b7a60', [0, 0.03, 1.2]);
  box(building, [5.5, 1.12, 1.3], '#486052', [5.8, 0.56, -5]);
  box(building, [5.7, 0.13, 1.5], '#d6bc91', [5.8, 1.18, -5]);
  const receptionist = receptionistModel(building, 5.8, 0, -6.12);
  sign(building, 'ASK ABOUT THE $1,000 RESET', 4.6, [5.8, 2.75, -5.78], { background: '#365348', serif: true, fontSize: 46 });
  const resetButton = { x: 5.8, z: -4.58, name: '$1,000 balance reset' };
  cylinder(building, 0.24, 0.28, 0.1, '#b99861', [resetButton.x, 1.295, resetButton.z], 12);
  cylinder(building, 0.14, 0.14, 0.08, '#d88668', [resetButton.x, 1.385, resetButton.z], 12, { emissive: '#b64f3d', emissiveIntensity: 0.35 });
  sign(building, 'A GOOD EVENING STARTS HERE', 6, [4, 2.8, -9.76], { serif: true });
  block(5.8, -5, 5.7, 1.5, 1);
  plant(building, 10.8, 0, -7.9, 1.4); plant(building, -6.7, 0, 8, 1.3);
  couch(building, 7, 0, 5); block(7, 5, 4, 1.4, 1);
  floorLamp(building, 9.8, 0, 5); plant(building, 12, 0, 8.4);
  const leaderboard = leaderboardBoard(building);

  // A real reflection, with a separate camera layer for the first-person body.
  box(building, [3.3, 2.9, 0.18], '#b99861', [-5, 1.65, -9.65]);
  const mirror = new Reflector(new THREE.PlaneGeometry(3, 2.6), {
    color: 0xffffff, textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: 0
  });
  mirror.position.set(-5, 1.65, -9.54);
  mirror.camera.layers.enable(1);
  building.add(mirror);
  sign(building, 'THE FACE PLACE', 3.2, [-5, 3.45, -9.5]);
  const faceButton = { x: -2.6, z: -9.45, name: 'Randomize face' };
  box(building, [0.65, 0.65, 0.18], '#b99861', [faceButton.x, 1.3, faceButton.z]);
  const button = cylinder(building, 0.22, 0.22, 0.12, '#d88668', [faceButton.x, 1.3, faceButton.z + 0.14], 12);
  button.rotation.x = Math.PI / 2;
  sign(building, 'RANDOMIZE FACE', 1.6, [faceButton.x, 1.95, faceButton.z + 0.1]);

  // Upstairs: green felt, oak, brass, terracotta and lamps.
  box(building, [19.5, 0.032, 8.5], '#506b59', [2.3, upper + 0.035, -4.9]);
  box(building, [19.1, 0.035, 8.1], '#365345', [2.3, upper + 0.04, -4.9]);
  sign(building, 'THE AMBER HOUSE', 7, [2, upper + 3.35, -9.72], { serif: true });
  sign(building, 'GAMES  /  LOUNGE  /  GOOD COMPANY', 5.2, [2, upper + 2.15, -9.7]);
  layout.stations.forEach(s => {
    if (s.game === 'slots') { slotMachine(building, s.x - 0.85, upper, s.z); slotMachine(building, s.x + 0.85, upper, s.z); block(s.x, s.z, 3.2, 1.15, 2); }
    else if (s.game === 'crash') { slotMachine(building, s.x, upper, s.z, 'SKYLINE'); block(s.x, s.z, 1.6, 1.15, 2); }
    else { gameTable(building, s.x, upper, s.z, s.game === 'dice'); block(s.x, s.z, 4.25, 2.5, 2); }
    sign(building, s.game.toUpperCase(), 2.3, [s.x, upper + 2.9, s.z - 0.8]);
  });
  layout.seats.forEach(s => {
    box(building, [5.9, 0.026, 4.5], '#b08565', [s.x, upper + 0.03, s.z + 0.9]);
    couch(building, s.x, upper, s.z); block(s.x, s.z, 3.95, 1.4, 2);
    const table = cylinder(building, 0.75, 0.75, 0.1, '#ceae7b', [s.x, upper + 0.55, s.z + 2.15], 10);
    cylinder(building, 0.25, 0.42, 0.5, '#6d5340', [s.x, upper + 0.25, s.z + 2.15], 8);
    cylinder(building, 0.11, 0.085, 0.18, '#e8d8b9', [s.x + 0.22, upper + 0.69, s.z + 2.15], 10);
    table.receiveShadow = true; block(s.x, s.z + 2.15, 1.5, 1.5, 2);
    floorLamp(building, s.x + 2.35, upper, s.z - 0.2); plant(building, s.x - 2.35, upper, s.z - 0.1);
  });
  plant(building, 12.6, upper, -1, 1.25); plant(building, -8.4, upper, -9, 1.15);
  plant(building, 12.5, upper, 8.6, 1.5);
  // Small golden rings inset in the floor guide players toward the stations.
  const markers = layout.stations.map(s => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.48, 32), new THREE.MeshBasicMaterial({ color: '#e4bc73', side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
    m.rotation.x = -Math.PI / 2; m.position.set(s.x, upper + 0.07, s.z + 2.5); building.add(m); return m;
  });
  return { cars, obstacles, markers, mirror, faceButton, leaderboard, receptionist, resetButton };
}
