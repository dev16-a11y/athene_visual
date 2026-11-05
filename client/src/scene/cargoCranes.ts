import { Quaternion, Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/loaders/glTF";
import { box, castShadows } from "./helpers";
import type { PortMaterials } from "./materials";

/**
 * Портальные и мобильные краны, которые обрабатывают генеральные грузы.
 *
 * Внешние GLB — комплект «Афина · Портальный и мобильный портовый краны» (v1):
 * портальный кран на рельсовом ходу (12,4 × 37,2 × 43,4 м, колея 10,4 м) и
 * мобильный портовый кран на выносных опорах (13,5 × 38,0 × 32,9 м).
 * Задействован LOD1: 13,9 и 14,8 тыс. треугольников, по пять объединённых
 * мешей вместо 26–30 в LOD0 — оба крана в кадре дублируются, и детализация
 * LOD0 здесь ничего не добавляет.
 *
 * Кранов четыре, поэтому они не клонируются по мешам, а собираются в thin
 * instances: один буфер матриц на шаблон, общий для всех его мешей.
 * Модели поставляются статичными, рабочая поза — та, что в GLB.
 */

/** Подкрановый путь: рельсы идут вдоль причала по северному краю площадки. */
export const CRANE_TRACK = {
  x0: 342,
  x1: 642,
  /** Оси рельсов: колея 10,4 м, как в модели. */
  z: [88, 98.4] as const,
  /** Верх головки рельса — на нём стоит кран (начало координат модели). */
  topY: 2.08,
} as const;

const MODEL_ROOT = "/models/port-cranes/";

type CraneModel = "portal_crane_lod1" | "mobile_harbour_crane_lod1";

interface CranePlacement {
  model: CraneModel;
  /** Центр поворотного круга. */
  x: number;
  z: number;
  y: number;
  /** Стрела модели смотрит в +Z: 0 — на площадку, π — на причал. */
  yaw: number;
}

/**
 * Портальные краны стоят на пути у северного края площадки и работают
 * стрелой на штабели; мобильные — на южном проезде, стрелой навстречу.
 */
const CRANES: CranePlacement[] = [
  { model: "portal_crane_lod1", x: 402, z: 93.2, y: CRANE_TRACK.topY, yaw: 0 },
  { model: "portal_crane_lod1", x: 548, z: 93.2, y: CRANE_TRACK.topY, yaw: 0 },
  { model: "mobile_harbour_crane_lod1", x: 404, z: 400, y: 1.96, yaw: Math.PI },
  {
    model: "mobile_harbour_crane_lod1",
    x: 556,
    z: 396,
    y: 1.96,
    yaw: Math.PI + 0.16,
  },
];

export interface CargoCraneStats {
  cranes: number;
  /** Сколько моделей реально загрузилось. */
  templates: number;
  drawMeshes: number;
  /** Поставленные краны: модель, центр и высота установки, поворот. */
  positions: { model: string; x: number; y: number; z: number; yaw: number }[];
}

/** Подкрановый путь: балластная призма и две головки рельса. */
function buildTrack(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
): void {
  const length = CRANE_TRACK.x1 - CRANE_TRACK.x0;
  const centerX = (CRANE_TRACK.x0 + CRANE_TRACK.x1) / 2;
  for (const z of CRANE_TRACK.z) {
    box(
      scene,
      `crane-track-bed-${z}`,
      { width: length, height: 0.06, depth: 1.3, x: centerX, y: 1.99, z },
      materials.ballast,
      root,
    );
    box(
      scene,
      `crane-track-rail-${z}`,
      { width: length, height: 0.06, depth: 0.16, x: centerX, y: 2.05, z },
      materials.rail,
      root,
    );
  }
}

const sceneCache = new WeakMap<Scene, Promise<CargoCraneStats | null>>();

async function loadCraneTemplate(
  scene: Scene,
  model: CraneModel,
  shadow: ShadowGenerator | null,
): Promise<Mesh[]> {
  const result = await SceneLoader.ImportMeshAsync(
    null,
    MODEL_ROOT,
    `${model}.glb`,
    scene,
  );
  const meshes: Mesh[] = [];
  for (const mesh of result.meshes) {
    if (mesh.getTotalVertices() === 0) {
      continue;
    }
    const part = mesh as Mesh;
    part.isPickable = false;
    part.receiveShadows = true;
    // Габарит мастера охватывает все краны этого типа: отсечение по камере
    // выкинуло бы дальний кран целиком, поэтому мастер всегда активен.
    part.alwaysSelectAsActiveMesh = true;
    meshes.push(part);
  }
  if (shadow) {
    for (const part of meshes) {
      castShadows(shadow, part);
    }
  }
  return meshes;
}

/**
 * Ставит краны на площадку генеральных грузов. Повторный вызов на той же
 * сцене возвращает тот же промис.
 */
export function buildCargoCranes(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator | null,
): Promise<CargoCraneStats | null> {
  const cached = sceneCache.get(scene);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    buildTrack(scene, materials, root);

    const groups = new Map<CraneModel, number[]>();
    for (const crane of CRANES) {
      let matrices = groups.get(crane.model);
      if (!matrices) {
        matrices = [];
        groups.set(crane.model, matrices);
      }
      const matrix = Matrix.Compose(
        Vector3.One(),
        Quaternion.RotationYawPitchRoll(crane.yaw, 0, 0),
        new Vector3(crane.x, crane.y, crane.z),
      );
      matrices.push(...matrix.asArray());
    }

    const entries = [...groups.entries()];
    const loaded = await Promise.all(
      entries.map(async ([model, matrices]) => {
        try {
          const meshes = await loadCraneTemplate(scene, model, shadow);
          return { model, matrices, meshes };
        } catch (error) {
          console.warn(
            `[cranes] не удалось загрузить ${model}:`,
            error instanceof Error ? error.message : error,
          );
          return null;
        }
      }),
    );
    if (scene.isDisposed) {
      return null;
    }

    let drawMeshes = 0;
    let templates = 0;
    for (const item of loaded) {
      if (!item || item.meshes.length === 0) {
        continue;
      }
      const data = new Float32Array(item.matrices);
      for (const mesh of item.meshes) {
        mesh.parent = root.isDisposed() ? mesh.parent : root;
        mesh.thinInstanceSetBuffer("matrix", data, 16, true);
        drawMeshes += 1;
      }
      templates += 1;
    }

    return {
      cranes: CRANES.length,
      templates,
      drawMeshes,
      positions: CRANES.map((crane) => ({
        model: crane.model,
        x: crane.x,
        y: crane.y,
        z: crane.z,
        yaw: crane.yaw,
      })),
    };
  })();

  sceneCache.set(scene, promise);
  return promise;
}
