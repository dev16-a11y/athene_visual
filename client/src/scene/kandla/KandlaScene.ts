// Сцена географической основы порта Кандла (Deendayal Port, Гуджарат).
//
// Здесь нет ни объектов, ни маршрутов, ни анимаций: только территория и
// акватория, восстановленные из OpenStreetMap. Сцена собирается по тем же
// правилам, что и демо-терминал (движок, камера, свет, вода, тонмаппинг), —
// поэтому управление камерой, качество и вода ведут себя привычно.
//
// Геопривязка: X — на восток, Z — на север, 1 единица = 1 метр, начало —
// KANDLA_AREA.origin (EPSG:32642). geoToWorld/worldToGeo в модуле geo.ts
// взаимно обратны, поэтому точка на карте и точка в сцене — одно и то же.

import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
// Побочный импорт: без него scene.pick и построение лучей падают — модуль
// подключает реализацию Ray, которую сам движок не тянет.
import "@babylonjs/core/Culling/ray";

import { CAMERA_FOV } from "../../domain/constants";
import { createPortEngine } from "../engine";
import type { CreatedEngine, PortEngine } from "../engine";
import type { DiagnosticsFrame, QualityLevel, Snapshot } from "../../domain/types";
import type { SceneLabel } from "../labels";
import { createWaterSystem, type WaterSystem } from "../water/index";
import { store } from "../../state/store";

import {
  KANDLA_AREA,
  KANDLA_CAMERA_LIMITS,
  KANDLA_COLORS,
  KANDLA_HEIGHTS,
  KANDLA_HOME,
  KANDLA_WATER,
} from "./config";
import { createGeoFrame, type GeoFrame } from "./geo";
import { loadKandlaLayers, type KandlaLayers } from "./layers";
import { createKandlaMaterials, type KandlaMaterials } from "./materials";
import { buildKandlaGround, type KandlaGroundStats } from "./meshes";
import { buildKandlaInfrastructure, type KandlaInfraStats } from "./infrastructure";

export interface KandlaInfo {
  kind: "kandla";
  stats: KandlaGroundStats;
  infrastructure: KandlaInfraStats;
  layers: {
    land: number;
    water: number;
    shoreline: number;
    quayFront: number;
    piers: number;
    openPiers: number;
    intertidal: number;
  };
  dataTimestamp: string | null;
  attribution: string;
  license: string;
}

export interface KandlaSceneOptions {
  onFrame: (frame: DiagnosticsFrame) => void;
  onLabels: (labels: SceneLabel[]) => void;
  onInfo?: (info: KandlaInfo) => void;
}

/**
 * Публичный интерфейс сцены — тот же, что у PortScene: App не должен знать,
 * какая именно сцена собрана.
 */
export interface SceneHandle {
  setSnapshot(snapshot: Snapshot): void;
  whenModelsReady(): Promise<void>;
  dispose(): void;
}

export class KandlaScene implements SceneHandle {
  private readonly engine: PortEngine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly water: WaterSystem;
  private readonly materials: KandlaMaterials;
  private readonly frame: GeoFrame;
  private readonly layers: KandlaLayers;
  private readonly stats: KandlaGroundStats;
  private readonly infraStats: KandlaInfraStats;
  private readonly options: KandlaSceneOptions;
  private readonly backend: CreatedEngine["backend"];
  private readonly instrumentation: SceneInstrumentation;
  private readonly unsubscribes: (() => void)[] = [];
  private readonly resizeObserver: ResizeObserver;

  private disposed = false;
  private returningHome = false;
  private lastFrameAt = 0;
  private lastDiagnosticsAt = 0;
  private renderedFrames = 0;

