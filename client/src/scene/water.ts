import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

const VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main(void) {
  vec3 p = position;
  float t = uTime;
  float h = sin(p.x * 0.035 + t * 0.85) * 0.42
          + sin(p.z * 0.052 - t * 1.12) * 0.28
          + sin((p.x + p.z) * 0.091 + t * 1.55) * 0.14;
  float dx = cos(p.x * 0.035 + t * 0.85) * 0.42 * 0.035
           + cos((p.x + p.z) * 0.091 + t * 1.55) * 0.14 * 0.091;
  float dz = cos(p.z * 0.052 - t * 1.12) * 0.28 * 0.052
           + cos((p.x + p.z) * 0.091 + t * 1.55) * 0.14 * 0.091;
  p.y += h;
  vNormal = normalize(vec3(-dx, 1.0, -dz));
  vec4 worldPosition = world * vec4(p, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = worldViewProjection * vec4(p, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
uniform vec3 uCameraPosition;
uniform vec3 uSunDir;
uniform float uTime;
void main(void) {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
  vec3 deep = vec3(0.018, 0.135, 0.205);
  vec3 shallow = vec3(0.075, 0.345, 0.415);
  vec3 color = mix(deep, shallow, clamp(viewDir.y * 1.8, 0.0, 1.0) * 0.55);
  color = mix(color, vec3(0.52, 0.70, 0.80), fresnel * 0.55);
  vec3 halfDir = normalize(uSunDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), 190.0) * 1.7;
  float ripples = sin(vWorldPos.x * 1.35 + uTime * 2.1) * sin(vWorldPos.z * 1.6 - uTime * 1.7);
  float sparkle = smoothstep(0.965, 1.0, ripples * 0.5 + 0.5);
  color += vec3(specular + sparkle * 0.08);
  float distanceToCamera = distance(uCameraPosition, vWorldPos);
  float haze = clamp((distanceToCamera - 420.0) / 760.0, 0.0, 1.0);
  color = mix(color, vec3(0.70, 0.795, 0.85), haze * 0.8);
  gl_FragColor = vec4(color, 0.97);
}
`;

export interface WaterView {
  mesh: Mesh;
  update: (time: number, cameraPosition: Vector3) => void;
  setSegments: (segments: number) => void;
}

let shaderRegistered = false;

function registerShaders(): void {
  if (shaderRegistered) {
    return;
  }
  Effect.ShadersStore["smarttwinWaterVertexShader"] = VERTEX;
  Effect.ShadersStore["smarttwinWaterFragmentShader"] = FRAGMENT;
  shaderRegistered = true;
}

export function createWater(scene: Scene, segments: number): WaterView {
  registerShaders();
  const material = new ShaderMaterial(
    "water-material",
    scene,
    { vertex: "smarttwinWater", fragment: "smarttwinWater" },
    {
      attributes: ["position"],
      uniforms: [
        "world",
        "worldViewProjection",
        "uTime",
        "uCameraPosition",
        "uSunDir",
      ],
    },
  );
  material.backFaceCulling = false;

  const mesh = MeshBuilder.CreateGround(
    "water",
    { width: 1900, height: 900, subdivisions: segments },
    scene,
  );
  mesh.position.set(0, 0, -365);
  mesh.material = material;
  mesh.receiveShadows = false;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  const sun = new Vector3(0.42, 0.82, -0.36).normalize();

  return {
    mesh,
    update(time: number, cameraPosition: Vector3) {
      material.setFloat("uTime", time);
      material.setVector3("uCameraPosition", cameraPosition);
      material.setVector3("uSunDir", sun);
    },
    setSegments() {
      // Subdivision is fixed for the lifetime of the plane to avoid rebuilding
      // geometry while the user changes quality.
    },
  };
}
