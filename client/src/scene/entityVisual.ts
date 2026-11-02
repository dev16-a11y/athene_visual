import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { EntityKind, PortEntity, Snapshot } from "../domain/types";

export interface EntityVisual {
  id: string;
  kind: EntityKind;
  root: TransformNode;
  meshes: AbstractMesh[];
  selectionMeshes: AbstractMesh[];
  markerY: number;
  focusRadius: number;
  labelTitle?: string;
  dynamic?: {
    target: Vector3;
    targetHeading: number;
    snapDistance: number;
  };
  update: (entity: PortEntity, snapshot: Snapshot) => void;
  tick?: (timeSeconds: number, deltaSeconds: number) => void;
}
