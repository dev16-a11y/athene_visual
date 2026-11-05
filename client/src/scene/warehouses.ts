import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { PortMaterials } from "./materials";
import { box, castShadows } from "./helpers";
import { swapInModel } from "./models";

export interface WarehouseSpec {
  name: string;
  x: number;
  /** Задняя линия застройки; у широких зданий сдвинута, чтобы не лезть в двор. */
  z?: number;
  width: number;
  depth: number;
  height: number;
  /** Ключ MODEL_MANIFEST: внешняя модель вместо параметрического корпуса. */
  modelKey?: string;
}

/**
 * Ряд складов вдоль тыловой границы терминала. Параметрические корпуса
 * строятся всегда и служат fallback; поверх них подставляются внешние
 * модели зданий (LOD1 — это фон в 270 м от камеры).
 */
export const WAREHOUSES: WarehouseSpec[] = [
  { name: "Склад 1", x: -300, z: 430, width: 64, depth: 38, height: 17, modelKey: "buildingKaispeicher" },
  { name: "Склад 2", x: 0, z: 430, width: 72, depth: 38, height: 19, modelKey: "buildingRdm" },
  // Steinwerder — низкий широкий комплекс: 130 × 97 м в модели, поэтому
  // ставим его ближе к тыловой границе и без прежнего отступа по Z.
  { name: "Склад 3", x: 300, z: 430, width: 62, depth: 38, height: 17, modelKey: "buildingSteinwerder" },
];

/**
 * Подменяет параметрический корпус здания внешней моделью. Промис нужен
 * вызывающему, чтобы дождаться моделей до снятия экрана загрузки.
 */
async function replaceWithModel(
  scene: Scene,
  root: TransformNode,
  shadow: ShadowGenerator,
  key: string,
  id: string,
): Promise<void> {
  const result = await swapInModel(scene, root, key, id, shadow);
  if (!result) {
    return;
  }
  const modelMeshes = new Set(result.meshes);
  for (const mesh of root.getChildMeshes()) {
    if (modelMeshes.has(mesh)) {
      continue;
    }
    shadow.removeShadowCaster(mesh, false);
    mesh.dispose();
  }
}

export function buildWarehouses(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
): Promise<void>[] {
  const pending: Promise<void>[] = [];
  for (const spec of WAREHOUSES) {
    const warehouse = new TransformNode(`warehouse-${spec.x}`, scene);
    warehouse.parent = root;
    warehouse.position.set(spec.x, 2, spec.z ?? 274);

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

    if (spec.modelKey) {
      pending.push(
        replaceWithModel(
          scene,
          warehouse,
          shadow,
          spec.modelKey,
          `warehouse-${spec.x}`,
        ),
      );
    }
  }
  return pending;
}
