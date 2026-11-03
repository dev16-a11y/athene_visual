import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { EntityKind, PortEntity, Snapshot } from "../domain/types";
import type { EntityMotion } from "./motion";
import type { RouteKey } from "./routes";

export interface EntityVisual {
  id: string;
  kind: EntityKind;
  root: TransformNode;
  meshes: AbstractMesh[];
  selectionMeshes: AbstractMesh[];
  markerY: number;
  focusRadius: number;
  labelTitle?: string;
  /**
   * Признак подвижной техники. Положение и курс считает `EntityMotion` в
   * цикле отрисовки; `update` только складывает измерения в буфер.
   */
  dynamic?: {
    routeKey: RouteKey;
    /** Высота, на которой стоит модель (причал, вода). */
    baseY: number;
  };
  motion?: EntityMotion;
  update: (entity: PortEntity, snapshot: Snapshot) => void;
  tick?: (timeSeconds: number, deltaSeconds: number) => void;
  /**
   * Вызывается один раз после подмены параметрической геометрии GLB-моделью.
   * Построитель обязан заморозить логику, трогающую удалённую параметрику.
   */
  onModelSwap?: () => void;
}
