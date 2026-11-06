// Материалы территории Кандлы.
//
// Задача — спокойная промышленная основа: песочно-серая суша, сдержанный бетон
// причальных оснований, мангровые отмели темнее суши. Никакого глянца: блик
// почти погашен, шероховатость задаётся мелкой процедурной текстурой, а не
// отражениями. Дорожные покрытия, балласт и подкрановые балки — PBR-материалы
// из наборов «Афина · Дорожные покрытия v1» и «Афина · Железнодорожные и
// подкрановые пути v1»: текстуры наборов, UV по мировым метрам.

import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

import { KANDLA_COLORS } from "./config";
import { KANDLA_SURFACES, type SurfaceKey } from "./surfaces";

export interface KandlaMaterials {
  land: StandardMaterial;
  quay: StandardMaterial;
  intertidal: StandardMaterial;
  /** Покрытия и путевые поверхности наборов, по ключу поверхности. */
  surfaces: Record<SurfaceKey, PBRMaterial>;
  dispose(): void;
}

/**
 * Затемнение стенок плиты относительно её верха. Считается из палитры, а не
 * задано числом: цвет влажного берега и цвет суши живут в одном месте.
 */
export function bankTint(fromHex: string, toHex: string): Color3 {
  const from = Color3.FromHexString(fromHex);
  const to = Color3.FromHexString(toHex);
  return new Color3(to.r / from.r, to.g / from.g, to.b / from.b);
}

/** Детерминированный генератор: текстура одна и та же при каждом запуске. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Процедурная «шершавая» текстура: мелкое зерно плюс редкие пятна.
 * Работает как карта диффузного цвета — цвет остаётся в палитре сцены,
 * меняется только его разброс.
 */
