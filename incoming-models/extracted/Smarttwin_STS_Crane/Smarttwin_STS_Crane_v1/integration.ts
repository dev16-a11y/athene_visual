// Requires @babylonjs/core and @babylonjs/loaders in the host application.
import { SceneLoader, TransformNode, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export async function loadStsCrane(scene: Scene) {
  const loaded = await SceneLoader.ImportMeshAsync(
    '', '/models/', 'smarttwin_sts_crane.glb', scene,
  );
  // Keep the glTF loader root: it handles conversion to the host handedness.
  const root = new TransformNode('sts-crane-instance', scene);
  for (const n of [...loaded.meshes, ...loaded.transformNodes]) {
    if (!n.parent) n.parent = root;
  }
  const byName = new Map([...loaded.meshes, ...loaded.transformNodes].map(n => [n.name, n]));
  return { root, byName, dispose: () => root.dispose(false, true) };
}
