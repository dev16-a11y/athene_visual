import { Scene } from "@babylonjs/core/scene";
import { createPortEngine } from "./engine";
import type { CreatedEngine, PortEngine } from "./engine";
import {
  addGroundCollider,
  countBodies,
  enablePhysics,
  spawnTestCrate,
} from "./physics";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Rendering/outlineRenderer";
import "@babylonjs/core/Culling/ray";

import { CAMERA_FOV, CAMERA_PRESETS, HOME_CAMERA, QUALITY_SCALE } from "../domain/constants";
import type { CameraPose } from "../domain/constants";
import type {
  DiagnosticsFrame,
  LayerKey,
  PortEntity,
  QualityLevel,
  Snapshot,
} from "../domain/types";
import { store } from "../state/store";
import { computeProgress } from "../metrics/progress";
import type { SceneLabel } from "./labels";
import { createMaterials, type PortMaterials } from "./materials";
import { buildTerminal, createTerminalRoots } from "./terminal";
import { createWaterSystem, type WaterInfo, type WaterSettings, type WaterSystem } from "./water/index";
import { WATER_LEVEL } from "./water/config";
import { swapInModel } from "./models";
import { resolveModelKey } from "./models";
import { buildYard } from "./yard";
import { buildVessel } from "./vessel";
import { buildCrane } from "./crane";
import { buildTruck } from "./truck";
import { buildTug } from "./tug";
import { buildTrain } from "./train";
import { railTemplateInfo } from "./railway";
import { buildWarehouses } from "./warehouses";
import { buildBackground } from "./background";
import type { EntityVisual } from "./entityVisual";
import { EntityMotion } from "./motion";
import { runMotionSelfTest } from "./motionSelfTest";
import { demoRoute } from "./routes";
import {
  planConvoy,
  TRUCK_GAP,
  TRUCK_LOOKAHEAD,
  type ConvoyMember,
} from "./traffic";

const OUTLINE_COLOR = "#3fd3ff";

/** Диаметр маркера выбора для разных типов объектов. */
function markerDiameter(kind: EntityVisual["kind"]): number {
  switch (kind) {
    case "vessel":
      return 44;
    case "yard":
    case "train":
      return 34;
    case "truck":
      return 10;
    case "tug":
      return 18;
    default:
      return 28;
  }
}

export class PortScene {
  private readonly engine: PortEngine;
  private readonly backend: string;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly homePose: CameraPose;
  private readonly materials: PortMaterials;
  private readonly roots: ReturnType<typeof createTerminalRoots>;
  private readonly visuals = new Map<string, EntityVisual>();
  private shadow: ShadowGenerator;
  private water: WaterSystem;
  private readonly ring: Mesh;
  private readonly beam: Mesh;
  private readonly beamMaterial: StandardMaterial;
  private selectedDiameter = 0;
  private readonly instrumentation: SceneInstrumentation;
  private readonly resizeObserver: ResizeObserver;
  private pointerObserver: Observer<PointerInfo> | null = null;
  private contextLost: { remove: () => void } | null = null;
  private contextRestored: { remove: () => void } | null = null;
  private unsubscribe: (() => void) | null = null;
  private snapshot: Snapshot | null = null;
  private selectedId: string | null = null;
  private quality: QualityLevel = "medium";
  private lastDiagnosticsAt = 0;
  private focusTarget: Vector3 | null = null;
  private focusRadius: number | null = null;
  private resetAnimation = false;
  private disposed = false;
  private onDiagnostics: (frame: DiagnosticsFrame) => void;
  private onLabels: ((labels: SceneLabel[]) => void) | null;
  private lastLabelsAt = 0;
  private lastTime = 0;
  private snapshotApplied = 0;
  private renderedFrames = 0;
  private headingTarget = Quaternion.Identity();
  private headingScratch = Quaternion.Identity();

