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
  box(
    scene,
    "land-base",
    { width: 1200, height: 4, depth: 600, x: 0, y: -0.08, z: 300 },
    materials.yard,
    roots.terminal,
  );
  const apron = box(
    scene,
    "quay-apron",
    { width: 440, height: 4, depth: 40, x: 0, y: 0, z: 20 },
    materials.apron,
    roots.terminal,
  );
  staticMeshes.push(apron);

  const yardGround = box(
    scene,
    "yard-ground",
    { width: 440, height: 4, depth: 265, x: 0, y: 0, z: 167.5 },
    materials.yard,
    roots.terminal,
  );
  staticMeshes.push(yardGround);

  const quayWall = box(
    scene,
    "quay-wall",
    { width: 440, height: 9, depth: 5, x: 0, y: -2.5, z: -2.5 },
    materials.quayWall,
    roots.terminal,
  );
  staticMeshes.push(quayWall);

  box(
    scene,
    "quay-safety-line",
    { width: 438, height: 0.06, depth: 0.4, x: 0, y: 2.05, z: 1.1 },
    materials.yellow,
    roots.terminal,
  );
  box(
    scene,
    "quay-safety-line-back",
    { width: 438, height: 0.06, depth: 0.4, x: 0, y: 2.05, z: 33 },
    materials.yellow,
    roots.terminal,
  );

  box(
    scene,
    "crane-rail-a",
    { width: 424, height: 0.14, depth: 0.22, x: 0, y: 2.08, z: 4.5 },
    materials.rail,
    roots.terminal,
  );
  box(
    scene,
    "crane-rail-b",
    { width: 424, height: 0.14, depth: 0.22, x: 0, y: 2.08, z: 23 },
    materials.rail,
    roots.terminal,
  );

  const road = box(
    scene,
    "port-road",
    { width: 424, height: 0.1, depth: 18, x: 0, y: 2.02, z: 59 },
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
  dash.isVisible = false;
  dash.isPickable = false;
  dash.parent = roots.terminal;
  const dashMatrices: number[] = [];
  for (let x = -206; x <= 206; x += 9) {
    dashMatrices.push(...Matrix.Translation(x, 2.09, 59.1).asArray());
  }
  dash.thinInstanceSetBuffer("matrix", new Float32Array(dashMatrices), 16, true);
  dash.alwaysSelectAsActiveMesh = true;

  const ballast = box(
    scene,
    "rail-ballast",
    { width: 424, height: 0.24, depth: 8.5, x: 0, y: 2.06, z: 87 },
    materials.ballast,
    roots.rail,
  );
  staticMeshes.push(ballast);
  box(
    scene,
    "rail-left",
    { width: 424, height: 0.16, depth: 0.16, x: 0, y: 2.27, z: 85.4 },
    materials.rail,
    roots.rail,
  );
  box(
    scene,
    "rail-right",
    { width: 424, height: 0.16, depth: 0.16, x: 0, y: 2.27, z: 88.6 },
    materials.rail,
    roots.rail,
  );

  const sleeper = MeshBuilder.CreateBox(
    "sleeper",
    { width: 2.5, height: 0.12, depth: 0.3 },
    scene,
  );
  sleeper.material = materials.ballast;
  sleeper.isVisible = false;
  sleeper.isPickable = false;
  sleeper.parent = roots.rail;
  const sleeperMatrices: number[] = [];
  for (let x = -210; x <= 210; x += 1.7) {
    sleeperMatrices.push(...Matrix.Translation(x, 2.19, 87).asArray());
  }
  sleeper.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(sleeperMatrices),
    16,
    true,
  );
  sleeper.alwaysSelectAsActiveMesh = true;

  const bollard = cylinder(
    scene,
    "bollard-base",
    1.4,
    1.8,
    { y: 2.9, tessellation: 10 },
    materials.steelLight,
    roots.terminal,
  );
  bollard.isVisible = false;
  bollard.isPickable = false;
  const bollardMatrices: number[] = [];
  for (let x = -208; x <= 208; x += 26) {
    bollardMatrices.push(...Matrix.Translation(x, 2.9, 0.2).asArray());
  }
  bollard.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(bollardMatrices),
    16,
    true,
  );
  bollard.alwaysSelectAsActiveMesh = true;

  for (const x of [-190, -110, -30, 50, 130, 200]) {
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

  groundText(scene, "terminal-mark", "TERMINAL 1", 70, 12, 20, 232, 2.07);

  const fenceRail = box(
    scene,
    "fence-rail",
    { width: 440, height: 0.12, depth: 0.12, x: 0, y: 3.6, z: 301 },
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
  fencePost.isVisible = false;
  fencePost.isPickable = false;
  fencePost.parent = roots.terminal;
  const fenceMatrices: number[] = [];
  for (let x = -218; x <= 218; x += 8) {
    fenceMatrices.push(...Matrix.Translation(x, 3.05, 301).asArray());
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
  rail: TransformNode;
  trucks: TransformNode;
  warehouses: TransformNode;
} {
  return {
    terminal: new TransformNode("root-terminal", scene),
    vessels: new TransformNode("root-vessels", scene),
    cranes: new TransformNode("root-cranes", scene),
    containers: new TransformNode("root-containers", scene),
    rail: new TransformNode("root-rail", scene),
    trucks: new TransformNode("root-trucks", scene),
    warehouses: new TransformNode("root-warehouses", scene),
  };
}
