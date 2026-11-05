import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { YardBlock } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, castShadows, tagEntity } from "./helpers";
import { CONTAINER_BLOCK } from "./containerYard";
import type { EntityVisual } from "./entityVisual";

/**
 * Площадка контейнерного двора: покрытие, разметка и 3D-щит заполнения.
 * Сами контейнеры строит `containerYard.ts` — они общие для всего двора
 * (thin instances 45 шаблонов), поэтому в визуале блока их нет.
 */
function blockLabelMaterial(
  scene: Scene,
  block: string,
  fill: number,
  warning: boolean,
): { material: StandardMaterial; texture: DynamicTexture } {
  const texture = new DynamicTexture(
    `yard-label-${block}`,
    { width: 512, height: 160 },
    scene,
    true,
  );
  texture.hasAlpha = true;
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 160);
  context.fillStyle = "rgba(6, 22, 32, 0.72)";
  context.fillRect(0, 0, 512, 160);
  context.strokeStyle = warning ? "#e3a72b" : "#49c8f0";
  context.lineWidth = 5;
  context.strokeRect(3, 3, 506, 154);
  context.fillStyle = "#f2f7fa";
  context.font = "700 64px 'Segoe UI', Arial, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(block, 26, 62);
  context.fillStyle = warning ? "#f0bd52" : "#7ad6f5";
  context.font = "500 42px 'Segoe UI', Arial, sans-serif";
  context.fillText(`${Math.round(fill * 100)}%`, 26, 120);
  context.fillStyle = "rgba(240, 246, 249, 0.65)";
  context.font = "500 28px 'Segoe UI', Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("заполнение", 486, 120);
  texture.update(false);
  const material = new StandardMaterial(`yard-label-material-${block}`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  return { material, texture };
}

export function buildYard(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  yard: YardBlock,
): EntityVisual {
  const blockRoot = new TransformNode(`yard-${yard.block}`, scene);
  blockRoot.parent = root;
  blockRoot.position.set(yard.position.x, 2, yard.position.z);
  const fill = yard.occupiedTeu / Math.max(1, yard.capacityTeu);

  const pad = box(
    scene,
    `yard-pad-${yard.block}`,
    {
      width: CONTAINER_BLOCK.length + 8,
      height: 0.12,
      depth: CONTAINER_BLOCK.depth + 8,
      y: 0.06,
    },
    materials.road,
    blockRoot,
  );

  // Угловая разметка — по фактическим габаритам площадки.
  const halfLength = (CONTAINER_BLOCK.length + 8) / 2 - 1;
  const halfDepth = (CONTAINER_BLOCK.depth + 8) / 2 - 1;
  for (const cornerX of [-halfLength, halfLength]) {
    for (const cornerZ of [-halfDepth, halfDepth]) {
      box(
        scene,
        `yard-mark-${yard.block}-${cornerX}-${cornerZ}`,
        { width: 1.4, height: 0.02, depth: 0.24, x: cornerX, y: 0.14, z: cornerZ },
        materials.yellow,
        blockRoot,
      );
    }
  }

  const label = MeshBuilder.CreatePlane(
    `yard-label-plane-${yard.block}`,
    { width: 16, height: 5 },
    scene,
  );
  label.parent = blockRoot;
  // Щит поднят над штабелем (пять ярусов × 2,9 м) и висит над проездом.
  label.position.set(0, 24, 0);
  // USE_POSITION + разворот на 180° по X: лицевая сторона плоскости смотрит
  // в -Z, а billboard наводит на камеру +Z — иначе видна изнанка (зеркало).
  label.billboardMode = Mesh.BILLBOARDMODE_USE_POSITION;
  label.rotation.x = Math.PI;
  label.isPickable = false;
  const labelState = blockLabelMaterial(scene, yard.block, fill, yard.status === "warning");
  label.material = labelState.material;

  tagEntity(blockRoot, yard.id);
  castShadows(shadow, blockRoot);
  pad.metadata = { ...(pad.metadata ?? {}), entityId: yard.id };

  return {
    id: yard.id,
    kind: "yard",
    root: blockRoot,
    meshes: [pad],
    selectionMeshes: [pad],
    markerY: 18,
    focusRadius: 330,
    update: (entity) => {
      const block = entity as YardBlock;
      const nextFill = Math.min(1, block.occupiedTeu / Math.max(1, block.capacityTeu));
      const context = labelState.texture.getContext() as CanvasRenderingContext2D;
      context.clearRect(0, 0, 512, 160);
      context.fillStyle = "rgba(6, 22, 32, 0.72)";
      context.fillRect(0, 0, 512, 160);
      const warning = block.status === "warning";
      context.strokeStyle = warning ? "#e3a72b" : "#49c8f0";
      context.lineWidth = 5;
      context.strokeRect(3, 3, 506, 154);
      context.fillStyle = "#f2f7fa";
      context.font = "700 64px 'Segoe UI', Arial, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(block.block, 26, 62);
      context.fillStyle = warning ? "#f0bd52" : "#7ad6f5";
      context.font = "500 42px 'Segoe UI', Arial, sans-serif";
      context.fillText(`${Math.round(nextFill * 100)}%`, 26, 120);
      context.fillStyle = "rgba(240, 246, 249, 0.65)";
      context.font = "500 28px 'Segoe UI', Arial, sans-serif";
      context.textAlign = "right";
      context.fillText("заполнение", 486, 120);
      labelState.texture.update(false);
    },
  };
}
