import { Quaternion, Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/loaders/glTF";

/**
 * Открытая площадка генеральных грузов.
 *
 * Внешние GLB — комплект «Афина · Генеральные грузы» (v1): 15 грузовых мест,
 * сталь, трубы, лес, бумага, биг-бэги, ящики и кабельные барабаны. В сцене
 * сотни мест, поэтому каждое — thin instance своего шаблона, а не клон модели.
 * Используется LOD1 (174–2 828 треугольников на место): детальные версии
 * (1–57 тыс.) на такую площадь не масштабируются.
 *
 * Раскладка детерминирована: перезагрузка страницы даёт ту же площадку.
 * Данных о фактических партиях в демо-потоке нет, поэтому это визуальный
 * слой, а не отражение состояния: количества мест постоянны.
 */

export interface CargoType {
  key: string;
  name: string;
  /** Ширина по X в модели, метры. */
  width: number;
  /** Длина по Z в модели, метры. */
  length: number;
  height: number;
  /** Сколько мест можно поставить друг на друга. */
  maxTiers: number;
  /** Длинномер (трубы, прокат, лес) или штучный груз (ящики, мешки, рулоны). */
  kind: "long" | "unit";
}

export const CARGO_TYPES: CargoType[] = [
  { key: "steel_slabs", name: "Стальные слябы", width: 1.79, length: 5.8, height: 1.12, maxTiers: 2, kind: "long" },
  { key: "steel_coils", name: "Стальные рулоны", width: 2.22, length: 4.56, height: 1.87, maxTiers: 1, kind: "long" },
  { key: "wire_rod_coils", name: "Бухты катанки", width: 2.1, length: 3.84, height: 1.6, maxTiers: 2, kind: "long" },
  { key: "rebar_bundle", name: "Арматурные прутки", width: 1.4, length: 6.0, height: 0.44, maxTiers: 5, kind: "long" },
  { key: "aluminium_ingots", name: "Алюминий в чушках", width: 1.22, length: 1.2, height: 0.94, maxTiers: 3, kind: "unit" },
  { key: "large_pipes", name: "Трубы большого диаметра", width: 2.03, length: 6.0, height: 1.75, maxTiers: 2, kind: "long" },
  { key: "galvanized_pipes", name: "Оцинкованные трубы", width: 1.226, length: 6.0, height: 0.71, maxTiers: 3, kind: "long" },
  { key: "steel_beams", name: "Стальные двутавры", width: 1.5, length: 6.4, height: 1.155, maxTiers: 2, kind: "long" },
  { key: "steel_plates", name: "Листовой прокат", width: 2.32, length: 4.403, height: 0.626, maxTiers: 4, kind: "long" },
  { key: "copper_cathodes", name: "Медные катоды", width: 1.15, length: 1.155, height: 0.695, maxTiers: 3, kind: "unit" },
  { key: "timber_bundle", name: "Пиломатериалы", width: 1.33, length: 5.624, height: 0.9, maxTiers: 2, kind: "long" },
  { key: "wooden_crate", name: "Деревянный ящик", width: 2.401, length: 3.22, height: 2.325, maxTiers: 1, kind: "unit" },
  { key: "big_bags", name: "Биг-бэги", width: 2.24, length: 2.24, height: 1.48, maxTiers: 2, kind: "unit" },
  { key: "paper_rolls", name: "Рулоны бумаги", width: 2.1, length: 2.1, height: 1.681, maxTiers: 1, kind: "unit" },
  { key: "cable_drum", name: "Кабельный барабан", width: 2.25, length: 1.463, height: 2.292, maxTiers: 1, kind: "unit" },
];

const TYPE_BY_KEY = new Map(CARGO_TYPES.map((type) => [type.key, type]));

/** Площадка генеральных грузов: восточный фланг, сразу за контейнерным двором. */
export const GENERAL_CARGO_PAD = {
  /** Западная граница плиты: сразу за плитой контейнерного двора. */
  x: 342,
  /** Северная (ближняя к причалу) граница плиты. */
  z: 80,
  width: 300,
  depth: 340,
  /** Верх плиты: на нём стоят грузовые места. */
  groundY: 1.96,
  /** Внутренний отступ от края плиты до штабелей. */
  inset: 10,
} as const;

const MODEL_ROOT = "/models/general-cargo/";

const X_START = GENERAL_CARGO_PAD.x + GENERAL_CARGO_PAD.inset;
const X_END = GENERAL_CARGO_PAD.x + GENERAL_CARGO_PAD.width - GENERAL_CARGO_PAD.inset;
const GROUND_Y = GENERAL_CARGO_PAD.groundY;
/** Верх служебной зоны под причальной полосой перевалки. */
const STAGING_GROUND_Y = 1.94;
/** Шаг соседних рядов внутри полосы длинномеров, метры. */
const LINE_PITCH = 2.9;

function hash(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Placement {
  key: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * Полосы длинномеров: ряды идут вдоль причала (по X), как на открытой
 * площадке. Каждая полоса — своя партия: у стали, труб и леса разные длины и
 * высота штабеля, поэтому полосы не сливаются в одинаковые линии.
 */
interface LongBand {
  /** Центр полосы по Z. */
  z: number;
  lines: number;
  /** Доля занятой длины ряда: на площадке всегда есть проезды и запасы. */
  fill: number;
  pool: string[];
}

/**
 * Полосы начинаются с Z = 114: севернее идёт подкрановый путь портальных
 * кранов (Z 86,5…123,7 — рельсы на 88 и 98,4 плюс свес противовеса), ставить
 * груз на рельсы нельзя.
 */
const LONG_BANDS: LongBand[] = [
  { z: 114, lines: 3, fill: 0.5, pool: ["steel_slabs", "steel_plates"] },
  { z: 134, lines: 2, fill: 0.34, pool: ["steel_coils"] },
  { z: 154, lines: 3, fill: 0.46, pool: ["large_pipes"] },
  { z: 174, lines: 3, fill: 0.44, pool: ["steel_beams", "rebar_bundle"] },
  { z: 194, lines: 3, fill: 0.5, pool: ["galvanized_pipes"] },
  { z: 214, lines: 2, fill: 0.4, pool: ["timber_bundle"] },
  { z: 234, lines: 3, fill: 0.42, pool: ["steel_slabs", "steel_beams"] },
  { z: 254, lines: 3, fill: 0.46, pool: ["large_pipes", "galvanized_pipes"] },
  { z: 274, lines: 2, fill: 0.3, pool: ["steel_coils", "wire_rod_coils"] },
  { z: 294, lines: 3, fill: 0.44, pool: ["rebar_bundle", "timber_bundle"] },
];

/**
 * Партии штучных грузов: место в блоке, шаг мест и число ярусов. Блоки
 * разложены вручную — на площадке партии стоят группами с проездами между
 * ними, а не равномерной сеткой по всей плите.
 */
interface UnitLot {
  key: string;
  /** Левый ближний угол партии. */
  x: number;
  z: number;
  cols: number;
  rows: number;
  pitchX: number;
  pitchZ: number;
  /** Ярусов в штабеле: фиксировано или 1..maxTiers по хешу. */
  tiers: number | "vary";
  yaw?: number;
}

const UNIT_LOTS: UnitLot[] = [
  { key: "wooden_crate", x: 354, z: 312, cols: 5, rows: 2, pitchX: 3.1, pitchZ: 4.2, tiers: 1 },
  { key: "cable_drum", x: 420, z: 310, cols: 5, rows: 4, pitchX: 3.0, pitchZ: 2.6, tiers: 1 },
  { key: "big_bags", x: 470, z: 310, cols: 7, rows: 6, pitchX: 3.0, pitchZ: 3.0, tiers: "vary" },
  { key: "paper_rolls", x: 540, z: 310, cols: 7, rows: 6, pitchX: 3.0, pitchZ: 3.0, tiers: 1 },
  { key: "wooden_crate", x: 600, z: 312, cols: 4, rows: 2, pitchX: 3.1, pitchZ: 4.2, tiers: 1 },
  { key: "aluminium_ingots", x: 354, z: 362, cols: 10, rows: 9, pitchX: 1.95, pitchZ: 2.0, tiers: "vary" },
  { key: "copper_cathodes", x: 452, z: 362, cols: 11, rows: 10, pitchX: 1.85, pitchZ: 1.9, tiers: "vary" },
  { key: "big_bags", x: 520, z: 362, cols: 6, rows: 6, pitchX: 3.0, pitchZ: 3.1, tiers: 1 },
  { key: "cable_drum", x: 570, z: 360, cols: 6, rows: 5, pitchX: 3.0, pitchZ: 3.0, tiers: 1 },
  {
    key: "paper_rolls",
    x: 610,
    z: 360,
    cols: 5,
    rows: 5,
    pitchX: 3.0,
    pitchZ: 3.0,
    tiers: 1,
    yaw: Math.PI / 2,
  },
];

/** Сколько мест каждого типа должно быть на площадке. */
const QUOTA: Record<string, number> = {
  steel_slabs: 100,
  steel_plates: 80,
  steel_coils: 70,
  rebar_bundle: 120,
  large_pipes: 100,
  galvanized_pipes: 100,
  steel_beams: 90,
  timber_bundle: 90,
  wire_rod_coils: 30,
};

/**
 * Причальная зона перевалки: груз, ждущий погрузки, стоит прямо у причала,
 * между дорогой и контейнерным двором. Это самый ближний к камере план —
 * именно он делает генеральные грузы заметными сразу, без облёта сцены.
 */
interface StagingLot {
  key: string;
  count: number;
  tiers: number;
}

/** Полоса перевалки вдоль причала: от -300 до +300 м, два ряда по глубине. */
const STAGING_X0 = -300;
const STAGING_X1 = 300;

const STAGING_ROWS: StagingLot[][] = [
  [
    { key: "large_pipes", count: 8, tiers: 1 },
    { key: "timber_bundle", count: 9, tiers: 2 },
    { key: "steel_coils", count: 7, tiers: 1 },
    { key: "steel_plates", count: 11, tiers: 2 },
    { key: "rebar_bundle", count: 9, tiers: 2 },
    { key: "galvanized_pipes", count: 9, tiers: 2 },
    { key: "steel_beams", count: 9, tiers: 1 },
    { key: "steel_slabs", count: 9, tiers: 2 },
    { key: "wooden_crate", count: 4, tiers: 1 },
    { key: "cable_drum", count: 5, tiers: 1 },
  ],
  [
    { key: "large_pipes", count: 7, tiers: 1 },
    { key: "steel_beams", count: 9, tiers: 2 },
    { key: "timber_bundle", count: 9, tiers: 1 },
    { key: "rebar_bundle", count: 9, tiers: 1 },
    { key: "steel_coils", count: 7, tiers: 1 },
    { key: "galvanized_pipes", count: 9, tiers: 1 },
    { key: "steel_plates", count: 9, tiers: 2 },
    { key: "paper_rolls", count: 4, tiers: 1 },
    { key: "cable_drum", count: 5, tiers: 1 },
  ],
];
/** Партия у причала: длинномеры — вдоль причала, штучные — в линию. */
function layoutStaging(placements: Placement[]): void {
  for (let rowIndex = 0; rowIndex < STAGING_ROWS.length; rowIndex += 1) {
    const row = STAGING_ROWS[rowIndex]!;
    const rowZ = 73.5 + rowIndex * 11;
    let cursor = STAGING_X0;
    for (const lot of row) {
      const type = TYPE_BY_KEY.get(lot.key)!;
      const along = type.kind === "long";
      const spanX = along ? type.length : type.width;
      for (let item = 0; item < lot.count; item += 1) {
        if (cursor + spanX > STAGING_X1) {
          break;
        }
        for (let tier = 0; tier < lot.tiers; tier += 1) {
          placements.push({
            key: lot.key,
            x: cursor + spanX / 2,
            y: STAGING_GROUND_Y + tier * type.height,
            z: rowZ,
            yaw: along ? Math.PI / 2 : 0,
          });
        }
        cursor += spanX + 1.1;
      }
      cursor += 3;
    }
  }
}
/** Ряд длинномеров: места ставятся вплотную друг к другу торцами по X. */
function layoutLongBands(placements: Placement[]): void {
  const counts = new Map<string, number>();
  for (const band of LONG_BANDS) {
    const bandSeed = band.z * 0.017;
    for (let line = 0; line < band.lines; line += 1) {
      const lineSeed = bandSeed + line * 7.31;
      // Ряды полосы идут параллельно причалу с шагом под ширину места:
      // иначе несколько проходов ложились бы друг на друга в одной линии.
      const lineZ = band.z + (line - (band.lines - 1) / 2) * LINE_PITCH;
      let cursor = X_START + hash(lineSeed) * 6;
      while (cursor < X_END - 7) {
        const available = band.pool.filter(
          (key) => (counts.get(key) ?? 0) < (QUOTA[key] ?? 0),
        );
        if (available.length === 0) {
          break;
        }
        const roll = hash(lineSeed + cursor * 0.113);
        if (roll > band.fill) {
          // Разрыв между партиями: проезд или свободное место.
          cursor += 4 + hash(lineSeed + cursor * 0.29) * 12;
          continue;
        }
        const keyIndex =
          Math.floor(hash(lineSeed + cursor * 0.53 + 1.7) * available.length) %
          available.length;
        const key = available[keyIndex]!;
        const type = TYPE_BY_KEY.get(key)!;
        const free = (QUOTA[key] ?? 0) - (counts.get(key) ?? 0);
        const lot = Math.min(
          Math.max(1, 2 + Math.floor(hash(lineSeed + cursor * 0.71) * 7)),
          free,
        );
        const tiers =
          1 + Math.floor(hash(lineSeed + cursor * 0.97) * type.maxTiers);
        if (cursor + type.length > X_END) {
          break;
        }
        for (let item = 0; item < lot && cursor + type.length <= X_END; item += 1) {
          for (let tier = 0; tier < tiers; tier += 1) {
            placements.push({
              key,
              // Модель лежит длиной по Z — вдоль ряда поворачиваем на 90°.
              x: cursor + type.length / 2,
              y: GROUND_Y + tier * type.height,
              z: lineZ,
              yaw: Math.PI / 2,
            });
          }
          counts.set(key, (counts.get(key) ?? 0) + tiers);
          cursor += type.length + 0.7;
        }
        cursor += 2.4;
      }
    }
  }
}

/** Партия штучных грузов: сетка мест с шагом под погрузчик. */
function layoutUnitLots(placements: Placement[]): void {
  for (const lot of UNIT_LOTS) {
    const type = TYPE_BY_KEY.get(lot.key)!;
    const yaw = lot.yaw ?? 0;
    // Повёрнутое на 90° место занимает по X длину модели, а по Z — ширину.
    const spanX = yaw === 0 ? type.width : type.length;
    const spanZ = yaw === 0 ? type.length : type.width;
    for (let col = 0; col < lot.cols; col += 1) {
      for (let row = 0; row < lot.rows; row += 1) {
        const seed = lot.x * 0.19 + lot.z * 0.37 + col * 3.7 + row * 9.1;
        const tiers =
          lot.tiers === "vary"
            ? 1 + Math.floor(hash(seed) * type.maxTiers)
            : lot.tiers;
        const x = lot.x + col * lot.pitchX + spanX / 2;
        const z = lot.z + row * lot.pitchZ + spanZ / 2;
        for (let tier = 0; tier < tiers; tier += 1) {
          placements.push({
            key: lot.key,
            x,
            y: GROUND_Y + tier * type.height,
            z,
            yaw,
          });
        }
      }
    }
  }
}

export interface GeneralCargoStats {
  units: number;
  templates: number;
  drawMeshes: number;
  byType: Record<string, number>;
}

const sceneCache = new WeakMap<Scene, Promise<GeneralCargoStats | null>>();

async function loadTemplate(scene: Scene, key: string): Promise<Mesh[]> {
  const result = await SceneLoader.ImportMeshAsync(
    null,
    MODEL_ROOT,
    `${key}.glb`,
    scene,
  );
  const meshes: Mesh[] = [];
  for (const mesh of result.meshes) {
    if (mesh.getTotalVertices() === 0) {
      continue;
    }
    const cargo = mesh as Mesh;
    cargo.isPickable = false;
    cargo.receiveShadows = true;
    cargo.isVisible = true;
    // Габарит шаблона охватывает всю площадку: отсечение по камере выкинуло бы
    // дальние штабели целиком, поэтому мастер всегда активен.
    cargo.alwaysSelectAsActiveMesh = true;
    meshes.push(cargo);
  }
  return meshes;
}

/**
 * Строит площадку генеральных грузов: раскладка, затем по каждому шаблону —
 * свой буфер матриц. Повторный вызов на той же сцене возвращает тот же промис.
 */
export function buildGeneralCargo(
  scene: Scene,
  root: TransformNode,
): Promise<GeneralCargoStats | null> {
  const cached = sceneCache.get(scene);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const placements: Placement[] = [];
    layoutLongBands(placements);
    layoutUnitLots(placements);
    layoutStaging(placements);
    if (placements.length === 0) {
      return null;
    }

    const groups = new Map<string, { key: string; matrices: number[] }>();
    const byType: Record<string, number> = {};
    for (const item of placements) {
      let group = groups.get(item.key);
      if (!group) {
        group = { key: item.key, matrices: [] };
        groups.set(item.key, group);
      }
      const matrix = Matrix.Compose(
        Vector3.One(),
        Quaternion.RotationYawPitchRoll(item.yaw, 0, 0),
        new Vector3(item.x, item.y, item.z),
      );
      group.matrices.push(...matrix.asArray());
      byType[item.key] = (byType[item.key] ?? 0) + 1;
    }

    let drawMeshes = 0;
    let templates = 0;
    const entries = [...groups.values()];
    const loaded = await Promise.all(
      entries.map(async (group) => {
        try {
          const meshes = await loadTemplate(scene, group.key);
          return { group, meshes };
        } catch (error) {
          console.warn(
            `[cargo] не удалось загрузить ${group.key}:`,
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
      templates += 1;
    }

    return { units: placements.length, templates, drawMeshes, byType };
  })();
  sceneCache.set(scene, promise);
  return promise;
}
