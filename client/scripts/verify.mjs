import { chromium } from "playwright-core";
import { execSync, spawn } from "node:child_process";
import path from "node:path";

const serverDir = path.resolve(
  "..",
  "server",
  "Smarttwin.Api",
  "bin",
  "Debug",
  "net9.0",
);
const serverEnv = {
  ...process.env,
  ConnectionStrings__Postgres:
    "Host=localhost;Port=5433;Database=smarttwin;Username=smarttwin;Password=smarttwin",
  ASPNETCORE_URLS: "http://0.0.0.0:5080",
};
const appUrl = "http://127.0.0.1:5173/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function killPortOwner() {
  try {
    execSync(
      `powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort 5080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($p) { Stop-Process -Id $p -Force }"`,
      { stdio: "ignore" },
    );
  } catch {
    // no listener on 5080
  }
}

async function waitHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://localhost:5080/api/health");
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // server is still starting
    }
    await sleep(500);
  }
  throw new Error("API health timeout");
}

function startServer() {
  return spawn("dotnet", ["Smarttwin.Api.dll"], {
    cwd: serverDir,
    env: serverEnv,
    stdio: "ignore",
    windowsHide: true,
  });
}

function stopServer(process) {
  try {
    execSync(`taskkill /PID ${process.pid} /T /F`, { stdio: "ignore" });
  } catch {
    killPortOwner();
  }
}

let api = null;
let browser = null;