  private constructor(
    canvas: HTMLCanvasElement,
    snapshot: Snapshot,
    created: CreatedEngine,
    onDiagnostics: (frame: DiagnosticsFrame) => void,
    onLabels?: (labels: SceneLabel[]) => void,
  ) {
    this.onDiagnostics = onDiagnostics;
    this.onLabels = onLabels ?? null;
    // Ракурс для сравнений: ?camera=legacy возвращает исходную композицию.
    const presetName =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("camera");
    this.homePose =
      (presetName ? CAMERA_PRESETS[presetName] : undefined) ?? HOME_CAMERA;
    this.engine = created.engine;
    this.backend = created.backend;
    this.scene = new Scene(this.engine);
    // Потеря GPU-контекста (сброс драйвера, сон устройства) — не крах сцены:
    // Babylon перевыделяет свои ресурсы при восстановлении, но без сигнала
    // пользователь видит замерший кадр без объяснений. После восстановления
    // FFT-вода пересчитывает спектр: содержимое float-текстур теряется.
    this.contextLost = this.engine.onContextLostObservable.add(() => {
      console.warn("[scene] контекст GPU потерян, ждём восстановления");
    });
    this.contextRestored = this.engine.onContextRestoredObservable.add(() => {
      console.info("[scene] контекст GPU восстановлен");
      this.water.resync?.();
    });
    if (import.meta.env.DEV) {
      (window as unknown as { __smarttwinScene?: Scene }).__smarttwinScene = this.scene;
      (
        window as unknown as {
          __smarttwinDebug?: {
            projectEntity: (id: string, offsetY?: number) => unknown;
            disposeScene: () => { sceneDisposed: boolean };
            enablePhysics: () => Promise<{ pluginName: string; bodies: number }>;
            spawnCrate: (x: number, y: number, z: number, size?: number) => Mesh;
            physicsBodies: () => number;
            motionProbe: (id?: string) => unknown;
            setMotionMode: (id: string, mode: "route" | "telemetry") => unknown;
            injectSample: (
              id: string,
              sample: { time: number; x: number; z: number; heading: number },
            ) => unknown;
            motionSelfTest: () => unknown;
            motionTrack: (id: string) => unknown;
            motionCounters: () => unknown;
            selectEntity: (id: string | null) => unknown;
            selectionMarker: () => unknown;
            trainProbe: () => unknown;
            trainState: () => unknown;
            trainStats: () => unknown;
            focusEntity: (id: string) => unknown;
            railProbe: () => Promise<unknown>;
            waterInfo: () => WaterInfo;
            waterSettings: (partial: Partial<WaterSettings>) => WaterInfo;
            waterLevel: () => number;
            trainSetX: (x: number) => unknown;
            scene: Scene;
          };
        }
      ).__smarttwinDebug = {
        scene: this.scene,
        motionProbe: (id?: string) => this.probeMotion(id),
        setMotionMode: (id: string, mode: "route" | "telemetry") => {
          this.visuals.get(id)?.motion?.setMode(mode);
          return this.probeMotion(id);
        },
        injectSample: (
          id: string,
          sample: { time: number; x: number; z: number; heading: number },
        ) => {
          const motion = this.visuals.get(id)?.motion;
          if (!motion) {
            return null;
          }
          motion.pushSample(sample);
          return this.probeMotion(id);
        },
        motionSelfTest: () => runMotionSelfTest(),
        motionTrack: (id: string) => this.visuals.get(id)?.motion?.trace() ?? null,
        motionCounters: () => ({
          frames: this.renderedFrames,
          snapshots: this.snapshotApplied,
        }),
        selectEntity: (id: string | null) => {
          store.select(id);
          return { selectedId: this.selectedId };
        },
        trainProbe: () => this.probeTrain(),
        trainState: () => this.visuals.get("train-01")?.consist?.snapshot() ?? null,
        trainStats: () => this.visuals.get("train-01")?.consist?.stats ?? null,
        focusEntity: (id: string) => {
          this.focusEntity(id);
          return { focused: id };
        },
        railProbe: () => railTemplateInfo(this.scene),
        waterInfo: (): WaterInfo => this.water.getInfo(),
        waterSettings: (partial: Partial<WaterSettings>) => {
          this.water.setSettings(partial);
          return this.water.getInfo();
        },
        waterLevel: () => WATER_LEVEL,
        trainSetX: (x: number) => {
          this.visuals.get("train-01")?.consist?.debugSetX(x);
          return this.probeTrain();
        },
        selectionMarker: () => ({
          selectedId: this.selectedId,
          enabled: this.ring.isEnabled(),
          x: Number(this.ring.position.x.toFixed(3)),
          z: Number(this.ring.position.z.toFixed(3)),
        }),
        disposeScene: () => {
          this.dispose();
          return { sceneDisposed: this.scene.isDisposed };
        },
        enablePhysics: async () => {
          await this.setupPhysics();
          return {
            pluginName: this.scene.getPhysicsEngine()?.getPhysicsPluginName() ?? "none",
            bodies: countBodies(this.scene),
          };
        },
        spawnCrate: (x: number, y: number, z: number, size = 2) =>
          spawnTestCrate(this.scene, new Vector3(x, y, z), size),
        physicsBodies: () => countBodies(this.scene),
        projectEntity: (id: string, offsetY = 6) => {
          const visual = this.visuals.get(id);
          if (!visual) {
            return null;
          }
          const position = visual.root.position;
          const point = new Vector3(
            position.x,
            position.y + offsetY,
            position.z,
          );
          return Vector3.Project(
            point,
            Matrix.IdentityReadOnly,
            this.scene.getTransformMatrix(),
            this.camera.viewport.toGlobal(
              this.engine.getRenderWidth(),
              this.engine.getRenderHeight(),
            ),
          );
        },
      };
    }
    // Тёплый дневной тон в духе референса: ACES-тонмаппинг сглаживает
    // пересветы и добавляет мягкий «плёночный» контраст.
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
    this.scene.imageProcessingConfiguration.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    this.scene.imageProcessingConfiguration.exposure = 1.15;
    this.scene.imageProcessingConfiguration.contrast = 1.22;
    this.scene.clearColor = Color3.FromHexString("#c2ddea").toColor4(1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = Color3.FromHexString("#d7e4e9");
    this.scene.fogDensity = 0.00085;
    this.scene.skipPointerMovePicking = true;
    this.instrumentation = new SceneInstrumentation(this.scene);

    this.camera = new ArcRotateCamera(
      "camera",
      this.homePose.alpha,
      this.homePose.beta,
      this.homePose.radius,
      new Vector3(this.homePose.target.x, this.homePose.target.y, this.homePose.target.z),
      this.scene,
    );
    this.camera.fov = CAMERA_FOV;
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 80;
    this.camera.upperRadiusLimit = 780;
    this.camera.lowerBetaLimit = 0.22;
    this.camera.upperBetaLimit = 1.42;
    this.camera.wheelDeltaPercentage = 0.018;
    this.camera.panningSensibility = 70;
    this.camera.inertia = 0.78;
    this.camera.minZ = 2;
    this.camera.maxZ = 3200;

    const hemi = new HemisphericLight(
      "hemi",
      new Vector3(0.25, 1, 0.15),
      this.scene,
    );
    // Тёплый свет сверху, прохладная «земля» от воды и бетона — так
    // формируется дневной баланс референса.
    hemi.intensity = 0.72;
    hemi.diffuse = Color3.FromHexString("#fff4e2");
    hemi.groundColor = Color3.FromHexString("#6d8492");

    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.52, -0.82, 0.34),
      this.scene,
    );
    sun.intensity = 2.1;
    sun.diffuse = Color3.FromHexString("#ffe7bd");
    sun.position.set(280, 420, -260);
    this.shadow = this.createShadowGenerator(sun, "medium");

