// Проверка воды в реальном браузере (Edge, WebGL2): скриншоты ракурсов,
// пиксельная статистика, отклик настроек, пауза, resize, стоимость кадра.
//
// Запуск:  node scripts/water-check.mjs            (после интеграции, полный набор)
//          WATER_TAG=baseline node scripts/water-check.mjs   (снять базу до правок)
//
// Пиксели читаются из WebGL-канваса через 2D-канвас: движок создан с
// preserveDrawingBuffer, поэтому drawImage отдаёт актуальный кадр.

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const tag = process.env.WATER_TAG ?? "after";
const full = process.env.WATER_QUICK !== "1";
const outDir = path.resolve("..", "docs", "screenshots", "water");
const reportPath = path.resolve("scripts", `water-${tag}.json`);

const VIEWS = {
  port: { alpha: -1.04, beta: 1.13, radius: 250, target: [-24, 20, 8] },
  water: { alpha: -0.9, beta: 1.4, radius: 95, target: [0, 1.5, -70] },
  ship: { alpha: -1.25, beta: 1.22, radius: 78, target: [-102, 10, -20] },
  quay: { alpha: -0.55, beta: 1.33, radius: 70, target: [0, 3, -4] },
  aerial: { alpha: -1.7, beta: 0.5, radius: 620, target: [0, 0, -160] },
};

// Полосы кадра для статистики: верх (небо), середина (суда/причал), низ (вода).
const BANDS = {
  sky: [0.25, 0.02, 0.5, 0.1],
  middle: [0.25, 0.4, 0.5, 0.12],
  water: [0.25, 0.62, 0.5, 0.3],
};

const errors = [];
const results = { tag, url, views: {}, checks: {}, errors };

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu"],
});

