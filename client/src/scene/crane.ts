import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Crane } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, castShadows, cylinder, tagEntity } from "./helpers";
import type { EntityVisual } from "./entityVisual";

/**
 * Стержень фермы: квадратный профиль, ориентированный по направлению.
 * Все стержни крана сливаются в один меш, поэтому количество примитивов
 * влияет только на геометрию, но не на число draw calls.
 */
function member(
  scene: Scene,
  name: string,
  from: Vector3,
  to: Vector3,
  thickness: number,
  material: StandardMaterial,
  parent: TransformNode,
): Mesh {
  const direction = to.subtract(from);
  const length = direction.length();
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: thickness, height: length, depth: thickness },
    scene,
  );
  mesh.position.copyFrom(from.add(to).scale(0.5));
  mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    direction.normalize(),
    new Quaternion(),
  );
  mesh.material = material;
  mesh.parent = parent;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  return mesh;
}

/**
 * Решётчатая ферма между двумя точками: 4 пояса, кольца жёсткости и
 * раскосы. Именно это даёт узнаваемый силуэт портального крана вместо
 * монолитных брусков.
 */
function lattice(
  scene: Scene,
  name: string,
  from: Vector3,
  to: Vector3,
  width: number,
  depth: number,
  material: StandardMaterial,
  parent: TransformNode,
  divisions: number,
): Mesh[] {
  const meshes: Mesh[] = [];
  const axis = to.subtract(from);
  const length = axis.length();
  const direction = axis.normalize();
  const helper =
    Math.abs(direction.y) > 0.9 ? new Vector3(1, 0, 0) : Vector3.Up();
  const side = Vector3.Cross(helper, direction).normalize();
  const up = Vector3.Cross(direction, side).normalize();
  const hw = width / 2;
  const hd = depth / 2;
  const corners: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  const pointAt = (t: number, corner: [number, number]) =>
    from
      .add(axis.scale(t))
      .add(side.scale(corner[0]))
      .add(up.scale(corner[1]));

  for (const corner of corners) {
    meshes.push(
      member(
        scene,
        `${name}-chord`,
        pointAt(0, corner),
        pointAt(1, corner),
        Math.min(0.34, Math.max(0.18, width * 0.16)),
        material,
        parent,
      ),
    );
  }

  const steps = Math.max(2, Math.min(divisions, Math.ceil(length / 5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    for (let k = 0; k < 4; k++) {
      meshes.push(
        member(
          scene,
          `${name}-ring`,
          pointAt(t, corners[k]),
          pointAt(t, corners[(k + 1) % 4]),
          0.13,
          material,
          parent,
        ),
      );
    }
    if (i < steps) {
      const next = (i + 1) / steps;
      for (let k = 0; k < 4; k++) {
        meshes.push(
          member(
            scene,
            `${name}-brace`,
            pointAt(t, corners[k]),
            pointAt(next, corners[(k + 1) % 4]),
            0.11,
            material,
            parent,
          ),
        );
      }
    }
  }
  return meshes;
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

  // Строим в локальных координатах крана на отдельном узле, затем сливаем
  // статику и переносим готовые меши под craneRoot.
  const buildRoot = new TransformNode(`crane-build-${crane.name}`, scene);
  const structure: Mesh[] = [];
  const BOOM_Y = 40;
  const TROLLEY_Y = 33.2;
  const LEG_TOP = 20;

  // Ходовые тележки на рельсах.
  for (const x of [-6.5, 6.5]) {
    for (const z of [-8.5, 8.5]) {
      structure.push(
        box(
          scene,
          "crane-bogie",
          { width: 3.6, height: 1.8, depth: 1.5, x, y: 0.9, z },
          materials.steelBlueDark,
          buildRoot,
        ),
      );
    }
  }

  // Опоры — решётчатые колонны.
  for (const x of [-6.5, 6.5]) {
    for (const z of [-8.5, 8.5]) {
      structure.push(
        ...lattice(
          scene,
          "crane-leg",
          new Vector3(x, 1.8, z),
          new Vector3(x, LEG_TOP, z),
          1.7,
          1.7,
          materials.steelBlue,
          buildRoot,
          4,
        ),
      );
    }
  }

  // Портал: поперечные и продольные связи по верху опор.
  for (const z of [-8.5, 8.5]) {
    structure.push(
      ...lattice(
        scene,
        "crane-portal",
        new Vector3(-6.5, LEG_TOP, z),
        new Vector3(6.5, LEG_TOP, z),
        1.9,
        1.9,
        materials.steelBlue,
        buildRoot,
        3,
      ),
    );
  }
  for (const x of [-6.5, 6.5]) {
    structure.push(
      ...lattice(
        scene,
        "crane-sill",
        new Vector3(x, LEG_TOP, -8.5),
        new Vector3(x, LEG_TOP, 8.5),
        1.6,
        1.6,
        materials.steelBlue,
        buildRoot,
        3,
      ),
    );
  }

  // Башня и опорная стойка стрелы.
  structure.push(
    ...lattice(
      scene,
      "crane-tower",
      new Vector3(0, LEG_TOP, 0),
      new Vector3(0, BOOM_Y + 3, 0),
      3.2,
      3.2,
      materials.steelBlue,
      buildRoot,
      6,
    ),
  );

  // Морская консоль (над судном) и тыловая (над площадкой).
  structure.push(
    ...lattice(
      scene,
      "crane-boom-sea",
      new Vector3(0, BOOM_Y, -4),
      new Vector3(0, TROLLEY_Y, -62),
      2.6,
      2.2,
      materials.steelBlue,
      buildRoot,
      11,
    ),
  );
  structure.push(
    ...lattice(
      scene,
      "crane-boom-land",
      new Vector3(0, BOOM_Y, -4),
      new Vector3(0, TROLLEY_Y + 0.6, 36),
      2.4,
      2.0,
      materials.steelBlue,
      buildRoot,
      8,
    ),
  );

  // Оттяжки от верха башни к консолям.
  structure.push(
    member(
      scene,
      "crane-stay-sea",
      new Vector3(0, BOOM_Y + 3, 0),
      new Vector3(0, TROLLEY_Y + 2, -46),
      0.3,
      materials.steelLight,
      buildRoot,
    ),
    member(
      scene,
      "crane-stay-sea-2",
      new Vector3(0, BOOM_Y + 3, 0),
      new Vector3(0, TROLLEY_Y + 2, 22),
      0.28,
      materials.steelLight,
      buildRoot,
    ),
  );

  // Машинное отделение и кабина оператора.
  const machinery = box(
    scene,
    "crane-house",
    { width: 11, height: 5.2, depth: 7.4, x: 0, y: 22.4, z: 2.6 },
    materials.steelBlueDark,
    buildRoot,
  );
  structure.push(machinery);
  for (let i = -3; i <= 3; i++) {
    structure.push(
      box(
        scene,
        "crane-louvre",
        { width: 9.4, height: 0.5, depth: 0.3, x: 0, y: 21.2 + i * 0.62, z: 6.4 },
        materials.steelLight,
        buildRoot,
      ),
    );
  }
  structure.push(
    box(
      scene,
      "crane-cabin",
      { width: 3.6, height: 3, depth: 3.2, x: 8.4, y: 25.4, z: 1.4 },
      materials.superstructure,
      buildRoot,
    ),
    box(
      scene,
      "crane-cabin-glass",
      { width: 3.7, height: 1.3, depth: 3.3, x: 8.4, y: 25.8, z: 1.4 },
      materials.glass,
      buildRoot,
    ),
  );

  // Слияние статики по материалам: 6 кранов дают ~30 draw calls вместо
  // тысяч, но корпус, машинное отделение и стекло сохраняют свои свойства.
  const groups = new Map<StandardMaterial, Mesh[]>();
  for (const mesh of structure) {
    const material = mesh.material as StandardMaterial;
    const bucket = groups.get(material);
    if (bucket) {
      bucket.push(mesh);
    } else {
      groups.set(material, [mesh]);
    }
  }
  const staticMeshes: Mesh[] = [];
  for (const [material, bucket] of groups) {
    if (bucket.length === 1) {
      bucket[0].parent = craneRoot;
      bucket[0].material = material;
      staticMeshes.push(bucket[0]);
      continue;
    }
    const merged = Mesh.MergeMeshes(bucket, true, true, undefined, false, false);
    if (!merged) {
      continue;
    }
    merged.name = `crane-${crane.name}-${material.name}`;
    merged.material = material;
    merged.parent = craneRoot;
    staticMeshes.push(merged);
  }
  buildRoot.dispose();

  const trolleyRoot = new TransformNode("trolley", scene);
  trolleyRoot.parent = craneRoot;
  trolleyRoot.position.set(0, TROLLEY_Y - 1.2, -30);
  const trolley = box(
    scene,
    "crane-trolley",
    { width: 4.4, height: 1.6, depth: 4.6 },
    materials.steelBlueDark,
    trolleyRoot,
  );

  const spreaderRoot = new TransformNode("spreader", scene);
  spreaderRoot.parent = craneRoot;
  box(
    scene,
    "crane-spreader",
    { width: 6.4, height: 0.9, depth: 2.6 },
    materials.yellow,
    spreaderRoot,
  );
  const cables: Mesh[] = [];
  for (const sx of [-2.1, 2.1]) {
    for (const sz of [-0.9, 0.9]) {
      cables.push(
        cylinder(
          scene,
          "spreader-cable",
          0.1,
          1,
          { x: sx, y: 0, z: sz },
          materials.steelLight,
          spreaderRoot,
        ),
      );
    }
  }
  const hangingContainer = box(
    scene,
    "crane-hanging-container",
    { width: 12.19, height: 2.59, depth: 2.44, y: -1.9 },
    materials.container[0] ?? materials.steelBlue,
    spreaderRoot,
  );
  hangingContainer.metadata = { skipShadow: true };

  const beaconMaterial = new StandardMaterial(`crane-beacon-${crane.name}`, scene);
  beaconMaterial.emissiveColor = Color3.FromHexString("#7ee7a2");
  beaconMaterial.disableLighting = true;
  const beacon = cylinder(
    scene,
    "crane-beacon",
    1.1,
    1.0,
    { y: BOOM_Y + 4.4, tessellation: 10 },
    beaconMaterial,
    craneRoot,
  );
  beacon.metadata = { skipShadow: true };

  tagEntity(craneRoot, crane.id);
  castShadows(shadow, craneRoot);

  let targetTrolleyZ = -30;
  let targetSpreaderY = 22;
  let currentSpreaderY = 26;
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

  const layoutSpreader = () => {
    spreaderRoot.position.set(
      trolleyRoot.position.x,
      currentSpreaderY,
      trolleyRoot.position.z,
    );
    const length = Math.max(0.8, TROLLEY_Y - 1.2 - currentSpreaderY);
    for (const cable of cables) {
      cable.scaling.y = length;
      cable.position.y = length / 2;
    }
  };
  layoutSpreader();

  return {
    id: crane.id,
    kind: "crane",
    root: craneRoot,
    meshes: [...staticMeshes, trolley],
    selectionMeshes: staticMeshes.length > 0 ? staticMeshes : [trolley],
    markerY: 3,
    focusRadius: 160,
    update: (entity) => {
      const current = entity as Crane;
      targetSpreaderY = current.spreaderLoad === 1 ? 20.5 : 26.5;
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
      layoutSpreader();
    },
  };
}
