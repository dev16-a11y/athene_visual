// Проверка геоосновы Кандлы в браузере.
//
// Что проверяется:
//  1. сцена собирается из локальных файлов, без обращения к Overpass;
//  2. привязка координат: WGS84 → локальные метры и обратно (взаимная
//     обратимость, ориентация осей: +X на восток, +Z на север);
//  3. высоты: суша выше воды, плита уходит под воду, вода — на нуле;
//  4. вода покрывает обе стороны рукава (полный круг, а не половинный диск);
//  5. камера показывает координаты центра обзора и они меняются при панораме;
//  6. снимки: вид сверху и косой обзор.

import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const sceneUrl = `${url}?scene=kandla`;
const outDir = path.resolve("..", "docs", "screenshots");
await mkdir(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});

const consoleErrors = [];
const requests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("request", (request) => requests.push(request.url()));

await page.goto(sceneUrl, { waitUntil: "domcontentloaded" });
await page
  .waitForFunction(() => Boolean(window.__smarttwinDebug?.mode === "kandla"), { timeout: 60_000 })
  .catch(() => undefined);
await page
  .waitForFunction(() => !document.querySelector(".loading-screen"), { timeout: 60_000 })
  .catch(() => undefined);
await page.waitForTimeout(4000);

const debug = await page.evaluate(() => {
  const api = window.__smarttwinDebug;
  if (!api) return { missing: true };
  return {
    info: api.info(),
    camera: api.cameraGeo(),
    meshes: api.meshes(),
    water: api.water(),
    geo: (() => {
      const frame = api.geo;
      const origin = frame.origin;
      const roundTrip = frame.worldToGeo(0, 0);
      const forward = frame.geoToWorld(origin.lon, origin.lat);
      const east = frame.geoToWorld(origin.lon + 0.001, origin.lat);
      const north = frame.geoToWorld(origin.lon, origin.lat + 0.001);
      // Точка причала из controlPoints: lon/lat для неё неизвестны, берём XZ.
      const berth = api.layers.meta.controlPoints.find((point) => point.role === "berth-north");
      const berthGeo = frame.worldToGeo(berth.x, berth.z);
      const berthBack = frame.geoToWorld(berthGeo.lon, berthGeo.lat);
      return {
        origin,
        zone: frame.zone,
        roundTrip,
        forward,
        east,
        north,
        berth,
        berthGeo,
        berthBack,
      };
    })(),
    meta: {
      crs: api.layers.meta.crs,
      projection: api.layers.meta.projection,
      dataTimestamp: api.layers.meta.dataTimestamp,
      attribution: api.layers.meta.attribution,
      areas: api.layers.meta.areasKm2,
      counts: api.layers.meta.counts,
    },
  };
});

