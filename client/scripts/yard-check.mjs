import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

/**
 * Проверка грузовых площадок сцены: контейнерный двор и генеральные грузы.
 *
 * Контейнеры: количество, совпадение TEU с данными площадок, посадка на плиту,
 * ярусность, габариты. Генеральные грузы: число мест, причальная полоса и
 * открытая площадка, посадка на грунт, отсутствие пересечения с двором и
 * видимость в исходном ракурсе. Отчёт — scripts/yard-report.json.
 */
const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:5080";
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const state = await fetch(`${apiUrl}/api/state`).then((response) => response.json());
const yards = state.yards;

/** Габариты зон: те же числа, что в generalCargo.ts. */
const CARGO_PAD = { x: 342, z: 80, width: 300, depth: 340, groundY: 1.96 };
const STAGING = { x0: -300, x1: 300, z0: 68, z1: 95, groundY: 1.94 };

const browser = await chromium.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dock-center", { timeout: 30_000 });
  await page.waitForFunction(
    () => Boolean(window.__smarttwinDebug?.containerYard?.()) &&
      Boolean(window.__smarttwinDebug?.generalCargo?.()),
    { timeout: 120_000 },
  );
  await page.waitForTimeout(2_000);

  const probe = await page.evaluate(() => {
    const debug = window.__smarttwinDebug;
    const scene = debug.scene;
    const collect = (rootName) => {
      const root = scene.getTransformNodeByName(rootName);
      const meshes = scene.meshes.filter(
        (mesh) => mesh.thinInstanceCount > 0 && mesh.parent === root,
      );
      const storage = meshes
        .map((mesh) => mesh._thinInstanceDataStorage?.matrixData)
        .filter(Boolean);
      const positions = [];
      let minY = Infinity;
      let maxY = -Infinity;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const buffer of storage) {
        for (let offset = 0; offset < buffer.length; offset += 16) {
          const x = buffer[offset + 12];
          const y = buffer[offset + 13];
          const z = buffer[offset + 14];
          positions.push([x, y, z]);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
      }
      return {
        meshes: meshes.length,
        positions,
        bbox: { minX, maxX, minY, maxY, minZ, maxZ },
      };
    };

    const camera = scene.activeCamera;
    const engine = scene.getEngine();
    const width = engine.getRenderWidth();
    const height = engine.getRenderHeight();
    const V3 = camera.target.constructor;
    const Matrix = scene.getTransformMatrix().constructor;
    const viewport = camera.viewport.toGlobal(width, height);
    const project = (x, y, z) => {
      const point = V3.Project(
        new V3(x, y, z),
        Matrix.Identity(),
        scene.getTransformMatrix(),
        viewport,
      );
      return {
        x: Math.round(point.x),
        y: Math.round(point.y),
        inside:
          point.x > width * 0.02 &&
          point.x < width * 0.98 &&
          point.y > height * 0.02 &&
          point.y < height * 0.98,
      };
    };

    let triangles = 0;
    for (const mesh of scene.meshes) {
      triangles += mesh.getTotalIndices() * (mesh.thinInstanceCount || 1);
    }
    return {
      containers: collect("root-containers"),
      cargo: collect("root-cargo"),
      containerStats: debug.containerYard(),
      cargoStats: debug.generalCargo(),
      craneStats: debug.cargoCranes(),
      textures: scene.textures.length,
      triangles: Math.round(triangles / 3),
      drawCalls: engine._drawCalls?.current ?? null,
      viewport: { width, height },
      projected: {
        padCentre: project(490, 6, 250),
        staging: project(0, 3, 80),
        shipWest: project(-100, 12, -22),
        shipEast: project(100, 12, -22),
      },
    };
  });

  // ── Контейнерный двор ────────────────────────────────────────────────────
  const containerStats = probe.containerStats;
  check(
    "контейнерный двор: 45 шаблонов (15 линий × 3 типа)",
    containerStats.templates === 45,
    `шаблонов: ${containerStats.templates}`,
  );
  check(
    "контейнеров больше 10 000",
    containerStats.containers > 10_000,
    `контейнеров: ${containerStats.containers}`,
  );

  const mismatches = [];
  for (const yard of yards) {
    const rendered = containerStats.blocks.find((block) => block.block === yard.block);
    if (!rendered) {
      mismatches.push(`${yard.block}: нет штабелей`);
      continue;
    }
    const delta = Math.abs(rendered.teu - yard.occupiedTeu);
    const tolerance = Math.max(4, yard.occupiedTeu * 0.01);
    if (delta > tolerance) {
      mismatches.push(`${yard.block}: сцена ${rendered.teu} TEU, данные ${yard.occupiedTeu}`);
    }
  }
  check("TEU на сцене совпадают с данными площадок", mismatches.length === 0, mismatches.join("; "));

  check(
    "контейнеры стоят на плите двора",
    Math.abs(probe.containers.bbox.minY - 2.12) < 0.01,
    `низ штабеля Y=${probe.containers.bbox.minY.toFixed(2)}`,
  );
  check(
    "контейнерные штабели не выше пяти ярусов",
    probe.containers.bbox.maxY < 2.12 + 5 * 2.896 + 0.01,
    `верх штабеля Y=${probe.containers.bbox.maxY.toFixed(2)}`,
  );
  const halfLength = (24 * 12.6) / 2 + 3;
  const halfDepth = (2 * 10 * 2.6 + 9) / 2 + 3;
  const containersOutside = probe.containers.positions.filter(
    ([x, , z]) =>
      !yards.some(
        (yard) =>
          Math.abs(x - yard.position.x) <= halfLength &&
          Math.abs(z - yard.position.z) <= halfDepth,
      ),
  );
  check(
    "контейнеры не выходят за площадки",
    containersOutside.length === 0,
    `вне площадок: ${containersOutside.length}`,
  );
  check(
    "двор укладывается в 400 вызовов отрисовки",
    probe.containers.meshes <= 400,
    `${probe.containers.meshes} мешей-мастеров`,
  );

  // ── Генеральные грузы ────────────────────────────────────────────────────
  const cargoStats = probe.cargoStats;
  check(
    "генеральные грузы: все 15 моделей в деле",
    cargoStats.templates === 15,
    `шаблонов: ${cargoStats.templates}, мест: ${cargoStats.units}`,
  );
  check(
    "генеральных грузов больше 1 500 мест",
    cargoStats.units > 1_500,
    `мест: ${cargoStats.units}`,
  );
  check(
    "площадка укладывается в 80 вызовов отрисовки",
    probe.cargo.meshes <= 80,
    `${probe.cargo.meshes} мешей-мастеров`,
  );

  const inPad = (x, z) =>
    x >= CARGO_PAD.x - 1 &&
    x <= CARGO_PAD.x + CARGO_PAD.width + 1 &&
    z >= CARGO_PAD.z - 1 &&
    z <= CARGO_PAD.z + CARGO_PAD.depth + 1;
  const inStaging = (x, z) =>
    x >= STAGING.x0 - 1 && x <= STAGING.x1 + 1 && z >= STAGING.z0 && z <= STAGING.z1;
  const cargoOutside = probe.cargo.positions.filter(([x, , z]) => !inPad(x, z) && !inStaging(x, z));
  check(
    "генеральные грузы только на площадке и в причальной полосе",
    cargoOutside.length === 0,
    `вне зон: ${cargoOutside.length}`,
  );
  const overlapYard = probe.cargo.positions.filter(
    ([x, , z]) => Math.abs(x) < 322 && z > 95 && z < 345,
  );
  check(
    "генеральные грузы не пересекаются с контейнерным двором",
    overlapYard.length === 0,
    `пересечений: ${overlapYard.length}`,
  );
  check(
    "грузовые места стоят на грунте",
    probe.cargo.bbox.minY > 1.9 && probe.cargo.bbox.minY < 2.0,
    `низ штабеля Y=${probe.cargo.bbox.minY.toFixed(2)}`,
  );
  check(
    "штабели грузов не выше 6 м",
    probe.cargo.bbox.maxY < 5.5,
    `верх штабеля Y=${probe.cargo.bbox.maxY.toFixed(2)}`,
  );

  // ── Краны генеральных грузов ─────────────────────────────────────────────
  const craneStats = probe.craneStats;
  check(
    "краны генеральных грузов загружены",
    craneStats.cranes === 4 && craneStats.templates === 2,
    `${craneStats.cranes} крана, ${craneStats.templates} модели, ${craneStats.drawMeshes} вызовов`,
  );
  const portals = craneStats.positions.filter((crane) => crane.model.startsWith("portal"));
  const mobiles = craneStats.positions.filter((crane) => crane.model.startsWith("mobile"));
  check(
    "портальные краны стоят на рельсовом пути",
    portals.length === 2 &&
      portals.every((crane) => Math.abs(crane.y - 2.08) < 0.01 && Math.abs(crane.z - 93.2) < 0.01),
    portals.map((crane) => `(${crane.x}; ${crane.z}; ${crane.y})`).join(" "),
  );
  check(
    "мобильные краны опираются на плиту площадки",
    mobiles.length === 2 && mobiles.every((crane) => Math.abs(crane.y - 1.96) < 0.01),
    mobiles.map((crane) => `(${crane.x}; ${crane.z})`).join(" "),
  );
  const cranesOffPad = craneStats.positions.filter(
    (crane) => !inPad(crane.x, crane.z),
  );
  check(
    "краны не выходят за площадку",
    cranesOffPad.length === 0,
    `вне площадки: ${cranesOffPad.map((crane) => crane.x).join(", ")}`,
  );
  const underTrack = probe.cargo.positions.filter(
    ([x, , z]) => x > 342 && x < 642 && z > 84 && z < 110,
  );
  check(
    "подкрановый путь свободен от груза",
    underTrack.length === 0,
    `мест на рельсах: ${underTrack.length}`,
  );

  // ── Кадр ─────────────────────────────────────────────────────────────────
  const projected = probe.projected;
  check(
    "площадка генеральных грузов видна в исходном ракурсе",
    projected.padCentre.inside,
    `x=${projected.padCentre.x}, y=${projected.padCentre.y} при ${probe.viewport.width}×${probe.viewport.height}`,
  );
  check(
    "обе площадки и оба судна в кадре",
    projected.staging.inside && projected.shipWest.inside && projected.shipEast.inside,
    `полоса ${projected.staging.x},${projected.staging.y}; суда ${projected.shipWest.x},${projected.shipWest.y} / ${projected.shipEast.x},${projected.shipEast.y}`,
  );
  check("нет ошибок в консоли", errors.length === 0, errors.slice(0, 3).join(" | "));

  const report = {
    yards: yards.map((yard) => ({
      block: yard.block,
      capacityTeu: yard.capacityTeu,
      occupiedTeu: yard.occupiedTeu,
      renderedContainers:
        containerStats.blocks.find((block) => block.block === yard.block)?.containers ?? 0,
      renderedTeu: containerStats.blocks.find((block) => block.block === yard.block)?.teu ?? 0,
    })),
    containers: {
      total: containerStats.containers,
      teu: containerStats.teu,
      templates: containerStats.templates,
      drawMeshes: containerStats.drawMeshes,
      bbox: probe.containers.bbox,
    },
    cargo: {
      units: cargoStats.units,
      templates: cargoStats.templates,
      drawMeshes: cargoStats.drawMeshes,
      byType: cargoStats.byType,
      bbox: probe.cargo.bbox,
    },
    viewport: probe.viewport,
    projected,
    drawCalls: probe.drawCalls,
    triangles: probe.triangles,
    textures: probe.textures,
    results,
  };
  writeFileSync("scripts/yard-report.json", JSON.stringify(report, null, 2), "utf8");
  const failed = results.filter((item) => !item.pass);
  console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} проверок пройдено`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
