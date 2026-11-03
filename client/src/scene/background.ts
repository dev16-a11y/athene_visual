import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { PortMaterials } from "./materials";
import { box } from "./helpers";

/**
 * Промышленный фон терминала: дальние склады, силосы, дымовые трубы и
 * портальные рамы. Заполняет дальний план, который иначе оставался пустой
 * бетонной плитой до самого горизонта, и растворяется в дымке.
 *
 * Всё статично, не участвует в выборе и слито по материалам: фон не должен
 * стоить draw calls.
 */
export function buildBackground(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
): TransformNode {
  const background = new TransformNode("background-industry", scene);
  background.parent = root;
  const buckets = new Map<StandardMaterial, Mesh[]>();
  const add = (mesh: Mesh, material: StandardMaterial) => {
    mesh.material = material;
    mesh.parent = background;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    const bucket = buckets.get(material);
    if (bucket) {
      bucket.push(mesh);
    } else {
      buckets.set(material, [mesh]);
    }
  };

  // Дальняя линия складов: разная высота и шаг, чтобы силуэт не был ритмичным.
  const warehouseRow = [
    { x: -470, width: 96, height: 24 },
    { x: -350, width: 74, height: 31 },
    { x: -238, width: 108, height: 22 },
    { x: -108, width: 82, height: 34 },
    { x: 26, width: 118, height: 26 },
    { x: 168, width: 88, height: 30 },
    { x: 292, width: 104, height: 23 },
    { x: 418, width: 92, height: 33 },
    { x: 536, width: 110, height: 27 },
  ];
  for (const row of warehouseRow) {
    add(
      box(
        scene,
        "bg-warehouse",
        {
          width: row.width,
          height: row.height,
          depth: 56,
          x: row.x,
          y: row.height / 2,
          z: 392,
        },
        materials.warehouse,
        background,
      ),
      materials.warehouse,
    );
    add(
      box(
        scene,
        "bg-warehouse-roof",
        {
          width: row.width + 2,
          height: 1.4,
          depth: 58,
          x: row.x,
          y: row.height + 0.7,
          z: 392,
        },
        materials.roof,
        background,
      ),
      materials.roof,
    );
  }

  // Силосный корпус.
  for (let index = 0; index < 6; index++) {
    const silo = MeshBuilder.CreateCylinder(
      `bg-silo-${index}`,
      { height: 38, diameter: 17, tessellation: 14 },
      scene,
    );
    silo.position.set(-430 + index * 21, 19, 330);
    add(silo, materials.warehouse);
    const cap = MeshBuilder.CreateCylinder(
      `bg-silo-cap-${index}`,
      { height: 4, diameterTop: 4, diameterBottom: 17.4, tessellation: 14 },
      scene,
    );
    cap.position.set(-430 + index * 21, 40, 330);
    add(cap, materials.roof);
  }

  // Резервуарный парк.
  for (let index = 0; index < 4; index++) {
    const tank = MeshBuilder.CreateCylinder(
      `bg-tank-${index}`,
      { height: 14, diameter: 30, tessellation: 18 },
      scene,
    );
    tank.position.set(300 + index * 40, 9, 330);
    add(tank, materials.quayWall);
  }

  // Дымовые трубы дальнего предприятия.
  for (let index = 0; index < 4; index++) {
    const chimney = MeshBuilder.CreateCylinder(
      `bg-chimney-${index}`,
      { height: 64, diameterTop: 5, diameterBottom: 8, tessellation: 12 },
      scene,
    );
    chimney.position.set(-150 + index * 96, 32, 448);
    add(chimney, materials.warehouse);
  }

  // Портальные рамы и крановые эстакады между рядами складов.
  for (let index = 0; index < 5; index++) {
    const x = -420 + index * 210;
    for (const side of [-1, 1]) {
      add(
        box(
          scene,
          "bg-gantry-leg",
          { width: 1.6, height: 26, depth: 1.6, x: x + side * 30, y: 15, z: 300 },
          materials.steelLight,
          background,
        ),
        materials.steelLight,
      );
    }
    add(
      box(
        scene,
        "bg-gantry-beam",
        { width: 66, height: 2.2, depth: 2, x, y: 28.4, z: 300 },
        materials.steelLight,
        background,
      ),
      materials.steelLight,
    );
  }

  // Слияние фона по материалам.
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) {
      continue;
    }
    const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
    if (merged) {
      merged.name = `background-${material.name}`;
      merged.material = material;
      merged.parent = background;
      merged.isPickable = false;
    }
  }

  return background;
}
