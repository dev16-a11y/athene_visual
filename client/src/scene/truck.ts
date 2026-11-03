import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Truck } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, castShadows, cylinder, tagEntity } from "./helpers";
import type { EntityVisual } from "./entityVisual";

let truckCounter = 0;

export function buildTruck(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  truck: Truck,
): EntityVisual {
  const index = truckCounter % 4;
  truckCounter += 1;
  const truckRoot = new TransformNode(`truck-${truck.id}`, scene);
  truckRoot.parent = root;
  truckRoot.position.set(truck.position.x, 2, truck.position.z);

  const cabMaterial = materials.truckCab[index] ?? materials.white;
  const cab = box(
    scene,
    "truck-cab",
    { width: 3.1, height: 3.1, depth: 2.5, x: 7.2, y: 1.9 },
    cabMaterial,
    truckRoot,
  );
  box(
    scene,
    "truck-cab-window",
    { width: 1.4, height: 1.2, depth: 2.55, x: 7.4, y: 2.7 },
    materials.glass,
    truckRoot,
  );
  const trailer = box(
    scene,
    "truck-trailer",
    { width: 12.8, height: 0.4, depth: 2.45, x: -0.4, y: 1.3 },
    materials.truckTrailer,
    truckRoot,
  );
  const container = box(
    scene,
    "truck-container",
    { width: 12.19, height: 2.59, depth: 2.44, x: -0.4, y: 2.8 },
    materials.container[index] ?? materials.container[0]!,
    truckRoot,
  );
  container.isVisible = truck.loaded;

  for (const wheelX of [5.6, 0.6, -4.9]) {
    for (const wheelZ of [-1.15, 1.15]) {
      cylinder(
        scene,
        "truck-wheel",
        1.15,
        0.35,
        { x: wheelX, y: 0.58, z: wheelZ, rx: Math.PI / 2, tessellation: 12 },
        materials.funnel,
        truckRoot,
      );
    }
  }

  const beaconMaterial = cabMaterial;
  const beacon = box(
    scene,
    "truck-beacon",
    { width: 0.5, height: 0.35, depth: 0.5, x: 7.2, y: 3.6 },
    materials.lamp,
    truckRoot,
  );
  beacon.metadata = { skipShadow: true };
  void beaconMaterial;

  tagEntity(truckRoot, truck.id);
  castShadows(shadow, truckRoot);

  const target = new Vector3(truck.position.x, 2, truck.position.z);
  let targetHeading = truck.heading;
  truckRoot.rotation.y = (truck.heading * Math.PI) / 180;

  // После подмены GLB-моделью параметрика удаляется, но терминальный тягач
  // работает с прицепом-шасси и контейнером: достраиваем их за кабиной,
  // иначе машина «теряет» груз.
  const swapState = { active: false };
  let swappedContainer: Mesh | null = null;

  return {
    id: truck.id,
    kind: "truck",
    root: truckRoot,
    meshes: [cab, trailer, container],
    selectionMeshes: [cab, trailer, container],
    markerY: 5,
    focusRadius: 95,
    dynamic: { target, targetHeading, snapDistance: 90 },
    update: (entity) => {
      const current = entity as Truck;
      target.set(current.position.x, 2, current.position.z);
      targetHeading = current.heading;
      if (swapState.active) {
        if (swappedContainer) {
          swappedContainer.isVisible = current.loaded;
        }
        return;
      }
      container.isVisible = current.loaded;
    },
    onModelSwap: () => {
      swapState.active = true;
      if (swappedContainer) {
        return;
      }
      const chassis = box(
        scene,
        "truck-chassis",
        { width: 12.8, height: 0.42, depth: 2.45, x: -9.4, y: 1.3 },
        materials.truckTrailer,
        truckRoot,
      );
      swappedContainer = box(
        scene,
        "truck-chassis-container",
        { width: 12.19, height: 2.59, depth: 2.44, x: -9.4, y: 2.8 },
        materials.container[0] ?? materials.steelBlue,
        truckRoot,
      );
      swappedContainer.isVisible = truck.loaded;
      for (const mesh of [chassis, swappedContainer]) {
        mesh.metadata = { ...(mesh.metadata ?? {}), entityId: truck.id };
        shadow.addShadowCaster(mesh, true);
      }
    },
  };
}

export function resetTruckMaterials(): void {
  truckCounter = 0;
}
