import * as THREE from 'three';
import freezeStaticTransforms from './freezeStaticTransforms';

test('static scenery stays fixed while animated descendants still move', () => {
  const scene = new THREE.Scene();
  const building = new THREE.Group(); building.position.x = 5; scene.add(building);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); wall.position.z = 2; building.add(wall);
  const car = new THREE.Group(); car.position.z = 3; building.add(car);
  const wheel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); car.add(wheel);

  freezeStaticTransforms(scene, new Set([car]));
  expect(building.matrixAutoUpdate).toBe(false);
  expect(wall.matrixAutoUpdate).toBe(false);
  expect(car.matrixAutoUpdate).toBe(true);
  expect(wall.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([5, 0, 2]);

  car.position.z = 6;
  scene.updateMatrixWorld();
  expect(wheel.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([5, 0, 6]);
});
