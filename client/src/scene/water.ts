import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
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
  // Несоизмеримые частоты и направления: волны не складываются в регулярную
  // сетку, как это было у трёх синусов подряд.
  float h = sin(p.x * 0.021 + t * 0.55) * 0.30
          + sin(p.z * 0.017 - t * 0.47) * 0.24
          + sin((p.x * 0.83 + p.z * 0.61) * 0.041 + t * 0.90) * 0.12
          + sin((p.x * -0.42 + p.z * 0.91) * 0.067 - t * 1.20) * 0.07;
  float dx = cos(p.x * 0.021 + t * 0.55) * 0.30 * 0.021
           + cos((p.x * 0.83 + p.z * 0.61) * 0.041 + t * 0.90) * 0.12 * 0.041 * 0.83
           + cos((p.x * -0.42 + p.z * 0.91) * 0.067 - t * 1.20) * 0.07 * 0.067 * -0.42;
  float dz = cos(p.z * 0.017 - t * 0.47) * 0.24 * 0.017
           + cos((p.x * 0.83 + p.z * 0.61) * 0.041 + t * 0.90) * 0.12 * 0.041 * 0.61
           + cos((p.x * -0.42 + p.z * 0.91) * 0.067 - t * 1.20) * 0.07 * 0.067 * 0.91;
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

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main(void) {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPosition - vWorldPos);

  // Мелкая рябь: апериодический шум вместо синусной сетки. Даёт блики
  // правдоподобного масштаба и не повторяется на плоскости.
  vec2 p = vWorldPos.xz;
  float n1 = valueNoise(p * 0.55 + vec2(uTime * 0.07, uTime * 0.05));
  float n2 = valueNoise(p * 0.55 + vec2(0.7, 0.7) + vec2(uTime * 0.07, uTime * 0.05));
  float n3 = valueNoise(p * 0.55 + vec2(0.0, 0.7) + vec2(uTime * 0.07, uTime * 0.05));
  vec3 detail = normalize(vec3((n2 - n1) * 0.9, 1.0, (n3 - n1) * 0.9));
  normal = normalize(mix(normal, detail, 0.38));

  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);

  // Портовый цвет: тёмная вода у борта, светлее к горизонту.
  vec3 deep = vec3(0.014, 0.176, 0.235);
  vec3 shallow = vec3(0.055, 0.352, 0.395);
  vec3 color = mix(deep, shallow, clamp(viewDir.y * 2.2, 0.0, 1.0));
  // Отражение неба держим умеренным: иначе вода становится «зеркалом».
  vec3 skyReflection = vec3(0.58, 0.70, 0.76);
  color = mix(color, skyReflection, fresnel * 0.45);

  vec3 halfDir = normalize(uSunDir + viewDir);
  float specular = pow(max(dot(normal, halfDir), 0.0), 220.0);
  float sunLane = pow(
    max(dot(normalize(vec2(uSunDir.x, uSunDir.z)),
            normalize(vec2(vWorldPos.x - uCameraPosition.x, vWorldPos.z - uCameraPosition.z))), 0.0),
    8.0
  );
  color += vec3(specular * (1.1 + sunLane * 0.8));
  color += vec3(sunLane * 0.03);

  // Пена у причальной стенки: узкая полоса с рваным краем.
  float shore = smoothstep(12.0, -4.0, vWorldPos.z);
  float foamNoise = valueNoise(p * 1.35 + vec2(uTime * 0.25, -uTime * 0.18));
  float foam = shore * smoothstep(0.52, 0.92, foamNoise);
  color = mix(color, vec3(0.80, 0.855, 0.87), foam * 0.75);

  float distanceToCamera = distance(uCameraPosition, vWorldPos);
  float haze = clamp((distanceToCamera - 380.0) / 820.0, 0.0, 1.0);
  color = mix(color, vec3(0.72, 0.80, 0.83), haze * 0.85);

  gl_FragColor = vec4(color, 1.0);
}
`;

// WebGPU не компилирует GLSL, поэтому для него держим эквивалентный WGSL.
// Формулы повторяют GLSL-версию один в один: поменяли одну — поправьте обе.
const VERTEX_WGSL = `
attribute position: vec3<f32>;
uniform world: mat4x4<f32>;
uniform worldViewProjection: mat4x4<f32>;
uniform uTime: f32;
varying vWorldPos: vec3<f32>;
varying vNormal: vec3<f32>;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var p: vec3<f32> = input.position;
  let t: f32 = uniforms.uTime;
  let h: f32 =
    sin(p.x * 0.021 + t * 0.55) * 0.30 +
    sin(p.z * 0.017 - t * 0.47) * 0.24 +
    sin((p.x * 0.83 + p.z * 0.61) * 0.041 + t * 0.90) * 0.12 +
    sin((p.x * -0.42 + p.z * 0.91) * 0.067 - t * 1.20) * 0.07;
  let dx: f32 =
    cos(p.x * 0.021 + t * 0.55) * 0.30 * 0.021 +
    cos((p.x * 0.83 + p.z * 0.61) * 0.041 + t * 0.90) * 0.12 * 0.041 * 0.83 +
    cos((p.x * -0.42 + p.z * 0.91) * 0.067 - t * 1.20) * 0.07 * 0.067 * -0.42;
  let dz: f32 =
    cos(p.z * 0.017 - t * 0.47) * 0.24 * 0.017 +
    cos((p.x * 0.83 + p.z * 0.61) * 0.041 + t * 0.90) * 0.12 * 0.041 * 0.61 +
    cos((p.x * -0.42 + p.z * 0.91) * 0.067 - t * 1.20) * 0.07 * 0.067 * 0.91;
  p.y += h;
  vertexOutputs.vWorldPos = (uniforms.world * vec4<f32>(p, 1.0)).xyz;
  vertexOutputs.vNormal = normalize(vec3<f32>(-dx, 1.0, -dz));
  vertexOutputs.position = uniforms.worldViewProjection * vec4<f32>(p, 1.0);
  return vertexOutputs;
}
`;

const FRAGMENT_WGSL = `
varying vWorldPos: vec3<f32>;
varying vNormal: vec3<f32>;
uniform uCameraPosition: vec3<f32>;
uniform uSunDir: vec3<f32>;
uniform uTime: f32;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p: vec2<f32>) -> f32 {
  let i: vec2<f32> = floor(p);
  let f: vec2<f32> = fract(p);
  let w: vec2<f32> = f * f * (3.0 - 2.0 * f);
  let a: f32 = hash(i);
  let b: f32 = hash(i + vec2<f32>(1.0, 0.0));
  let c: f32 = hash(i + vec2<f32>(0.0, 1.0));
  let d: f32 = hash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.y), w.y);
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let normal0: vec3<f32> = normalize(input.vNormal);
  let viewDir: vec3<f32> = normalize(uniforms.uCameraPosition - input.vWorldPos);

  let p: vec2<f32> = input.vWorldPos.xz;
  let drift: vec2<f32> = vec2<f32>(uniforms.uTime * 0.07, uniforms.uTime * 0.05);
  let n1: f32 = valueNoise(p * 0.55 + drift);
  let n2: f32 = valueNoise(p * 0.55 + vec2<f32>(0.7, 0.7) + drift);
  let n3: f32 = valueNoise(p * 0.55 + vec2<f32>(0.0, 0.7) + drift);
  let detail: vec3<f32> = normalize(vec3<f32>((n2 - n1) * 0.9, 1.0, (n3 - n1) * 0.9));
  let normal: vec3<f32> = normalize(mix(normal0, detail, 0.38));

  let fresnel: f32 = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);

  let deep: vec3<f32> = vec3<f32>(0.014, 0.176, 0.235);
  let shallow: vec3<f32> = vec3<f32>(0.055, 0.352, 0.395);
  var color: vec3<f32> = mix(deep, shallow, clamp(viewDir.y * 2.2, 0.0, 1.0));
  let skyReflection: vec3<f32> = vec3<f32>(0.58, 0.70, 0.76);
  color = mix(color, skyReflection, fresnel * 0.45);

  let halfDir: vec3<f32> = normalize(uniforms.uSunDir + viewDir);
  let specular: f32 = pow(max(dot(normal, halfDir), 0.0), 220.0);
  let sunLane: f32 = pow(
    max(dot(
      normalize(vec2<f32>(uniforms.uSunDir.x, uniforms.uSunDir.z)),
      normalize(vec2<f32>(input.vWorldPos.x - uniforms.uCameraPosition.x, input.vWorldPos.z - uniforms.uCameraPosition.z))
    ), 0.0),
    8.0
  );
  color += vec3<f32>(specular * (1.1 + sunLane * 0.8));
  color += vec3<f32>(sunLane * 0.03);

  let shore: f32 = smoothstep(12.0, -4.0, input.vWorldPos.z);
  let foamNoise: f32 = valueNoise(p * 1.35 + vec2<f32>(uniforms.uTime * 0.25, -uniforms.uTime * 0.18));
  let foam: f32 = shore * smoothstep(0.52, 0.92, foamNoise);
  color = mix(color, vec3<f32>(0.80, 0.855, 0.87), foam * 0.75);

  let distanceToCamera: f32 = distance(uniforms.uCameraPosition, input.vWorldPos);
  let haze: f32 = clamp((distanceToCamera - 380.0) / 820.0, 0.0, 1.0);
  color = mix(color, vec3<f32>(0.72, 0.80, 0.83), haze * 0.85);

  fragmentOutputs.color = vec4<f32>(color, 1.0);
  return fragmentOutputs;
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
  // WGSL живёт в отдельном сторе и с обычными именами: ключ с суффиксом
  // «WGSL» Babylon не найдёт и уйдёт за шейдером по HTTP.
  ShaderStore.ShadersStoreWGSL["smarttwinWaterVertexShader"] = VERTEX_WGSL;
  ShaderStore.ShadersStoreWGSL["smarttwinWaterFragmentShader"] = FRAGMENT_WGSL;
  shaderRegistered = true;
}

export function createWater(
  scene: Scene,
  segments: number,
  webgpu = false,
): WaterView {
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
      shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
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
