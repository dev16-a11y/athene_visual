/**
 * Проверка железнодорожного состава в браузере: посадка на путь, раскладка по
 * сцепкам, профиль движения, качение колёс, видимость в кадре.
 *
 * Запуск: node scripts/train-check.mjs (нужны Vite на 5173 и API на 5080).
 */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL = process.env.TRAIN_URL ?? "http://127.0.0.1:5173/?engine=webgl2";
const RAIL_TOP_Y = 2.35;
const RAIL_Z = 87;
const GAUGE = 1.52;
const WHEEL_RADIUS = { shunter: 0.5, default: 0.46 };
const PITCH = {
  shunter: 17.52,
  container: 26.72,
  gondola: 14.52,
  grain: 15.72,
  tank: 13.52,
  covered: 16.32,
  pipes: 15.32,
};

const browser = await chromium.launch({
  executablePath: EDGE,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => Boolean(window.__smarttwinDebug), null, {
  timeout: 90_000,
});
const loadedMs = Number(
  await page.evaluate(async () => {
    const started = performance.now();
    while (performance.now() - started < 120_000) {
      if (window.__smarttwinDebug.trainProbe()?.ready) {
        return (performance.now() - started).toFixed(0);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return -1;
  }),
);

const geometry = await page.evaluate(() => window.__smarttwinDebug.trainProbe());

// Камера на состав и проверка, что он действительно попадает в кадр.
await page.evaluate(() => window.__smarttwinDebug.focusEntity("train-01"));
await page.waitForTimeout(2500);
const frame = await page.evaluate(() => {
  const scene = window.__smarttwinDebug.scene;
  const camera = scene.activeCamera;
  const engine = scene.getEngine();
  const train = scene.meshes.filter(
    (mesh) => mesh.metadata?.entityId === "train-01" && mesh.isEnabled(),
  );
  let inFrustum = 0;
  for (const mesh of train) {
    mesh.computeWorldMatrix(true);
    if (camera.isInFrustum(mesh)) {
      inFrustum += 1;
    }
  }
  let trainHits = 0;
  let otherHits = 0;
  let sampled = 0;
  for (let x = 8; x < engine.getRenderWidth(); x += 24) {
    for (let y = 8; y < engine.getRenderHeight(); y += 24) {
      sampled += 1;
      const entityId = scene.pick(x, y)?.pickedMesh?.metadata?.entityId;
      if (entityId === "train-01") {
        trainHits += 1;
      } else if (entityId) {
        otherHits += 1;
      }
    }
  }
  return {
    sampled,
    trainHits,
    otherHits,
    meshes: train.length,
    inFrustum,
    vertices: train.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
    activeMeshes: scene.getActiveMeshes().length,
  };
});

// Профиль движения: покадрово 25 секунд по лёгкому состоянию.
const motion = await page.evaluate(async () => {
  const debug = window.__smarttwinDebug;
  const frames = [];
  const started = performance.now();
  while (performance.now() - started < 25_000) {
    const state = debug.trainState();
    frames.push({
      t: performance.now() - started,
      x: state.x,
      speed: state.speed,
      roll: state.roll,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return frames;
});

// Торможение у конца пути, стоянка и отправление назад.
const stop = await page.evaluate(async () => {
  const debug = window.__smarttwinDebug;
  const probe = debug.trainProbe();
  debug.trainSetX(probe.bounds.maxX - 12);
  const frames = [];
  const started = performance.now();
  while (performance.now() - started < 44_000) {
    frames.push({ t: performance.now() - started, ...debug.trainState() });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return { frames, limitX: probe.bounds.maxX };
});

const stats = await page.evaluate(() => window.__smarttwinDebug.trainStats());

const fps = await page.evaluate(async () => {
  const started = performance.now();
  let frames = 0;
  while (performance.now() - started < 5000) {
    frames += 1;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return (frames / (performance.now() - started)) * 1000;
});

await browser.close();

// --- разбор ---------------------------------------------------------------
const vehicles = geometry.vehicles ?? [];
const steps = [];
const accelerations = [];
for (let index = 1; index < motion.length; index += 1) {
  const dt = (motion[index].t - motion[index - 1].t) / 1000;
  steps.push(motion[index].x - motion[index - 1].x);
  if (dt > 0.0005) {
    accelerations.push((motion[index].speed - motion[index - 1].speed) / dt);
  }
}
const speeds = motion.map((frame) => frame.speed);
const accelerationsSorted = [...accelerations]
  .map(Math.abs)
  .sort((a, b) => a - b);
const percentile = (values, share) =>
  values[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;
let stepViolations = 0;
let accelViolations = 0;
for (let index = 1; index < motion.length; index += 1) {
  const dt = (motion[index].t - motion[index - 1].t) / 1000;
  const step = motion[index].x - motion[index - 1].x;
  if (Math.abs(step) > Math.max(speeds[index], speeds[index - 1]) * dt + 0.02) {
    stepViolations += 1;
  }
  if (
    Math.abs(motion[index].speed - motion[index - 1].speed) >
    0.3 * dt + 0.02
  ) {
    accelViolations += 1;
  }
}
const first = motion[0];
const last = motion[motion.length - 1];
const travelled = last.x - first.x;
const rollDelta = last.roll - first.roll;
const radius = vehicles[0]
  ? (WHEEL_RADIUS[vehicles[0].key] ?? WHEEL_RADIUS.default)
  : 0.5;

const spacing = [];
for (let index = 1; index < vehicles.length; index += 1) {
  const expected =
    (PITCH[vehicles[index - 1].key] + PITCH[vehicles[index].key]) / 2;
  spacing.push({
    pair: `${vehicles[index - 1].key}→${vehicles[index].key}`,
    measured: Number(
      (vehicles[index].offset - vehicles[index - 1].offset).toFixed(3),
    ),
    expected: Number(expected.toFixed(3)),
  });
}

const stopFrames = stop.frames;
const stoppedFrames = stopFrames.filter((frame) => Math.abs(frame.speed) < 1e-3);
const reversedFrames = stopFrames.filter((frame) => frame.direction < 0);
const dwellMax = Math.max(...stopFrames.map((frame) => frame.dwell));

const report = {
  url: URL,
  loadedMs,
  fps: Number(fps.toFixed(1)),
  geometry: {
    vehicles: vehicles.map((vehicle) => ({
      key: vehicle.key,
      offset: vehicle.offset,
      axles: vehicle.axles,
      cargo: `${vehicle.cargo}/${vehicle.cargoTotal}`,
      minY: vehicle.bounds.minY,
      height: Number((vehicle.bounds.maxY - vehicle.bounds.minY).toFixed(2)),
      lengthX: Number((vehicle.bounds.maxX - vehicle.bounds.minX).toFixed(2)),
      centreZ: Number(
        ((vehicle.bounds.minZ + vehicle.bounds.maxZ) / 2).toFixed(3),
      ),
      wheelCentreZ: vehicle.wheelCentreZ,
      wheelSpanZ: vehicle.wheelSpanZ,
      wheelOrigin: vehicle.wheelOrigin,
    })),
    consistLength: geometry.length,
    bounds: geometry.bounds,
  },
  checks: {
    /** Нижняя точка колеса — гребень, он уходит ниже головки рельса. */
    railContact: vehicles.every(
      (vehicle) =>
        vehicle.bounds.minY <= RAIL_TOP_Y + 0.02 &&
        vehicle.bounds.minY >= RAIL_TOP_Y - 0.15,
    ),
    wheelsOnRails: vehicles.every(
      (vehicle) =>
        vehicle.wheelCentreZ !== null &&
        Math.abs(vehicle.wheelCentreZ - RAIL_Z) < 0.05,
    ),
    /** Размах по Z — это колея плюс две толщины бандажа (≈0,19 м каждая). */
    gaugeOk: vehicles.every(
      (vehicle) =>
        vehicle.wheelSpanZ !== null &&
        Math.abs(vehicle.wheelSpanZ - (GAUGE + 0.38)) < 0.1,
    ),
    gaugeSpan: vehicles.map((vehicle) => vehicle.wheelSpanZ),
    centresOnTrack: vehicles.every((vehicle) => {
      const centre = (vehicle.bounds.minZ + vehicle.bounds.maxZ) / 2;
      return Math.abs(centre - RAIL_Z) < 0.6;
    }),
    spacingErrorMax: Number(
      Math.max(
        ...spacing.map((pair) => Math.abs(pair.measured - pair.expected)),
      ).toFixed(3),
    ),
    locoFirst:
      vehicles.length > 0 &&
      vehicles[0].bounds.minX > vehicles[vehicles.length - 1].bounds.minX,
  },
  frame,
  motion: {
    frames: motion.length,
    seconds: Number(((last.t - first.t) / 1000).toFixed(2)),
    travelled: Number(travelled.toFixed(2)),
    stepSum: Number(steps.reduce((sum, value) => sum + value, 0).toFixed(2)),
    maxStep: Number(Math.max(...steps.map(Math.abs)).toFixed(3)),
    speedMax: Number(Math.max(...speeds).toFixed(3)),
    speedMin: Number(Math.min(...speeds).toFixed(3)),
    accelerationMax: Number(
      Math.max(...accelerations.map(Math.abs)).toFixed(3),
    ),
    accelerationP99: Number(percentile(accelerationsSorted, 0.99).toFixed(3)),
    accelerationMedian: Number(percentile(accelerationsSorted, 0.5).toFixed(3)),
    stepViolations,
    accelViolations,
    wheelRoll: {
      rollDelta: Number(rollDelta.toFixed(3)),
      expectedRadiusTurns: Number((travelled / radius).toFixed(3)),
      /** |ratio| = 1 — колесо катится без проскальзывания. */
      ratio: Number((rollDelta / (travelled / radius)).toFixed(4)),
    },
  },
  stopTest: {
    frames: stopFrames.length,
    limitX: stop.limitX,
    reachedX: Number(Math.max(...stopFrames.map((frame) => frame.x)).toFixed(3)),
    stoppedFrames: stoppedFrames.length,
    maxDwellSeconds: Number(dwellMax.toFixed(2)),
    reversed: reversedFrames.length > 0,
    afterReverseDistance: reversedFrames.length
      ? Number(
          (
            reversedFrames[reversedFrames.length - 1].x - reversedFrames[0].x
          ).toFixed(3),
        )
      : 0,
  },
  spacing,
  /** Счётчики самого цикла отрисовки: шаг всегда равен v·dt. */
  stats,
  consoleErrors,
};

console.log(JSON.stringify(report, null, 2));