function createGrainTexture(
  scene: Scene,
  name: string,
  base: string,
  amplitude: number,
  size = 256,
): DynamicTexture {
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const context = texture.getContext() as CanvasRenderingContext2D;
  const image = context.createImageData(size, size);
  const random = mulberry32(0x5eed);
  const colour = Color3.FromHexString(base);
  const baseR = colour.r * 255;
  const baseG = colour.g * 255;
  const baseB = colour.b * 255;
  // Крупные пятна: сетка со случайными значениями, сглаженная усреднением.
  const cells = 16;
  const coarse: number[] = [];
  for (let index = 0; index < cells * cells; index += 1) {
    coarse.push(random() * 2 - 1);
  }
  const coarseAt = (x: number, y: number): number => {
    const cx = Math.floor((x / size) * cells) % cells;
    const cy = Math.floor((y / size) * cells) % cells;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        sum += coarse[((cy + dy + cells) % cells) * cells + ((cx + dx + cells) % cells)];
      }
    }
    return sum / 9;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = (random() * 2 - 1) * 0.55 + coarseAt(x, y) * 0.45;
      const shift = 1 + fine * amplitude;
      const offset = (y * size + x) * 4;
      image.data[offset] = Math.max(0, Math.min(255, baseR * shift));
      image.data[offset + 1] = Math.max(0, Math.min(255, baseG * shift));
      image.data[offset + 2] = Math.max(0, Math.min(255, baseB * shift));
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  texture.update(false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

/**
 * Плитка текстуры. UV полигонов Babylon берёт из координат XZ в метрах,
 * поэтому масштаб — «сколько метров на одно повторение».
 */
function tile(texture: Texture, metresPerRepeat: number): Texture {
  const scale = 1 / metresPerRepeat;
  texture.uScale = scale;
  texture.vScale = scale;
  return texture;
}

export function createKandlaMaterials(scene: Scene): KandlaMaterials {
  const landTexture = tile(createGrainTexture(scene, "kandla-land-grain", KANDLA_COLORS.land, 0.09), 47);
  const land = new StandardMaterial("kandla-land", scene);
  land.diffuseTexture = landTexture;
  land.diffuseColor = Color3.White();
  land.specularColor = new Color3(0.04, 0.04, 0.045);
  land.specularPower = 8;
  land.ambientColor = new Color3(0.22, 0.22, 0.21);
  // Плита суши — замкнутый объём: обратные нормали у стенок не должны
  // превращаться в дыры в береговой линии.
  land.backFaceCulling = false;

  const quayTexture = tile(createGrainTexture(scene, "kandla-quay-grain", KANDLA_COLORS.quay, 0.05), 26);
  const quay = new StandardMaterial("kandla-quay", scene);
  quay.diffuseTexture = quayTexture;
  quay.diffuseColor = Color3.White();
  quay.specularColor = new Color3(0.06, 0.06, 0.06);
  quay.specularPower = 16;
  quay.ambientColor = new Color3(0.24, 0.24, 0.24);
  quay.backFaceCulling = false;

  const intertidalTexture = tile(
    createGrainTexture(scene, "kandla-intertidal-grain", KANDLA_COLORS.intertidal, 0.12),
    33,
  );
  const intertidal = new StandardMaterial("kandla-intertidal", scene);
  intertidal.diffuseTexture = intertidalTexture;
  intertidal.diffuseColor = Color3.White();
  intertidal.specularColor = new Color3(0.03, 0.03, 0.03);
  intertidal.ambientColor = new Color3(0.18, 0.18, 0.17);
  intertidal.backFaceCulling = false;

  // Дорожные покрытия и путевые поверхности из наборов «Афина».
  //
  // Материал PBR: color (sRGB), normal (OpenGL), ORM (R — AO, G — roughness,
  // B — metallic). Карты кладутся на геометрию территории, UV заданы в мировых
  // метрах: шаг повтора берётся из набора (6 м у покрытий, 2 м у путей).
  // Окружения (IBL) в сцене нет, поэтому environmentIntensity = 0: покрытия
  // освещаются тем же солнцем и небом, что и суша.
  const loadTexture = (path: string, gammaSpace: boolean): Texture => {
    const texture = new Texture(
      `${import.meta.env.BASE_URL}${path}`,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => undefined,
      undefined,
      undefined,
      false,
    );
    // Цветовая карта — sRGB, нормали и ORM — линейные: если перепутать,
    // покрытие темнеет и блик уезжает.
    texture.gammaSpace = gammaSpace;
    texture.anisotropicFilteringLevel = 8;
    return texture;
  };
  const surfaces = {} as Record<SurfaceKey, PBRMaterial>;
  const surfaceTextures: Texture[] = [];
  for (const key of Object.keys(KANDLA_SURFACES) as SurfaceKey[]) {
    const { asset, folder, albedoGain, depthBias, metallicFromTexture, albedoTint } =
      KANDLA_SURFACES[key];
    const albedo = loadTexture(`${folder}/${asset}.png`, true);
    const normal = loadTexture(`${folder}/${asset}_normal.png`, false);
    const orm = loadTexture(`${folder}/${asset}_orm.png`, false);
    surfaceTextures.push(albedo, normal, orm);

    const material = new PBRMaterial(`kandla-surface-${asset}`, scene);
    material.albedoTexture = albedo;
    const tint = albedoTint ?? [1, 1, 1];
    material.albedoColor = new Color3(
      albedoGain * tint[0],
      albedoGain * tint[1],
      albedoGain * tint[2],
    );
    material.bumpTexture = normal;
    material.metallicTexture = orm;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
    material.useRoughnessFromMetallicTextureGreen = true;
    // Головка рельса в наборе металлическая (0,92). Металл без окружения
    // отражать нечего, и он уходит в чёрный, поэтому для неё металличность
    // задаётся числом: сталь остаётся сталью при одном солнце.
    material.useMetallnessFromMetallicTextureBlue = metallicFromTexture;
    material.metallic = 1;
    material.roughness = 1;
    if (!metallicFromTexture) {
      material.metallic = 0.3;
      material.roughness = 0.42;
    }
    material.environmentIntensity = 0;
    material.backFaceCulling = false;
    // Покрытие лежит в сантиметрах над сушей: смещение по глубине обязательно,
    // иначе на дальнем плане Depth-буфер не различает подъём и лента мерцает.
    // Разные bias у классов разводят перекрёстки: две ленты в одной плоскости
    // без этого мерцали бы друг сквозь друга.
    material.zOffset = -2;
    material.zOffsetUnits = depthBias;
    surfaces[key] = material;
  }

  return {
    land,
    quay,
    intertidal,
    surfaces,
    dispose(): void {
      landTexture.dispose();
      quayTexture.dispose();
      intertidalTexture.dispose();
      for (const texture of surfaceTextures) texture.dispose();
      for (const material of Object.values(surfaces)) material.dispose();
      land.dispose();
      quay.dispose();
      intertidal.dispose();
    },
  };
}