try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text().slice(0, 400));
    }
  });
  page.on("pageerror", (error) => errors.push(String(error.message).slice(0, 400)));

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dock-center", { timeout: 40_000 });
  // Экран загрузки держится до готовности GLB-моделей: пока он на экране,
  // скриншоты ракурсов поймали бы оверлей вместо воды.
  await page
    .waitForFunction(() => !document.querySelector(".loading-screen"), {
      timeout: 30_000,
    })
    .catch(() => undefined);
  // Ждём, пока вода отчитается о готовности (FFT-проходы собираются асинхронно).
  await page
    .waitForFunction(
      () => {
        const debug = window.__smarttwinDebug;
        const info = debug?.waterInfo?.();
        return Boolean(info) && (info.ready === true || info.kind === "legacy");
      },
      { timeout: 45_000 },
    )
    .catch(() => {
      if (tag !== "baseline") {
        errors.push("вода не отчиталась о готовности за 45 с");
      }
    });
  await page.waitForTimeout(1500);

  const applyCamera = async (view) => {
    await page.evaluate((pose) => {
      const scene = window.__smarttwinScene;
      const camera = scene?.activeCamera;
      if (!camera) {
        return;
      }
      camera.alpha = pose.alpha;
      camera.beta = pose.beta;
      camera.radius = pose.radius;
      const target = camera.target;
      if (target?.set) {
        target.set(pose.target[0], pose.target[1], pose.target[2]);
      }
      camera.setTarget?.(target);
      camera.getViewMatrix(true);
    }, view);
  };

  const probe = async () => {
    return page.evaluate((bands) => {
      const canvas = document.querySelector("canvas");
      const scene = window.__smarttwinScene;
      const info = window.__smarttwinDebug?.waterInfo?.() ?? null;
      const out = { bands: {}, engine: {}, water: info };
      if (!canvas) {
        return out;
      }
      const surface = document.createElement("canvas");
      surface.width = canvas.width;
      surface.height = canvas.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      context.drawImage(canvas, 0, 0);
      for (const [name, rect] of Object.entries(bands)) {
        const x = Math.floor(rect[0] * surface.width);
        const y = Math.floor(rect[1] * surface.height);
        const w = Math.max(1, Math.floor(rect[2] * surface.width));
        const h = Math.max(1, Math.floor(rect[3] * surface.height));
        const data = context.getImageData(x, y, w, h).data;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumL = 0;
        let sumL2 = 0;
        let maxL = 0;
        const count = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sumR += r;
          sumG += g;
          sumB += b;
          sumL += l;
          sumL2 += l * l;
          if (l > maxL) maxL = l;
        }
        const mean = sumL / count;
        out.bands[name] = {
          r: Number((sumR / count).toFixed(2)),
          g: Number((sumG / count).toFixed(2)),
          b: Number((sumB / count).toFixed(2)),
          lum: Number(mean.toFixed(2)),
          std: Number(Math.sqrt(Math.max(0, sumL2 / count - mean * mean)).toFixed(2)),
          max: Number(maxL.toFixed(1)),
        };
      }
      const engine = scene?.getEngine?.();
      if (engine) {
        out.engine = {
          fps: Number(engine.getFps().toFixed(1)),
          drawCalls: engine._drawCalls?.current ?? null,
          meshes: scene.meshes.length,
          backend: engine.isWebGPU ? "WebGPU" : `WebGL ${engine.webGLVersion}`,
          width: engine.getRenderWidth(),
          height: engine.getRenderHeight(),
        };
      }
      return out;
    }, BANDS);
  };

  const setViewport = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(900);
  };

  await mkdir(outDir, { recursive: true });

  const info = await page.evaluate(() => window.__smarttwinDebug?.waterInfo?.() ?? null);
  results.info = info;

  for (const [name, view] of Object.entries(VIEWS)) {
    await applyCamera(view);
    await page.waitForTimeout(full ? 1400 : 700);
    const stats = await probe();
    results.views[name] = stats;
    await page.screenshot({
      path: path.join(outDir, `${tag}-${name}.png`),
      fullPage: false,
    });
  }

  if (full) {
    // Отражения: выключение должно менять кадр и снимать проход.
    await applyCamera(VIEWS.water);
    await page.waitForTimeout(900);
    const withReflection = await probe();
    await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ reflections: false }));
    await page.waitForTimeout(900);
    const withoutReflection = await probe();
    await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ reflections: true }));
    await page.waitForTimeout(600);
    results.checks.reflections = {
      enabled: withReflection.bands.water,
      disabled: withoutReflection.bands.water,
      passRegistered: withReflection.water?.reflectionActive === true,
      passRemovedWhenOff: withoutReflection.water?.reflectionActive === false,
      deltaLum: Number(
        Math.abs(
          (withReflection.bands.water?.lum ?? 0) - (withoutReflection.bands.water?.lum ?? 0),
        ).toFixed(2),
      ),
      deltaStd: Number(
        Math.abs(
          (withReflection.bands.water?.std ?? 0) - (withoutReflection.bands.water?.std ?? 0),
        ).toFixed(2),
      ),
    };

    // Пена.
    const foamOn = await probe();
    await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ foam: false }));
    await page.waitForTimeout(700);
    const foamOff = await probe();
    await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ foam: true }));
    results.checks.foam = {
      deltaStd: Number(
        Math.abs((foamOn.bands.water?.std ?? 0) - (foamOff.bands.water?.std ?? 0)).toFixed(2),
      ),
    };

    // Ветер и амплитуда: расчёт должен перезапускаться при смене спектра.
    const calm = await page.evaluate(() => {
      window.__smarttwinDebug?.waterSettings?.({ windSpeed: 3, waveGain: 0.16 });
      return window.__smarttwinDebug?.waterInfo?.() ?? null;
    });
    await page.waitForTimeout(1600);
    const calmStats = await probe();
    const rough = await page.evaluate(() => {
      window.__smarttwinDebug?.waterSettings?.({ windSpeed: 10.4, waveGain: 0.42 });
      return window.__smarttwinDebug?.waterInfo?.() ?? null;
    });
    await page.waitForTimeout(1600);
    const roughStats = await probe();
    results.checks.waves = {
      calm: calmStats.bands.water,
      rough: roughStats.bands.water,
      calmInfo: { windSpeed: calm?.windSpeed, waveGain: calm?.waveGain },
      roughInfo: { windSpeed: rough?.windSpeed, waveGain: rough?.waveGain },
      deltaStd: Number(
        Math.abs((roughStats.bands.water?.std ?? 0) - (calmStats.bands.water?.std ?? 0)).toFixed(2),
      ),
    };
    await page.evaluate(() =>
      window.__smarttwinDebug?.waterSettings?.({ windSpeed: 5.8, waveGain: 0.24 }),
    );

    // Пауза: время волн должно застыть, камера — продолжать работать.
    await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ paused: true }));
    const frozenA = await page.evaluate(() => window.__smarttwinDebug?.waterInfo?.()?.time);
    await applyCamera({ ...VIEWS.water, radius: 110 });
    await page.waitForTimeout(1200);
    const frozenB = await page.evaluate(() => window.__smarttwinDebug?.waterInfo?.()?.time);
    await page.evaluate(() => window.__smarttwinDebug?.waterSettings?.({ paused: false }));
    await page.waitForTimeout(1200);
    const resumed = await page.evaluate(() => window.__smarttwinDebug?.waterInfo?.()?.time);
    results.checks.pause = {
      timeFrozen: frozenA === frozenB,
      frozenA,
      frozenB,
      resumed: typeof resumed === "number" && typeof frozenA === "number" && resumed !== frozenA,
    };

    // Размер окна.
    await setViewport(1280, 720);
    const small = await probe();
    await setViewport(2560, 1440);
    const large = await probe();
    await setViewport(1920, 1080);
    results.checks.resize = {
      small: { size: [small.engine.width, small.engine.height], fps: small.engine.fps },
      large: { size: [large.engine.width, large.engine.height], fps: large.engine.fps },
    };

    // Нагрузка: средний FPS за 6 с на рабочем ракурсе.
    await applyCamera(VIEWS.port);
    await page.waitForTimeout(500);
    const samples = [];
    for (let i = 0; i < 6; i += 1) {
      await page.waitForTimeout(1000);
      samples.push(await page.evaluate(() => window.__smarttwinDebug?.waterInfo?.() ?? null));
    }
    const fps = samples.map((sample) => sample?.fps ?? 0).filter((value) => value > 0);
    const updateMs = samples.map((sample) => sample?.updateMs ?? 0).filter((value) => value > 0);
    results.checks.load = {
      fpsMin: fps.length ? Math.min(...fps) : null,
      fpsAvg: fps.length ? Number((fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1)) : null,
      updateMsAvg: updateMs.length
        ? Number((updateMs.reduce((a, b) => a + b, 0) / updateMs.length).toFixed(3))
        : null,
      updateMsMax: updateMs.length ? Math.max(...updateMs) : null,
    };

    // Повторное создание сцены (выгрузка/загрузка).
    await page.evaluate(() => window.__smarttwinDebug?.disposeScene?.());
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".dock-center", { timeout: 40_000 });
    // Ждём готовности воды, а не фиксированные 4 с: сразу после reload
    // сцена ещё прогревается (шейдеры FFT, GLB), и скользящий FPS
    // оказывался занижен и несравним между прогонами.
    await page
      .waitForFunction(
        () => {
          const info = window.__smarttwinDebug?.waterInfo?.();
          return Boolean(info) && (info.ready === true || info.kind === "legacy");
        },
        { timeout: 45_000 },
      )
      .catch(() => errors.push("вода не отчиталась о готовности после reload за 45 с"));
    await page.waitForTimeout(5000);
    const reloaded = await probe();
    results.checks.reload = {
      water: reloaded.water?.kind ?? null,
      ready: reloaded.water?.ready ?? null,
      fps: reloaded.engine.fps,
      errors: errors.length,
    };
  }
} finally {
  await browser.close();
}

