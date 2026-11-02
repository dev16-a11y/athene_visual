import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { drawLabel } from "./textures";

export interface BoxOptions {
  width: number;
  height: number;
  depth: number;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

export function box(
  scene: Scene,
  name: string,
  options: BoxOptions,
  material: StandardMaterial,
  parent: TransformNode | null,
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    {
      width: options.width,
      height: options.height,
      depth: options.depth,
    },
    scene,
  );
  mesh.material = material;
  mesh.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  if (options.rx) mesh.rotation.x = options.rx;
  if (options.ry) mesh.rotation.y = options.ry;
  if (options.rz) mesh.rotation.z = options.rz;
  if (parent) mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

export function cylinder(
  scene: Scene,
  name: string,
  diameter: number,
  height: number,
  options: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; tessellation?: number; diameterTop?: number },
  material: StandardMaterial,
  parent: TransformNode | null,
): Mesh {
  const mesh = MeshBuilder.CreateCylinder(
    name,
    {
      diameter,
      diameterTop: options.diameterTop,
      height,
      tessellation: options.tessellation ?? 12,
    },
    scene,
  );
  mesh.material = material;
  mesh.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  if (options.rx) mesh.rotation.x = options.rx;
  if (options.ry) mesh.rotation.y = options.ry;
  if (options.rz) mesh.rotation.z = options.rz;
  if (parent) mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

export function plane(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  material: StandardMaterial,
  parent: TransformNode | null,
  position: { x?: number; y?: number; z?: number },
  rotation?: { x?: number; y?: number; z?: number },
): Mesh {
  const mesh = MeshBuilder.CreatePlane(name, { width, height }, scene);
  mesh.material = material;
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  if (rotation) {
    mesh.rotation.set(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  }
  if (parent) mesh.parent = parent;
  mesh.isPickable = false;
  return mesh;
}

export function castShadows(shadow: ShadowGenerator, node: TransformNode): void {
  for (const child of node.getChildMeshes()) {
    const skipByName = /(wheel|window|beacon|cable|label)/i.test(child.name);
    if (child.metadata?.skipShadow !== true && !skipByName) {
      shadow.addShadowCaster(child, false);
      child.metadata = { ...(child.metadata ?? {}), shadowCaster: true };
    }
    child.receiveShadows = true;
  }
}

export function tagEntity(node: TransformNode, entityId: string): void {
  node.metadata = { ...(node.metadata ?? {}), entityId };
  for (const child of node.getChildMeshes()) {
    child.metadata = { ...(child.metadata ?? {}), entityId };
  }
}

export function createLabelPlane(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  title: string,
  subtitle: string,
  accent = "#49c8f0",
): { plane: Mesh; texture: DynamicTexture; material: StandardMaterial } {
  const texture = new DynamicTexture(
    `${name}-texture`,
    { width: 512, height: 192 },
    scene,
    true,
  );
  texture.hasAlpha = true;
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  drawLabel(texture, [
    { text: title, size: 54, color: "#f4f9fc", bold: true },
    { text: subtitle, size: 30, color: accent },
  ], accent);
  const mesh = MeshBuilder.CreatePlane(`${name}-plane`, { width, height }, scene);
  mesh.material = material;
  // Лицевая сторона плоскости Babylon смотрит в -Z (см. planeBuilder),
  // а USE_POSITION наводит на камеру ось +Z — без разворота видна изнанка
  // и текст зеркалится. rotation.x = π разворачивает лицевую сторону к камере.
  mesh.billboardMode = Mesh.BILLBOARDMODE_USE_POSITION;
  mesh.rotation.x = Math.PI;
  mesh.isPickable = false;
  mesh.metadata = { skipShadow: true };
  return { plane: mesh, texture, material };
}

export function lerpAngle(from: number, to: number, amount: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  if (!Number.isFinite(delta)) {
    delta = 0;
  }
  return from + delta * amount;
}

export function vectorFrom(x: number, z: number, y = 0): Vector3 {
  return new Vector3(x, y, z);
}
