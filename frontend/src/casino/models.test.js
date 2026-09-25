import * as THREE from 'three';
import { clearMaterialCache, instancedBoxes } from './models';

test('repeated boxes keep their individual positions and dimensions', () => {
  const scene = new THREE.Group();
  const boxes = [
    { size: [3.65, 0.2, 0.5], position: [-11.45, 0.1, 7] },
    { size: [3.65, 2.3, 0.5], position: [-11.45, 1.15, 2] }
  ];
  const instances = instancedBoxes(scene, boxes, '#d3ba95');
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  expect(scene.children).toHaveLength(1);
  expect(instances.count).toBe(2);
  boxes.forEach((box, index) => {
    instances.getMatrixAt(index, matrix);
    matrix.decompose(position, rotation, scale);
    position.toArray().forEach((value, axis) => expect(value).toBeCloseTo(box.position[axis]));
    scale.toArray().forEach((value, axis) => expect(value).toBeCloseTo(box.size[axis]));
  });

  instances.geometry.dispose();
  clearMaterialCache();
});
