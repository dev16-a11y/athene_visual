import { Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export async function loadAurora(scene: Scene) {
  const loaded = await SceneLoader.ImportMeshAsync(
    '', '/models/', 'smarttwin_aurora_container_ship.glb', scene,
  );
  const root = new TransformNode('smarttwin-aurora', scene);
  for (const node of [...loaded.meshes, ...loaded.transformNodes]) {
    if (!node.parent) node.parent = root;
  }
  const byName = new Map(
    [...loaded.meshes, ...loaded.transformNodes].map(node => [node.name, node]),
  );
  // Units are metres; the GLB origin lies on the model's waterline.
  // Preserve the loader root for the glTF handedness conversion.
  return { root, byName, dispose: () => root.dispose(false, true) };
}