    this.materials = createMaterials(this.scene);
    this.roots = createTerminalRoots(this.scene);
    buildTerminal(this.scene, this.materials, {
      terminal: this.roots.terminal,
      rail: this.roots.rail,
    });
    // Вода: FFT-каскады из прототипа акватории. Если движок не тянет
    // плавающие render targets, модуль сам отдаёт прежнюю воду проекта.
    this.water = createWaterSystem(this.scene, {
      quality: store.getState().quality,
      horizon: this.scene.fogColor.clone(),
      zenith: Color3.FromHexString("#5d93bd").scale(1),
    });
    if (this.water.kind === "legacy") {
      console.warn("[water] используется прежняя вода:", this.water.getInfo().fallbackReason);
    }
    buildWarehouses(
      this.scene,
      this.materials,
      this.roots.warehouses,
      this.shadow,
    );
    buildBackground(this.scene, this.materials, this.roots.terminal);

    const ringMaterial = this.materials.marker;
    this.ring = MeshBuilder.CreateTorus(
      "selection-ring",
      { diameter: 1, thickness: 0.035, tessellation: 64 },
      this.scene,
    );
    this.ring.material = ringMaterial;
    this.ring.isPickable = false;
    this.ring.setEnabled(false);

    const beamMaterial = this.materials.marker.clone("selection-beam-material");
    beamMaterial.alpha = 0.16;
    this.beamMaterial = beamMaterial;
    this.beam = MeshBuilder.CreateCylinder(
      "selection-beam",
      { diameter: 0.6, height: 1, tessellation: 12 },
      this.scene,
    );
    this.beam.material = beamMaterial;
    this.beam.isPickable = false;
    this.beam.setEnabled(false);

