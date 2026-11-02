import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { PortMaterials } from "./materials";
import { box, castShadows } from "./helpers";

export interface WarehouseSpec {
  name: string;
  x: number;
  width: number;
  depth: number;
  height: number;
}

export const WAREHOUSES: WarehouseSpec[] = [
  { name: "Склад 1", x: -142, width: 64, depth: 38, height: 17 },
  { name: "Склад 2", x: 0, width: 72, depth: 38, height: 19 },
  { name: "Склад 3", x: 144, width: 62, depth: 38, height: 17 },
];

export function buildWarehouses(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
): TransformNode {
  for (const spec of WAREHOUSES) {
    const warehouse = new TransformNode(`warehouse-${spec.x}`, scene);
    warehouse.parent = root;
    warehouse.position.set(spec.x, 2, 274);

    box(
      scene,
      "warehouse-body",
      {
        width: spec.width,
        height: spec.height,
        depth: spec.depth,
        y: spec.height / 2,
      },
      materials.warehouse,
      warehouse,
    );

    const slope = Math.atan2(5, spec.depth / 2);
    for (const side of [-1, 1]) {
      box(
        scene,
        "warehouse-roof",
        {
          width: spec.width + 1.5,
          height: 0.7,
          depth: spec.depth * 0.58,
          y: spec.height + 2.1,
          z: side * (spec.depth * 0.23),
          rx: side * slope,
        },
        materials.roof,
        warehouse,
      );
    }

    for (const doorX of [-spec.width * 0.28, 0, spec.width * 0.28]) {
      box(
        scene,
        "warehouse-door",
        { width: 9, height: 8, depth: 0.5, x: doorX, y: 4, z: -spec.depth / 2 - 0.3 },
        materials.warehouseDoor,
        warehouse,
      );
      box(
        scene,
        "warehouse-canopy",
        { width: 10.5, height: 0.35, depth: 3, x: doorX, y: 8.6, z: -spec.depth / 2 - 1.5 },
        materials.steelLight,
        warehouse,
      );
    }

    for (const ventX of [-spec.width * 0.35, spec.width * 0.35]) {
      box(
        scene,
        "warehouse-vent",
        { width: 3.2, height: 1.6, depth: 0.4, x: ventX, y: spec.height - 2.4, z: -spec.depth / 2 - 0.15 },
        materials.steelLight,
        warehouse,
      );
    }

    castShadows(shadow, warehouse);
  }
  return root;
}
