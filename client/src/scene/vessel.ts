import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Vessel } from "../domain/types";
import { computeProgress } from "../metrics/progress";
import type { PortMaterials } from "./materials";
import {
  box,
  castShadows,
  createLabelPlane,
  cylinder,
  tagEntity,
} from "./helpers";
import { drawLabel } from "./textures";
import { mergeBoxes, type BoxInstance } from "./mergedBoxes";
import type { EntityVisual } from "./entityVisual";

const DECK_Y = 10;
const BAY_COUNT = 11;
const ROW_COUNT = 7;
const MAX_TIERS = 4;
const CONTAINER_LENGTH = 12.19;
const CONTAINER_HEIGHT = 2.59;
const CONTAINER_DEPTH = 2.44;

function hash(value: number): number {
  const x = Math.sin(value * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

function hullMesh(scene: Scene, materials: PortMaterials, root: TransformNode): Mesh {
  const outline = [
    [-95, -16],
    [55, -16],
    [78, -13],
    [95, 0],
    [78, 13],
    [55, 16],
    [-95, 16],
  ] as const;

  const positions: number[] = [];
  for (const [x, z] of outline) {
    positions.push(x, DECK_Y, z);
  }
  for (const [x, z] of outline) {
    positions.push(x * 0.9, -5, z * 0.68);
  }

  const indices: number[] = [];
  const count = outline.length;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const topA = index;
    const topB = next;
    const bottomA = index + count;
    const bottomB = next + count;
    indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
  }

  const centerTop = positions.length / 3;
  positions.push(0, DECK_Y, 0);
  const centerBottom = positions.length / 3;
  positions.push(0, -5, 0);
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(centerTop, index, next);
    indices.push(centerBottom, next + count, index + count);
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh("hull", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.material = materials.hull;
  mesh.parent = root;
  mesh.receiveShadows = true;
  mesh.metadata = { hull: true };
  return mesh;
}

function buildCargo(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  fraction: number,
): { meshes: Mesh[]; fraction: number } {
  const buckets: BoxInstance[][] = [[], [], [], [], [], []];
  for (let bay = 0; bay < BAY_COUNT; bay += 1) {
    for (let row = 0; row < ROW_COUNT; row += 1) {
      const seed = bay * 71 + row * 17;
      const density = 0.42 + hash(seed) * 0.58;
      const stack = Math.round(fraction * MAX_TIERS * density * 1.35);
      const tiers = Math.min(MAX_TIERS, Math.max(0, stack));
      for (let tier = 0; tier < tiers; tier += 1) {
        const color = Math.floor(hash(seed + tier * 13) * buckets.length);
        buckets[color]?.push({
          x: -72 + bay * 12.55,
          y: DECK_Y + 0.35 + CONTAINER_HEIGHT / 2 + tier * 2.63,
          z: (row - (ROW_COUNT - 1) / 2) * 2.6,
          width: CONTAINER_LENGTH,
          height: CONTAINER_HEIGHT,
          depth: CONTAINER_DEPTH,
        });
      }
    }
  }

  const meshes: Mesh[] = [];
  buckets.forEach((boxes, index) => {
    const material = materials.container[index];
    if (!material || boxes.length === 0) {
      return;
    }
    const mesh = mergeBoxes(scene, `cargo-${index}`, boxes, material, root);
    shadow.addShadowCaster(mesh, false);
    meshes.push(mesh);
  });
  return { meshes, fraction };
}

export function buildVessel(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  vessel: Vessel,
): EntityVisual {
  const shipRoot = new TransformNode(`vessel-${vessel.name}`, scene);
  shipRoot.parent = root;
  shipRoot.position.set(vessel.position.x, 0, vessel.position.z);

  const hull = hullMesh(scene, materials, shipRoot);
  const deck = box(
    scene,
    "deck",
    { width: 150, height: 0.35, depth: 27, x: -8, y: DECK_Y + 0.05 },
    materials.deck,
    shipRoot,
  );
  for (let index = 0; index < 6; index += 1) {
    box(
      scene,
      `hatch-${index}`,
      { width: 17.5, height: 0.5, depth: 21, x: -64 + index * 23.5, y: DECK_Y + 0.35 },
      materials.deck,
      shipRoot,
    );
  }

  const superstructure = box(
    scene,
    "superstructure",
    { width: 19, height: 22, depth: 22, x: -80, y: DECK_Y + 11.4 },
    materials.superstructure,
    shipRoot,
  );
  const bridge = box(
    scene,
    "bridge",
    { width: 25, height: 4.2, depth: 26, x: -80, y: DECK_Y + 23.5 },
    materials.superstructure,
    shipRoot,
  );
  box(
    scene,
    "bridge-windows",
    { width: 25.4, height: 1.5, depth: 26.4, x: -80, y: DECK_Y + 23.8 },
    materials.glass,
    shipRoot,
  );
  box(
    scene,
    "funnel",
    { width: 6.5, height: 9, depth: 5, x: -86, y: DECK_Y + 30.5 },
    materials.funnel,
    shipRoot,
  );
  box(
    scene,
    "funnel-cap",
    { width: 6.8, height: 0.9, depth: 5.3, x: -86, y: DECK_Y + 35.2 },
    materials.hullLower,
    shipRoot,
  );
  cylinder(
    scene,
    "mast",
    0.35,
    14,
    { x: -71, y: DECK_Y + 31, tessellation: 8 },
    materials.steelLight,
    shipRoot,
  );
  for (let index = 0; index < 4; index += 1) {
    box(
      scene,
      `window-strip-${index}`,
      { width: 0.3, height: 1.1, depth: 18, x: -70.4, y: DECK_Y + 5 + index * 4.2 },
      materials.glass,
      shipRoot,
    );
  }

  const progress = computeProgress(vessel.completedTeu, vessel.plannedTeu);
  const fraction =
    vessel.operation === "loading"
      ? progress / 100
      : 1 - progress / 100;
  let cargo = buildCargo(scene, materials, shipRoot, shadow, fraction);

  const label = createLabelPlane(
    scene,
    `vessel-label-${vessel.name}`,
    vessel.loa * 0.26,
    vessel.loa * 0.1,
    vessel.name,
    "",
  );
  label.plane.parent = shipRoot;
  label.plane.position.set(0, DECK_Y + 48, 0);

  const updateLabel = (current: Vessel) => {
    const currentProgress = computeProgress(current.completedTeu, current.plannedTeu);
    const operation =
      current.operation === "loading" ? "погрузка" : "выгрузка";
    drawLabel(
      label.texture,
      [
        { text: current.name, size: 58, color: "#f5fafc", bold: true },
        {
          text: `${operation} · ${Math.round(currentProgress)}% · причал ${current.berth}`,
          size: 29,
          color: "#8fdcf6",
        },
      ],
      current.status === "warning" ? "#e3a72b" : "#49c8f0",
    );
  };
  updateLabel(vessel);

  tagEntity(shipRoot, vessel.id);
  castShadows(shadow, shipRoot);

  return {
    id: vessel.id,
    kind: "vessel",
    root: shipRoot,
    meshes: [hull, deck, superstructure, bridge, ...cargo.meshes],
    selectionMeshes: [hull, superstructure, bridge, deck],
    markerY: 18,
    focusRadius: 235,
    labelTitle: vessel.name,
    update: (entity) => {
      const current = entity as Vessel;
      updateLabel(current);
      const currentProgress = computeProgress(current.completedTeu, current.plannedTeu);
      const nextFraction =
        current.operation === "loading"
          ? currentProgress / 100
          : 1 - currentProgress / 100;
      if (Math.abs(nextFraction - cargo.fraction) >= 0.015) {
        for (const mesh of cargo.meshes) {
          shadow.removeShadowCaster(mesh, false);
          mesh.dispose();
        }
        cargo = buildCargo(scene, materials, shipRoot, shadow, nextFraction);
        for (const mesh of cargo.meshes) {
          mesh.metadata = { ...(mesh.metadata ?? {}), entityId: current.id, shadowCaster: true };
        }
      }
    },
  };
}

