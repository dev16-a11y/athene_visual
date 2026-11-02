import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Crane } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, castShadows, cylinder, tagEntity } from "./helpers";
import type { EntityVisual } from "./entityVisual";

function strut(
  scene: Scene,
  name: string,
  from: Vector3,
  to: Vector3,
  diameter: number,
  material: StandardMaterial,
  parent: TransformNode,
): Mesh {
  const direction = to.subtract(from);
  const length = direction.length();
  const mesh = MeshBuilder.CreateCylinder(
    name,
    { height: length, diameter, tessellation: 8 },
    scene,
  );
  mesh.material = material;
  mesh.position.copyFrom(from.add(to).scale(0.5));
  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), rotation);
  mesh.rotationQuaternion = rotation;
  mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

export function buildCrane(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  crane: Crane,
): EntityVisual {
  const craneRoot = new TransformNode(`crane-${crane.name}`, scene);
  craneRoot.parent = root;
  craneRoot.position.set(crane.position.x, 2, crane.position.z);

  const mainMeshes: Mesh[] = [];
  const legs: Array<[number, number]> = [
    [-6.5, 8.5],
    [6.5, 8.5],
    [-6.5, -8.5],
    [6.5, -8.5],
  ];
  for (const [x, z] of legs) {
    mainMeshes.push(
      box(
        scene,
        "crane-leg",
        { width: 1.35, height: 19, depth: 1.35, x, y: 9.5, z },
        materials.steelBlue,
        craneRoot,
      ),
    );
  }
  box(
    scene,
    "crane-portal-a",
    { width: 15, height: 1.6, depth: 1.5, x: 0, y: 19, z: 8.5 },
    materials.steelBlue,
    craneRoot,
  );
  box(
    scene,
    "crane-portal-b",
    { width: 15, height: 1.6, depth: 1.5, x: 0, y: 19, z: -8.5 },
    materials.steelBlue,
    craneRoot,
  );
  box(
    scene,
    "crane-cross-a",
    { width: 1.5, height: 1.5, depth: 17, x: -6.5, y: 19, z: 0 },
    materials.steelBlue,
    craneRoot,
  );
  box(
    scene,
    "crane-cross-b",
    { width: 1.5, height: 1.5, depth: 17, x: 6.5, y: 19, z: 0 },
    materials.steelBlue,
    craneRoot,
  );

  box(
    scene,
    "crane-house",
    { width: 12.5, height: 6.5, depth: 8.5, x: 0, y: 22.6, z: 2.5 },
    materials.steelBlueDark,
    craneRoot,
  );
  box(
    scene,
    "crane-tower",
    { width: 4.6, height: 17, depth: 4.6, x: 0, y: 32, z: 3.5 },
    materials.steelBlue,
    craneRoot,
  );
  box(
    scene,
    "crane-apex",
    { width: 3.4, height: 3, depth: 3.4, x: 0, y: 41.6, z: 3.5 },
    materials.steelBlueDark,
    craneRoot,
  );
  const boom = box(
    scene,
    "crane-boom",
    { width: 2.8, height: 2.4, depth: 86, x: 0, y: 38.6, z: -22 },
    materials.steelBlue,
    craneRoot,
  );
  mainMeshes.push(boom);
  box(
    scene,
    "crane-boom-tip",
    { width: 3.2, height: 2.8, depth: 4, x: 0, y: 38.6, z: -64 },
    materials.steelBlueDark,
    craneRoot,
  );

  const backstayFrom = new Vector3(0, 42.6, 3.5);
  strut(scene, "crane-stay-a", backstayFrom, new Vector3(0, 39.6, -55), 0.42, materials.steelLight, craneRoot);
  strut(scene, "crane-stay-b", backstayFrom, new Vector3(-2.4, 39.6, 16), 0.38, materials.steelLight, craneRoot);
  strut(scene, "crane-stay-c", backstayFrom, new Vector3(2.4, 39.6, 16), 0.38, materials.steelLight, craneRoot);

  const trolleyRoot = new TransformNode("trolley", scene);
  trolleyRoot.parent = craneRoot;
  const trolley = box(
    scene,
    "crane-trolley",
    { width: 5, height: 1.7, depth: 5, y: 36.4 },
    materials.steelBlueDark,
    trolleyRoot,
  );
  mainMeshes.push(trolley);

  const spreaderRoot = new TransformNode("spreader", scene);
  spreaderRoot.parent = trolleyRoot;
  box(
    scene,
    "crane-spreader",
    { width: 6.5, height: 1.1, depth: 2.7 },
    materials.yellow,
    spreaderRoot,
  );
  const cables: Mesh[] = [];
  for (const offset of [-1.8, 1.8]) {
    const cable = cylinder(
      scene,
      "spreader-cable",
      0.12,
      1,
      { x: offset, y: 28 },
      materials.steelLight,
      trolleyRoot,
    );
    cables.push(cable);
  }
  const hangingContainer = box(
    scene,
    "crane-hanging-container",
    { width: 12.19, height: 2.59, depth: 2.44, y: -2 },
    materials.container[0] ?? materials.steelBlue,
    spreaderRoot,
  );
  hangingContainer.metadata = { skipShadow: true };

  box(
    scene,
    "crane-cabin",
    { width: 4.4, height: 3.6, depth: 3.4, x: 8.1, y: 30, z: 1.4 },
    materials.superstructure,
    craneRoot,
  );
  box(
    scene,
    "crane-cabin-glass",
    { width: 4.5, height: 1.6, depth: 3.5, x: 8.1, y: 30.4, z: 1.4 },
    materials.glass,
    craneRoot,
  );

  const beaconMaterial = new StandardMaterial(`crane-beacon-${crane.name}`, scene);
  beaconMaterial.emissiveColor = Color3.FromHexString("#7ee7a2");
  beaconMaterial.disableLighting = true;
  const beacon = cylinder(
    scene,
    "crane-beacon",
    1.4,
    1.2,
    { y: 43.8, z: 3.5, tessellation: 10 },
    beaconMaterial,
    craneRoot,
  );
  beacon.metadata = { skipShadow: true };

  tagEntity(craneRoot, crane.id);
  castShadows(shadow, craneRoot);

  let targetTrolleyZ = -30;
  let targetSpreaderY = 22;
  let currentSpreaderY = 22;
  const phase = crane.id.charCodeAt(crane.id.length - 1) * 0.8;
  hangingContainer.isVisible = crane.spreaderLoad === 1;

  const applyStatus = (status: Crane["status"]) => {
    if (status === "maintenance") {
      beaconMaterial.emissiveColor = Color3.FromHexString("#e3a72b");
    } else if (status === "warning" || status === "critical") {
      beaconMaterial.emissiveColor = Color3.FromHexString("#e0584d");
    } else {
      beaconMaterial.emissiveColor = Color3.FromHexString("#7ee7a2");
    }
  };
  applyStatus(crane.status);

  return {
    id: crane.id,
    kind: "crane",
    root: craneRoot,
    meshes: mainMeshes,
    selectionMeshes: mainMeshes,
    markerY: 3,
    focusRadius: 160,
    update: (entity) => {
      const current = entity as Crane;
      targetSpreaderY = current.spreaderLoad === 1 ? 19.5 : 25.5;
      hangingContainer.isVisible = current.spreaderLoad === 1;
      applyStatus(current.status);
    },
    tick: (time, deltaSeconds) => {
      targetTrolleyZ = -30 + Math.sin(time * 0.22 + phase) * 9;
      trolleyRoot.position.z +=
        (targetTrolleyZ - trolleyRoot.position.z) *
        Math.min(1, deltaSeconds * 1.4);
      currentSpreaderY +=
        (targetSpreaderY - currentSpreaderY) * Math.min(1, deltaSeconds * 1.1);
      spreaderRoot.position.y = currentSpreaderY;
      for (const cable of cables) {
        cable.scaling.y = Math.max(1, 36.4 - currentSpreaderY);
        cable.position.y = (36.4 + currentSpreaderY) / 2;
      }
    },
  };
}
