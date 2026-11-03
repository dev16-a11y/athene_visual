import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL = process.env.MOTION_URL ?? "http://127.0.0.1:5173/?engine=webgl2";
const CAPTURE_MS = Number(process.env.MOTION_CAPTURE_MS ?? 20000);
const TURN_BUDGET_MS = Number(process.env.MOTION_TURN_MS ?? 120000);

const browser = await chromium.launch({
  executablePath: EDGE,
  args: [
    "--use-angle=d3d11",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__smarttwinDebug), null, { timeout: 60000 });
await page.waitForFunction(
  () => {
    const probe = window.__smarttwinDebug.motionProbe();
    return Array.isArray(probe) && probe.filter((item) => item.kind === "truck").length >= 5;
  },
  null,
  { timeout: 90000 },
);
await page.waitForTimeout(6000);

const capture = await page.evaluate(async (durationMs) => {
  const debug = window.__smarttwinDebug;
  const ids = debug
    .motionProbe()
    .filter((item) => item.kind === "truck" || item.kind === "tug")
    .map((item) => item.id);
  const frames = [];
  const start = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const now = performance.now();
      frames.push({
        t: now - start,
        entities: debug
          .motionProbe()
          .filter((item) => ids.includes(item.id))
          .map((item) => ({
            id: item.id,
            x: item.root.x,
            z: item.root.z,
            heading: item.root.headingDeg,
            speed: item.stats.speed,
            offset: item.stats.routeOffset,
            stale: item.stats.stale,
            age: item.stats.sampleAgeMs,
          })),
      });
      if (now - start < durationMs) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return { ids, frames };
}, CAPTURE_MS);

function metrics(series) {
  const steps = [];
  const turns = [];
  let stalls = 0;
  let maxOffset = 0;
  let staleEver = false;
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const step = Math.hypot(current.x - previous.x, current.z - previous.z);
    steps.push(step);
    if (step < 0.002) stalls += 1;
    let delta = current.heading - previous.heading;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    turns.push(Math.abs(delta));
    maxOffset = Math.max(maxOffset, current.offset);
    if (current.stale) staleEver = true;
  }
  const mean = steps.reduce((sum, value) => sum + value, 0) / (steps.length || 1);
  const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)] ?? 0;
  const variance =
    steps.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (steps.length || 1);
  const sorted = [...steps].sort((a, b) => a - b);
  const durationSeconds = (series[series.length - 1].t - series[0].t) / 1000 || 1;
  const distance = steps.reduce((sum, value) => sum + value, 0);
  return {
    frames: series.length,
    meanStep: Number(mean.toFixed(4)),
    medianStep: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(4)),
    cv: Number((variance ** 0.5 / (mean || 1)).toFixed(3)),
    maxStep: Number(Math.max(...steps, 0).toFixed(3)),
    spikeFrames: steps.filter((value) => value > median * 3).length,
    stallFrames: stalls,
    maxTurnDeg: Number(Math.max(...turns, 0).toFixed(2)),
    speed: Number((distance / durationSeconds).toFixed(2)),
    maxRouteOffset: Number(maxOffset.toFixed(2)),
    staleEver,
  };
}

const perEntity = {};
for (const id of capture.ids) {
  const series = capture.frames
    .map((frame) => {
      const entity = frame.entities.find((item) => item.id === id);
      return entity ? { ...entity, t: frame.t } : null;
    })
    .filter(Boolean);
  perEntity[id] = metrics(series);
}
const renderedFrames = capture.frames.length;
const captureSeconds = (capture.frames.at(-1).t - capture.frames[0].t) / 1000;

