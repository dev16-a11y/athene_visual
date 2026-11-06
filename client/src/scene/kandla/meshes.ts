// Меши территории Кандлы из подготовленных слоёв.
//
// Суша — плита: верх на высоте KANDLA_HEIGHTS.land, стенка уходит под воду,
// поэтому у берега нет щели и вода не «подтекает» под кромку. Причальные
// основания — отдельные плиты повыше: надводные площадки пирсов не должны
// превращать воду под ними в сушу, поэтому в маске суши их нет, а стоят они
// на своих опорах над водой.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import earcut from "earcut";
import "@babylonjs/core/Meshes/Builders/polygonBuilder";
import "@babylonjs/core/Meshes/Builders/boxBuilder";

import { KANDLA_COLORS, KANDLA_HEIGHTS } from "./config";
import type { IntertidalPolygon, KandlaLayers, LandPolygon, PierItem, Ring } from "./layers";
import { bankTint } from "./materials";
import type { KandlaMaterials } from "./materials";

export interface KandlaGroundStats {
  landMeshes: number;
  landTriangles: number;
  landVertices: number;
  quayMeshes: number;
  quayTriangles: number;
  intertidalMeshes: number;
  /** Площадь суши по данным слоя, км². */
  landAreaKm2: number;
}

/** Затемнение береговой стенки: цвет «bank» из палитры относительно суши. */
const BANK_TINT = bankTint(KANDLA_COLORS.land, KANDLA_COLORS.bank);
/** Бетон причальных оснований: стенка чуть темнее верха, но без «мокрого» вида. */
const QUAY_TINT = new Color3(0.9, 0.9, 0.9);

const toVector3 = (ring: Ring[]): Vector3[] =>
  ring.map(([x, z]) => new Vector3(x, 0, z));

/**
 * Вершинные цвета: верх плиты остаётся как есть, а стенки темнеют.
 * Без этого кромка берега сливается с водой — сверху её видно только по цвету,
 * а с воды не видно совсем: вертикальная стенка того же цвета, что и суша.
 */
function applySideTint(mesh: Mesh, tint: Color3): void {
  const positions = mesh.getVerticesData("position");
  const normals = mesh.getVerticesData("normal");
  if (!positions || !normals) return;
  const count = positions.length / 3;
  const colors = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    // Нормаль почти горизонтальна → это боковая грань плиты.
    const verticality = Math.abs(normals[index * 3 + 1]);
    const shade = verticality < 0.5 ? tint : Color3.White();
    colors[index * 4] = shade.r;
    colors[index * 4 + 1] = shade.g;
    colors[index * 4 + 2] = shade.b;
    colors[index * 4 + 3] = 1;
  }
  mesh.setVerticesData("color", colors, false, 4);
  mesh.useVertexColors = true;
  mesh.hasVertexAlpha = false;
}

/**
 * UV в мировых метрах: у полигонального билдера UV нормированы на габарит
 * меша, из-за чего плитка резиновая на объектах разного размера. Пишем
 * собственные UV — повтор текстуры становится честным «раз в N метров».
 */
export function applyWorldUv(mesh: Mesh, metresPerRepeat: number): void {
  const positions = mesh.getVerticesData("position");
  if (!positions) return;
  const uvs = new Float32Array((positions.length / 3) * 2);
  for (let index = 0; index < positions.length; index += 3) {
    uvs[(index / 3) * 2] = positions[index] / metresPerRepeat;
    uvs[(index / 3) * 2 + 1] = positions[index + 2] / metresPerRepeat;
  }
  mesh.setVerticesData("uv", uvs, false, 2);
}

/** Площадь кольца в м²: нужна, чтобы крупные материки строились первыми. */
function areaOf(ring: Ring[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area) / 2;
}

export function buildLandMeshes(
  scene: Scene,
  polygons: LandPolygon[],
  material: KandlaMaterials["land"],
): { meshes: Mesh[]; triangles: number; vertices: number } {
  const meshes: Mesh[] = [];
  let triangles = 0;
  let vertices = 0;
  // Крупные материки первыми: у островов меньше площадь, их видно поверх.
  const ordered = [...polygons].sort((a, b) => areaOf(b.outer) - areaOf(a.outer));
  ordered.forEach((polygon, index) => {
    const shape = toVector3(polygon.outer);
    const holes = polygon.holes
      .filter((hole) => hole.length >= 3)
      .map((hole) => toVector3(hole));
    const mesh = MeshBuilder.ExtrudePolygon(
      `kandla-land-${index}`,
      {
        shape,
        holes: holes.length ? holes : undefined,
        depth: KANDLA_HEIGHTS.slabDepth,
        sideOrientation: Mesh.FRONTSIDE,
        updatable: false,
      },
      scene,
      earcut,
    );
    // Полигональный билдер выдаёт плиту вниз от y = 0: поднимаем так, чтобы
    // верхняя грань встала ровно на проектную высоту суши.
    const bounds = mesh.getBoundingInfo().boundingBox;
    mesh.position.y = KANDLA_HEIGHTS.land - bounds.maximum.y;
    mesh.material = material;
    mesh.receiveShadows = false;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = false;
    mesh.doNotSyncBoundingInfo = false;
    applyWorldUv(mesh, 47);
    applySideTint(mesh, BANK_TINT);
    meshes.push(mesh);
    triangles += mesh.getTotalIndices() / 3;
    vertices += mesh.getTotalVertices();
  });
  return { meshes, triangles, vertices };
}