    this.setSnapshot(snapshot);
    this.installPicking();
    this.installInputCancel();
    this.installStoreSubscription();
    this.setQuality(store.getState().quality, true);
    this.applyLayers(store.getState().layers);

    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);

    this.scene.onBeforeRenderObservable.add(() => this.onFrame());
    this.scene.onAfterRenderObservable.add(() => this.collectDiagnostics());
    this.scene.onAfterRenderObservable.add(() => this.collectLabels());
    this.engine.runRenderLoop(() => {
      if (!this.disposed) {
        this.scene.render();
      }
    });
    window.addEventListener("resize", this.handleWindowResize);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // Физика включается только по запросу: Havok тянет 2 МБ WASM, и держать
    // его в обычном режиме просмотра незачем.
    const wantsPhysics =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("physics") === "1";
    if (wantsPhysics) {
      void this.setupPhysics();
    }
  }

  /**
   * Состояние движения для отладки и замеров в браузере. Только читает
   * отрендеренную трансформацию: вызов `sample()` здесь сдвигал бы маршрут.
   */
  private probeMotion(id?: string): unknown {
    const dataNow = Date.now() + store.getState().clockOffsetMs;
    const read = (visual: EntityVisual) => {
      const motion = visual.motion;
      if (!motion) {
        return null;
      }
      const rotation = visual.root.rotationQuaternion;
      const heading = rotation
        ? rotation.toEulerAngles().y
        : visual.root.rotation.y;
      return {
        id: visual.id,
        kind: visual.kind,
        root: {
          x: Number(visual.root.position.x.toFixed(3)),
          y: Number(visual.root.position.y.toFixed(3)),
          z: Number(visual.root.position.z.toFixed(3)),
          headingDeg: Number(((heading * 180) / Math.PI).toFixed(2)),
        },
        stats: motion.stats(dataNow),
      };
    };
    if (id) {
      const visual = this.visuals.get(id);
      return visual ? read(visual) : null;
    }
    return [...this.visuals.values()].map(read).filter(Boolean);
  }

  /**
   * Состояние состава и его габариты в мире: для проверок в браузере.
   * Показывает, где стоят машины, как легли колёса на рельс и что с грузом.
   */
  private probeTrain(): unknown {
    const visual = this.visuals.get("train-01");
    const consist = visual?.consist;
    if (!visual || !consist) {
      return { ready: false };
    }
    const vehicles = consist.vehicles.map((vehicle) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const mesh of vehicle.root.getChildMeshes()) {
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
      const wheels = vehicle.axles[0];
      wheels?.computeWorldMatrix(true);
      wheels?.refreshBoundingInfo(false, false);
      const wheelBox = wheels?.getBoundingInfo().boundingBox;
      return {
        key: vehicle.key,
        offset: Number(vehicle.offset.toFixed(3)),
        roll: Number(vehicle.roll.toFixed(3)),
        axles: vehicle.axles.length,
        cargo: vehicle.cargo.filter((mesh) => mesh.isEnabled()).length,
        cargoTotal: vehicle.cargo.length,
        bounds: {
          minX: Number(minX.toFixed(3)),
          maxX: Number(maxX.toFixed(3)),
          minY: Number(minY.toFixed(3)),
          maxY: Number(maxY.toFixed(3)),
          minZ: Number(minZ.toFixed(3)),
          maxZ: Number(maxZ.toFixed(3)),
        },
        wheelCentreZ: wheelBox
          ? Number(((wheelBox.minimumWorld.z + wheelBox.maximumWorld.z) / 2).toFixed(3))
          : null,
        rootY: Number(vehicle.root.position.y.toFixed(3)),
        wheelOrigin: wheels
          ? wheels.position.asArray().map((value) => Number(value.toFixed(2)))
          : null,
        rootWorldY: Number(vehicle.root.getAbsolutePosition().y.toFixed(3)),
        wheelSpanZ: wheelBox
          ? Number((wheelBox.maximumWorld.z - wheelBox.minimumWorld.z).toFixed(3))
          : null,
      };
    });
    return {
      ready: true,
      x: Number(consist.x.toFixed(3)),
      speed: Number(consist.speed.toFixed(3)),
      state: consist.state,
      bounds: consist.bounds,
      length: Number(consist.length.toFixed(2)),
      root: {
        x: Number(visual.root.position.x.toFixed(3)),
        y: Number(visual.root.position.y.toFixed(3)),
        z: Number(visual.root.position.z.toFixed(3)),
      },
      vehicles,
    };
  }

  private async setupPhysics(): Promise<void> {
    const handle = await enablePhysics(this.scene);
    addGroundCollider(this.scene, 2);
    console.info(
      `[physics] ${handle.pluginName}: тел ${countBodies(this.scene)}`,
    );
  }

  /**
   * Создание сцены асинхронное: WebGPU-движок инициализируется через
   * `initAsync()` (запрос адаптера, компиляция пайплайнов). Для WebGL 2
   * промис разрешается сразу — вызывающая сторона ожидает его единообразно.
   */
  static async create(
    canvas: HTMLCanvasElement,
    snapshot: Snapshot,
    onDiagnostics: (frame: DiagnosticsFrame) => void,
    onLabels?: (labels: SceneLabel[]) => void,
  ): Promise<PortScene> {
    const created = await createPortEngine(canvas);
    return new PortScene(canvas, snapshot, created, onDiagnostics, onLabels);
  }

  private createShadowGenerator(
    light: DirectionalLight,
    quality: QualityLevel,
  ): ShadowGenerator {
    const generator = new ShadowGenerator(
      QUALITY_SCALE[quality].shadowMap,
      light,
    );
    generator.useBlurExponentialShadowMap = true;
    generator.blurKernel = 28;
    generator.darkness = 0.38;
    generator.bias = 0.0015;
    generator.normalBias = 0.02;
    return generator;
  }

  private handleWindowResize = (): void => {
    this.engine.resize();
  };

  private installPicking(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP) {
        return;
      }
      const pick = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        (mesh: AbstractMesh) =>
          mesh.isPickable && typeof mesh.metadata?.entityId === "string",
      );
      if (pick?.hit && pick.pickedMesh) {
        const entityId = pick.pickedMesh.metadata?.entityId as string | undefined;
        if (entityId) {
          store.select(entityId);
          return;
        }
      }
      store.select(null);
    });
  }

  private installInputCancel(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    canvas?.addEventListener("pointerdown", this.cancelFocusHandler);
    canvas?.addEventListener("wheel", this.cancelFocusHandler, { passive: true });
  }

  private installStoreSubscription(): void {
    let previous = store.getState();
    this.selectedId = previous.selectedId;
    this.applySelection();
    this.unsubscribe = store.subscribe(() => {
      const state = store.getState();
      if (state.selectedId !== previous.selectedId) {
        this.selectedId = state.selectedId;
        this.applySelection();
      }
      if (state.quality !== previous.quality) {
        this.setQuality(state.quality);
      }
      if (state.layers !== previous.layers) {
        this.applyLayers(state.layers);
      }
      if (state.focus && state.focus !== previous.focus) {
        this.focusEntity(state.focus.entityId);
      }
      if (state.cameraHomeNonce !== previous.cameraHomeNonce) {
        this.resetCamera();
      }
      previous = state;
    });
  }

  setSnapshot(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    this.snapshotApplied += 1;
    const entities: PortEntity[] = [
      ...snapshot.vessels,
      ...snapshot.cranes,
      ...snapshot.yards,
      ...snapshot.trucks,
      ...snapshot.tugs,
      snapshot.train,
    ];
    const snapshotTime = Date.parse(snapshot.serverTime);
    for (const entity of entities) {
      let visual = this.visuals.get(entity.id);
      if (!visual) {
        const created = this.buildVisual(entity);
        if (created) {
          visual = created;
          this.visuals.set(entity.id, created);
        }
      }
      visual?.update(entity, snapshot);
      if (visual?.dynamic) {
        // Измерение попадает в буфер движения с меткой времени; положение
        // визуала из него посчитает цикл отрисовки, а не это сообщение.
        //
        // Разности не содержат неизменившихся объектов, поэтому у стоящей
        // машины своя метка времени замирает. Снимок же подтверждает всё своё
        // состояние на момент `serverTime` — его и берём как нижнюю границу.
        const motion = this.ensureMotion(visual, snapshot, entity);
        const own = this.serverTimeOf(entity.updatedAt);
        motion.pushSample({
          time: Number.isFinite(snapshotTime) ? Math.max(own, snapshotTime) : own,
          x: entity.position.x,
          z: entity.position.z,
          heading: (entity.heading * Math.PI) / 180,
        });
      }
    }
    if (this.selectedId) {
      this.applySelection();
    }
  }

  private ensureMotion(
    visual: EntityVisual,
    snapshot: Snapshot,
    entity: PortEntity,
  ): EntityMotion {
    if (!visual.motion) {
      const route =
        snapshot.mode === "demo" && visual.dynamic
          ? demoRoute(visual.dynamic.routeKey)
          : undefined;
      const motion = new EntityMotion(visual.id, { route });
      motion.seed(
        entity.position.x,
        entity.position.z,
        (entity.heading * Math.PI) / 180,
      );
      visual.motion = motion;
    }
    return visual.motion;
  }

  /**
   * Метка времени измерения в шкале сервера. Шкала рендера — `Date.now()` плюс
   * смещение серверных часов, поэтому смещение применяется ровно один раз.
   */
  private serverTimeOf(isoTimestamp: string): number {
    const parsed = Date.parse(isoTimestamp);
    if (!Number.isFinite(parsed)) {
      return Date.now() + store.getState().clockOffsetMs;
    }
    return parsed;
  }

  private buildVisual(entity: PortEntity): EntityVisual | null {
    const visual = this.buildParametricVisual(entity);
    const modelKey = resolveModelKey(entity.kind, entity.id);
    if (visual && modelKey) {
      this.swapModelAsync(visual, modelKey);
    }
    return visual;
  }

  private buildParametricVisual(entity: PortEntity): EntityVisual | null {
    switch (entity.kind) {
      case "vessel":
        return buildVessel(
          this.scene,
          this.materials,
          this.roots.vessels,
          this.shadow,
          entity,
        );
      case "crane":
        return buildCrane(
          this.scene,
          this.materials,
          this.roots.cranes,
          this.shadow,
          entity,
        );
      case "yard":
        return buildYard(
          this.scene,
          this.materials,
          this.roots.containers,
          this.shadow,
          entity,
        );
      case "truck":
        return buildTruck(
          this.scene,
          this.materials,
          this.roots.trucks,
          this.shadow,
          entity,
        );
      case "tug":
        return buildTug(
          this.scene,
          this.materials,
          this.roots.vessels,
          this.shadow,
          entity,
        );
      case "train":
        return buildTrain(
          this.scene,
          this.materials,
          this.roots.rail,
          this.shadow,
          entity,
        );
      default:
        return null;
    }
  }

  /**
   * Ленивая подмена параметрической геометрии внешней GLB-моделью.
   * Параметрика работает, пока модель грузится или если загрузка не удалась.
   */
  private swapModelAsync(visual: EntityVisual, modelKey: string): void {
    void swapInModel(
      this.scene,
      visual.root,
      modelKey,
      visual.id,
      this.shadow,
    ).then((result) => {
      if (!result || visual.root.isDisposed()) {
        return;
      }
      for (const mesh of visual.meshes) {
        this.shadow.removeShadowCaster(mesh, false);
        mesh.dispose();
      }
      visual.meshes = result.meshes;
      visual.selectionMeshes = result.meshes;
      visual.onModelSwap?.();
    });
  }

  private applySelection(): void {
    for (const visual of this.visuals.values()) {
      const selected = visual.id === this.selectedId;
      for (const mesh of visual.selectionMeshes) {
        mesh.renderOutline = selected;
        if (selected) {
          mesh.outlineColor = Color3.FromHexString(OUTLINE_COLOR);
          mesh.outlineWidth = visual.kind === "vessel" ? 0.22 : 0.13;
        }
      }
    }
    if (!this.selectedId) {
      this.ring.setEnabled(false);
      this.beam.setEnabled(false);
      return;
    }
    const visual = this.visuals.get(this.selectedId);
    if (!visual) {
      this.ring.setEnabled(false);
      this.beam.setEnabled(false);
      return;
    }
    this.placeSelectionMarkers(visual);
    this.selectedDiameter = markerDiameter(visual.kind);
  }

  /**
   * Маркер выбора ставится по отрендеренной позиции и обновляется каждый кадр:
   * иначе у движущейся машины он отставал бы до следующего сообщения.
   */
  private placeSelectionMarkers(visual: EntityVisual): void {
    const position = visual.root.position;
    const diameter = markerDiameter(visual.kind);
    const y = position.y + visual.markerY;
    this.ring.setEnabled(true);
    this.ring.position.set(position.x, y, position.z);
    this.ring.scaling.set(diameter, 1, diameter);
    this.beam.setEnabled(true);
    this.beam.position.set(position.x, y + 11, position.z);
    this.beam.scaling.set(1.6, 22, 1.6);
  }

  private focusEntity(entityId: string): void {
    const visual = this.visuals.get(entityId);
    if (!visual) {
      return;
    }
    const position = visual.root.position;
    this.focusTarget = new Vector3(
      position.x,
      position.y + visual.markerY * 0.4,
      position.z,
    );
    this.focusRadius = visual.focusRadius;
    this.resetAnimation = false;
  }

  private resetCamera(): void {
    this.focusTarget = null;
    this.focusRadius = null;
    this.resetAnimation = true;
  }

  private applyLayers(layers: Record<LayerKey, boolean>): void {
    this.roots.vessels.setEnabled(layers.vessels);
    this.roots.cranes.setEnabled(layers.cranes);
    this.roots.containers.setEnabled(layers.containers);
    this.roots.rail.setEnabled(layers.rail);
    this.roots.trucks.setEnabled(layers.trucks);
    this.roots.warehouses.setEnabled(layers.warehouses);
    this.water.setEnabled(layers.water);
  }

  private setQuality(quality: QualityLevel, force = false): void {
    if (!force && quality === this.quality) {
      return;
    }
    this.quality = quality;
    const scale = QUALITY_SCALE[quality];
    this.engine.setHardwareScalingLevel(scale.hardwareScaling);
    // Профиль воды: разрешение отражения и дальность мелкой ряби.
    this.water.setQuality(quality);
    const sun = this.scene.getLightByName("sun") as DirectionalLight | null;
    if (sun) {
      this.shadow.dispose();
      this.shadow = this.createShadowGenerator(sun, quality);
      for (const mesh of this.scene.meshes) {
        if (mesh.metadata?.shadowCaster === true) {
          this.shadow.addShadowCaster(mesh, false);
        }
      }
    }
  }

  private onFrame(): void {
    const now = performance.now();
    const deltaSeconds = this.lastTime === 0 ? 0.016 : Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const timeSeconds = now / 1000;
    this.renderedFrames += 1;

    // Вода обновляется до отрисовки кадра: сначала расчёт FFT, затем
    // материал поверхности. Время — секунды, а не кадры.
    this.water.update(deltaSeconds, this.camera);

    // Время данных: шкала сервера, приведённая к локальным часам. Движение
    // считается здесь, в цикле отрисовки, и не зависит от прихода сообщений.
    const dataNow = Date.now() + store.getState().clockOffsetMs;
    // Машины на общем маршруте видят друг друга: собираем их дуговые
    // координаты и ограничиваем подъезд к впереди идущей.
    const convoy: ConvoyMember[] = [];
    const truckRoute = demoRoute("truck-loop");
    for (const visual of this.visuals.values()) {
      if (visual.dynamic && visual.motion) {
        const pose = visual.motion.sample(dataNow);
        const root = visual.root;
        root.position.x = pose.x;
        root.position.z = pose.z;
        root.position.y = visual.dynamic.baseY;
        this.applyHeading(root, pose.heading, deltaSeconds);
        if (visual.kind === "truck") {
          if (visual.motion.getMode() === "route") {
            convoy.push({
              id: visual.id,
              s: truckRoute.project(pose.x, pose.z).s,
            });
          } else {
            // Реальные данные: маршрута нет, правило интервала неприменимо.
            visual.motion.setLeadLimit(null);
          }
        }
      }
      visual.tick?.(timeSeconds, deltaSeconds);
    }
    if (convoy.length > 0) {
      const limits =
        convoy.length > 1
          ? planConvoy(truckRoute.length, convoy, {
              gap: TRUCK_GAP,
              lookahead: TRUCK_LOOKAHEAD,
            })
          : new Map<string, number>();
      for (const member of convoy) {
        const motion = this.visuals.get(member.id)?.motion;
        motion?.setLeadLimit(limits.get(member.id) ?? null);
      }
    }

    // Маркер выбора идёт за отрендеренной позицией, а не за данными.
    if (this.selectedId) {
      const selected = this.visuals.get(this.selectedId);
      if (selected) {
        this.placeSelectionMarkers(selected);
      }
    }

    this.animateCamera(deltaSeconds);
    this.clampCameraTarget();

    if (this.selectedId) {
      const visual = this.visuals.get(this.selectedId);
      if (visual) {
        const pulse = 1 + Math.sin(timeSeconds * 2.4) * 0.018;
        this.ring.scaling.set(
          this.selectedDiameter * pulse,
          1,
          this.selectedDiameter * pulse,
        );
        this.beamMaterial.alpha = 0.13 + Math.sin(timeSeconds * 2.2) * 0.035;
      }
    }
  }

  private animateCamera(deltaSeconds: number): void {
    const amount = 1 - Math.exp(-deltaSeconds * 3.5);
    if (this.resetAnimation) {
      const home = this.homePose;
      this.camera.alpha += (home.alpha - this.camera.alpha) * amount;
      this.camera.beta += (home.beta - this.camera.beta) * amount;
      this.camera.radius += (home.radius - this.camera.radius) * amount;
      this.camera.target.x += (home.target.x - this.camera.target.x) * amount;
      this.camera.target.y += (home.target.y - this.camera.target.y) * amount;
      this.camera.target.z += (home.target.z - this.camera.target.z) * amount;
      if (
        Math.abs(this.camera.alpha - home.alpha) < 0.002 &&
        Math.abs(this.camera.radius - home.radius) < 0.6
      ) {
        this.resetAnimation = false;
      }
      return;
    }
    if (this.focusTarget) {
      this.camera.target.x += (this.focusTarget.x - this.camera.target.x) * amount;
      this.camera.target.y += (this.focusTarget.y - this.camera.target.y) * amount;
      this.camera.target.z += (this.focusTarget.z - this.camera.target.z) * amount;
      if (this.focusRadius !== null) {
        this.camera.radius += (this.focusRadius - this.camera.radius) * amount;
      }
      const distance = Vector3.Distance(this.camera.target, this.focusTarget);
      if (distance < 0.4) {
        this.focusTarget = null;
        this.focusRadius = null;
      }
    }
  }

  /**
   * Ориентация — через кватернионы: на разворотах курс доводится сликом,
   * без мгновенных перескоков и без «догоняющей» анимации по каждому
   * сообщению. Скорость доводки ограничена, поэтому поворот читается как
   * поворот, а не как рывок.
   */
  private applyHeading(
    root: TransformNode,
    heading: number,
    deltaSeconds: number,
  ): void {
    Quaternion.FromEulerAnglesToRef(0, heading, 0, this.headingTarget);
    if (!root.rotationQuaternion) {
      root.rotationQuaternion = this.headingTarget.clone();
      return;
    }
    const amount = 1 - Math.exp(-deltaSeconds * 6);
    Quaternion.SlerpToRef(
      root.rotationQuaternion,
      this.headingTarget,
      amount,
      this.headingScratch,
    );
    root.rotationQuaternion.copyFrom(this.headingScratch);
  }

  /**
   * Возврат во вкладку: накопленный разрыв не проигрываем — показываем
   * известное положение и ждём первое свежее измерение.
   */
  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      return;
    }
    const dataNow = Date.now() + store.getState().clockOffsetMs;
    for (const visual of this.visuals.values()) {
      if (!visual.motion) {
        continue;
      }
      visual.motion.resync(dataNow, {
        x: visual.root.position.x,
        z: visual.root.position.z,
        heading: visual.root.rotationQuaternion
          ? visual.root.rotationQuaternion.toEulerAngles().y
          : visual.root.rotation.y,
      });
    }
    // Большой скачок времени в onFrame дал бы рывок мира.
    this.lastTime = 0;
  };

  private clampCameraTarget(): void {
    this.camera.target.x = Math.min(270, Math.max(-270, this.camera.target.x));
    this.camera.target.z = Math.min(340, Math.max(-140, this.camera.target.z));
    this.camera.target.y = Math.min(50, Math.max(0, this.camera.target.y));
  }

  /**
   * Экранные подписи: мировая точка визуала проецируется в CSS-пиксели
   * канваса. Подписи за камерой и за границами кадра не отдаются.
   */
  private collectLabels(): void {
    if (!this.onLabels) {
      return;
    }
    const now = performance.now();
    if (now - this.lastLabelsAt < 90) {
      return;
    }
    this.lastLabelsAt = now;
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas) {
      return;
    }
    const width = canvas.clientWidth || this.engine.getRenderWidth();
    const height = canvas.clientHeight || this.engine.getRenderHeight();
    const viewport = this.camera.viewport.toGlobal(width, height);
    const transform = this.scene.getTransformMatrix();
    const labels: SceneLabel[] = [];
    for (const vessel of this.snapshot?.vessels ?? []) {
      const visual = this.visuals.get(vessel.id);
      if (!visual) {
        continue;
      }
      const point = Vector3.Project(
        new Vector3(
          visual.root.position.x,
          visual.root.position.y + 46,
          visual.root.position.z,
        ),
        Matrix.IdentityReadOnly,
        transform,
        viewport,
      );
      const progress = Math.round(
        computeProgress(vessel.completedTeu, vessel.plannedTeu),
      );
      // Подпись центрируется над объектом, поэтому её позиция прижимается к
      // кадру: иначе у края экрана карточка обрезается.
      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));
      labels.push({
        id: vessel.id,
        title: vessel.name,
        subtitle: `${vessel.operation === "loading" ? "погрузка" : "выгрузка"} · ${progress}% · причал ${vessel.berth}`,
        tone:
          vessel.status === "critical"
            ? "critical"
            : vessel.status === "warning"
              ? "warning"
              : "info",
        x: clamp(point.x, 96, width - 96),
        y: clamp(point.y, 110, height - 170),
        visible:
          point.z > 0 &&
          point.z < 1 &&
          point.x > 20 &&
          point.x < width - 20 &&
          point.y > 96 &&
          point.y < height - 150,
      });
    }
    this.onLabels(labels);
  }

  private collectDiagnostics(): void {
    const now = performance.now();
    if (now - this.lastDiagnosticsAt < 500) {
      return;
    }
    this.lastDiagnosticsAt = now;
    const resolution = `${this.engine.getRenderWidth()}×${this.engine.getRenderHeight()}`;
    this.onDiagnostics({
      fps: Math.round(this.engine.getFps()),
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      totalVertices: this.scene.getTotalVertices(),
      resolution,
      backend: this.backend,
    });
  }

  getSnapshot(): Snapshot | null {
    return this.snapshot;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.handleWindowResize);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    this.contextLost?.remove();
    this.contextLost = null;
    this.contextRestored?.remove();
    this.contextRestored = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const canvas = this.scene.getEngine().getRenderingCanvas();
    canvas?.removeEventListener("pointerdown", this.cancelFocusHandler);
    canvas?.removeEventListener("wheel", this.cancelFocusHandler);
    this.engine.stopRenderLoop();
    // Свои render targets, текстуры и проходы вода убирает сама: scene.dispose
    // не знает о кастомных цепочках расчёта волн.
    this.water.dispose();
    this.scene.dispose();
    this.engine.dispose();
    this.visuals.clear();
  }

  private cancelFocusHandler = (): void => {
    this.focusTarget = null;
    this.focusRadius = null;
    this.resetAnimation = false;
  };
}