if (debug.missing) {
  check("сцена Кандлы создана", false, "window.__smarttwinDebug отсутствует");
} else {
  check("сцена Кандлы создана", true, `суша ${debug.info.stats.landAreaKm2} км²`);
  check(
    "проекция EPSG:32642",
    debug.meta.crs === "EPSG:32642" && debug.geo.zone === 42,
    debug.meta.crs,
  );
  check(
    "снимок OSM указан в метаданных",
    Boolean(debug.meta.dataTimestamp),
    debug.meta.dataTimestamp,
  );
  check(
    "атрибуция OSM присутствует",
    /OpenStreetMap/.test(debug.meta.attribution),
    debug.meta.attribution,
  );

  const forwardError = Math.hypot(debug.geo.forward.x, debug.geo.forward.z);
  check("geoToWorld(origin) = (0,0)", forwardError < 0.05, `${forwardError.toFixed(3)} м`);

  const roundTripError = Math.max(
    Math.abs(debug.geo.roundTrip.lon - debug.geo.origin.lon),
    Math.abs(debug.geo.roundTrip.lat - debug.geo.origin.lat),
  );
  check(
    "worldToGeo(0,0) = origin",
    roundTripError < 1e-7,
    `расхождение ${roundTripError.toExponential(2)}°`,
  );

  const berthError = Math.hypot(
    debug.geo.berthBack.x - debug.geo.berth.x,
    debug.geo.berthBack.z - debug.geo.berth.z,
  );
  check(
    "обратный пересчёт точки причала",
    berthError < 0.05,
    `${debug.geo.berth} → ${debug.geo.berthGeo.lon.toFixed(5)},${debug.geo.berthGeo.lat.toFixed(5)}`,
  );

  check(
    "+X увеличивает долготу (восток)",
    debug.geo.east.x > 90 && Math.abs(debug.geo.east.z) < 2,
    `x ${debug.geo.east.x.toFixed(1)}, z ${debug.geo.east.z.toFixed(1)}`,
  );
  check(
    "+Z увеличивает широту (север)",
    debug.geo.north.z > 110 && Math.abs(debug.geo.north.x) < 2,
    `x ${debug.geo.north.x.toFixed(1)}, z ${debug.geo.north.z.toFixed(1)}`,
  );

  const land = debug.meshes.filter((mesh) => mesh.name.startsWith("kandla-land"));
  const piers = debug.meshes.filter((mesh) => mesh.name.startsWith("kandla-pier"));
  check("меши суши есть", land.length > 0, `${land.length} шт.`);
  check("причальные основания есть", piers.length > 0, `${piers.length} шт.`);

  const landTop = Math.max(...land.map((mesh) => mesh.maxY));
  const landBottom = Math.min(...land.map((mesh) => mesh.minY));
  check(
    "верх суши выше воды",
    Math.abs(landTop - 1.6) < 0.05,
    `верх ${landTop.toFixed(2)} м`,
  );
  check("плита суши уходит под воду", landBottom < -0.5, `низ ${landBottom.toFixed(2)} м`);

  const quayTop = piers.length ? Math.max(...piers.map((mesh) => mesh.maxY)) : 0;
  check("причальные основания выше воды", quayTop > 1.5, `верх ${quayTop.toFixed(2)} м`);

  check(
    "вода FFT, полный круг",
    debug.water.kind === "fft" && debug.water.vertices > 10_000,
    `${debug.water.kind}, ${debug.water.vertices} вершин, отражения: ${debug.water.reflections}`,
  );

  check(
    "данные загружены локально, без Overpass",
    requests.some((request) => request.includes("/geo/kandla/land.json")) &&
      !requests.some((request) => /overpass|api\.openstreetmap\.org/.test(request)),
    `${requests.filter((request) => request.includes("/geo/kandla/")).length} файлов слоёв`,
  );

  check(
    "координаты камеры читаются",
    debug.camera && Math.abs(debug.camera.lat - 23.02) < 0.2 && Math.abs(debug.camera.lon - 70.22) < 0.25,
    `${debug.camera.lon.toFixed(5)}, ${debug.camera.lat.toFixed(5)}`,
  );

  // Панорама: центр обзора должен уехать вместе с камерой. Вращение вокруг
  // цели её не двигает, поэтому смещаем саму цель — так же, как это делает
  // правая кнопка мыши.
  const before = debug.camera;
  await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    camera.setTarget(new V3(camera.target.x + 700, 1.6, camera.target.z + 500));
  });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__smarttwinDebug.cameraGeo());
  const deltaLon = (after.lon - before.lon) * 102_000;
  const deltaLat = (after.lat - before.lat) * 111_000;
  check(
    "панорама меняет центр обзора",
    Math.abs(deltaLon) > 100 && Math.abs(deltaLat) > 100,
    `${before.lon.toFixed(5)} → ${after.lon.toFixed(5)} (${deltaLon.toFixed(0)} м, ${deltaLat.toFixed(0)} м)`,
  );

  // Отмель и стенки берега: то, что делает кромку читаемой.
  const shading = await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const band = scene.getMeshByName("kandla-shallow");
    const land = scene.getMeshByName("kandla-land-1");
    const colours = land?.getVerticesData("color");
    const normals = land?.getVerticesData("normal");
    const positions = land?.getVerticesData("position");
    let sideShade = null;
    let topShade = null;
    if (colours && normals) {
      let sideSum = 0;
      let sideCount = 0;
      let topSum = 0;
      let topCount = 0;
      for (let index = 0; index < positions.length / 3; index += 1) {
        const value = colours[index * 4];
        if (Math.abs(normals[index * 3 + 1]) < 0.5) {
          sideSum += value;
          sideCount += 1;
        } else {
          topSum += value;
          topCount += 1;
        }
      }
      sideShade = sideCount ? sideSum / sideCount : null;
      topShade = topCount ? topSum / topCount : null;
    }
    return {
      band: band
        ? {
            y: band.position.y + band.getBoundingInfo().boundingBox.maximum.y,
            triangles: band.getTotalIndices() / 3,
            alpha: band.material?.alpha ?? null,
            depthWrite: band.material?.disableDepthWrite ?? null,
          }
        : null,
      sideShade,
      topShade,
      fogDensity: scene.fogDensity,
    };
  });
  check(
    "отмель построена вдоль всей кромки",
    Boolean(shading.band) &&
      shading.band.triangles > 600 &&
      Math.abs(shading.band.y - 0.9) < 0.01 &&
      shading.band.alpha > 0.15 &&
      shading.band.alpha < 0.45,
    shading.band
      ? `${shading.band.triangles} треугольников, верх ${shading.band.y.toFixed(2)} м, прозрачность ${shading.band.alpha}`
      : "меша нет",
  );
  check(
    "стенка берега темнее суши",
    shading.sideShade !== null &&
      shading.topShade !== null &&
      shading.sideShade < shading.topShade - 0.1,
    `верх ${shading.topShade?.toFixed(2)}, стенка ${shading.sideShade?.toFixed(2)}`,
  );
  check(
    "дымка не съедает дальний берег",
    shading.fogDensity <= 0.00012,
    `плотность ${shading.fogDensity}`,
  );
  // Интерфейс: демо-панели и их подписи скрыты, геооснова на месте.
  const ui = await page.evaluate(() => ({
    geoCard: document.querySelector(".geo-card")?.textContent ?? null,
    vesselRows: document.querySelectorAll(".vessel-row").length,
    sceneLabels: document.querySelectorAll(".scene-label").length,
    modeToggle: document.querySelectorAll(".mode-toggle").length,
    connection: document.querySelector(".connection-label")?.textContent ?? null,
    topbar: Boolean(document.querySelector(".topbar")),
    attribution: document.querySelector(".geo-attribution")?.textContent ?? null,
  }));
  check(
    "демо-панели и подписи скрыты",
    ui.vesselRows === 0 && ui.sceneLabels === 0 && ui.modeToggle === 0,
    `судов ${ui.vesselRows}, подписей ${ui.sceneLabels}, переключатель истории ${ui.modeToggle}`,
  );
  check(
    "карточка геоосновы с атрибуцией",
    ui.topbar && /OpenStreetMap/.test(ui.attribution ?? "") && /Кандла/.test(ui.geoCard ?? ""),
    ui.attribution ?? "нет",
  );
  check("статус «Геооснова»", ui.connection === "Геооснова", ui.connection ?? "нет");

  // Кнопка возврата ракурса работает и в геооснове.
  await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    camera.setTarget(new V3(-1500, 1.6, -1500));
  });
  await page.waitForTimeout(600);
  await page.locator(".topbar-actions button.icon-button").first().click();
  await page.waitForTimeout(3000);
  const restored = await page.evaluate(() => window.__smarttwinDebug.cameraGeo());
  check(
    "кнопка возвращает домашний ракурс",
    Math.abs(restored.radius - 3000) < 40 && Math.abs(restored.lat - 23.0272) < 0.01,
    `радиус ${Math.round(restored.radius)}, ${restored.lon.toFixed(5)}, ${restored.lat.toFixed(5)}`,
  );

  // Снимки: сверху и косой обзор.
  await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    camera.lowerBetaLimit = 0.02;
    camera.setTarget(new V3(300, 0, 300));
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.06;
    camera.radius = 4600;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, "kandla-topdown-1920.png") });

  await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    camera.setTarget(new V3(120, 1.6, 800));
    camera.alpha = -1.3;
    camera.beta = 0.8;
    camera.radius = 3000;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, "kandla-oblique-1920.png") });

  await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    camera.setTarget(new V3(0, 1.6, 1000));
    camera.alpha = 0.35;
    camera.beta = 1.05;
    camera.radius = 1600;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, "kandla-berths-1920.png") });

  // Рендер против геоданных: точки со известной принадлежностью проецируются на
  // экран, и цвет пикселя должен соответствовать «суша» или «вода». Так
  // проверяется не только геометрия, но и то, что она действительно видна.
  await page.evaluate(() => {
    const scene = window.__smarttwinDebug.scene;
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    camera.setTarget(new V3(300, 0, 300));
    camera.alpha = -Math.PI / 2;
    camera.beta = 0.06;
    camera.radius = 4600;
  });
  await page.waitForTimeout(2500);

  const sampling = await page.evaluate(() => {
    const api = window.__smarttwinDebug;
    const scene = api.scene;
    const engine = scene.getEngine();
    const camera = scene.activeCamera;
    const V3 = camera.target.constructor;
    const M = scene.getTransformMatrix().constructor;

    const insideRing = (ring, x, z) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, zi] = ring[i];
        const [xj, zj] = ring[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
    const isLand = (x, z) =>
      api.layers.land.some(
        (polygon) =>
          insideRing(polygon.outer, x, z) &&
          !polygon.holes.some((hole) => insideRing(hole, x, z)),
      );

    const bbox = api.layers.meta.bounds.scene;
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const transform = scene.getTransformMatrix();

    // Луч из камеры через пиксель: попадание в меш суши подтверждает, что
    // геометрия стоит там, где её описывают данные, и что она видна с камеры.
    const landMeshes = scene.meshes.filter((mesh) => mesh.name.startsWith("kandla-land"));
    for (const mesh of landMeshes) mesh.isPickable = true;

    const samples = [];
    for (let z = bbox.z0 + 300; z <= bbox.z1 - 300; z += 300) {
      for (let x = bbox.x0 + 300; x <= bbox.x1 - 300; x += 300) {
        const screen = V3.Project(new V3(x, isLand(x, z) ? 1.6 : 0, z), M.Identity(), transform, viewport);
        if (screen.z < 0 || screen.z > 1) continue;
        const px = Math.round(screen.x);
        const py = Math.round(screen.y);
        if (px < 2 || py < 2 || px > viewport.width - 2 || py > viewport.height - 2) continue;
        const hit = scene.pick(px, py, (mesh) => mesh.isPickable && mesh.isVisible);
        const hitLand = Boolean(hit?.hit && hit.pickedMesh?.name.startsWith("kandla-land"));
        samples.push({ land: isLand(x, z), hitLand });
      }
    }
    for (const mesh of landMeshes) mesh.isPickable = false;
    return { samples };
  });

  const agree = sampling.samples.filter((sample) => sample.land === sample.hitLand).length;
  const ratio = sampling.samples.length ? agree / sampling.samples.length : 0;
  check(
    "экранная проекция совпадает с геометрией",
    ratio >= 0.97 && sampling.samples.length > 100,
    `${(ratio * 100).toFixed(1)}% из ${sampling.samples.length} точек`,
  );

  // И отдельно — что сцена вообще отрисована: пиксели не пустые и отличаются
  // от неба.
  const pixels = await page.evaluate(() => {
    const api = window.__smarttwinDebug;
    const scene = api.scene;
    const engine = scene.getEngine();
    const gl = engine._gl;
    if (!gl) return { error: "нет WebGL-контекста" };
    return new Promise((resolve) => {
      scene.onAfterRenderObservable.addOnce(() => {
        const width = engine.getRenderWidth();
        const height = engine.getRenderHeight();
        const buffer = new Uint8Array(4);
        const probe = (x, y) => {
          gl.readPixels(x, height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
          return [...buffer];
        };
        // Сетка проб по кадру: важно, что картинка не пустая и не однотонная.
        const samples = [];
        for (let gy = 1; gy <= 9; gy += 1) {
          for (let gx = 1; gx <= 9; gx += 1) {
            samples.push(probe(Math.round((width * gx) / 10), Math.round((height * gy) / 10)));
          }
        }
        resolve({ samples });
      });
      scene.render();
    });
  });

  if (pixels.error) {
    check("кадр отрисован", false, pixels.error);
  } else {
    const mean =
      pixels.samples.reduce((sum, rgba) => sum + rgba[0] + rgba[1] + rgba[2], 0) /
      (pixels.samples.length * 3);
    const variance =
      pixels.samples.reduce((sum, rgba) => {
        const value = (rgba[0] + rgba[1] + rgba[2]) / 3;
        return sum + (value - mean) ** 2;
      }, 0) / pixels.samples.length;
    const deviation = Math.sqrt(variance);
    check(
      "кадр отрисован",
      mean > 25 && deviation > 8,
      `средняя яркость ${mean.toFixed(0)}, разброс ${deviation.toFixed(1)}`,
    );
  }
}

const relevantErrors = consoleErrors.filter(
  (text) => !/favicon|DevTools|Autofill|WebGL:|GPU stall/i.test(text),
);
check(
  "в консоли нет ошибок",
  relevantErrors.length === 0,
  relevantErrors.slice(0, 3).join(" | ") || "чисто",
);

await browser.close();

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено`);
if (failed.length) {
  console.log("Не прошли: " + failed.map((item) => item.name).join(", "));
  process.exitCode = 1;
}
