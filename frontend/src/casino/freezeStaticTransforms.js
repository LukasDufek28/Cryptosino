export default function freezeStaticTransforms(scene, animatedRoots) {
  const freeze = object => {
    if (animatedRoots.has(object)) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
    object.children.forEach(freeze);
  };
  scene.children.forEach(freeze);
  scene.updateMatrixWorld(true);
  scene.matrixAutoUpdate = false;
}
