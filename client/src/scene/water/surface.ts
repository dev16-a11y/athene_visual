// Материал и геометрия поверхности воды.
//
// Визуальная часть прототипа акватории (water-material.js) перенесена с
// сохранением вида: смещение вершин по трём каскадам FFT, наклоны из четвёртого
// (мелкая рябь), Fresnel, блик GGX, процедурное небо с облаками, пена по
// якобиану и планарное отражение с искажением рябью.
//
// Что изменено при переносе (и почему):
//  * убраны константы демонстрационной сцены — «подветренная» поправка на
//    x = 64 м и полоса пены по линии причала x = 65 м; пена у причала теперь
//    считается по фактической линии берега SHORE_Z;
//  * вместо Reinhard + гаммы внутри шейдера — та же цепочка, что у остальных
//    материалов сцены: экспозиция → ACES → гамма → контраст. Иначе вода
//    выбивалась бы из кадра по тону;
//  * дымка считается по настройкам тумана сцены (EXP2), а не по константе
//    прототипа;
//  * геометрия — не полный полярный диск, а половина, обращённая в море:
//    вода заканчивается на линии причала и не заходит на сушу;
//  * сетка следует за целью камеры по X (с привязкой к шагу колец), чтобы
//    у причала всегда была детализация; рисунок волн при этом остаётся
//    привязанным к мировым координатам и не «плывёт».

import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  SHORE_Z,
  SURFACE_RING_GROWTH,
  SURFACE_INNER_RADIUS,
  SURFACE_OUTER_RADIUS,
  WATER_LEVEL,
  type WaterSettings,
} from "./config";

const VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 world, viewProjection;
uniform sampler2D disp0, disp1, disp2, disp3;
uniform float uWaveGain;
varying vec3 vWorld;
varying vec4 vClip;
varying vec2 vBase;
varying float vFoam;

