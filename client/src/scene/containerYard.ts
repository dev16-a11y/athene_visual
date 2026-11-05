import { Quaternion, Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { YardBlock } from "../domain/types";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/loaders/glTF";

/**
 * Контейнерный двор: штабели из реальных моделей морских линий.
 *
 * Внешние GLB — комплект «Афина · Контейнеры ведущих морских линий»:
 * 15 марок × 20GP/40GP/40HC, тяжёлые версии в наборе не используются.
 * Моделей в кадре тысячи, поэтому каждый контейнер — не отдельный меш и не
 * клон модели, а thin instance одного из 45 шаблонов (марка × тип). Ребро
 * такого шаблона — 288 треугольников, а все штабели двора укладываются
 * примерно в 270 draw calls.
 */

export const CONTAINER_LINES = [
  "msc",
  "maersk",
  "cma_cgm",
  "cosco",
  "hapag_lloyd",
  "one",
  "evergreen",
  "hmm",
  "yang_ming",
  "zim",
  "wan_hai",
  "pil",
  "sitc",
  "kmtc",
  "oocl",
] as const;

export type ContainerLine = (typeof CONTAINER_LINES)[number];
export type ContainerTypeKey = "20GP" | "40GP" | "40HC";

interface ContainerType {
  key: ContainerTypeKey;
  /** Длина по Z в модели, метры. */
  length: number;
  height: number;
}

export const CONTAINER_TYPES: Record<ContainerTypeKey, ContainerType> = {
  "20GP": { key: "20GP", length: 6.058, height: 2.591 },
  "40GP": { key: "40GP", length: 12.192, height: 2.591 },
  "40HC": { key: "40HC", length: 12.192, height: 2.896 },
};

/** Верх плиты двора: на нём стоят площадки (blockRoot смещён на эту высоту). */
export const YARD_GROUND_Y = 2;

/** Раскладка одного блока: 24 бейя × 2 группы по 10 рядов × 5 ярусов. */
export const CONTAINER_BLOCK = {
  bays: 24,
  bayPitch: 12.6,
  /** Два штабельных ряда по 10 рядов, между ними проезд. */
  rowsPerGroup: 10,
  rowPitch: 2.6,
  groupGap: 9,
  tiers: 5,
  padHeight: 0.12,
  get length(): number {
    return this.bays * this.bayPitch;
  },
  get depth(): number {
    return 2 * (this.rowsPerGroup * this.rowPitch) + this.groupGap;
  },
  get rows(): number {
    return 2 * this.rowsPerGroup;
  },
  /** TEU, которые блок держит при полной загрузке (40-футовый ярус = 2 TEU). */
  get capacityTeu(): number {
    return this.bays * this.rows * this.tiers * 2;
  },
  /** Контейнеров при полной загрузке. */
  get slots(): number {
    return this.bays * this.rows * this.tiers;
  },
} as const;

const MODEL_ROOT = "/models/containers/";

function hash(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Placement {
  line: ContainerLine;
  type: ContainerTypeKey;
  /** Мировые координаты дна контейнера. */
  x: number;
  y: number;
  z: number;
}

interface BlockStats {
  block: string;
  containers: number;
  teu: number;
  slots: number;
}

export interface ContainerYardStats {
  blocks: BlockStats[];
  containers: number;
  teu: number;
  templates: number;
  drawMeshes: number;
}

const sceneCache = new WeakMap<Scene, Promise<ContainerYardStats | null>>();

/** Шаблон контейнера: его меши остаются в сцене и рисуются инстансами. */
async function loadTemplate(
  scene: Scene,
  line: ContainerLine,
  type: ContainerTypeKey,
): Promise<Mesh[]> {
  const result = await SceneLoader.ImportMeshAsync(
    null,
    MODEL_ROOT,
    `${line}/${type}.glb`,
    scene,
  );
  const meshes: Mesh[] = [];
  for (const mesh of result.meshes) {
    if (mesh.getTotalVertices() === 0) {
      continue;
    }
    const container = mesh as Mesh;
    container.isPickable = false;
    container.receiveShadows = true;
    // Мастер обязан быть активным: thin instances рисуются только у видимого
    // меша, а его габарит охватывает весь двор — считаем его всегда видимым,
    // иначе отсечение по камере выкидывает дальние штабели целиком.
    container.isVisible = true;
    container.alwaysSelectAsActiveMesh = true;
    meshes.push(container);
  }
  return meshes;
}

function templateKey(line: ContainerLine, type: ContainerTypeKey): string {
  return `${line}/${type}`;
}

/**
 * Раскладка штабелей блока. Детерминирована по имени блока и заполнению:
 * перезагрузка страницы даёт тот же двор, а ползунок истории — другой.
 *
 * Высоты сначала разыгрываются хешем (пустые места, разная высота), затем
 * корректируются до ровно того объёма, который заявлен в данных: панель
 * «Заполнение» и то, что видно на сцене, обязаны совпадать. Ярус любого
 * штабеля — это ровно 2 TEU (одно 40-футовое или два 20-футовых).
 */
function layoutBlock(block: YardBlock, target: Placement[]): BlockStats {
  const fill = Math.min(1, block.occupiedTeu / Math.max(1, block.capacityTeu));
  const blockSeed = [...block.block].reduce(
    (acc, char, index) => acc + char.charCodeAt(0) * (index + 3) * 17,
    0,
  );
  const { bays, bayPitch, rowsPerGroup, rowPitch, groupGap, tiers, padHeight } =
    CONTAINER_BLOCK;
  const groupCenter = groupGap / 2 + (rowsPerGroup * rowPitch) / 2;
  const stackCount = bays * rowsPerGroup * 2;
  const neededTiers = Math.min(
    stackCount * tiers,
    Math.round((fill * block.capacityTeu) / 2),
  );

  const heights = new Array<number>(stackCount).fill(0);
  for (let index = 0; index < stackCount; index += 1) {
    const seed = blockSeed + index * 17.13;
    // Пустые места на земле: чем ниже заполнение, тем их больше.
    if (hash(seed) < (1 - fill) * 0.5) {
      continue;
    }
    const rolled = Math.round(tiers * fill * 1.25 + (hash(seed + 2.7) - 0.62) * 3.2);
    heights[index] = Math.max(1, Math.min(tiers, rolled));
  }

  // Точная подгонка объёма: нехватку добираем ярусами, излишек снимаем.
  let total = heights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (total < neededTiers) {
    const index = (cursor * 7) % stackCount;
    if (heights[index]! < tiers) {
      heights[index]! += 1;
      total += 1;
    }
    cursor += 1;
    if (cursor > stackCount * 40) {
      break;
    }
  }
  cursor = 0;
  while (total > neededTiers) {
    const index = (cursor * 11) % stackCount;
    if (heights[index]! > 0) {
      heights[index]! -= 1;
      total -= 1;
    }
    cursor += 1;
    if (cursor > stackCount * 40) {
      break;
    }
  }

  let containers = 0;
  let teu = 0;
  for (let group = 0; group < 2; group += 1) {
    const groupSign = group === 0 ? -1 : 1;
    for (let row = 0; row < rowsPerGroup; row += 1) {
      for (let bay = 0; bay < bays; bay += 1) {
        const index = group * bays * rowsPerGroup + row * bays + bay;
        const stackHeight = heights[index]!;
        if (stackHeight === 0) {
          continue;
        }
        const seed = blockSeed + index * 41.7;
        // Порода стека: 20-футовые стоят парами в одном бейе.
        const kindRoll = hash(seed + 3.1);
        const type: ContainerTypeKey =
          kindRoll < 0.3 ? "20GP" : kindRoll < 0.65 ? "40GP" : "40HC";
        const stackType = CONTAINER_TYPES[type];
        const bayX = (bay - (bays - 1) / 2) * bayPitch;
        const rowZ = groupSign * (groupCenter - (row + 0.5) * rowPitch);
        const xs = type === "20GP" ? [-3.05, 3.05] : [0];
        for (let tier = 0; tier < stackHeight; tier += 1) {
          // Марка выбирается на каждый ярус: в реальном штабеле верхние
          // контейнеры часто уже другого перевозчика.
          const lineRoll = hash(seed + tier * 41.3 + 0.7);
          const line = CONTAINER_LINES[Math.floor(lineRoll * CONTAINER_LINES.length)]!;
          for (const offsetX of xs) {
            target.push({
              line,
              type,
              x: block.position.x + bayX + offsetX,
              y: YARD_GROUND_Y + padHeight + tier * stackType.height,
              z: block.position.z + rowZ,
            });
            containers += 1;
            teu += type === "20GP" ? 1 : 2;
          }
        }
      }
    }
  }
  return { block: block.block, containers, teu, slots: CONTAINER_BLOCK.slots };
}

/**
 * Строит штабели всех площадок одним проходом: сначала раскладка, потом по
 * каждому шаблону — свой буфер матриц. Повторный вызов на той же сцене
 * возвращает тот же промис (двор строится один раз).
 */
export function buildContainerYard(
  scene: Scene,
  root: TransformNode,
  yards: YardBlock[],
): Promise<ContainerYardStats | null> {
  const cached = sceneCache.get(scene);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const placements: Placement[] = [];
    const blocks: BlockStats[] = [];
    for (const yard of yards) {
      blocks.push(layoutBlock(yard, placements));
    }
    if (placements.length === 0) {
      return null;
    }

    const groups = new Map<string, { line: ContainerLine; type: ContainerTypeKey; matrices: number[] }>();
    for (const item of placements) {
      const key = templateKey(item.line, item.type);
      let group = groups.get(key);
      if (!group) {
        group = { line: item.line, type: item.type, matrices: [] };
        groups.set(key, group);
      }
      const matrix = Matrix.Compose(
        Vector3.One(),
        // Нос контейнера (двери) смотрит в +Z модели — разворачиваем вдоль X,
        // чтобы длинная сторона шла вдоль блока, как на реальном терминале.
        Quaternion.RotationYawPitchRoll(Math.PI / 2, 0, 0),
        new Vector3(item.x, item.y, item.z),
      );
      group.matrices.push(...matrix.asArray());
    }

    let drawMeshes = 0;
    const templates: Mesh[][] = [];
    const entries = [...groups.values()];
    const loaded = await Promise.all(
      entries.map(async (group) => {
        try {
          const meshes = await loadTemplate(scene, group.line, group.type);
          return { group, meshes };
        } catch (error) {
          console.warn(
            `[containers] не удалось загрузить ${group.line}/${group.type}:`,
            error instanceof Error ? error.message : error,
          );
          return null;
        }
      }),
    );
    if (scene.isDisposed) {
      return null;
    }
    for (const item of loaded) {
      if (!item || item.meshes.length === 0) {
        continue;
      }
      const data = new Float32Array(item.group.matrices);
      for (const mesh of item.meshes) {
        mesh.parent = root.isDisposed() ? mesh.parent : root;
        mesh.thinInstanceSetBuffer("matrix", data, 16, true);
        drawMeshes += 1;
      }
      templates.push(item.meshes);
    }

    return {
      blocks,
      containers: blocks.reduce((sum, block) => sum + block.containers, 0),
      teu: blocks.reduce((sum, block) => sum + block.teu, 0),
      templates: templates.length,
      drawMeshes,
    };
  })();
  sceneCache.set(scene, promise);
  return promise;
}
