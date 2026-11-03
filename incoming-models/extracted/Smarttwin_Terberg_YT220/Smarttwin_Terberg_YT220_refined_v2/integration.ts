import { Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export async function loadYt220(scene: Scene) {
  const loaded = await SceneLoader.ImportMeshAsync('', '/models/', 'terberg_yt220.glb', scene);
  const root = new TransformNode('terberg-yt220', scene);
  for (const n of [...loaded.meshes, ...loaded.transformNodes]) {
    if (!n.parent) n.parent = root;
  }
  const byName = new Map([...loaded.meshes, ...loaded.transformNodes].map(n => [n.name, n]));
  return { root, byName, dispose: () => root.dispose(false, true) };
}