  private constructor(
    engine: PortEngine,
    backend: CreatedEngine["backend"],
    camera: ArcRotateCamera,
    scene: Scene,
    water: WaterSystem,
    materials: KandlaMaterials,
    frame: GeoFrame,
    layers: KandlaLayers,
    stats: KandlaGroundStats,
    infraStats: KandlaInfraStats,
    instrumentation: SceneInstrumentation,
    options: KandlaSceneOptions,
    canvas: HTMLCanvasElement,
  ) {
    this.engine = engine;
    this.backend = backend;
    this.scene = scene;
    this.camera = camera;
    this.water = water;
    this.materials = materials;
    this.frame = frame;
    this.layers = layers;
    this.stats = stats;
    this.infraStats = infraStats;
    this.instrumentation = instrumentation;
    this.options = options;
    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: KandlaSceneOptions,
  ): Promise<KandlaScene> {
    const { engine, backend } = await createPortEngine(canvas);
    const scene = new Scene(engine);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.12;
    scene.imageProcessingConfiguration.contrast = 1.16;
    scene.clearColor = Color3.FromHexString("#c2ddea").toColor4(1);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = Color3.FromHexString(KANDLA_COLORS.fog);
    // Обзорная сцена в разы крупнее демо-терминала: при прежней плотности
    // тумана дальний берег рукава уходил бы в молоко уже на 1,5 км.
    scene.fogDensity = 0.00011;
    scene.skipPointerMovePicking = true;

    const camera = new ArcRotateCamera(
      "camera",
      KANDLA_HOME.alpha,
      KANDLA_HOME.beta,
      KANDLA_HOME.radius,
      new Vector3(KANDLA_HOME.target.x, KANDLA_HOME.target.y, KANDLA_HOME.target.z),
      scene,
    );
    camera.fov = CAMERA_FOV;
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = KANDLA_CAMERA_LIMITS.lowerRadius;
    camera.upperRadiusLimit = KANDLA_CAMERA_LIMITS.upperRadius;
    camera.lowerBetaLimit = KANDLA_CAMERA_LIMITS.lowerBeta;
    camera.upperBetaLimit = KANDLA_CAMERA_LIMITS.upperBeta;
    camera.wheelDeltaPercentage = 0.02;
    camera.panningSensibility = 900;
    camera.inertia = 0.82;
    camera.minZ = KANDLA_CAMERA_LIMITS.minZ;
    camera.maxZ = KANDLA_CAMERA_LIMITS.maxZ;

    const hemi = new HemisphericLight("hemi", new Vector3(0.25, 1, 0.15), scene);
    hemi.intensity = 0.74;
    hemi.diffuse = Color3.FromHexString("#fff4e2");
    hemi.groundColor = Color3.FromHexString("#728795");

    const sun = new DirectionalLight("sun", new Vector3(-0.52, -0.82, 0.34), scene);
    sun.intensity = 2.0;
    sun.diffuse = Color3.FromHexString("#ffe7bd");
    sun.position.set(1200, 2200, -1400);

    const materials = createKandlaMaterials(scene);

    // Вода — полный круг: рукав огибает порт с востока, а внутренние бассейны
    // лежат западнее береговой линии. Половинный диск демо-терминала оставил
    // бы в них дыры.
    const water = createWaterSystem(scene, {
      quality: store.getState().quality,
      horizon: scene.fogColor.clone(),
      zenith: Color3.FromHexString("#5d93bd"),
      coverage: "full",
    });
    water.setSettings({
      windSpeed: KANDLA_WATER.windSpeed,
      waveGain: KANDLA_WATER.waveGain,
      rippleStrength: KANDLA_WATER.rippleStrength,
      reflectionStrength: KANDLA_WATER.reflectionStrength,
      shoreFoam: KANDLA_WATER.shoreFoam,
      // Вода рукава мутнее открытого моря: цвет задан в линейном пространстве,
      // как и остальные цвета модуля воды.
      deepColor: Color3.FromHexString(KANDLA_WATER.deepColorHex).toLinearSpace(),
    });

    // Данные: только подготовленные файлы из public/geo/kandla. Overpass
    // в рантайме не вызывается.
    const layers = await loadKandlaLayers();
    const frame = createGeoFrame(layers.meta.utmZone, layers.meta.origin);
    const { stats, meshes } = buildKandlaGround(scene, layers, materials);
    for (const mesh of meshes) {
      mesh.alwaysSelectAsActiveMesh = true;
    }
    // Дорожная сеть — плоские заглушки поверх суши: геометрия из OSM,
    // текстуры покрытий подключим позже. Меши сами добавляются в сцену и
    // всегда активны (в buildRibbonMesh).
    const { stats: infraStats } = buildKandlaInfrastructure(scene, layers, materials);

    const instrumentation = new SceneInstrumentation(scene);

    const instance = new KandlaScene(
      engine,
      backend,
      camera,
      scene,
      water,
      materials,
      frame,
      layers,
      stats,
      infraStats,
      instrumentation,
      options,
      canvas,
    );

    scene.onBeforeRenderObservable.add(() => instance.onFrame());
    scene.onAfterRenderObservable.add(() => instance.collectDiagnostics());
    engine.runRenderLoop(() => {
      if (!instance.disposed) {
        scene.render();
      }
    });

    window.addEventListener("resize", instance.handleWindowResize);
    let quality = store.getState().quality;
    let homeNonce = store.getState().cameraHomeNonce;
    const unsubscribeQuality = store.subscribe(() => {
      const state = store.getState();
      if (state.quality !== quality) {
        quality = state.quality;
        water.setQuality(state.quality);
      }
      if (state.cameraHomeNonce !== homeNonce) {
        homeNonce = state.cameraHomeNonce;
        instance.returningHome = true;
      }
    });
    instance.unsubscribes.push(unsubscribeQuality);

    options.onInfo?.(instance.getInfo());

    if (import.meta.env.DEV) {
      (window as unknown as { __smarttwinScene?: Scene }).__smarttwinScene = scene;
      (
        window as unknown as {
          __smarttwinDebug?: Record<string, unknown>;
        }
      ).__smarttwinDebug = {
        scene,
        mode: "kandla",
        geo: frame,
        layers,
        // Высоты уровней: проверки берут их отсюда, чтобы не дублировать числа.
        heights: KANDLA_HEIGHTS,
        // Проверки в браузере: сколько мешей, где суша, где вода.
        info: () => instance.getInfo(),
        cameraGeo: () => instance.getCameraGeo(),
        meshes: () =>
          scene.meshes
            .filter((mesh) => mesh.name.startsWith("kandla-"))
            .map((mesh) => ({
              name: mesh.name,
              vertices: mesh.getTotalVertices(),
              position: {
                x: Number(mesh.position.x.toFixed(2)),
                y: Number(mesh.position.y.toFixed(2)),
                z: Number(mesh.position.z.toFixed(2)),
              },
              minY: Number(mesh.getBoundingInfo().boundingBox.minimumWorld.y.toFixed(2)),
              maxY: Number(mesh.getBoundingInfo().boundingBox.maximumWorld.y.toFixed(2)),
            })),
        water: () => instance.waterInfo(),
      };
    }

    console.info(
      `[kandla] суша ${stats.landAreaKm2} км², мешей ${stats.landMeshes + stats.quayMeshes}, ` +
        `причальных оснований ${layers.quay.piers.length}, ` +
        `данные OSM ${layers.meta.dataTimestamp ?? "без отметки"}`,
    );
    return instance;
  }