const check = (name, ok, detail) => `${ok ? "PASS" : "FAIL"} ${name} (${detail})`;
const lines = [];
if (results.info) {
  lines.push(
    `вода: ${results.info.kind}, готовность ${results.info.ready}, шейдеры ${results.info.compileErrors?.length ?? "?"} ошибок`,
  );
}
for (const [name, view] of Object.entries(results.views)) {
  lines.push(
    `${name.padEnd(6)} вода r=${view.bands.water?.r} g=${view.bands.water?.g} b=${view.bands.water?.b} lum=${view.bands.water?.lum} std=${view.bands.water?.std} fps=${view.engine.fps}`,
  );
}
if (results.checks.reflections) {
  const r = results.checks.reflections;
  lines.push(
    check("отражения меняют кадр", r.deltaLum > 0.5 || r.deltaStd > 0.2, `dLum=${r.deltaLum} dStd=${r.deltaStd}`),
  );
  lines.push(check("проход отражений снимается", r.passRemovedWhenOff !== false, String(r.passRemovedWhenOff)));
}
if (results.checks.waves) {
  lines.push(
    check("ветер/амплитуда меняют рисунок", results.checks.waves.deltaStd > 0.2, `dStd=${results.checks.waves.deltaStd}`),
  );
}
if (results.checks.pause) {
  const p = results.checks.pause;
  lines.push(check("пауза замораживает волны", p.timeFrozen === true, `${p.frozenA} → ${p.frozenB}`));
  lines.push(check("после паузы расчёт продолжается", p.resumed === true, String(p.resumed)));
}
if (results.checks.load) {
  lines.push(`нагрузка: FPS min=${results.checks.load.fpsMin} avg=${results.checks.load.fpsAvg}, update=${results.checks.load.updateMsAvg} мс`);
}
lines.push(check("ошибок консоли нет", errors.length === 0, `${errors.length}`));
results.summary = lines;

await writeFile(reportPath, JSON.stringify(results, null, 2), "utf8");
console.log(lines.join("\n"));
if (errors.length) {
  console.log("CONSOLE ERRORS\n" + errors.slice(0, 10).join("\n"));
}
