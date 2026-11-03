/** Example adapter for an existing Babylon.js application.
 * Metres; scene.useRightHandedSystem = true before scene construction/imports.
 * Assets use +Z forward, Y up, railhead at Y=0.180.
 */
import { Scene, LoadAssetContainerAsync, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export type RailSpec = {
  couplerPitchMetres: number;
  wheelRadiusMetres: number;
};

export async function loadRailVehicle(
  scene: Scene, baseUrl: string, filename: string, spec: RailSpec,
) {
  if (!scene.useRightHandedSystem) {
    throw new Error('This example expects a right-handed scene; adapt forward direction for a left-handed app.');
  }
  const container = await LoadAssetContainerAsync(filename, scene, { rootUrl: baseUrl });
  container.addAllToScene();
  const root = new TransformNode(filename + '_placement', scene);
  // Parent only imported top-level nodes. Do not flatten the glTF hierarchy.
  for (const node of [...container.meshes, ...container.transformNodes]) {
    if (!node.parent) node.parent = root;
  }
  const wheels = container.meshes.filter(mesh => mesh.name.includes('_wheel_'));
  for (const wheel of wheels) {
    wheel.refreshBoundingInfo();
    wheel.setPivotPoint(wheel.getBoundingInfo().boundingBox.center.clone());
  }
  return {
    root, wheels, spec,
    setPosition(x: number, z: number, trackBaseY = 0) {
      root.position.copyFromFloats(x, trackBaseY, z);
    },
    /** Signed travelled distance, not frame count. Use with route interpolation. */
    roll(distanceMetres: number) {
      for (const wheel of wheels) {
        wheel.rotationQuaternion = null;
        // +Z translation corresponds to +X angular velocity in right-handed axes.
        wheel.rotation.x += distanceMetres / spec.wheelRadiusMetres;
      }
    },
    dispose() {
      container.dispose();
      root.dispose();
    },
  };
}

/** Place successive roots behind the lead vehicle on a straight +Z-oriented track. */
export function placeStraightTrain(
  vehicles: Array<{ root: TransformNode; spec: RailSpec }>,
  leadPosition: Vector3,
) {
  let offset = 0;
  vehicles.forEach((vehicle, i) => {
    if (i) offset += (vehicles[i - 1].spec.couplerPitchMetres + vehicle.spec.couplerPitchMetres) / 2;
    vehicle.root.position.copyFrom(leadPosition);
    vehicle.root.position.z -= offset;
  });
}
// Read spec values from connection_points.json. This file is an integration
// example, not a tested patch to your application's asset-loading architecture.
