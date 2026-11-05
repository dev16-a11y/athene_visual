import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { PortMaterials } from "./materials";
import { box, cylinder, plane } from "./helpers";
import { GENERAL_CARGO_PAD } from "./generalCargo";
import "@babylonjs/core/Meshes/thinInstanceMesh";

export interface TerminalBuild {
  root: TransformNode;
  staticMeshes: Mesh[];
}

function groundText(
  scene: Scene,
  name: string,
  text: string,
  width: number,
  height: number,
  x: number,
  z: number,
  y = 2.06,
): Mesh {
  const texture = new DynamicTexture(
    `${name}-texture`,
    { width: 512, height: 256 },
    scene,
    true,
  );
  texture.hasAlpha = true;
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 256);
  context.fillStyle = "rgba(240, 244, 246, 0.92)";
  context.font = "700 148px 'Segoe UI', Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 132);
  texture.update(false);

  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;

  const mesh = plane(scene, name, width, height, material, null, { x, y, z }, {
    x: Math.PI / 2,
  });
  mesh.isPickable = false;
  return mesh;
}

export function buildTerminal(
  scene: Scene,
  materials: PortMaterials,
  roots: { terminal: TransformNode; rail: TransformNode },
): TerminalBuild {
  const staticMeshes: Mesh[] = [];
  // Плита суши под всей территорией: двор вырос, и «край мира» должен
  // оставаться за забором, а не сразу за штабелями. Восточный фланг отдан
  // генеральным грузам, поэтому суша шире контейнерного двора на 200 м.
  box(
    scene,
    "land-base",
    { width: 1700, height: 4, depth: 820, x: 100, y: -0.08, z: 410 },
    materials.yard,
    roots.terminal,
  );
  // Служебная зона между причалом и двором: дорога, железная дорога, склады.
  box(
    scene,
    "service-area",
    { width: 1700, height: 4, depth: 480, x: 100, y: -0.06, z: 250 },
    materials.road,
    roots.terminal,
  );
  const apron = box(
    scene,
    "quay-apron",
    { width: 1400, height: 4, depth: 40, x: 250, y: 0, z: 20 },
    materials.apron,
    roots.terminal,
  );
  staticMeshes.push(apron);

  // Открытая площадка генеральных грузов: своя плита, на 4 см ниже двора,
  // чтобы стык с сушей не мерцал.
  const cargoPad = box(
    scene,
    "cargo-pad",
    {
      width: GENERAL_CARGO_PAD.width,
      depth: GENERAL_CARGO_PAD.depth,
      height: 4,
      x: GENERAL_CARGO_PAD.x + GENERAL_CARGO_PAD.width / 2,
      y: GENERAL_CARGO_PAD.groundY - 2,
      z: GENERAL_CARGO_PAD.z + GENERAL_CARGO_PAD.depth / 2,
    },
    materials.yard,
    roots.terminal,
  );
  staticMeshes.push(cargoPad);


  // Верх площадки (y=2) копланарен апрону (тоже y=2): стыкуем без нахлёста,
  // z от 95 — иначе полоса между дорогой и двором мерцала бы z-fighting'ом.
  // Плита двора уже, чем плита генеральных грузов начинается сразу за ней:
  // нахлёст двух плит на разных уровнях дал бы мерцание стыка.
  const yardGround = box(
    scene,
    "yard-ground",
    { width: 680, height: 4, depth: 250, x: 0, y: 0, z: 220 },
    materials.yard,
    roots.terminal,
  );
  staticMeshes.push(yardGround);

  const quayWall = box(
    scene,
    "quay-wall",
    { width: 1700, height: 9, depth: 5, x: 100, y: -2.5, z: -2.5 },
    materials.quayWall,
    roots.terminal,
  );
  staticMeshes.push(quayWall);

  box(
    scene,
    "quay-safety-line",
    { width: 1398, height: 0.06, depth: 0.4, x: 250, y: 2.05, z: 1.1 },
    materials.yellow,
    roots.terminal,
  );
  box(
    scene,
    "quay-safety-line-back",
    { width: 1398, height: 0.06, depth: 0.4, x: 250, y: 2.05, z: 33 },
    materials.yellow,
    roots.terminal,
  );

  // Крановые рельсы: краны стоят на z = 12 (данные), колея тележек
  // параметрического крана ±8.5 — рельсы обязаны быть на 12 ∓ 8.5, иначе
  // тележки не встают на них (старые 4.5/23 были симметричны вокруг 13.75).
  box(
    scene,
    "crane-rail-a",
    { width: 884, height: 0.14, depth: 0.22, x: 0, y: 2.08, z: 3.5 },
    materials.rail,
    roots.terminal,
  );
  box(
    scene,
    "crane-rail-b",
    { width: 884, height: 0.14, depth: 0.22, x: 0, y: 2.08, z: 20.5 },
    materials.rail,
    roots.terminal,
  );

  const road = box(
    scene,
    "port-road",
    { width: 1140, height: 0.1, depth: 18, x: 250, y: 2.02, z: 59 },
    materials.road,
    roots.terminal,
  );
  staticMeshes.push(road);

  const dashMaterial = materials.white;
  const dash = MeshBuilder.CreateBox(
    "road-dash",
    { width: 3.2, height: 0.04, depth: 0.28 },
    scene,
  );
  dash.material = dashMaterial;
  // Мастер обязан быть видимым: thin instances рисуются только у активного
  // меша (гейт mesh.isVisible в scene._evaluateActiveMeshes), а сам мастер
  // не рисуется — его матрицы в буфере инстансов нет.
  dash.isVisible = true;
  dash.isPickable = false;
  dash.parent = roots.terminal;
  const dashMatrices: number[] = [];
  for (let x = -320; x <= 812; x += 9) {
    dashMatrices.push(...Matrix.Translation(x, 2.09, 59.1).asArray());
  }
  dash.thinInstanceSetBuffer("matrix", new Float32Array(dashMatrices), 16, true);
  dash.alwaysSelectAsActiveMesh = true;

  const ballast = box(
    scene,
    "rail-ballast",
    { width: 884, height: 0.24, depth: 6.4, x: 0, y: 2.06, z: 87 },
    materials.ballast,
    roots.rail,
  );
  staticMeshes.push(ballast);
  // Колея 1520 мм, как у моделей состава: внутренние грани головок на
  // Z = 87 ± 0,76. Верх головки — Y = 2,35, на нём и лежат колёса.
  box(
    scene,
    "rail-left",
    { width: 884, height: 0.16, depth: 0.16, x: 0, y: 2.27, z: 86.24 },
    materials.rail,
    roots.rail,
  );
  box(
    scene,
    "rail-right",
    { width: 884, height: 0.16, depth: 0.16, x: 0, y: 2.27, z: 87.76 },
    materials.rail,
    roots.rail,
  );

  const sleeper = MeshBuilder.CreateBox(
    "sleeper",
    { width: 2.5, height: 0.12, depth: 0.3 },
    scene,
  );
  sleeper.material = materials.ballast;
  sleeper.isVisible = true;
  sleeper.isPickable = false;
  sleeper.parent = roots.rail;
  const sleeperMatrices: number[] = [];
  for (let x = -440; x <= 440; x += 1.7) {
    sleeperMatrices.push(...Matrix.Translation(x, 2.19, 87).asArray());
  }
  sleeper.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(sleeperMatrices),
    16,
    true,
  );
  sleeper.alwaysSelectAsActiveMesh = true;

  // Матрица инстанса преумножается на мировую матрицу мастера
  // (instancesVertex: finalWorld = world * finalWorld), поэтому смещение
  // по Y живёт только в матрицах: y=2.9 в опциях дало бы кнехты на 5.8.
  const bollard = cylinder(
    scene,
    "bollard-base",
    1.4,
    1.8,
    { tessellation: 10 },
    materials.steelLight,
    roots.terminal,
  );
  bollard.isVisible = true;
  bollard.isPickable = false;
  const bollardMatrices: number[] = [];
  for (let x = -440; x <= 940; x += 26) {
    bollardMatrices.push(...Matrix.Translation(x, 2.9, 0.2).asArray());
  }
  bollard.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(bollardMatrices),
    16,
    true,
  );
  bollard.alwaysSelectAsActiveMesh = true;

  for (const x of [-420, -336, -252, -168, -84, 0, 84, 168, 252, 336, 420, 504, 672, 840]) {
    const mast = cylinder(
      scene,
      `light-mast-${x}`,
      0.55,
      19,
      { x, y: 11.5, z: 43.5, tessellation: 8 },
      materials.steelLight,
      roots.terminal,
    );
    staticMeshes.push(mast);
    box(
      scene,
      `light-head-${x}`,
      { width: 3.2, height: 0.7, depth: 1.4, x, y: 21, z: 42.6 },
      materials.lamp,
      roots.terminal,
    );
  }

  for (const [text, x] of [
    ["02", -108],
    ["03", 108],
  ] as const) {
    groundText(scene, `berth-${text}`, text, 30, 15, x, 27.5);
  }

  groundText(scene, "terminal-mark", "TERMINAL 1", 70, 12, 20, 384, 1.98);
  // Разметка площадки генеральных грузов: между рядами длинномеров и блоком
  // штучных грузов остаётся проезд, в него и ложится надпись.
  groundText(scene, "cargo-mark", "GENERAL CARGO", 84, 12, 520, 300, 1.99);

  const fenceRail = box(
    scene,
    "fence-rail",
    { width: 1700, height: 0.12, depth: 0.12, x: 100, y: 3.6, z: 520 },
    materials.steelLight,
    roots.terminal,
  );
  staticMeshes.push(fenceRail);
  const fencePost = MeshBuilder.CreateBox(
    "fence-post",
    { width: 0.16, height: 1.7, depth: 0.16 },
    scene,
  );
  fencePost.material = materials.steelLight;
  fencePost.isVisible = true;
  fencePost.isPickable = false;
  fencePost.parent = roots.terminal;
  const fenceMatrices: number[] = [];
  for (let x = -746; x <= 946; x += 8) {
    fenceMatrices.push(...Matrix.Translation(x, 3.05, 520).asArray());
  }
  fencePost.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(fenceMatrices),
    16,
    true,
  );
  fencePost.alwaysSelectAsActiveMesh = true;

  const skySphere = MeshBuilder.CreateSphere(
    "sky",
    { diameter: 2600, segments: 24 },
    scene,
  );
  skySphere.material = materials.sky;
  skySphere.infiniteDistance = true;
  skySphere.isPickable = false;
  skySphere.applyFog = false;
  skySphere.alwaysSelectAsActiveMesh = true;

  return { root: roots.terminal, staticMeshes };
}

export function createTerminalRoots(scene: Scene): {
  terminal: TransformNode;
  vessels: TransformNode;
  cranes: TransformNode;
  containers: TransformNode;
  cargo: TransformNode;
  /** Портальные и мобильные краны площадки генеральных грузов. */
  cargoCranes: TransformNode;
  rail: TransformNode;
  trucks: TransformNode;
  warehouses: TransformNode;
} {
  return {
    terminal: new TransformNode("root-terminal", scene),
    vessels: new TransformNode("root-vessels", scene),
    cranes: new TransformNode("root-cranes", scene),
    containers: new TransformNode("root-containers", scene),
    cargo: new TransformNode("root-cargo", scene),
    cargoCranes: new TransformNode("root-cargo-cranes", scene),
    rail: new TransformNode("root-rail", scene),
    trucks: new TransformNode("root-trucks", scene),
    warehouses: new TransformNode("root-warehouses", scene),
  };
}
