import { chromium } from "playwright-core";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const url = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const outDir = path.resolve("..", "docs", "screenshots");
await mkdir(outDir, { recursive: true });
await rm(path.join(outDir, "debug.png"), { force: true });

const browser = await chromium.launch({
  executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu"],
});

const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".dock-center", { timeout: 30_000 });
await page.waitForTimeout(13_000);

await page.screenshot({
  path: path.join(outDir, "overview-1920.png"),
  fullPage: false,
});

await page.locator(".vessel-row").filter({ hasText: "ORION" }).click();
await page.waitForSelector(".vessel-card", { timeout: 5_000 });
await page.waitForTimeout(2_000);
await page.screenshot({
  path: path.join(outDir, "vessels-1920.png"),
  fullPage: false,
});

await page.locator(".vessel-card .icon-button.small").click();
await page.locator(".topbar-actions > button.icon-button").first().click();
await page.waitForTimeout(2_000);

await page.setViewportSize({ width: 2560, height: 1440 });
await page.waitForTimeout(2_000);
await page.screenshot({
  path: path.join(outDir, "overview-2560.png"),
  fullPage: false,
});

await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(1_200);
await page.locator(".mode-toggle button").nth(1).click();
await page.waitForSelector(".history-bar", { timeout: 15_000 });
await page.waitForTimeout(1_500);
await page.screenshot({
  path: path.join(outDir, "history-1920.png"),
  fullPage: false,
});

console.log("CONSOLE\n" + (errors.join("\n") || "no errors"));
await browser.close();
