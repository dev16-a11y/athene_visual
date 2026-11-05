import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface BoxInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotationY?: number;
}

const template = VertexData.CreateBox({ size: 1 });
const templatePositions = template.positions ?? new Float32Array();
const templateNormals = template.normals ?? new Float32Array();
const templateIndices = template.indices ?? [];

export function mergeBoxes(
  scene: Scene,
  name: string,
  boxes: BoxInstance[],
  material: StandardMaterial,
  parent: TransformNode | null,
): Mesh {
  const vertexCount = templatePositions.length / 3;
  const positions = new Float32Array(boxes.length * vertexCount * 3);
  const normals = new Float32Array(boxes.length * vertexCount * 3);
  const indices = new Uint32Array(boxes.length * templateIndices.length);

  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  for (const instance of boxes) {
    const rotation = Matrix.RotationY(instance.rotationY ?? 0);
    const rotation3 = rotation;
    for (let index = 0; index < vertexCount; index += 1) {
      const px = (templatePositions[index * 3] ?? 0) * instance.width;
      const py = (templatePositions[index * 3 + 1] ?? 0) * instance.height;
      const pz = (templatePositions[index * 3 + 2] ?? 0) * instance.depth;
      const local = Vector3.TransformNormal(new Vector3(px, py, pz), rotation3);
      positions[positionOffset] = local.x + instance.x;
      positions[positionOffset + 1] = local.y + instance.y;
      positions[positionOffset + 2] = local.z + instance.z;
      positionOffset += 3;

      const nx = templateNormals[index * 3] ?? 0;
      const ny = templateNormals[index * 3 + 1] ?? 0;
      const nz = templateNormals[index * 3 + 2] ?? 0;
      const normal = Vector3.TransformNormal(new Vector3(nx, ny, nz), rotation3);
      normals[normalOffset] = normal.x;
      normals[normalOffset + 1] = normal.y;
      normals[normalOffset + 2] = normal.z;
      normalOffset += 3;
    }
    for (const index of templateIndices) {
      indices[indexOffset] = index + vertexOffset;
      indexOffset += 1;
    }
    vertexOffset += vertexCount;
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh, false);
  mesh.material = material;
  mesh.receiveShadows = true;
  mesh.isPickable = false;
  if (parent) {
    mesh.parent = parent;
  }
  return mesh;
}
