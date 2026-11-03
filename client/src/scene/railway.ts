import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/loaders/glTF";
import {
  createRailDrive,
  consistLimits,
  stepRailDrive,
  vehicleOffsets,
  type RailDriveLimits,
  type RailDriveState,
} from "./railDrive";

/**
 * Железнодорожные модели проекта «Афина» (пакет Smarttwin_Railway_Models).
 *
 * Соглашение ассетов: метры, Y вверх, +Z — нос, начало координат в середине
 * машины, головка рельса на Y = 0,18. Габариты и колёсная база берутся из
 * `connection_points.json` пакета, поэтому сцепки стыкуются без подгонки.
 */
export type RailVehicleKey =
  | "shunter"
  | "industrial"
  | "mainline"
  | "container"
  | "gondola"
  | "grain"
  | "tank"
  | "covered"
  | "pipes";

interface RailVehicleSpec {
  file: string;
  /** Расстояние между центрами сцепок, метры. */
  pitch: number;
  wheelRadius: number;
  /** Свесы от центра машины до сцепки, метры. */
  frontHalf: number;
  rearHalf: number;
}

export const RAIL_VEHICLES: Record<RailVehicleKey, RailVehicleSpec> = {
  shunter: {
    file: "diesel_shunter_6axle.glb",
    pitch: 17.52,
    wheelRadius: 0.5,
    frontHalf: 8.76,
    rearHalf: 8.76,
  },
  industrial: {
    file: "diesel_industrial_4axle.glb",
    pitch: 13.32,
    wheelRadius: 0.5,
    frontHalf: 6.66,
    rearHalf: 6.66,
  },
  mainline: {
    file: "diesel_mainline_2section.glb",
    pitch: 36.72,
    wheelRadius: 0.5,
    frontHalf: 18.36,
    rearHalf: 18.36,
  },
  container: {
    file: "wagon_container_platform.glb",
    pitch: 26.72,
    wheelRadius: 0.46,
    frontHalf: 13.36,
    rearHalf: 13.36,
  },
  gondola: {
    file: "wagon_gondola.glb",
    pitch: 14.52,
    wheelRadius: 0.46,
    frontHalf: 7.26,
    rearHalf: 7.26,
  },
  grain: {
    file: "wagon_grain_hopper.glb",
    pitch: 15.72,
    wheelRadius: 0.46,
    frontHalf: 7.86,
    rearHalf: 7.86,
  },
  tank: {
    file: "wagon_tank.glb",
    pitch: 13.52,
    wheelRadius: 0.46,
    frontHalf: 6.76,
    rearHalf: 6.76,
  },
  covered: {
    file: "wagon_covered.glb",
    pitch: 16.32,
    wheelRadius: 0.46,
    frontHalf: 8.16,
    rearHalf: 8.16,
  },
  pipes: {
    file: "wagon_pipe_platform.glb",
    pitch: 15.32,
    wheelRadius: 0.46,
    frontHalf: 7.66,
    rearHalf: 7.66,
  },
};

/** Один узел оси: геометрия колёс пары и центр, вокруг которого она катится. */
interface RailAxle {
  center: Vector3;
  meshes: Mesh[];
}

interface RailTemplate {
  key: RailVehicleKey;
  spec: RailVehicleSpec;
  /** Поворот вокруг Y, при котором нос смотрит в +X. */
  yaw: number;
  debug?: Record<string, unknown>;
  /** Знак вращения колёс при движении вперёд. */
  rollSign: 1 | -1;
  /** Головка рельса в координатах модели. */
  railHeadY: number;
  body: Mesh[];
  axles: RailAxle[];
  cargo: Mesh[];
}

const templateCache = new WeakMap<Scene, Map<string, Promise<RailTemplate | null>>>();

