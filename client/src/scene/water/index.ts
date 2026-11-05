// Вода акватории как самостоятельный модуль.
//
// Точка входа для сцены: createWaterSystem(scene, options) возвращает объект с
// единым интерфейсом (update / setEnabled / setQuality / setSettings / dispose).
// Если движок не тянет FFT-воду (WebGL1, WebGPU без WGSL-версии шейдеров, нет
// рендера в плавающие текстуры), модуль молча возвращает прежнюю воду проекта:
// сцена не падает, а в консоли и диагностике остаётся причина отката.

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { QualityLevel } from "../../domain/types";
import { createWater as createLegacyWater, type WaterView } from "../water";
import {
  DEFAULT_WATER_SETTINGS,
  WATER_QUALITY,
  WATER_LEVEL,
  type WaterQuality,
  type WaterSettings,
} from "./config";
import { OceanSim, checkOceanSupport, type OceanSupport } from "./oceanSim";
import {
  bindCascadeTextures,
  bindReflection,
  createOceanSurface,
  reflectionClearColor,
  type OceanSurface,
} from "./surface";
import { createOceanReflection } from "./reflection";

export type { WaterSettings } from "./config";
export { DEFAULT_WATER_SETTINGS, WATER_QUALITY } from "./config";

/** Что можно узнать о воде для диагностики и проверок. */
export interface WaterInfo {
  kind: "fft" | "legacy";
  ready: boolean;
  /** Причина отказа от FFT-воды (для kind = "legacy"). */
  fallbackReason: string;
  compileErrors: string[];
  fps: number;
  /** Стоимость обновления воды в кадре, мс (скользящее среднее). */
  updateMs: number;
  time: number;
  paused: boolean;
  enabled: boolean;
  reflections: boolean;
  reflectionActive: boolean;
  reflectionSize: number;
  reflectable: number;
  foam: boolean;
  windSpeed: number;
  waveGain: number;
  quality: QualityLevel;
  vertices: number;
  triangles: number;
}

export interface WaterSystem {
  kind: "fft" | "legacy";
  mesh: OceanSurface["mesh"] | WaterView["mesh"];
  update(dtSeconds: number, camera: Camera): void;
  setEnabled(enabled: boolean): void;
  setQuality(quality: QualityLevel): void;
  setSettings(partial: Partial<WaterSettings>): void;
  getSettings(): WaterSettings;
  getQuality(): WaterQuality;
  getInfo(): WaterInfo;
  dispose(): void;
}

export interface CreateWaterOptions {
  quality: QualityLevel;
  /** Начальные оттенки неба: из них же берётся очистка текстуры отражения. */
  horizon: Color3;
  zenith: Color3;
}