try {
  killPortOwner();
  await sleep(1_000);
  api = startServer();
  await waitHealth();
  console.log("API started for verification");

  browser = await chromium.launch({
    executablePath:
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const consoleErrors = [];
  let collectingErrors = true;
  page.on("console", (message) => {
    if (message.type() === "error" && collectingErrors) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (collectingErrors) {
      consoleErrors.push(error.message);
    }
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".connection-live", { timeout: 30_000 });
  await page.waitForSelector(".vessel-row", { timeout: 20_000 });
  // Экран загрузки держится до готовности GLB-моделей: без ожидания клики
  // в первые ~2 с упираются в оверлей.
  await page
    .waitForFunction(() => !document.querySelector(".loading-screen"), {
      timeout: 30_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(700);

  const initialRows = await page.locator(".vessel-row").allInnerTexts();
  // Демо тикает по таймеру: пока грузятся GLB (экран загрузки ждёт модели),
  // ORION успевает взять ещё одну партию, и 68% превращается в 69%. Проверяем,
  // что на панели исходная загрузка, а не заглушка, допуская один тик.
  check(
    "initial demo values on the server",
    initialRows.some((row) => /\b6[89]%/.test(row)) &&
      initialRows.some((row) => /\b4[23]%/.test(row)),
    initialRows.map((row) => row.replace(/\s+/g, " ")).join(" | "),
  );
  check(
    "server connection is used",
    (await page.locator(".connection-live").innerText()).includes("Онлайн"),
  );

  await page.waitForTimeout(13_000);
  check(
    "one warning appears in the demo",
    (await page.locator(".warning-card").count()) === 1,
  );
  check(
    "warning and yard fill agree",
    (await page.locator(".warning-title").innerText()).includes("91%") &&
      (await page.locator(".yard-row").filter({ hasText: "B2" }).innerText()).includes("91%"),
  );

  const layout1920 = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    };
    return {
      viewport: [window.innerWidth, window.innerHeight],
      body: [document.body.scrollWidth, document.body.clientWidth],
      topbar: rect(".topbar"),
      left: rect(".rail-left"),
      right: rect(".rail-right"),
      dock: rect(".dock"),
      table: rect(".vessel-table"),
      row: rect(".vessel-row"),
    };
  });
  check(
    "no horizontal page overflow at 1920x1080",
    layout1920.body[0] <= layout1920.viewport[0] + 1,
    JSON.stringify(layout1920.body),
  );
  check(
    "panels fit the 1920x1080 viewport",
    layout1920.left.x >= 0 &&
      layout1920.right.x + layout1920.right.width <= layout1920.viewport[0] + 1 &&
      layout1920.dock.y + layout1920.dock.height <= layout1920.viewport[1] + 1,
    JSON.stringify({
      left: layout1920.left,
      right: layout1920.right,
      dock: layout1920.dock,
    }),
  );
  check(
    "vessel row fits its table",
    layout1920.row.scrollWidth <= layout1920.table.clientWidth + 2,
    JSON.stringify({ row: layout1920.row, table: layout1920.table }),
  );

  await page.locator(".vessel-row").filter({ hasText: "ORION" }).click();
  await page.waitForSelector(".vessel-card", { timeout: 5_000 });
  check(
    "list selection opens the vessel card",
    (await page.locator(".vessel-card-title").innerText()).includes("ORION") &&
      (await page.locator(".vessel-row.selected").innerText()).includes("ORION"),
  );
  await page.screenshot({
    path: path.resolve("..", "docs", "screenshots", "vessels-1920.png"),
  });

  await page
    .getByRole("button", { name: "Вернуть исходный ракурс" })
    .click();
  await page.waitForTimeout(2_000);
  await page.mouse.click(960, 220);
  await page.waitForTimeout(500);
  check(
    "click on empty scene clears the selection",
    (await page.locator(".vessel-row.selected").count()) === 0,
  );

  const vegaPoint = await page.evaluate(() => {
    const debug = window.__smarttwinDebug;
    const projected = debug.projectEntity("vessel-vega", 10);
    const canvas = document.querySelector("canvas");
    if (!projected || !canvas) return null;
    const scaleX = canvas.clientWidth / debug.scene.getEngine().getRenderWidth();
    const scaleY = canvas.clientHeight / debug.scene.getEngine().getRenderHeight();
    return {
      x: projected._x * scaleX,
      y: projected._y * scaleY,
    };
  });
  check("VEGA is projected inside the scene viewport", Boolean(vegaPoint));
  if (vegaPoint) {
    await page.mouse.click(vegaPoint.x, vegaPoint.y);
    await page.waitForTimeout(500);
    const selected = await page.locator(".vessel-row.selected").allInnerTexts();
    check(
      "scene selection synchronizes the vessel list",
      selected.some((row) => row.includes("VEGA")),
      selected.join(" | "),
    );
  }

  await page.getByRole("tab", { name: "История" }).click();
  await page.waitForSelector(".history-bar", { timeout: 15_000 });
  await page.waitForTimeout(1_500);
  const historyTimeBefore = await page.locator(".history-time").innerText();
  await page.locator(".history-slider").evaluate((slider) => {
    const value = String(
      Math.max(0, Math.floor(Number(slider.max) * 0.25)),
    );
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(slider, value);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(1_500);
  const historyTimeAfter = await page.locator(".history-time").innerText();
  check(
    "history slider loads a different state",
    historyTimeBefore !== historyTimeAfter,
    `${historyTimeBefore} -> ${historyTimeAfter}`,
  );
  check(
    "history mode is marked as archive",
    (await page.locator(".connection").innerText()).includes("Архив"),
  );
  await page.screenshot({
    path: path.resolve("..", "docs", "screenshots", "history-1920.png"),
  });
  await page.getByRole("button", { name: "Вернуться к текущему" }).click();
  await page.waitForSelector(".history-bar", { state: "detached", timeout: 15_000 });
  await page.waitForSelector(".connection-live", { timeout: 15_000 });
  check("return to live state restores the stream", true);

  await page.screenshot({
    path: path.resolve("..", "docs", "screenshots", "overview-1920.png"),
  });

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(2_000);
  const layout2560 = await page.evaluate(() => ({
    viewport: [window.innerWidth, window.innerHeight],
    body: [document.body.scrollWidth, document.body.clientWidth],
    left: document.querySelector(".rail-left")?.getBoundingClientRect().width,
    right: document.querySelector(".rail-right")?.getBoundingClientRect().width,
    dock: document.querySelector(".dock")?.getBoundingClientRect().width,
  }));
  check(
    "layout remains proportional at 2560x1440",
    layout2560.body[0] <= layout2560.viewport[0] + 1 &&
      layout2560.viewport[0] === 2560,
    JSON.stringify(layout2560),
  );
  await page.screenshot({
    path: path.resolve("..", "docs", "screenshots", "overview-2560.png"),
  });

  check(
    "no client console errors before reconnect",
    consoleErrors.length === 0,
    consoleErrors.join(" || "),
  );

  // --- reconnect / stale state ---
  collectingErrors = false;
  const beforeRestart = await page.locator(".vessel-row").filter({ hasText: "ORION" }).innerText();
  stopServer(api);
  await page.waitForSelector(".data-alert", { timeout: 20_000 });
  const alertText = await page.locator(".data-alert").innerText();
  check("disconnect is shown explicitly", alertText.length > 0, alertText.replace(/\s+/g, " "));

  await sleep(2_000);
  api = startServer();
  await waitHealth();
  await page.waitForSelector(".connection-live", { timeout: 50_000 });
  await page.waitForTimeout(1_000);
  const afterRestart = await page.locator(".vessel-row").filter({ hasText: "ORION" }).innerText();
  check(
    "reconnect receives a fresh snapshot from the restarted server",
    afterRestart.includes("68%") && beforeRestart !== afterRestart,
    `${beforeRestart.replace(/\s+/g, " ")} -> ${afterRestart.replace(/\s+/g, " ")}`,
  );
  check(
    "data alert disappears after recovery",
    (await page.locator(".data-alert").count()) === 0,
  );

  // --- resource disposal ---
  const disposed = await page.evaluate(() => {
    const debug = window.__smarttwinDebug;
    if (!debug) return null;
    return debug.disposeScene();
  });
  check("scene and engine resources are disposed", disposed?.sceneDisposed === true, JSON.stringify(disposed));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".dock-center", { timeout: 30_000 });
  // После перезагрузки сцена поднимается заново вместе с 45 шаблонами
  // контейнеров: ждём сам признак жизни, а не фиксированную паузу.
  await page
    .waitForFunction(
      () => Boolean(window.__smarttwinDebug?.scene) && window.__smarttwinDebug.scene.isDisposed === false,
      { timeout: 45_000 },
    )
    .catch(() => undefined);
  const recreated = await page.evaluate(
    () =>
      Boolean(window.__smarttwinDebug?.scene) &&
      window.__smarttwinDebug.scene.isDisposed === false,
  );
  check("scene can be created again after disposal", recreated);

  const failed = results.filter((item) => !item.pass);
  console.log(
    `\nSUMMARY ${results.length - failed.length}/${results.length} checks passed`,
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser?.close().catch(() => undefined);
  if (api) {
    stopServer(api);
  }
  killPortOwner();
}
