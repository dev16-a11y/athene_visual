import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Rendering/outlineRenderer";
import "@babylonjs/core/Culling/ray";

import { HOME_CAMERA, QUALITY_SCALE } from "../domain/constants";
import type {
  DiagnosticsFrame,
  LayerKey,
  PortEntity,
  QualityLevel,
  Snapshot,
} from "../domain/types";
import { store } from "../state/store";
import { createMaterials, type PortMaterials } from "./materials";
import { buildTerminal, createTerminalRoots } from "./terminal";
import { createWater, type WaterView } from "./water";
import { buildYard } from "./yard";
import { buildVessel } from "./vessel";
import { buildCrane } from "./crane";
import { buildTruck } from "./truck";
import { buildTug } from "./tug";
import { buildTrain } from "./train";
import { buildWarehouses } from "./warehouses";
import type { EntityVisual } from "./entityVisual";

const OUTLINE_COLOR = "#3fd3ff";

export class PortScene {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly materials: PortMaterials;
  private readonly roots: ReturnType<typeof createTerminalRoots>;
  private readonly visuals = new Map<string, EntityVisual>();
  private shadow: ShadowGenerator;
  private water: WaterView;
  private readonly ring: Mesh;
  private readonly beam: Mesh;
  private readonly beamMaterial: StandardMaterial;
  private selectedDiameter = 0;
  private readonly instrumentation: SceneInstrumentation;
  private readonly resizeObserver: ResizeObserver;
  private pointerObserver: Observer<PointerInfo> | null = null;
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
  private lastTime = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    snapshot: Snapshot,
    onDiagnostics: (frame: DiagnosticsFrame) => void,
  ) {
    this.onDiagnostics = onDiagnostics;
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.scene = new Scene(this.engine);
    if (import.meta.env.DEV) {
      (window as unknown as { __smarttwinScene?: Scene }).__smarttwinScene = this.scene;
      (
        window as unknown as {
          __smarttwinDebug?: {
            projectEntity: (id: string, offsetY?: number) => unknown;
            disposeScene: () => { sceneDisposed: boolean };
            scene: Scene;
          };
        }
      ).__smarttwinDebug = {
        scene: this.scene,
        disposeScene: () => {
          this.dispose();
          return { sceneDisposed: this.scene.isDisposed };
        },
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
    this.scene.clearColor = Color3.FromHexString("#b9cedb").toColor4(1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = Color3.FromHexString("#c9d9e2");
    this.scene.fogDensity = 0.00085;
    this.scene.skipPointerMovePicking = true;
    this.instrumentation = new SceneInstrumentation(this.scene);

    this.camera = new ArcRotateCamera(
      "camera",
      HOME_CAMERA.alpha,
      HOME_CAMERA.beta,
      HOME_CAMERA.radius,
      new Vector3(HOME_CAMERA.target.x, HOME_CAMERA.target.y, HOME_CAMERA.target.z),
      this.scene,
    );
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
    hemi.intensity = 0.82;
    hemi.diffuse = Color3.FromHexString("#eef6fb");
    hemi.groundColor = Color3.FromHexString("#5c686f");

    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.42, -1, 0.32),
      this.scene,
    );
    sun.intensity = 1.55;
    sun.diffuse = Color3.FromHexString("#fff2dd");
    sun.position.set(210, 330, -230);
    this.shadow = this.createShadowGenerator(sun, "medium");

    this.materials = createMaterials(this.scene);
    this.roots = createTerminalRoots(this.scene);
    buildTerminal(this.scene, this.materials, {
      terminal: this.roots.terminal,
      rail: this.roots.rail,
    });
    this.water = createWater(this.scene, QUALITY_SCALE.medium.waterSegments);
    buildWarehouses(
      this.scene,
      this.materials,
      this.roots.warehouses,
      this.shadow,
    );

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
    this.engine.runRenderLoop(() => {
      if (!this.disposed) {
        this.scene.render();
      }
    });
    window.addEventListener("resize", this.handleWindowResize);
  }

  static create(
    canvas: HTMLCanvasElement,
    snapshot: Snapshot,
    onDiagnostics: (frame: DiagnosticsFrame) => void,
  ): PortScene {
    return new PortScene(canvas, snapshot, onDiagnostics);
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
    const entities: PortEntity[] = [
      ...snapshot.vessels,
      ...snapshot.cranes,
      ...snapshot.yards,
      ...snapshot.trucks,
      ...snapshot.tugs,
      snapshot.train,
    ];
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
    }
    if (this.selectedId) {
      this.applySelection();
    }
  }

  private buildVisual(entity: PortEntity): EntityVisual | null {
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
    const position = visual.root.position;
    const diameter =
      visual.kind === "vessel"
        ? 44
        : visual.kind === "yard" || visual.kind === "train"
          ? 34
          : visual.kind === "truck"
            ? 10
            : visual.kind === "tug"
              ? 18
              : 28;
    const y = position.y + visual.markerY;
    this.ring.setEnabled(true);
    this.ring.position.set(position.x, y, position.z);
    this.selectedDiameter = diameter;
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
    this.water.mesh.setEnabled(layers.water);
  }

  private setQuality(quality: QualityLevel, force = false): void {
    if (!force && quality === this.quality) {
      return;
    }
    this.quality = quality;
    const scale = QUALITY_SCALE[quality];
    this.engine.setHardwareScalingLevel(scale.hardwareScaling);
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

    const cameraPosition = this.camera.globalPosition;
    this.water.update(timeSeconds, cameraPosition);

    for (const visual of this.visuals.values()) {
      if (visual.dynamic) {
        const root = visual.root;
        const target = visual.dynamic.target;
        const dx = target.x - root.position.x;
        const dz = target.z - root.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > visual.dynamic.snapDistance) {
          root.position.set(target.x, target.y, target.z);
        } else {
          const amount = 1 - Math.exp(-deltaSeconds * 3.2);
          root.position.set(
            root.position.x + dx * amount,
            root.position.y + (target.y - root.position.y) * amount,
            root.position.z + dz * amount,
          );
        }
        const targetRotation = (visual.dynamic.targetHeading * Math.PI) / 180;
        let rotationDelta = targetRotation - root.rotation.y;
        while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
        while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
        root.rotation.y += rotationDelta * Math.min(1, deltaSeconds * 3);
      }
      visual.tick?.(timeSeconds, deltaSeconds);
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
      this.camera.alpha += (HOME_CAMERA.alpha - this.camera.alpha) * amount;
      this.camera.beta += (HOME_CAMERA.beta - this.camera.beta) * amount;
      this.camera.radius += (HOME_CAMERA.radius - this.camera.radius) * amount;
      this.camera.target.x += (HOME_CAMERA.target.x - this.camera.target.x) * amount;
      this.camera.target.y += (HOME_CAMERA.target.y - this.camera.target.y) * amount;
      this.camera.target.z += (HOME_CAMERA.target.z - this.camera.target.z) * amount;
      if (
        Math.abs(this.camera.alpha - HOME_CAMERA.alpha) < 0.002 &&
        Math.abs(this.camera.radius - HOME_CAMERA.radius) < 0.6
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

  private clampCameraTarget(): void {
    this.camera.target.x = Math.min(270, Math.max(-270, this.camera.target.x));
    this.camera.target.z = Math.min(340, Math.max(-140, this.camera.target.z));
    this.camera.target.y = Math.min(50, Math.max(0, this.camera.target.y));
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
      backend: this.engine.webGLVersion >= 2 ? "WebGL 2" : "WebGL 1",
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
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    const canvas = this.scene.getEngine().getRenderingCanvas();
    canvas?.removeEventListener("pointerdown", this.cancelFocusHandler);
    canvas?.removeEventListener("wheel", this.cancelFocusHandler);
    this.engine.stopRenderLoop();
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
