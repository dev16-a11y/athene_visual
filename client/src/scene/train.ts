import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Train } from "../domain/types";
import type { PortMaterials } from "./materials";
import { box, tagEntity } from "./helpers";
import type { EntityVisual } from "./entityVisual";
import {
  DEFAULT_CONSIST,
  TrainConsist,
  loadConsistTemplates,
  type ConsistPlacement,
} from "./railway";
import { displayedLoaded, vehicleOffsets } from "./railDrive";

/** Путь в сцене: головка рельса, ось пути и границы (см. `terminal.ts`). */
export const RAIL_TOP_Y = 2.35;
export const RAIL_Z = 87;
export const RAIL_MIN_X = -212;
export const RAIL_MAX_X = 212;

export function railPlacement(): ConsistPlacement {
  return {
    railTopY: RAIL_TOP_Y,
    trackZ: RAIL_Z,
    trackMinX: RAIL_MIN_X,
    trackMaxX: RAIL_MAX_X,
    cruiseSpeed: 4,
    acceleration: 0.3,
    dwellSeconds: 30,
  };
}

/**
 * Железнодорожный состав.
 *
 * Геометрия моделей приходит из пакета «Афина» (одна модель на машину),
 * движение считает `TrainConsist` в цикле отрисовки: скорость с ограничением
 * ускорения, колёса катятся по пройденному пути, вагоны стоят по сцепкам.
 * Пока модели грузятся (или если загрузка не удалась), на пути остаётся
 * простая болванка того же габарита — сцена не пустует.
 */
export function buildTrain(
  scene: Scene,
  materials: PortMaterials,
  root: TransformNode,
  shadow: ShadowGenerator,
  train: Train,
): EntityVisual {
  const trainRoot = new TransformNode("train", scene);
  trainRoot.parent = root;
  trainRoot.position.set(RAIL_MIN_X + 40, RAIL_TOP_Y, RAIL_Z);
  tagEntity(trainRoot, train.id);

  const placeholder = buildPlaceholder(scene, materials, trainRoot, shadow);
  let consist: TrainConsist | null = null;
  let loadedWagons = 0;

  const visual: EntityVisual = {
    id: train.id,
    kind: "train",
    root: trainRoot,
    meshes: placeholder,
    selectionMeshes: placeholder,
    markerY: 6,
    focusRadius: 230,
    update: (entity) => {
      if (entity.kind !== "train") {
        return;
      }
      loadedWagons = entity.loadedWagons;
      if (consist) {
        consist.setLoadedWagons(loadedForVisual(loadedWagons, entity));
      }
    },
    tick: (_timeSeconds, deltaSeconds) => {
      consist?.update(deltaSeconds);
    },
  };

  void loadConsistTemplates(scene, DEFAULT_CONSIST).then((templates) => {
    if (!templates || trainRoot.isDisposed()) {
      return;
    }
    consist = new TrainConsist(
      scene,
      trainRoot,
      railPlacement(),
      templates.map((item) => item.template),
      shadow,
    );
    consist.setLoadedWagons(loadedForVisual(loadedWagons, train));
    visual.consist = consist;

    const wagons = consist.vehicles
      .slice(1)
      .flatMap((vehicle) => vehicle.root.getChildMeshes());
    for (const mesh of placeholder) {
      shadow.removeShadowCaster(mesh, false);
      mesh.dispose();
    }
    visual.meshes = wagons;
    visual.selectionMeshes = consist.vehicles[0]!.root
      .getChildMeshes()
      .filter((mesh) => !/wheel|axle/i.test(mesh.name));
    tagEntity(trainRoot, train.id);
  });

  return visual;
}

/** Сколько вагонов показать загруженными при текущем составе. */
function loadedForVisual(loadedWagons: number, train: Train): number {
  return displayedLoaded(loadedWagons, train.wagons, DEFAULT_CONSIST.length - 1);
}

/**
 * Болванка на время загрузки моделей: один локомотив и вагоны по Pitch,
 * чтобы силуэт состава совпадал с будущим.
 */
function buildPlaceholder(
  scene: Scene,
  materials: PortMaterials,
  parent: TransformNode,
  shadow: ShadowGenerator,
): Mesh[] {
  const offsets = vehicleOffsets(
    DEFAULT_CONSIST.map((key) => (key === "shunter" ? 17.52 : 15)),
  );
  const meshes: Mesh[] = [];
  offsets.forEach((offset, index) => {
    const mesh = box(
      scene,
      `train-stub-${index}`,
      {
        width: index === 0 ? 17.2 : 14.4,
        height: index === 0 ? 4.3 : 3.6,
        depth: 3.1,
        x: -offset,
        y: (index === 0 ? 4.3 : 3.6) / 2,
      },
      index === 0 ? materials.steelBlueDark : materials.steelLight,
      parent,
    );
    shadow.addShadowCaster(mesh, false);
    meshes.push(mesh);
  });
  return meshes;
}