void main() {
  vec3 p = (world * vec4(position, 1.0)).xyz;
  vBase = p.xz;
  // Смещение берётся из мировых координат: поверхность можно двигать вслед за
  // камерой, рисунок волн от этого не смещается.
  vec4 a = texture2D(disp0, p.xz / 600.0);
  vec4 b = texture2D(disp1, p.xz / 85.0);
  vec4 c = texture2D(disp2, p.xz / 12.0);
  p += (a.xyz + b.xyz + c.xyz) * uWaveGain;
  vFoam = min(a.w, min(b.w, c.w));
  vWorld = p;
  vClip = viewProjection * vec4(p, 1.0);
  gl_Position = vClip;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D slope0, slope1, slope2, slope3, reflectionSampler;
uniform vec3 cameraPosition, sunDirection, sunColor, deepColor;
uniform vec3 horizonColor, zenithColor, fogColor;
uniform float uTime, uWind, uRipple;
uniform float uReflectionOn, uReflectionStrength;
uniform float uFoamOn, uFoamThreshold, uShoreFoam, uShoreZ;
uniform float uRippleDistance;
uniform float uFogDensity, uExposure, uContrast, uToneMap;
varying vec3 vWorld;
varying vec4 vClip;
varying vec2 vBase;
varying float vFoam;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

// Процедурное небо: используется и как отражение, и как дымка у горизонта.
vec3 sky(vec3 r) {
  float h = pow(clamp(r.y, 0.0, 1.0), 0.38);
  vec3 col = mix(horizonColor, zenithColor, h);
  float cloud = noise(r.xz / max(r.y + 0.15, 0.14) * 3.0 + uTime * 0.001);
  cloud = mix(cloud, noise(r.xz / max(r.y + 0.2, 0.14) * 7.0), 0.3);
  col = mix(col, vec3(0.89, 0.91, 0.89),
    smoothstep(0.59, 0.82, cloud) * smoothstep(0.03, 0.30, r.y) * 0.5);
  col += sunColor * pow(max(dot(r, sunDirection), 0.0), 600.0) * 2.0;
  return col;
}

// ACES-аппроксимация из imageProcessingFunctions Babylon.js: те же матрицы и
// тот же фит, что применяют к кадру остальные материалы.
vec3 rrtAndOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 acesFitted(vec3 color) {
  const mat3 inputMat = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
  const mat3 outputMat = mat3(
     1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);
  color = inputMat * color;
  color = rrtAndOdt(color);
  color = outputMat * color;
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec2 q = vBase;

  // Наклоны каскадов: 600 / 85 / 12 м + мелкая рябь 2,1 м вблизи.
  vec2 s = texture2D(slope0, q / 600.0).xy
         + texture2D(slope1, q / 85.0).xy
         + texture2D(slope2, q / 12.0).xy;
  float dist = length(cameraPosition - vWorld);
  float fine = 1.0 - smoothstep(uRippleDistance * 0.15, uRippleDistance, dist);
  s += texture2D(slope3, q / 2.1).xy * fine * 0.35;
  s *= 0.24;
  // Подпиксельная рябь: у причала вода должна «дышать», а не быть стеклом.
  s += vec2(
    sin(q.x * 2.1 + sin(q.y * 0.7) + uTime * 1.1),
    cos(q.y * 2.7 + sin(q.x * 0.8) - uTime * 0.9)) * 0.011 * (0.5 + uWind * 0.08) * uRipple;

  vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
  vec3 v = normalize(cameraPosition - vWorld);
  if (n.y < 0.0) {
    n = -n;
  }

  vec3 r = reflect(-v, n);
  float nv = max(dot(n, v), 0.001);
  float fresnel = 0.0204 + 0.9796 * pow(1.0 - nv, 5.0);

  vec3 reflected = sky(r);
  vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec2 distortion = n.xz * 0.018 * clamp(70.0 / max(dist, 1.0), 0.3, 1.3);
  vec2 ruv = uv + distortion;
  if (uReflectionOn > 0.5 && min(ruv.x, ruv.y) > 0.005 && max(ruv.x, ruv.y) < 0.995) {
    vec3 planar = texture2D(reflectionSampler, ruv).rgb;
    reflected = mix(reflected, planar, uReflectionStrength);
  }

  float ndl = max(dot(n, sunDirection), 0.0);
  vec3 base = deepColor * (0.48 + 0.52 * ndl);
  base += vec3(0.015, 0.075, 0.067) * max(vWorld.y, 0.0) * 0.18;

  vec3 h = normalize(v + sunDirection);
  float nh = max(dot(n, h), 0.0);
  float rough = mix(0.13, 0.19, clamp(uWind / 14.0, 0.0, 1.0));
  float a2 = pow(rough, 4.0);
  float denom = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159265 * denom * denom);
  float spec = min(D * 0.025, 4.0) * ndl;
  vec3 color = mix(base, reflected, fresnel) + sunColor * spec;

  // Пена: гребни по якобиану и полоса у причала по фактической линии берега.
  float lace = noise(q * 4.0 + uTime * 0.10) * noise(q * 0.65 - uTime * 0.04);
  float crest = (1.0 - smoothstep(uFoamThreshold - 0.30, uFoamThreshold, vFoam))
              * smoothstep(0.13, 0.38, lace);
  float edge = exp(-abs(q.y - uShoreZ) * 2.8) * (0.4 + 0.6 * noise(q * 0.7 + uTime * 0.12));
  float foam = clamp((crest * 0.64 + edge * uShoreFoam) * uFoamOn, 0.0, 0.82);
  color = mix(color, vec3(0.75, 0.84, 0.81), foam);

  // Дымка сцены (EXP2): та же формула, что у остальных материалов.
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  color = mix(color, fogColor, clamp(fog, 0.0, 1.0));

  // Тональная компрессия кадра: экспозиция → ACES → гамма → контраст.
  color *= uExposure;
  if (uToneMap > 0.5) {
    color = acesFitted(color);
  }
  color = pow(max(color, vec3(0.0)), vec3(0.4545454545));
  color = clamp(color, 0.0, 1.0);
  if (uContrast < 1.0) {
    color = mix(vec3(0.5), color, uContrast);
  } else {
    color = mix(color, color * color * (3.0 - 2.0 * color), uContrast - 1.0);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Кадровые параметры, которые материал получает каждый кадр. */
export interface SurfaceFrame {
  camera: Vector3;
  time: number;
  /** Цель камеры по X: под неё подстраивается центр полярной сетки. */
  anchorX: number;
  sunDirection: Vector3;
  exposure: number;
  contrast: number;
  toneMap: boolean;
  fogDensity: number;
  fogColor: Color3;
  /** Оттенок неба у горизонта (он же — цвет дымки на воде). */
  horizon: Color3;
  /** Оттенок неба в зените. */
  zenith: Color3;
}

export interface OceanSurfaceOptions {
  /** Дальность мелкой ряби, м. */
  rippleDistance: number;
  /** Начальные настройки воды. */
  settings: WaterSettings;
}

export interface OceanSurface {
  mesh: Mesh;
  material: ShaderMaterial;
  update(frame: SurfaceFrame): void;
  setSettings(settings: WaterSettings): void;
  setRippleDistance(distance: number): void;
  dispose(): void;
}

/**
 * Полярная сетка-полудиск: центр на линии причала, дуга уходит в море.
 * Кольца растут геометрически, поэтому у берега шаг меньше метра, а на
 * горизонте — десятки метров; разрывов между участками нет, это одна сетка.
 */
function buildGeometry(
  scene: Scene,
  ringGrowth: number,
  segments: number,
): Mesh {
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  const radii: number[] = [];

  for (let radius = SURFACE_INNER_RADIUS; radius < SURFACE_OUTER_RADIUS; radius *= ringGrowth) {
    radii.push(radius);
  }
  radii.push(SURFACE_OUTER_RADIUS);

  for (const radius of radii) {
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI;
      positions.push(Math.cos(angle) * radius, 0, -Math.sin(angle) * radius);
    }
  }

  // Веер у центра.
  for (let index = 0; index < segments; index += 1) {
    indices.push(0, 1 + index, 1 + ((index + 1) % segments));
  }
  // Кольца.
  for (let ring = 0; ring < radii.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const a = 1 + ring * segments + index;
      const b = 1 + ring * segments + next;
      const c = b + segments;
      const d = a + segments;
      indices.push(a, c, b, a, d, c);
    }
  }

  const mesh = new Mesh("water", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  const normals: number[] = new Array(positions.length).fill(0);
  for (let index = 1; index < normals.length; index += 3) {
    normals[index] = 1;
  }
  data.normals = normals;
  data.applyToMesh(mesh);
  return mesh;
}

const UNIFORMS = [
  "world",
  "viewProjection",
  "cameraPosition",
  "uTime",
  "uWind",
  "uRipple",
  "uWaveGain",
  "uReflectionOn",
  "uReflectionStrength",
  "uFoamOn",
  "uFoamThreshold",
  "uShoreFoam",
  "uShoreZ",
  "uRippleDistance",
  "uFogDensity",
  "uExposure",
  "uContrast",
  "uToneMap",
  "sunDirection",
  "sunColor",
  "deepColor",
  "horizonColor",
  "zenithColor",
  "fogColor",
];

const SAMPLERS = [
  "disp0",
  "disp1",
  "disp2",
  "disp3",
  "slope0",
  "slope1",
  "slope2",
  "slope3",
  "reflectionSampler",
];

export function createOceanSurface(
  scene: Scene,
  options: OceanSurfaceOptions,
): OceanSurface {
  const settings = options.settings;
  let rippleDistance = options.rippleDistance;

  const material = new ShaderMaterial(
    "ocean-surface-material",
    scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    {
      attributes: ["position"],
      uniforms: UNIFORMS,
      samplers: SAMPLERS,
      // Каскады FFT считаются в GLSL ES 3.0; WGSL-версии в переносе нет,
      // поэтому вода работает на WebGL2 (см. checkOceanSupport).
      shaderLanguage: ShaderLanguage.GLSL,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = false;
  material.zOffset = 0;

  const mesh = buildGeometry(scene, SURFACE_RING_GROWTH, 192);
  mesh.name = "water";
  mesh.material = material;
  mesh.position.y = WATER_LEVEL;
  mesh.position.z = SHORE_Z;
  mesh.receiveShadows = false;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  // Вода не участвует в выборе и не должна попадать в bounding-box проверки
  // камеры: сетка заведомо больше кадра.
  mesh.doNotSyncBoundingInfo = true;
  mesh.metadata = { noReflection: true, water: true };

  const applySettings = (next: WaterSettings): void => {
    material.setFloat("uWind", next.windSpeed);
    material.setFloat("uWaveGain", next.waveGain);
    material.setFloat("uRipple", next.rippleStrength);
    material.setFloat("uReflectionOn", next.reflections ? 1 : 0);
    material.setFloat("uReflectionStrength", next.reflectionStrength);
    material.setFloat("uFoamOn", next.foam ? 1 : 0);
    material.setFloat("uFoamThreshold", next.foamThreshold);
    material.setFloat("uShoreFoam", next.shoreFoam);
    material.setFloat("uShoreZ", SHORE_Z);
    material.setColor3("deepColor", next.deepColor);
    material.setColor3("sunColor", next.sunColor);
  };
  applySettings(settings);

  /** Привязка центра сетки к шагу колец: без неё вершины «дрожат» на ходу. */
  let anchor = Number.NaN;

  return {
    mesh,
    material,
    update(frame: SurfaceFrame): void {
      const snapped = Math.round(frame.anchorX / 4) * 4;
      if (snapped !== anchor) {
        anchor = snapped;
        mesh.position.x = snapped;
      }
      material.setFloat("uTime", frame.time);
      material.setFloat("uRippleDistance", rippleDistance);
      material.setVector3("cameraPosition", frame.camera);
      material.setVector3("sunDirection", frame.sunDirection);
      material.setFloat("uExposure", frame.exposure);
      material.setFloat("uContrast", frame.contrast);
      material.setFloat("uToneMap", frame.toneMap ? 1 : 0);
      material.setFloat("uFogDensity", frame.fogDensity);
      material.setColor3("fogColor", frame.fogColor);
      material.setColor3("horizonColor", frame.horizon);
      material.setColor3("zenithColor", frame.zenith);
    },
    setSettings(next: WaterSettings): void {
      applySettings(next);
    },
    setRippleDistance(distance: number): void {
      rippleDistance = distance;
    },
    dispose(): void {
      mesh.dispose();
      material.dispose();
    },
  };
}

/** Цвет очистки отражения: небо без геометрии, в линейном пространстве. */
export function reflectionClearColor(horizon: Color3): Color4 {
  return new Color4(horizon.r, horizon.g, horizon.b, 1);
}

/** Смещения и наклоны, которые материал берёт из расчёта волн. */
export function bindCascadeTextures(
  material: ShaderMaterial,
  displacement: Texture[],
  slope: Texture[],
): void {
  for (let index = 0; index < displacement.length; index += 1) {
    material.setTexture(`disp${index}`, displacement[index]);
    material.setTexture(`slope${index}`, slope[index]);
  }
}

export function bindReflection(
  material: ShaderMaterial,
  texture: Texture | null,
): void {
  if (texture) {
    material.setTexture("reflectionSampler", texture);
  }
}

/** Меш воды: нужен снаружи для слоёв, отражений и проверок. */
export function waterMeshOf(surface: OceanSurface): AbstractMesh {
  return surface.mesh;
}