// Живой поворот: ждём, пока любая машина подойдёт к торцу причала.
const turnWindow = await page.evaluate(async (budgetMs) => {
  const debug = window.__smarttwinDebug;
  const trucks = () => debug.motionProbe().filter((item) => item.kind === "truck");
  const start = performance.now();
  let targetId = null;
  while (performance.now() - start < budgetMs && !targetId) {
    const near = trucks().find((item) => {
      const x = item.root.x;
      const speed = item.stats.speed;
      const heading = Math.abs(item.root.headingDeg);
      const towardEast = x > 168 && heading < 25;
      const towardWest = x < -168 && heading > 155;
      return speed > 0.5 && (towardEast || towardWest);
    });
    if (near) targetId = near.id;
    else await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!targetId) return [];
  const frames = [];
  const captureStart = performance.now();
  while (performance.now() - captureStart < 9000) {
    const entity = debug.motionProbe(targetId);
    frames.push({
      t: performance.now() - captureStart,
      id: targetId,
      x: entity.root.x,
      z: entity.root.z,
      heading: entity.root.headingDeg,
      speed: entity.stats.speed,
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return frames;
}, TURN_BUDGET_MS);

function turnMetrics(frames) {
  if (frames.length < 30) return { frames: frames.length, captured: false };
  const steps = [];
  const turns = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (previous.id !== current.id) continue;
    steps.push(Math.hypot(current.x - previous.x, current.z - previous.z));
    let delta = current.heading - previous.heading;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    turns.push(Math.abs(delta));
  }
  const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)] ?? 0;
  return {
    captured: true,
    frames: frames.length,
    seconds: Number(((frames.at(-1).t - frames[0].t) / 1000).toFixed(2)),
    maxStep: Number(Math.max(...steps).toFixed(3)),
    medianStep: Number(median.toFixed(3)),
    maxTurnDeg: Number(Math.max(...turns).toFixed(2)),
    headingSpanDeg: Number(
      Math.abs(frames.at(-1).heading - frames[0].heading).toFixed(1),
    ),
    maxAbsX: Number(Math.max(...frames.map((frame) => Math.abs(frame.x))).toFixed(2)),
  };
}

const selfTest = await page.evaluate(() => window.__smarttwinDebug.motionSelfTest());

// Масштаб шкалы: сколько кадров и сколько применений состояния за секунду.
const countersBefore = await page.evaluate(() => window.__smarttwinDebug.motionCounters());
await page.waitForTimeout(4000);
const countersAfter = await page.evaluate(() => window.__smarttwinDebug.motionCounters());

// Маркер выбора должен идти за движущейся машиной, а не отставать на сообщение.
const selection = await page.evaluate(async () => {
  const debug = window.__smarttwinDebug;
  debug.selectEntity("truck-01");
  const gaps = [];
  let first = null;
  let last = null;
  for (let index = 0; index < 8; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const probe = debug.motionProbe("truck-01");
    const marker = debug.selectionMarker();
    gaps.push(Math.hypot(marker.x - probe.root.x, marker.z - probe.root.z));
    last = { x: probe.root.x, z: probe.root.z };
    first ??= last;
  }
  const marker = debug.selectionMarker();
  debug.selectEntity(null);
  return {
    selectedId: marker.selectedId,
    enabled: marker.enabled,
    maxGap: Number(Math.max(...gaps).toFixed(3)),
    truckTravelled: Number(
      Math.hypot(last.x - first.x, last.z - first.z).toFixed(2),
    ),
  };
});

// Возврат во вкладку: не должно быть прыжка, движение должно возобновиться.
const visibility = await page.evaluate(async () => {
  const read = () =>
    window.__smarttwinDebug.motionProbe().filter((item) => item.kind === "truck");
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const before = read();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const whileHidden = read();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
  await frame();
  await frame();
  const rightAfter = read();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const later = read();
  const jumpOnReturn = Math.max(
    ...whileHidden.map((item, index) => {
      const now = rightAfter[index];
      return Math.hypot(now.root.x - item.root.x, now.root.z - item.root.z);
    }),
  );
  const resumed = Math.max(
    ...rightAfter.map((item, index) => {
      const now = later[index];
      return Math.hypot(now.root.x - item.root.x, now.root.z - item.root.z);
    }),
  );
  const hiddenTravel = Math.max(
    ...before.map((item, index) => {
      const now = whileHidden[index];
      return Math.hypot(now.root.x - item.root.x, now.root.z - item.root.z);
    }),
  );
  return {
    jumpOnReturn: Number(jumpOnReturn.toFixed(3)),
    travelWhileHidden: Number(hiddenTravel.toFixed(2)),
    resumedWithin3s: Number(resumed.toFixed(2)),
  };
});

const report = {
  url: URL,
  captureSeconds: Number(captureSeconds.toFixed(1)),
  renderedFrames,
  fps: Number((renderedFrames / captureSeconds).toFixed(1)),
  perEntity,
  liveTurn: turnMetrics(turnWindow),
  clockRate: {
    framesPerSecond: Number(
      ((countersAfter.frames - countersBefore.frames) / 4).toFixed(1),
    ),
    snapshotsPerSecond: Number(
      ((countersAfter.snapshots - countersBefore.snapshots) / 4).toFixed(2),
    ),
  },
  selfTest,
  visibility,
  selection,
  consoleErrors,
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
