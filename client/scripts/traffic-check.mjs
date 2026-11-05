/**
 * Проверка интервала между тягачами: машины не должны проезжать друг сквозь
 * друга. Замер идёт по отрисованным позициям (что видит пользователь), а не по
 * данным сервера: именно отрисовка раньше показывала наложение.
 *
 * Запуск: node scripts/traffic-check.mjs > scripts/traffic-report.json
 */
import { chromium } from "playwright-core";

const URL = "http://127.0.0.1:5173/?engine=webgl2";
const SECONDS = Number(process.env.TRAFFIC_SECONDS ?? 170);
const RIG_LENGTH = 3.4 + 15.9; // нос + корма автопоезда, м

const browser = await chromium.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  args: ["--use-angle=d3d11", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text().slice(0, 200));
  }
});
page.on("pageerror", (error) => {
  consoleErrors.push(String(error).slice(0, 200));
});

await page.goto(URL, { waitUntil: "load" });
await page.waitForFunction(() => Boolean(window.__smarttwinDebug), null, {
  timeout: 90000,
});
await page.waitForFunction(
  () => {
    const debug = window.__smarttwinDebug;
    const probe = debug.motionProbe?.("truck-01");
    return Boolean(probe && probe.stats.mode === "route");
  },
  null,
  { timeout: 90000 },
);
await page.waitForTimeout(2500);

const result = await page.evaluate(
  async ({ seconds, rig }) => {
    const debug = window.__smarttwinDebug;
    const ids = ["truck-01", "truck-02", "truck-03", "truck-04", "truck-05"];
    const frames = [];
    const started = performance.now();
    let blockedSamples = 0;
    const blockedByTruck = Object.fromEntries(ids.map((id) => [id, 0]));
    const samples = { total: 0 };
    while (performance.now() - started < seconds * 1000) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const rows = ids.map((id) => {
        const probe = debug.motionProbe(id);
        return {
          id,
          x: probe.root.x,
          z: probe.root.z,
          blocked: probe.stats.blocked === true,
          leadGap: probe.stats.leadGap,
          speed: probe.stats.speed,
        };
      });
      samples.total += 1;
      for (const row of rows) {
        if (row.blocked) {
          blockedSamples += 1;
          blockedByTruck[row.id] += 1;
        }
      }
      frames.push(rows);
    }

    // Разбор пар: на одной полосе (|Δz| < 1 м) считаем просвет между кормой
    // переднего и носом заднего. Именно он был отрицательным, когда машины
    // проезжали друг сквозь друга.
    let minClearance = Number.POSITIVE_INFINITY;
    let minClearanceAt = null;
    let overlapSamples = 0;
    const perPair = {};
    for (const rows of frames) {
      for (let i = 0; i < rows.length; i += 1) {
        for (let j = i + 1; j < rows.length; j += 1) {
          const a = rows[i];
          const b = rows[j];
          if (Math.abs(a.z - b.z) > 1) {
            continue;
          }
          const key = `${a.id}|${b.id}`;
          const clearance = Math.abs(a.x - b.x) - rig;
          if (!(key in perPair) || clearance < perPair[key]) {
            perPair[key] = Number(clearance.toFixed(2));
          }
          if (clearance < 0) {
            overlapSamples += 1;
          }
          if (clearance < minClearance) {
            minClearance = clearance;
            minClearanceAt = { pair: key, clearance: Number(clearance.toFixed(2)), x: [Number(a.x.toFixed(1)), Number(b.x.toFixed(1))] };
          }
        }
      }
    }
    return {
      seconds,
      samples: samples.total,
      blockedSamples,
      blockedByTruck,
      minClearance: Number(minClearance.toFixed(2)),
      minClearanceAt,
      overlapSamples,
      perPair,
      finalGap: frames.length
        ? Object.fromEntries(
            frames[frames.length - 1].map((row) => [row.id, row.leadGap]),
          )
        : {},
    };
  },
  { seconds: SECONDS, rig: RIG_LENGTH },
);

const fps = await page.evaluate(
  async () =>
    new Promise((resolve) => {
      const engine = window.__smarttwinDebug.scene.getEngine();
      resolve(Math.round(engine.getFps()));
    }),
);

const report = {
  url: URL,
  fps,
  consoleErrors,
  rigLength: RIG_LENGTH,
  ...result,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
