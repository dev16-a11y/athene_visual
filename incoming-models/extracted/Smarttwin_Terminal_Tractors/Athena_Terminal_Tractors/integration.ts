import { Scene, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
export type TractorKind = 'kalmar_ottawa_t2' | 'terberg_yt193' | 'terberg_yt220';
export async function loadTractor(scene: Scene, kind: TractorKind) {
  const loaded = await SceneLoader.ImportMeshAsync('', '/models/', `${kind}.glb`, scene);
  const root = new TransformNode(kind, scene);
  for (const node of [...loaded.meshes, ...loaded.transformNodes]) {
    if (!node.parent) node.parent = root;
  }
  const byName = new Map([...loaded.meshes, ...loaded.transformNodes].map(n => [n.name, n]));
  return { root, byName, dispose: () => root.dispose(false, true) };
}