  /** Снимок телеметрии к географии не относится: метод нужен для совместимости. */
  setSnapshot(_snapshot: Snapshot): void {
    // Объектов в этой сцене нет — обновлять нечего.
  }

  async whenModelsReady(): Promise<void> {
    // Данные уже загружены и меши построены: экран загрузки снимаем сразу.
  }

  getInfo(): KandlaInfo {
    return {
      kind: "kandla",
      stats: this.stats,
      infrastructure: this.infraStats,
      layers: {
        land: this.layers.land.length,
        water: this.layers.water.polygons.length,
        shoreline: this.layers.shoreline.length,
        quayFront: this.layers.quay.front.length,
        piers: this.layers.quay.piers.length,
        openPiers: this.layers.quay.openPiers.length,
        intertidal: this.layers.intertidal.length,
      },
      dataTimestamp: this.layers.meta.dataTimestamp,
      attribution: this.layers.meta.attribution,
      license: this.layers.meta.license,
    };
  }

  /** Что сейчас в центре кадра, в градусах: для карточки координат. */
  getCameraGeo(): { lon: number; lat: number; radius: number; beta: number } {
    const target = this.camera.target;
    const geo = this.frame.worldToGeo(target.x, target.z);
    return {
      lon: geo.lon,
      lat: geo.lat,
      radius: this.camera.radius,
      beta: this.camera.beta,
    };
  }