export function buildQuayMeshes(
  scene: Scene,
  quay: KandlaLayers["quay"],
  material: KandlaMaterials["quay"],
): { meshes: Mesh[]; triangles: number } {
  const meshes: Mesh[] = [];
  let triangles = 0;

  const add = (mesh: Mesh, tile: number, tint?: Color3) => {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    applyWorldUv(mesh, tile);
    if (tint) {
      applySideTint(mesh, tint);
    }
    meshes.push(mesh);
    triangles += mesh.getTotalIndices() / 3;
  };

  quay.piers.forEach((pier: PierItem, index) => {
    if (pier.coords.length < 4) return;
    const mesh = MeshBuilder.ExtrudePolygon(
      `kandla-pier-${index}`,
      {
        shape: toVector3(pier.coords),
        // Глубина с запасом: низ пирса должен быть ниже впадин волн, иначе
        // между основанием и водой появляется щель и пирс «висит».
        depth: KANDLA_HEIGHTS.quay + 2.4,
        sideOrientation: Mesh.FRONTSIDE,
        updatable: false,
      },
      scene,
      earcut,
    );
    const bounds = mesh.getBoundingInfo().boundingBox;
    mesh.position.y = KANDLA_HEIGHTS.quay - bounds.maximum.y;
    add(mesh, 22, QUAY_TINT);
  });

  // Открытые причалы размечены линией: показываем их узкой плитой на опорах.
  const openWidth = 8;
  quay.openPiers.forEach((pier, index) => {
    for (let i = 1; i < pier.coords.length; i += 1) {
      const [x1, z1] = pier.coords[i - 1];
      const [x2, z2] = pier.coords[i];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 1) continue;
      const box = MeshBuilder.CreateBox(
        `kandla-open-pier-${index}-${i}`,
        { width: openWidth, depth: length + openWidth, height: KANDLA_HEIGHTS.quay + 2.4 },
        scene,
      );
      box.position.set(
        (x1 + x2) / 2,
        KANDLA_HEIGHTS.quay - (KANDLA_HEIGHTS.quay + 2.4) / 2,
        (z1 + z2) / 2,
      );
      box.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      add(box, 22, QUAY_TINT);
    }
  });

  quay.breakwaters.forEach((line, index) => {
    for (let i = 1; i < line.coords.length; i += 1) {
      const [x1, z1] = line.coords[i - 1];
      const [x2, z2] = line.coords[i];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 1) continue;
      const box = MeshBuilder.CreateBox(
        `kandla-breakwater-${index}-${i}`,
        // Волнолом стоит в воде: высота с запасом ниже впадин волн.
        { width: 18, depth: length + 12, height: 3.8 },
        scene,
      );
      box.position.set((x1 + x2) / 2, 0.3, (z1 + z2) / 2);
      box.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      add(box, 22);
    }
  });

  return { meshes, triangles };
}

export function buildIntertidalMeshes(
  scene: Scene,
  polygons: IntertidalPolygon[],
  material: KandlaMaterials["intertidal"],
): { meshes: Mesh[]; triangles: number } {
  const meshes: Mesh[] = [];
  let triangles = 0;
  polygons.forEach((polygon, index) => {
    if (polygon.coords.length < 4) return;
    const mesh = MeshBuilder.CreatePolygon(
      `kandla-intertidal-${index}`,
      { shape: toVector3(polygon.coords), sideOrientation: Mesh.DOUBLESIDE },
      scene,
      earcut,
    );
    mesh.position.y = KANDLA_HEIGHTS.intertidal;
    mesh.material = material;
    mesh.isPickable = false;
    applyWorldUv(mesh, 33);
    meshes.push(mesh);
    triangles += mesh.getTotalIndices() / 3;
  });
  return { meshes, triangles };
}

export function buildKandlaGround(
  scene: Scene,
  layers: KandlaLayers,
  materials: KandlaMaterials,
): { stats: KandlaGroundStats; meshes: Mesh[] } {
  const land = buildLandMeshes(scene, layers.land, materials.land);
  const quay = buildQuayMeshes(scene, layers.quay, materials.quay);
  const intertidal = buildIntertidalMeshes(scene, layers.intertidal, materials.intertidal);

  const landAreaKm2 = layers.land.reduce((sum, polygon) => sum + polygon.areaKm2, 0);

  return {
    stats: {
      landMeshes: land.meshes.length,
      landTriangles: land.triangles,
      landVertices: land.vertices,
      quayMeshes: quay.meshes.length,
      quayTriangles: quay.triangles,
      intertidalMeshes: intertidal.meshes.length,
      landAreaKm2: +landAreaKm2.toFixed(2),
    },
    meshes: [...land.meshes, ...quay.meshes, ...intertidal.meshes],
  };
}
