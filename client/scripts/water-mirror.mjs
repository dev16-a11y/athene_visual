// Проверка ориентации планарного отражения.
//
// В воду ставится заметный маркер над водой в известной точке. Снимаются два
// кадра — без маркера и с ним; разница показывает, где отражение оказалось на
// экране. Аналитически считается точка поверхности воды, в которой отражается
// маркер, и её проекция. Совпадение значит, что отражение не перевёрнуто по
// горизонтали и не сдвинуто.

import { chromium } from "playwright-core";

const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const MARKER = { x: 150, y: 12, z: -80 };

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".dock-center", { timeout: 40_000 });
// Экран загрузки держится до готовности GLB-моделей: снимать раньше —
// значит поймать в кадр оверлей вместо сцены.
await page
  .waitForFunction(() => !document.querySelector(".loading-screen"), {
    timeout: 30_000,
  })
  .catch(() => undefined);
await page.waitForTimeout(5000);

// Ракурс, в котором видна вода перед причалом и точка отражения маркера.
await page.evaluate(() => {
  const camera = window.__smarttwinScene?.activeCamera;
  if (!camera) return;
  camera.alpha = -0.95;
  camera.beta = 1.36;
  camera.radius = 230;
  camera.target.set(30, 4, -20);
  camera.setTarget(camera.target);
});
await page.waitForTimeout(1500);

const grab = () =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const surface = document.createElement("canvas");
    surface.width = canvas.width;
    surface.height = canvas.height;
    const context = surface.getContext("2d", { willReadFrequently: true });
    context.drawImage(canvas, 0, 0);
    const data = context.getImageData(0, 0, surface.width, surface.height).data;
    return { width: surface.width, height: surface.height, data: Array.from(data) };
  });

// Волны замораживаем: иначе диффуется вся поверхность и маркер не выделить.
await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ paused: true }));
await page.waitForTimeout(400);
const before = await grab();

// Маркер: клонируем небольшой меш сцены, чтобы не тянуть в страницу MeshBuilder.
const markerInfo = await page.evaluate((point) => {
  const scene = window.__smarttwinScene;
  // Небольшой меш сцены: клон вырастает до ~10 м и становится заметным,
  // но не заслоняет кадр.
  const candidates = scene.meshes.filter((mesh) => {
    if (!mesh.isEnabled() || !mesh.material) return false;
    if (mesh.name.startsWith("water") || mesh.name.startsWith("bg-")) return false;
    if (mesh.getTotalVertices() < 8 || mesh.getTotalVertices() > 400) return false;
    const extents = mesh.getBoundingInfo().boundingBox.extendSize;
    const max = Math.max(extents.x, extents.y, extents.z);
    return max > 0.1 && max < 4;
  });
  if (candidates.length === 0) return null;
  const source = candidates[0];
  const marker = source.clone("water-marker");
  marker.setEnabled(true);
  marker.parent = null;
  marker.position.set(point.x, point.y, point.z);
  const extents = source.getBoundingInfo().boundingBox.extendSize;
  const max = Math.max(extents.x, extents.y, extents.z);
  const scale = 8 / Math.max(max, 0.01);
  marker.scaling.set(scale, scale, scale);
  marker.isPickable = false;
  // Маркер обязан попасть в отражение: список обновляется по событию сцены.
  window.__smarttwinDebug?.waterSettings?.({});
  return { source: source.name, vertices: source.getTotalVertices() };
}, MARKER);

await page.waitForTimeout(1200);
const after = await grab();

const analysis = await page.evaluate(
  ({ before, after, point }) => {
    const scene = window.__smarttwinScene;
    const camera = scene.activeCamera;
    const width = after.width;
    const height = after.height;
    const b = before.data;
    const a = after.data;

    // Проекция точки поверхности, в которой отражается маркер: луч из камеры
    // в отражённый маркер (x, -y, z) пересекает плоскость воды y = 0.
    const eye = camera.globalPosition;
    const mirrored = { x: point.x, y: -point.y, z: point.z };
    const t = (0 - eye.y) / (mirrored.y - eye.y);
    const water = {
      x: eye.x + (mirrored.x - eye.x) * t,
      y: 0,
      z: eye.z + (mirrored.z - eye.z) * t,
    };
    // Проекция считается вручную: в модульной сборке нет глобального BABYLON.
    const m = scene.getTransformMatrix().m;
    const clip = {
      x: m[0] * water.x + m[4] * water.y + m[8] * water.z + m[12],
      y: m[1] * water.x + m[5] * water.y + m[9] * water.z + m[13],
      z: m[2] * water.x + m[6] * water.y + m[10] * water.z + m[14],
      w: m[3] * water.x + m[7] * water.y + m[11] * water.z + m[15],
    };
    // Пиксели считаем без квантования NDC: округление до одного знака
    // до умножения на ширину давало погрешность до ~80 px при радиусе
    // окна 110 px — проверка могла ложно срабатывать.
    const project =
      clip.w > 1e-6
        ? {
            x: (clip.x / clip.w) * 0.5 * width + width / 2,
            y: (0.5 - (clip.y / clip.w) * 0.5) * height,
          }
        : null;

    // Центр масс пикселей, которые появились после установки маркера.
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const diff =
          Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (diff > 24) {
          sumX += x;
          sumY += y;
          count += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    // Сравнение двух окон: там, где отражение должно быть, и там, где оно
    // оказалось бы при зеркальном развороте по горизонтали.
    const windowCount = (cx, cy, half) => {
      let hits = 0;
      for (let y = Math.max(0, cy - half); y < Math.min(height, cy + half); y += 1) {
        for (let x = Math.max(0, cx - half); x < Math.min(width, cx + half); x += 1) {
          const i = (y * width + x) * 4;
          const d =
            Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          if (d > 24) hits += 1;
        }
      }
      return hits;
    };
    const expectedWindow = project ? windowCount(Math.round(project.x), Math.round(project.y), 110) : 0;
    const mirroredWindow = project
      ? windowCount(Math.round(width - 1 - project.x), Math.round(project.y), 110)
      : 0;

    return {
      changedPixels: count,
      expectedWindow,
      mirroredWindow,
      centroid: count ? { x: Math.round(sumX / count), y: Math.round(sumY / count) } : null,
      box: count ? { minX, maxX, minY, maxY } : null,
      expected: project,
      waterPoint: {
        x: Number(water.x.toFixed(1)),
        z: Number(water.z.toFixed(1)),
      },
      canvas: { width, height },
      markerProjectionAvailable: Boolean(project),
    };
  },
  { before, after, point: MARKER },
);

console.log(JSON.stringify({ markerInfo, ...analysis, errors }, null, 1));
await browser.close();