  /** Соответствие «градусы → метры» для проверок и подписей. */
  getGeoFrame(): GeoFrame {
    return this.frame;
  }

  /** Параметры воды: для проверок и диагностики. */
  waterInfo(): unknown {
    const info = this.water.getInfo();
    return {
      ...info,
      kind: this.water.kind,
    };
  }

  getArea(): typeof KANDLA_AREA {
    return KANDLA_AREA;
  }

  private onFrame(): void {
    const now = performance.now();
    const delta = this.lastFrameAt === 0 ? 0.016 : Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.renderedFrames += 1;
    this.water.update(delta, this.camera);
    this.animateCameraHome(delta);
    // Камеру держим в пределах области: за её краем данных нет.
    const target = this.camera.target;
    const limit = 4600;
    target.x = Math.max(-limit, Math.min(limit, target.x));
    target.z = Math.max(-limit, Math.min(limit, target.z));
    target.y = KANDLA_HEIGHTS.land;
  }

  /** Возврат к домашнему ракурсу — та же кнопка, что и в демо-сцене. */
  private animateCameraHome(deltaSeconds: number): void {
    if (!this.returningHome) {
      return;
    }
    const amount = 1 - Math.exp(-deltaSeconds * 3.5);
    this.camera.alpha += (KANDLA_HOME.alpha - this.camera.alpha) * amount;
    this.camera.beta += (KANDLA_HOME.beta - this.camera.beta) * amount;
    this.camera.radius += (KANDLA_HOME.radius - this.camera.radius) * amount;
    this.camera.target.x += (KANDLA_HOME.target.x - this.camera.target.x) * amount;
    this.camera.target.y += (KANDLA_HOME.target.y - this.camera.target.y) * amount;
    this.camera.target.z += (KANDLA_HOME.target.z - this.camera.target.z) * amount;
    if (
      Math.abs(this.camera.alpha - KANDLA_HOME.alpha) < 0.002 &&
      Math.abs(this.camera.radius - KANDLA_HOME.radius) < 0.6
    ) {
      this.returningHome = false;
    }
  }

  private collectDiagnostics(): void {
    const now = performance.now();
    if (now - this.lastDiagnosticsAt < 500) {
      return;
    }
    this.lastDiagnosticsAt = now;
    this.options.onFrame({
      fps: Math.round(this.engine.getFps()),
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      totalVertices: this.scene.getTotalVertices(),
      resolution: `${this.engine.getRenderWidth()}×${this.engine.getRenderHeight()}`,
      backend: this.backend,
    });
  }

  private handleWindowResize = (): void => {
    this.engine.resize();
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
    for (const unsubscribe of this.unsubscribes) {
      unsubscribe();
    }
    this.unsubscribes.length = 0;
    this.engine.stopRenderLoop();
    this.water.dispose();
    this.materials.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}

/** Качество сцены меняется из стора: сохраняем привычное поведение. */
export type { QualityLevel };
