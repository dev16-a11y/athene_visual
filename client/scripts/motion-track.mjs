import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const id = process.env.TRACK_ID ?? "truck-01";
const waitMs = Number(process.env.TRACK_WAIT ?? 12000);

const browser = await chromium.launch({
  executablePath: EDGE,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
await page.goto("http://127.0.0.1:5173/?engine=webgl2", { waitUntil: "load" });
await page.waitForFunction(() => Boolean(window.__smarttwinDebug), null, { timeout: 60000 });
await page.waitForTimeout(waitMs);

const data = await page.evaluate((entityId) => {
  const debug = window.__smarttwinDebug;
  return {
    track: debug.motionTrack(entityId),
    stats: debug.motionProbe(entityId)?.stats ?? null,
    root: debug.motionProbe(entityId)?.root ?? null,
  };
}, id);

console.log(`измерений: ${data.track.length}  stats=${JSON.stringify(data.stats)}`);
console.log(`root=${JSON.stringify(data.root)}`);
for (let index = 0; index < data.track.length; index += 1) {
  const point = data.track[index];
  const previous = data.track[index - 1];
  const ds = previous ? (point.s - previous.s).toFixed(2) : "-";
  const dt = previous ? point.time - previous.time : "-";
  const speed = previous
    ? ((point.s - previous.s) / ((point.time - previous.time) / 1000)).toFixed(2)
    : "-";
  console.log(
    `#${index} t=${new Date(point.time).toISOString().slice(11, 23)} s=${point.s} ds=${ds} dt=${dt} v=${speed} pos=(${point.x},${point.z})`,
  );
}
await browser.close();
