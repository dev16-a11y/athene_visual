import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Train } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, castShadows, cylinder, tagEntity } from "./helpers";
import type { EntityVisual } from "./entityVisual";

export function buildTrain(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  train: Train,
): EntityVisual {
  const trainRoot = new TransformNode("train", scene);
  trainRoot.parent = root;
  trainRoot.position.set(0, 2.1, 87);

  const locomotive = box(
    scene,
    "loco-body",
    { width: 19, height: 5.6, depth: 3.1, x: -60, y: 4.1 },
    materials.steelBlueDark,
    trainRoot,
  );
  box(
    scene,
    "loco-cab",
    { width: 5.5, height: 4.6, depth: 3.2, x: -53.5, y: 5.6 },
    materials.steelBlue,
    trainRoot,
  );
  box(
    scene,
    "loco-windows",
    { width: 5.6, height: 1.2, depth: 3.3, x: -53.5, y: 6.6 },
    materials.glass,
    trainRoot,
  );
  box(
    scene,
    "loco-stripe",
    { width: 19.2, height: 1.1, depth: 3.2, x: -60, y: 3.2 },
    materials.yellow,
    trainRoot,
  );
  box(
    scene,
    "loco-roof",
    { width: 10, height: 0.5, depth: 2.6, x: -61, y: 7.2 },
    materials.steelLight,
    trainRoot,
  );
  for (const x of [-66, -60, -54]) {
    for (const z of [-0.95, 0.95]) {
      cylinder(
        scene,
        "loco-wheel",
        1.1,
        0.28,
        { x, y: 1.05, z, rx: Math.PI / 2, tessellation: 12 },
        materials.funnel,
        trainRoot,
      );
    }
  }

  const wagons = 8;
  const loaded = Math.min(wagons, Math.round((train.loadedWagons / train.wagons) * wagons));
  for (let index = 0; index < wagons; index += 1) {
    const x = -40 + index * 15.4;
    box(
      scene,
      `wagon-${index}-bed`,
      { width: 14, height: 0.5, depth: 2.8, x, y: 2.1 },
      materials.steelLight,
      trainRoot,
    );
    for (const wheelX of [x - 5.6, x + 5.6]) {
      for (const z of [-1, 1]) {
        cylinder(
          scene,
          "wagon-wheel",
          0.9,
          0.24,
          { x: wheelX, y: 0.85, z, rx: Math.PI / 2, tessellation: 10 },
          materials.funnel,
          trainRoot,
        );
      }
    }
    if (index < loaded) {
      box(
        scene,
        `wagon-${index}-container`,
        { width: 12.19, height: 2.59, depth: 2.44, x, y: 3.64 },
        materials.container[index % materials.container.length]!,
        trainRoot,
      );
    }
  }

  tagEntity(trainRoot, train.id);
  castShadows(shadow, trainRoot);

  return {
    id: train.id,
    kind: "train",
    root: trainRoot,
    meshes: [locomotive],
    selectionMeshes: [locomotive],
    markerY: 6,
    focusRadius: 230,
    update: () => undefined,
  };
}
