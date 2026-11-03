import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  args: ["--use-angle=d3d11", "--enable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:5173/?engine=webgl2", { waitUntil: "load" });
await page.waitForFunction(() => Boolean(window.__smarttwinDebug), null, { timeout: 90000 });
await page.waitForTimeout(8000);
const out = await page.evaluate(async () => {
  const debug = window.__smarttwinDebug;
  const scene = debug.scene;
  const id = "truck-01";
  const a = debug.motionProbe(id);
  await new Promise((r) => setTimeout(r, 1200));
  const b = debug.motionProbe(id);
  const dx = b.root.x - a.root.x;
  const dz = b.root.z - a.root.z;
  const len = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / len, z: dz / len };
  const meshes = scene.meshes.filter((m) => m.metadata?.entityId === id);
  const rows = meshes.map((m) => {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(false, false);
    const box = m.getBoundingInfo().boundingBox;
    const cx = (box.minimumWorld.x + box.maximumWorld.x) / 2;
    const cz = (box.minimumWorld.z + box.maximumWorld.z) / 2;
    const relX = cx - b.root.x;
    const relZ = cz - b.root.z;
    return {
      name: m.name.slice(0, 44),
      material: m.material?.name ?? null,
      verts: m.getTotalVertices(),
      along: +(relX * dir.x + relZ * dir.z).toFixed(2),
      sizeX: +(box.maximumWorld.x - box.minimumWorld.x).toFixed(2),
      sizeZ: +(box.maximumWorld.z - box.minimumWorld.z).toFixed(2),
      minY: +box.minimumWorld.y.toFixed(2),
      maxY: +box.maximumWorld.y.toFixed(2),
    };
  });
  rows.sort((p, q) => q.along - p.along);
  return { dir, speed: b.stats.speed, heading: b.root.headingDeg, count: rows.length, rows };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
