import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Tug } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, castShadows, cylinder, tagEntity } from "./helpers";
import type { EntityVisual } from "./entityVisual";

export function buildTug(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  tug: Tug,
): EntityVisual {
  const tugRoot = new TransformNode(`tug-${tug.name}`, scene);
  tugRoot.parent = root;
  tugRoot.position.set(tug.position.x, 0, tug.position.z);

  const hull = box(
    scene,
    "tug-hull",
    { width: 24, height: 3.2, depth: 8.6, y: 1.2 },
    materials.tugHull,
    tugRoot,
  );
  box(
    scene,
    "tug-bow",
    { width: 7, height: 3.2, depth: 6.5, x: 13.4, y: 1.2, ry: 0.12 },
    materials.tugHull,
    tugRoot,
  );
  box(
    scene,
    "tug-deck",
    { width: 23, height: 0.3, depth: 8, y: 2.9 },
    materials.deck,
    tugRoot,
  );
  const cabin = box(
    scene,
    "tug-cabin",
    { width: 9, height: 3.6, depth: 5.6, x: -2.4, y: 4.8 },
    materials.tugCabin,
    tugRoot,
  );
  box(
    scene,
    "tug-windows",
    { width: 9.2, height: 1.2, depth: 5.7, x: -2.4, y: 5.6 },
    materials.glass,
    tugRoot,
  );
  box(
    scene,
    "tug-roof",
    { width: 9.4, height: 0.35, depth: 6, x: -2.4, y: 6.7 },
    materials.white,
    tugRoot,
  );
  cylinder(
    scene,
    "tug-mast",
    0.25,
    6,
    { x: -2.4, y: 9.4, tessellation: 8 },
    materials.steelLight,
    tugRoot,
  );
  for (const side of [-1, 1]) {
    for (const x of [8.5, 4, -0.5, -5]) {
      cylinder(
        scene,
        "tug-fender",
        1.3,
        0.6,
        { x, y: 2.2, z: side * 4.5, rx: Math.PI / 2, tessellation: 10 },
        materials.funnel,
        tugRoot,
      );
    }
  }
  box(
    scene,
    "tug-stack",
    { width: 1.8, height: 2.4, depth: 1.6, x: -6.3, y: 7.9 },
    materials.hullLower,
    tugRoot,
  );

  tagEntity(tugRoot, tug.id);
  castShadows(shadow, tugRoot);

  const target = new Vector3(tug.position.x, 0, tug.position.z);
  let targetHeading = tug.heading;
  tugRoot.rotation.y = (tug.heading * Math.PI) / 180;

  return {
    id: tug.id,
    kind: "tug",
    root: tugRoot,
    meshes: [hull, cabin],
    selectionMeshes: [hull, cabin],
    markerY: 8,
    focusRadius: 140,
    dynamic: { target, targetHeading, snapDistance: 150 },
    update: (entity) => {
      const current = entity as Tug;
      target.set(current.position.x, 0, current.position.z);
      targetHeading = current.heading;
    },
  };
}