export function loadRailTemplate(
  scene: Scene,
  key: RailVehicleKey,
): Promise<RailTemplate | null> {
  let cache = templateCache.get(scene);
  if (!cache) {
    cache = new Map();
    templateCache.set(scene, cache);
  }
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const promise = importTemplate(scene, key).catch((error: unknown) => {
    console.warn(
      `[railway] не удалось загрузить ${RAIL_VEHICLES[key].file}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  });
  cache.set(key, promise);
  return promise;
}

function centerOf(mesh: AbstractMesh): Vector3 {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo(false, false);
  return mesh.getBoundingInfo().boundingBox.centerWorld.clone();
}

/** Общий центр и нижняя точка группы мешей в координатах модели. */
function boundsOf(meshes: AbstractMesh[]): { center: Vector3; minY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(false, false);
    const box = mesh.getBoundingInfo().boundingBox;
    minX = Math.min(minX, box.minimumWorld.x);
    maxX = Math.max(maxX, box.maximumWorld.x);
    minY = Math.min(minY, box.minimumWorld.y);
    maxY = Math.max(maxY, box.maximumWorld.y);
    minZ = Math.min(minZ, box.minimumWorld.z);
    maxZ = Math.max(maxZ, box.maximumWorld.z);
  }
  if (!Number.isFinite(minX)) {
    return null;
  }
  return {
    center: new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    minY,
  };
}

/**
 * Поворот, при котором нос модели смотрит в +X.
 *
 * Модель приходит из правой системы координат, сцена — левая, и загрузчик
 * может отразить ось Z, поэтому направление не предполагается, а измеряется:
 * берём вектор «задняя сцепка → передняя» и подбираем угол так, чтобы после
 * поворота он совпал с +X.
 */
function calibrateYaw(
  meshes: AbstractMesh[],
  debug?: Record<string, unknown>,
): number | null {
  const front = meshes.find((mesh) => mesh.name.includes("coupler_front"));
  const rear = meshes.find((mesh) => mesh.name.includes("coupler_rear"));
  if (debug) {
    debug.couplers = [front?.name ?? null, rear?.name ?? null];
  }
  if (!front || !rear) {
    return null;
  }
  const head = centerOf(front);
  const tail = centerOf(rear);
  const forward = new Vector3(head.x - tail.x, 0, head.z - tail.z);
  if (forward.lengthSquared() < 1e-6) {
    return null;
  }
  forward.normalize();
  if (debug) {
    debug.f0 = [Number(forward.x.toFixed(3)), Number(forward.z.toFixed(3))];
  }
  // Matrix.RotationY в Babylon: (x, z) → (x·cos + z·sin, −x·sin + z·cos),
  // поэтому нос f0 смотрит в +X при yaw = atan2(f0.z, f0.x).
  return Math.atan2(forward.z, forward.x);
}

function mergeGroup(meshes: Mesh[], name: string): Mesh[] {
  if (meshes.length <= 1) {
    return meshes;
  }
  try {
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, true, true);
    if (merged) {
      merged.name = name;
      merged.parent = null;
      return [merged];
    }
  } catch (error) {
    console.warn(
      `[railway] слияние ${name} пропущено:`,
      error instanceof Error ? error.message : error,
    );
  }
  return meshes;
}

async function importTemplate(
  scene: Scene,
  key: RailVehicleKey,
): Promise<RailTemplate | null> {
  const spec = RAIL_VEHICLES[key];
  const result = await SceneLoader.ImportMeshAsync(
    "",
    "/models/railway/",
    spec.file,
    scene,
  );
  const source = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  if (source.length === 0) {
    return null;
  }
  const holder = new TransformNode(`rail-src-${key}`, scene);
  for (const mesh of source) {
    if (!mesh.parent) {
      mesh.parent = holder;
    }
  }
  holder.computeWorldMatrix(true);

  // Запекаем трансформацию каждой части в вершины: дальше все меши живут в
  // координатах модели с единичной матрицей, и любые измерения габаритов
  // относятся к одной и той же системе отсчёта.
  for (const mesh of source as Mesh[]) {
    mesh.computeWorldMatrix(true);
    mesh.bakeTransformIntoVertices(mesh.getWorldMatrix());
    mesh.parent = null;
    mesh.refreshBoundingInfo(true, true);
  }
  holder.dispose();

  const yawDebug: Record<string, unknown> = {};
  const yaw = calibrateYaw(source, yawDebug) ?? 0;

  const wheels = source.filter((mesh) => /_wheel_/i.test(mesh.name));
  const cargo = source.filter((mesh) => /^cargo_/i.test(mesh.name));
  const body = source.filter(
    (mesh) => !wheels.includes(mesh) && !cargo.includes(mesh),
  );

  const templateRoot = new TransformNode(`rail-template-${key}`, scene);

  // Оси: колёса одной оси сливаются и центрируются в своей оси вращения.
  const axleGroups = new Map<string, Mesh[]>();
  for (const wheel of wheels) {
    const axleKey = wheel.name
      .replace(/_primitive\d+$/i, "")
      .replace(/_[LR]$/i, "");
    const group = axleGroups.get(axleKey) ?? [];
    group.push(wheel as Mesh);
    axleGroups.set(axleKey, group);
  }
  const axleMeshes: RailAxle[] = [];
  for (const [axleKey, group] of axleGroups) {
    const bounds = boundsOf(group);
    if (!bounds) {
      continue;
    }
    const merged = mergeGroup(group, `${key}-${axleKey}`);
    const centre = bounds.center;
    for (const mesh of merged) {
      mesh.parent = templateRoot;
      mesh.position.set(0, 0, 0);
      mesh.bakeTransformIntoVertices(
        Matrix.Translation(-centre.x, -centre.y, -centre.z),
      );
      mesh.refreshBoundingInfo(true, true);
    }
    axleMeshes.push({ center: centre, meshes: merged });
  }

  const bodyMeshes = mergeGroup(body as Mesh[], `${key}-body`);
  for (const mesh of bodyMeshes) {
    mesh.parent = templateRoot;
    mesh.position.set(0, 0, 0);
  }
  const cargoMeshes = cargo as Mesh[];
  for (const mesh of cargoMeshes) {
    mesh.parent = templateRoot;
    mesh.position.set(0, 0, 0);
  }

  // Головка рельса — на радиусе ниже центра оси: у колеса есть гребень,
  // который уходит ниже головки, поэтому нижняя точка габарита не годится.
  const axleCentreY = axleMeshes[0]?.center.y;
  const railHead =
    axleCentreY !== undefined ? axleCentreY - spec.wheelRadius : 0.18;
  const rollSign = calibrateRoll(templateRoot, axleMeshes, railHead, yaw, scene);

  holder.setEnabled(false);
  templateRoot.setEnabled(false);

  return {
    key,
    spec,
    yaw,
    debug: yawDebug,
    rollSign,
    railHeadY: railHead,
    body: bodyMeshes,
    axles: axleMeshes,
    cargo: cargoMeshes,
  };
}

/**
 * Знак вращения колёс. Проверяем численно: при вращении вокруг локальной оси X
 * точка контакта у переднего хода должна уходить назад, иначе колёса будут
 * крутиться против движения.
 */
function calibrateRoll(
  templateRoot: TransformNode,
  axles: RailAxle[],
  railHeadY: number,
  yaw: number,
  scene: Scene,
): 1 | -1 {
  const axle = axles[0];
  if (!axle) {
    return 1;
  }
  const probe = new TransformNode("roll-probe", scene);
  probe.parent = templateRoot;
  probe.rotation.y = yaw;
  const pivot = new TransformNode("roll-pivot", scene);
  pivot.parent = probe;
  pivot.position.copyFrom(axle.center);
  const clone = axle.meshes[0]?.clone("roll-clone", pivot, false);
  if (!clone) {
    probe.dispose();
    return 1;
  }
  clone.position.set(-axle.center.x, -axle.center.y, -axle.center.z);
  const contact = new Vector3(0, railHeadY - axle.center.y, 0);
  const sample = (angle: number): number => {
    pivot.rotation.x = angle;
    pivot.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(contact, pivot.getWorldMatrix()).x;
  };
  const forward = sample(0.2);
  const backward = sample(-0.2);
  probe.dispose();
  return forward < backward ? 1 : -1;
}

/** Раскладка состава: локомотив и вагоны в порядке сцепки. */
export const DEFAULT_CONSIST: RailVehicleKey[] = [
  "shunter",
  "container",
  "gondola",
  "tank",
  "grain",
  "covered",
  "pipes",
  "container",
];

export interface ConsistPlacement {
  /** Высота головки рельса в сцене. */
  railTopY: number;
  /** Ось пути по Z. */
  trackZ: number;
  /** Границы пути по X. */
  trackMinX: number;
  trackMaxX: number;
  cruiseSpeed?: number;
  acceleration?: number;
  dwellSeconds?: number;
}

export interface ConsistVehicle {
  key: RailVehicleKey;
  root: TransformNode;
  axles: Mesh[];
  cargo: Mesh[];
  wheelRadius: number;
  rollSign: 1 | -1;
  /** Смещение от центра локомотива вдоль состава, метры. */
  offset: number;
  roll: number;
}

/**
 * Состав на прямом пути: машины жёстко расставлены по сцепкам, колёса
 * катятся по пройденному пути, скорость меняется с ограничением ускорения.
 */
export class TrainConsist {
  readonly vehicles: ConsistVehicle[] = [];
  /** Счётчики для проверок: состав не должен прыгать между кадрами. */
  readonly stats = {
    frames: 0,
    maxStep: 0,
    maxStepDelta: 0,
    maxSpeedChange: 0,
    maxSpeedDelta: 0,
    overshoots: 0,
    clampedFrames: 0,
  };
  private readonly limits: RailDriveLimits;
  private drive: RailDriveState;
  private loadedWagons = -1;
  private readonly templates: RailTemplate[];

  constructor(
    scene: Scene,
    private readonly root: TransformNode,
    placement: ConsistPlacement,
    templates: RailTemplate[],
    shadow: ShadowGenerator | null,
  ) {
    this.templates = templates;
    const offsets = vehicleOffsets(templates.map((item) => item.spec.pitch));
    const bounds = consistLimits(
      offsets,
      templates[0]!.spec.frontHalf,
      templates[templates.length - 1]!.spec.rearHalf,
      placement.trackMinX,
      placement.trackMaxX,
    );
    this.limits = {
      minX: bounds.minX,
      maxX: bounds.maxX,
      cruiseSpeed: placement.cruiseSpeed ?? 4,
      acceleration: placement.acceleration ?? 0.3,
      dwellSeconds: placement.dwellSeconds ?? 30,
      tolerance: 0.06,
    };
    // Стартуем не у самого края: состав должен быть виден в кадре.
    this.drive = createRailDrive(Math.min(bounds.maxX, bounds.minX + 40));

    templates.forEach((template, index) => {
      this.vehicles.push(
        createVehicle(scene, root, template, offsets[index]!, shadow),
      );
    });

    this.root.position.set(this.drive.x, placement.railTopY, placement.trackZ);
  }

  /** Сколько вагонов загружено: у них включаются меши груза. */
  setLoadedWagons(count: number): void {
    const next = Math.max(0, Math.round(count));
    if (next === this.loadedWagons) {
      return;
    }
    this.loadedWagons = next;
    for (let index = 1; index < this.vehicles.length; index += 1) {
      const loaded = index - 1 < next;
      for (const mesh of this.vehicles[index]!.cargo) {
        mesh.setEnabled(loaded);
      }
    }
  }

  /** Лёгкое состояние для покадровых замеров: без обхода мешей. */
  snapshot(): {
    x: number;
    speed: number;
    direction: number;
    dwell: number;
    roll: number;
  } {
    return {
      x: this.drive.x,
      speed: this.drive.speed,
      direction: this.drive.direction,
      dwell: this.drive.dwell,
      roll: this.vehicles[0]?.roll ?? 0,
    };
  }

  get x(): number {
    return this.drive.x;
  }

  get speed(): number {
    return this.drive.speed;
  }

  get state(): RailDriveState {
    return this.drive;
  }

  get bounds(): { minX: number; maxX: number } {
    return { minX: this.limits.minX, maxX: this.limits.maxX };
  }

  get length(): number {
    const last = this.vehicles[this.vehicles.length - 1];
    return last ? last.offset + this.templates[this.templates.length - 1]!.spec.rearHalf : 0;
  }

  /** Только для проверок: поставить состав в точку и обнулить скорость. */
  debugSetX(x: number): void {
    this.drive = {
      x: Math.min(this.limits.maxX, Math.max(this.limits.minX, x)),
      speed: 0,
      direction: 1,
      dwell: 0,
    };
  }

  update(deltaSeconds: number): void {
    const previous = this.drive;
    this.drive = stepRailDrive(previous, deltaSeconds, this.limits);
    const travelled = this.drive.x - previous.x;

    const stats = this.stats;
    stats.frames += 1;
    if (Math.abs(travelled) > stats.maxStep) {
      stats.maxStep = Math.abs(travelled);
      stats.maxStepDelta = Math.min(0.25, Math.max(0, deltaSeconds));
    }
    const speedChange = Math.abs(this.drive.speed - previous.speed);
    if (speedChange > stats.maxSpeedChange) {
      stats.maxSpeedChange = speedChange;
      stats.maxSpeedDelta = Math.min(0.25, Math.max(0, deltaSeconds));
    }
    const dt = Math.min(0.25, Math.max(0, deltaSeconds));
    // Ожидаемый шаг — ровно v·dt: расхождение означало бы телепорт.
    if (Math.abs(travelled - this.drive.speed * dt) > 0.001) {
      if (this.drive.speed === 0) {
        stats.clampedFrames += 1;
      } else {
        stats.overshoots += 1;
      }
    }

    this.root.position.x = this.drive.x;
    for (const vehicle of this.vehicles) {
      vehicle.root.position.x = -vehicle.offset;
      if (travelled !== 0) {
        vehicle.roll += (travelled / vehicle.wheelRadius) * vehicle.rollSign;
        for (const axle of vehicle.axles) {
          axle.rotation.x = vehicle.roll;
        }
      }
    }
  }
}

function createVehicle(
  scene: Scene,
  parent: TransformNode,
  template: RailTemplate,
  offset: number,
  shadow: ShadowGenerator | null,
): ConsistVehicle {
  const name = `rail-${template.key}-${offset.toFixed(1)}`;
  const root = new TransformNode(name, scene);
  root.parent = parent;
  root.position.set(-offset, -template.railHeadY, 0);
  root.rotation.y = template.yaw;
  root.metadata = { entityId: parent.metadata?.entityId, railKey: template.key };

  const decorate = (mesh: Mesh, withShadow: boolean): void => {
    if (withShadow) {
      shadow?.addShadowCaster(mesh, false);
    }
    mesh.receiveShadows = true;
    mesh.metadata = { entityId: parent.metadata?.entityId };
  };

  for (const mesh of template.body) {
    const clone = mesh.clone(`${mesh.name}-${offset.toFixed(1)}`, root, false);
    if (clone) {
      decorate(clone, true);
    }
  }

  const axles: Mesh[] = [];
  for (const axle of template.axles) {
    for (const mesh of axle.meshes) {
      const clone = mesh.clone(`${mesh.name}-${offset.toFixed(1)}`, root, false);
      if (clone) {
        // Геометрия отцентрована в оси, поэтому достаточно поставить меш в
        // центр оси: вращение вокруг X будет катить колесо на месте.
        clone.position.copyFrom(axle.center);
        decorate(clone, false);
        axles.push(clone);
      }
    }
  }

  const cargo: Mesh[] = [];
  for (const mesh of template.cargo) {
    const clone = mesh.clone(`${mesh.name}-${offset.toFixed(1)}`, root, false);
    if (clone) {
      decorate(clone, true);
      cargo.push(clone);
    }
  }

  return {
    key: template.key,
    root,
    axles,
    cargo,
    wheelRadius: template.spec.wheelRadius,
    rollSign: template.rollSign,
    offset,
    roll: 0,
  };
}

/** Диагностика шаблонов: углы, оси, посадка на рельс. */
export async function railTemplateInfo(scene: Scene): Promise<unknown> {
  const cache = templateCache.get(scene);
  if (!cache) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, promise] of cache) {
    const template = await promise;
    out[key] = template
      ? {
          yaw: Number(template.yaw.toFixed(4)),
          debug: template.debug,
          rollSign: template.rollSign,
          railHeadY: Number(template.railHeadY.toFixed(4)),
          axles: template.axles.length,
          axleCenters: template.axles.map((axle) =>
            axle.center.asArray().map((value) => Number(value.toFixed(2))),
          ),
          body: template.body.length,
          cargo: template.cargo.length,
        }
      : null;
  }
  return out;
}

/** Загрузка всех шаблонов состава; undefined — модель недоступна. */
export async function loadConsistTemplates(
  scene: Scene,
  plan: RailVehicleKey[],
): Promise<Array<{ key: RailVehicleKey; template: RailTemplate }> | null> {
  const unique = [...new Set(plan)];
  const loaded = await Promise.all(
    unique.map(async (key) => [key, await loadRailTemplate(scene, key)] as const),
  );
  const byKey = new Map(loaded);
  const result: Array<{ key: RailVehicleKey; template: RailTemplate }> = [];
  for (const key of plan) {
    const template = byKey.get(key);
    if (!template) {
      return null;
    }
    result.push({ key, template });
  }
  return result;
}
