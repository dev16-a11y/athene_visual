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
import { mergeBoxes, type BoxInstance } from "./mergedBoxes";
import type { EntityVisual } from "./entityVisual";

const BAYS = 3;
const LANES = 9;
const BAY_LENGTH = 12.7;
const LANE_WIDTH = 2.58;
const TIER_HEIGHT = 2.63;
const CONTAINER_LENGTH = 12.19;
const CONTAINER_HEIGHT = 2.59;
const CONTAINER_DEPTH = 2.44;

function hash(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

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
  const fill = Math.min(1, yard.occupiedTeu / Math.max(1, yard.capacityTeu));

  const pad = box(
    scene,
    `yard-pad-${yard.block}`,
    { width: 38, height: 0.12, depth: 28, y: 0.06 },
    materials.road,
    blockRoot,
  );

  for (const cornerX of [-18.3, 18.3]) {
    for (const cornerZ of [-13.3, 13.3]) {
      box(
        scene,
        `yard-mark-${yard.block}-${cornerX}-${cornerZ}`,
        { width: 1.1, height: 0.02, depth: 0.22, x: cornerX, y: 0.14, z: cornerZ },
        materials.yellow,
        blockRoot,
      );
    }
  }

  const buckets: BoxInstance[][] = [[], [], [], [], [], []];
  for (let bay = 0; bay < BAYS; bay += 1) {
    for (let lane = 0; lane < LANES; lane += 1) {
      const seed = yard.block.charCodeAt(0) * 97 + yard.block.charCodeAt(1) * 13 + bay * 31 + lane * 7;
      const occupied = hash(seed) < 0.18 + fill * 0.82;
      if (!occupied) {
        continue;
      }
      const height = 1 + Math.floor(hash(seed + 5) * (2 + fill * 3));
      for (let tier = 0; tier < height; tier += 1) {
        const color = Math.floor(hash(seed + tier * 11) * buckets.length);
        buckets[color]?.push({
          x: (bay - (BAYS - 1) / 2) * BAY_LENGTH,
          y: 0.16 + CONTAINER_HEIGHT / 2 + tier * TIER_HEIGHT,
          z: (lane - (LANES - 1) / 2) * LANE_WIDTH,
          width: CONTAINER_LENGTH,
          height: CONTAINER_HEIGHT,
          depth: CONTAINER_DEPTH,
          rotationY: 0,
        });
      }
    }
  }

  const containerMeshes: Mesh[] = [];
  buckets.forEach((boxes, index) => {
    if (boxes.length === 0) {
      return;
    }
    const material = materials.container[index];
    if (!material) {
      return;
    }
    const mesh = mergeBoxes(
      scene,
      `yard-containers-${yard.block}-${index}`,
      boxes,
      material,
      blockRoot,
    );
    shadow.addShadowCaster(mesh, false);
    containerMeshes.push(mesh);
  });

  const label = MeshBuilder.CreatePlane(
    `yard-label-plane-${yard.block}`,
    { width: 13, height: 4 },
    scene,
  );
  label.parent = blockRoot;
  label.position.set(0, 16, 0);
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
    meshes: containerMeshes,
    selectionMeshes: [pad],
    markerY: 5,
    focusRadius: 175,
    update: (entity) => {
      const block = entity as YardBlock;
      const nextFill = Math.min(1, block.occupiedTeu / Math.max(1, block.capacityTeu));
      labelState.texture
        .getContext();
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
