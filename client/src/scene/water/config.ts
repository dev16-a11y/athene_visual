// Настройки воды: значения по умолчанию и профили качества.
//
// Регуляторы названы по смыслу: `waveGain` — относительный масштаб смещения
// вершин (не метры), `windSpeed` — скорость ветра JONSWAP в м/с (она задаёт
// форму спектра, а не высоту отдельной волны).

import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { QualityLevel } from "../../domain/types";

/** Настройки, которые можно менять без пересоздания сцены. */
export interface WaterSettings {
  /** Скорость ветра, м/с. Меняет спектр JONSWAP (пересчёт каскадов). */
  windSpeed: number;
  /** Направление ветра, градусы. */
  windDirection: number;
  /** Разгон ветра, км. */
  fetchKm: number;
  /** Относительная интенсивность волн: масштаб смещения поверхности. */
  waveGain: number;
  /** Сила мелкой ряби (наклоны в нормали). */
  rippleStrength: number;
  /** Планарные отражения включены. */
  reflections: boolean;
  /** Доля отражения в цвете поверхности. */
  reflectionStrength: number;
  /** Пена включена. */
  foam: boolean;
  /** Волны стоят (камера и остальная сцена живут). */
  paused: boolean;
  /** Множитель скорости времени волн. */
  timeScale: number;
  /** Цвет толщи воды в линейном пространстве. */
  deepColor: Color3;
  /** Цвет солнечного блика (линейный, до тональной компрессии). */
  sunColor: Color3;
  /** Порог якобиана, после которого появляется пена на гребнях. */
  foamThreshold: number;
  /** Пена у причала: 0 — выключена, 1 — полная. */
  shoreFoam: number;
}

/**
 * sRGB-хекс → линейное значение: сцена тонально сжимает и гаммирует кадр в
 * материалах, поэтому константы цвета воды задаются в линейном пространстве.
 */
export function linearFromHex(hex: string): Color3 {
  const srgb = Color3.FromHexString(hex);
  return new Color3(
    Math.pow(srgb.r, 2.2),
    Math.pow(srgb.g, 2.2),
    Math.pow(srgb.b, 2.2),
  );
}

export const DEFAULT_WATER_SETTINGS: WaterSettings = {
  // Прототип запускался с 5,8 м/с: волны заметные, но вода не превращается
  // в шторм у причала.
  windSpeed: 5.8,
  windDirection: 20,
  fetchKm: 35,
  waveGain: 0.24,
  rippleStrength: 1,
  reflections: true,
  reflectionStrength: 0.9,
  foam: true,
  paused: false,
  timeScale: 1,
  // Глубокий цвет воды: #21555a в sRGB соответствует линейным
  // (0,012; 0,090; 0,102) — тем же значениям, что в прототипе акватории.
  // Через ACES + гамму сцены они дают тёмный сине-зелёный, а не чёрный.
  deepColor: linearFromHex("#21555a"),
  sunColor: new Color3(1.35, 1.28, 1.08),
  foamThreshold: 0.65,
  shoreFoam: 0.25,
};

/** Профиль качества воды: разрешение отражения и дальность мелкой ряби. */
export interface WaterQuality {
  /** Сторона текстуры отражения (квадрат). */
  reflectionSize: number;
  /** Расстояние, после которого мелкая рябь затухает, м. */
  rippleDistance: number;
}

/**
 * Профиль качества меняет разрешение отражения и дальность мелкой ряби, но не
 * разрешение FFT: 128×128 задано переносом и не масштабируется автоматически.
 */
export const WATER_QUALITY: Record<QualityLevel, WaterQuality> = {
  low: { reflectionSize: 384, rippleDistance: 120 },
  medium: { reflectionSize: 768, rippleDistance: 260 },
  high: { reflectionSize: 1024, rippleDistance: 380 },
};

/** Шаг колец полярной сетки: 6,5% — у берега меньше метра, на горизонте десятки. */
export const SURFACE_RING_GROWTH = 1.065;

/** Уровень воды в сцене: причальная стенка стоит на y = 0. */
export const WATER_LEVEL = 0;
/**
 * Линия берега по Z. Причальная плита занимает z ∈ [0; 600], стенка висит
 * ниже нуля, поэтому вода заканчивается ровно на z = 0 и не заходит на сушу.
 */
export const SHORE_Z = 0;
/** Внутренний радиус полярной сетки, м (под камерой всегда есть детализация). */
export const SURFACE_INNER_RADIUS = 0.75;
/** Внешний радиус: дальше туман сцены всё равно съедает воду. */
export const SURFACE_OUTER_RADIUS = 6000;
