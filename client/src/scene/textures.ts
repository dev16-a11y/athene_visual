import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function speckle(
  context: CanvasRenderingContext2D,
  size: number,
  seed: number,
  count: number,
  alpha: number,
  light: string,
  dark: string,
): void {
  const random = seededRandom(seed);
  for (let index = 0; index < count; index += 1) {
    const radius = 1 + random() * 3.5;
    context.fillStyle = random() > 0.5 ? light : dark;
    context.globalAlpha = alpha * (0.35 + random() * 0.65);
    context.beginPath();
    context.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

export function createGroundTexture(
  scene: Scene,
  name: string,
  base: string,
  seed: number,
  variant: "concrete" | "asphalt",
): DynamicTexture {
  const size = 512;
  const texture = new DynamicTexture(name, { width: size, height: size }, scene, false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = 9;
  texture.vScale = 9;
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);

  if (variant === "concrete") {
    speckle(context, size, seed, 2600, 0.16, "#e2e4e5", "#7d8184");
    const random = seededRandom(seed + 7);
    for (let index = 0; index < 26; index += 1) {
      context.strokeStyle = "rgba(90, 95, 98, 0.18)";
      context.lineWidth = 1 + random() * 2;
      context.beginPath();
      context.moveTo(random() * size, random() * size);
      context.lineTo(random() * size, random() * size);
      context.stroke();
    }
    context.strokeStyle = "rgba(80, 85, 88, 0.35)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 256);
    context.lineTo(size, 256);
    context.moveTo(256, 0);
    context.lineTo(256, size);
    context.stroke();
  } else {
    speckle(context, size, seed, 4200, 0.2, "#7d8388", "#2c3033");
    const random = seededRandom(seed + 11);
    for (let index = 0; index < 60; index += 1) {
      context.strokeStyle = "rgba(35, 38, 40, 0.22)";
      context.lineWidth = 1 + random() * 1.4;
      const x = random() * size;
      context.beginPath();
      context.moveTo(x, random() * size);
      context.lineTo(x + 20 + random() * 90, random() * size);
      context.stroke();
    }
  }
  texture.update(false);
  return texture;
}

export function createContainerTexture(scene: Scene): DynamicTexture {
  const width = 512;
  const height = 256;
  const texture = new DynamicTexture(
    "container-corrugation",
    { width, height },
    scene,
    false,
  );
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = "#f2f2f0";
  context.fillRect(0, 0, width, height);

  for (let x = 8; x < width - 8; x += 14) {
    context.fillStyle = "rgba(255, 255, 255, 0.55)";
    context.fillRect(x, 10, 5, height - 20);
    context.fillStyle = "rgba(60, 60, 60, 0.22)";
    context.fillRect(x + 5, 10, 2, height - 20);
  }

  context.strokeStyle = "rgba(40, 40, 40, 0.5)";
  context.lineWidth = 7;
  context.strokeRect(5, 5, width - 10, height - 10);
  context.strokeStyle = "rgba(40, 40, 40, 0.35)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(width * 0.5, 6);
  context.lineTo(width * 0.5, height - 6);
  context.stroke();

  const random = seededRandom(31);
  for (let index = 0; index < 18; index += 1) {
    context.fillStyle = "rgba(75, 55, 40, 0.12)";
    const x = random() * width;
    context.fillRect(x, height * (0.6 + random() * 0.35), 6 + random() * 18, 2);
  }
  texture.update(false);
  return texture;
}

export function createSkyTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture(
    "sky-gradient",
    { width: 1024, height: 512 },
    scene,
    false,
  );
  const context = texture.getContext() as CanvasRenderingContext2D;
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#7a9db5");
  gradient.addColorStop(0.42, "#a9c4d3");
  gradient.addColorStop(0.72, "#d6e3e9");
  gradient.addColorStop(1, "#e9eff1");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 512);
  texture.update(false);
  return texture;
}

export interface LabelTexture {
  texture: DynamicTexture;
  width: number;
  height: number;
}

export function drawLabel(
  texture: DynamicTexture,
  lines: Array<{ text: string; size: number; color: string; bold?: boolean }>,
  accent: string,
): void {
  const context = texture.getContext() as CanvasRenderingContext2D;
  const { width, height } = texture.getSize();
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(5, 20, 30, 0.78)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.strokeRect(3, 3, width - 6, height - 6);
  context.textBaseline = "middle";
  let y = height * 0.2;
  for (const line of lines) {
    context.fillStyle = line.color;
    context.font = `${line.bold ? "700" : "500"} ${line.size}px "Segoe UI", Arial, sans-serif`;
    context.textAlign = "center";
    context.fillText(line.text, width / 2, y, width - 24);
    y += line.size * 1.45;
  }
  texture.update(false);
}
