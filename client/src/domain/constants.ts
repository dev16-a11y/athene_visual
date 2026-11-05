import type { LayerKey, QualityLevel } from "./types";

export const PORT_NAME = "Атене";
export const TERMINAL_NAME = "Контейнерный терминал №1";
export const TERMINAL_ORIGIN_LABEL = "Локальная метрическая система координат";

export const STALE_AFTER_MS = 7_000;
export const OFFLINE_AFTER_MS = 20_000;
export const TICK_MS = 2_000;

export interface CameraPose {
  alpha: number;
  beta: number;
  radius: number;
  target: { x: number; y: number; z: number };
}

/**
 * Рабочий ракурс презентационного вида: камера над акваторией, причал идёт
 * диагональю, судно и краны занимают центр кадра, вода — передний план.
 * Угол обзора 0.7 рад (~40°) без широкоугольных искажений по краям.
 *
 * Камера отведена дальше прежнего (250 → 380): двор вырос до шести площадок
 * на 12 тысяч контейнеров, и в кадр должны попадать все, а не левая половина.
 */
export const HOME_CAMERA: CameraPose = {
  alpha: -1.5,
  beta: 0.98,
  radius: 800,
  target: { x: 150, y: 12, z: 170 },
};

/** Исходный ракурс до визуальной итерации — для сравнения «до/после». */
export const HOME_CAMERA_LEGACY: CameraPose = {
  alpha: -1.62,
  beta: 0.93,
  radius: 380,
  target: { x: 0, y: 6, z: 50 },
};

export const CAMERA_PRESETS: Record<string, CameraPose> = {
  hero: HOME_CAMERA,
  legacy: HOME_CAMERA_LEGACY,
};

export const CAMERA_FOV = 0.7;

export const LAYER_LABELS: Record<LayerKey, string> = {
  vessels: "Суда",
  cranes: "Причальные краны",
  containers: "Контейнерные площадки",
  rail: "Железная дорога",
  trucks: "Автотранспорт",
  water: "Акватория",
  warehouses: "Склады",
};

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: "Низкое",
  medium: "Среднее",
  high: "Высокое",
};

export const QUALITY_SCALE: Record<
  QualityLevel,
  { hardwareScaling: number; shadowMap: number; waterSegments: number }
> = {
  low: { hardwareScaling: 1.5, shadowMap: 512, waterSegments: 48 },
  medium: { hardwareScaling: 1.15, shadowMap: 1024, waterSegments: 80 },
  high: { hardwareScaling: 1, shadowMap: 2048, waterSegments: 128 },
};