export function createWaterSystem(
  scene: Scene,
  options: CreateWaterOptions,
): WaterSystem {
  const quality = WATER_QUALITY[options.quality];
  const support: OceanSupport = checkOceanSupport(scene.getEngine());

  if (!support.supported) {
    console.warn(`[water] FFT-вода недоступна (${support.reason}); используется прежняя вода`);
    return createLegacyWaterSystem(scene, options, support.reason);
  }

  const settings: WaterSettings = { ...DEFAULT_WATER_SETTINGS };
  const sim = new OceanSim(scene, {
    windSpeed: settings.windSpeed,
    windDirection: settings.windDirection,
    fetchKm: settings.fetchKm,
  });

  const surface = createOceanSurface(scene, {
    rippleDistance: quality.rippleDistance,
    settings,
  });

  const reflection = createOceanReflection(scene, {
    size: quality.reflectionSize,
    water: surface.mesh,
    clearColor: reflectionClearColor(options.horizon),
  });
  bindReflection(surface.material, reflection.texture);

  const sun = scene.getLightByName("sun") as DirectionalLight | null;
  const sunDirection = sun
    ? sun.direction.scale(-1).normalize()
    : new Vector3(0.42, 0.82, -0.36).normalize();

  let layerEnabled = true;
  let ready = false;
  let updateMs = 0;
  let currentQuality = options.quality;
  let horizon = options.horizon.clone();
  let zenith = options.zenith.clone();

  const imageProcessing = scene.imageProcessingConfiguration;

  const applyVisibility = (): void => {
    // До готовности шейдеров поверхность не показываем: у неё ещё нет
    // каскадов FFT, и вместо воды был бы чёрный диск.
    surface.mesh.setEnabled(layerEnabled && ready);
  };
  applyVisibility();

  return {
    kind: "fft",
    mesh: surface.mesh,

    update(dtSeconds: number, camera: Camera): void {
      if (!layerEnabled) {
        return;
      }
      const started = performance.now();
      // Ограничение шага: после возврата во вкладку dt бывает в секунды, и
      // без среза волны прыгнули бы вперёд.
      const dt = Math.max(0, Math.min(dtSeconds, 0.05));
      if (!ready) {
        ready = sim.update(dt);
        if (!ready) {
          return;
        }
        applyVisibility();
      }
      if (!settings.paused) {
        sim.update(dt);
      }
      bindCascadeTextures(surface.material, sim.displacement, sim.slope);

      const target = (camera as ArcRotateCamera).target ?? camera.globalPosition;
      surface.update({
        camera: camera.globalPosition,
        time: sim.time,
        anchorX: target.x,
        sunDirection,
        exposure: imageProcessing.exposure,
        contrast: imageProcessing.contrast,
        toneMap: imageProcessing.toneMappingEnabled,
        fogDensity:
          scene.fogMode === Scene.FOGMODE_EXP2 || scene.fogMode === Scene.FOGMODE_EXP
            ? scene.fogDensity
            : 0,
        fogColor: scene.fogColor,
        horizon,
        zenith,
      });

      const spent = performance.now() - started;
      updateMs = updateMs === 0 ? spent : updateMs * 0.9 + spent * 0.1;
    },

    setEnabled(enabled: boolean): void {
      layerEnabled = enabled;
      applyVisibility();
      // Скрытая вода не должна стоить ни прохода отражений, ни расчёта волн.
      reflection.setEnabled(enabled && settings.reflections);
    },

    setQuality(next: QualityLevel): void {
      if (next === currentQuality) {
        return;
      }
      currentQuality = next;
      const profile = WATER_QUALITY[next];
      reflection.setSize(profile.reflectionSize);
      surface.setRippleDistance(profile.rippleDistance);
    },

    setSettings(partial: Partial<WaterSettings>): void {
      Object.assign(settings, partial);
      surface.setSettings(settings);
      sim.setParams({
        windSpeed: settings.windSpeed,
        windDirection: settings.windDirection,
        fetchKm: settings.fetchKm,
        timeScale: settings.timeScale,
      });
      if (partial.reflections !== undefined) {
        // Выключенный слой воды не включает проход отражений обратно.
        reflection.setEnabled(partial.reflections && layerEnabled);
      }
    },

    getSettings: () => ({ ...settings }),

    getQuality: () => WATER_QUALITY[currentQuality],

    getInfo(): WaterInfo {
      return {
        kind: "fft",
        ready,
        fallbackReason: "",
        compileErrors: sim.compileErrors,
        fps: Number(scene.getEngine().getFps().toFixed(1)),
        updateMs: Number(updateMs.toFixed(3)),
        time: Number(sim.time.toFixed(3)),
        paused: settings.paused,
        enabled: layerEnabled,
        reflections: settings.reflections,
        reflectionActive: reflection.isActive(),
        reflectionSize: reflection.size,
        reflectable: reflection.reflectableCount(),
        foam: settings.foam,
        windSpeed: settings.windSpeed,
        waveGain: settings.waveGain,
        quality: currentQuality,
        vertices: surface.mesh.getTotalVertices(),
        triangles: surface.mesh.getTotalIndices() / 3,
      };
    },

    dispose(): void {
      reflection.dispose();
      surface.dispose();
      sim.dispose();
    },
  };
}

/**
 * Прежняя вода проекта в том же интерфейсе. Используется как fallback и как
 * способ вернуться к старой воде без правок сцены.
 */
function createLegacyWaterSystem(
  scene: Scene,
  options: CreateWaterOptions,
  reason: string,
): WaterSystem {
  const view: WaterView = createLegacyWater(scene, 80, scene.getEngine().isWebGPU);
  const settings: WaterSettings = { ...DEFAULT_WATER_SETTINGS };
  let layerEnabled = true;
  let time = 0;
  let updateMs = 0;
  let currentQuality = options.quality;

  return {
    kind: "legacy",
    mesh: view.mesh,
    update(dtSeconds: number, camera: Camera): void {
      if (!layerEnabled) {
        return;
      }
      const started = performance.now();
      time += Math.max(0, Math.min(dtSeconds, 0.05));
      view.update(time, camera.globalPosition);
      const spent = performance.now() - started;
      updateMs = updateMs === 0 ? spent : updateMs * 0.9 + spent * 0.1;
    },
    setEnabled(enabled: boolean): void {
      layerEnabled = enabled;
      view.mesh.setEnabled(enabled);
    },
    setQuality(next: QualityLevel): void {
      currentQuality = next;
    },
    setSettings(partial: Partial<WaterSettings>): void {
      Object.assign(settings, partial);
    },
    getSettings: () => ({ ...settings }),
    getQuality: () => WATER_QUALITY[currentQuality],
    getInfo(): WaterInfo {
      return {
        kind: "legacy",
        ready: true,
        fallbackReason: reason,
        compileErrors: [],
        fps: Number(scene.getEngine().getFps().toFixed(1)),
        updateMs: Number(updateMs.toFixed(3)),
        time: Number(time.toFixed(3)),
        paused: false,
        enabled: layerEnabled,
        reflections: false,
        reflectionActive: false,
        reflectionSize: 0,
        reflectable: 0,
        foam: false,
        windSpeed: 0,
        waveGain: 0,
        quality: currentQuality,
        vertices: view.mesh.getTotalVertices(),
        triangles: view.mesh.getTotalIndices() / 3,
      };
    },
    dispose(): void {
      const material = view.mesh.material;
      view.mesh.dispose();
      material?.dispose();
    },
  };
}

/** Уровень воды в сцене (для внешних проверок). */
export const WATER_SURFACE_LEVEL = WATER_LEVEL;
