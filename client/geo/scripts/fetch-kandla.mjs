// Загрузка исходных геоданных Кандлы из OpenStreetMap.
//
// Скрипт воспроизводимый: один запуск — один снимок данных. Результат кладётся
// в client/geo/raw и больше не обновляется сам: обычный запуск сцены к Overpass
// не обращается.
//
// Источники по порядку: несколько зеркал Overpass API (Overpass QL), затем
// публичный OSM API (api.openstreetmap.org/api/0.6/map) как резерв — он отдаёт
// тот же снимок базы, но XML-ом и целиком по bbox. Если недоступны все, скрипт
// падает с понятным сообщением и ничего не пишет: подменять данные нельзя.
//
// Запуск: node geo/scripts/fetch-kandla.mjs [--force]
//   --force  перезаписать уже сохранённый снимок

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "..");
const area = JSON.parse(
  fs.readFileSync(path.join(clientDir, "geo", "kandla-area.json"), "utf8"),
);
const rawDir = path.join(clientDir, "geo", "raw");
const rawFile = path.join(rawDir, "kandla-osm.json");
const metaFile = path.join(rawDir, "kandla-fetch-meta.json");

const force = process.argv.includes("--force");

/** Теги, которые нужны для основы территории, акватории и дорожной сети. */
const SELECTORS = [
  'way["natural"="coastline"]',
  'way["natural"="water"]',
  'way["natural"="wetland"]',
  'way["waterway"]',
  'way["man_made"~"^(quay|pier|breakwater|groyne|jetty|dock)$"]',
  'way["landuse"="salt_pond"]',
  'way["natural"="beach"]',
  // Дорожная сеть: дороги и рельсы целиком, сортировка по значимости —
  // на этапе подготовки (в снимке пусть лежит всё).
  'way["highway"]',
  'way["railway"]',
  'relation["natural"="water"]',
  'relation["natural"="wetland"]',
  'relation["landuse"="salt_pond"]',
  'relation["man_made"~"^(quay|pier|breakwater)$"]',
];

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

const OSM_API = "https://api.openstreetmap.org/api/0.6/map";

const USER_AGENT =
  "Athene-geo-pipeline/1.0 (smarttwin port digital twin; +https://github.com/)";

function bboxString(box) {
  return `${box.south},${box.west},${box.north},${box.east}`;
}

function overpassQuery(box) {
  const bb = bboxString(box);
  const body = SELECTORS.map((s) => `  ${s}(${bb});`).join("\n");
  return `[out:json][timeout:300];\n(\n${body}\n);\nout geom;`;
}

async function fetchOverpass(endpoint, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
      return { ok: false, reason: `HTTP ${response.status} ${text}` };
    }
    const payload = await response.json();
    if (!Array.isArray(payload.elements)) {
      return { ok: false, reason: "ответ без elements" };
    }
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Резервный путь: OSM API отдаёт XML по bbox. Переводим его в тот же формат
 * элементов, что и Overpass, чтобы подготовка не знала разницы.
 */
async function fetchOsmApi(box) {
  const url = `${OSM_API}?bbox=${box.west},${box.south},${box.east},${box.north}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/xml", "user-agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    const xml = await response.text();
    const nodes = new Map();
    for (const m of xml.matchAll(/<node id="(-?\d+)"[^>]*lat="([-\d.]+)" lon="([-\d.]+)"/g)) {
      nodes.set(m[1], { lat: Number(m[2]), lon: Number(m[3]) });
    }
    const elements = [];
    for (const m of xml.matchAll(/<way id="(-?\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
      const tags = {};
      for (const t of m[2].matchAll(/<tag k="([^"]+)" v="([^"]+)"/g)) tags[t[1]] = t[2];
      const geometry = [...m[2].matchAll(/<nd ref="(-?\d+)"/g)]
        .map((n) => nodes.get(n[1]))
        .filter(Boolean);
      elements.push({ type: "way", id: Number(m[1]), tags, geometry });
    }
    for (const m of xml.matchAll(/<relation id="(-?\d+)"[^>]*>([\s\S]*?)<\/relation>/g)) {
      const tags = {};
      for (const t of m[2].matchAll(/<tag k="([^"]+)" v="([^"]+)"/g)) tags[t[1]] = t[2];
      const members = [...m[2].matchAll(/<member type="(\w+)" ref="(-?\d+)" role="(\w*)"/g)].map(
        (mem) => ({ type: mem[1], ref: Number(mem[2]), role: mem[3] }),
      );
      const byRef = new Map(elements.filter((e) => e.type === "way").map((w) => [String(w.id), w]));
      for (const member of members) {
        const way = byRef.get(String(member.ref));
        if (way) member.geometry = way.geometry;
      }
      elements.push({ type: "relation", id: Number(m[1]), tags, members });
    }
    return {
      ok: true,
      payload: {
        elements,
        osm3s: { timestamp_osm_base: "unknown (OSM API)" },
        generator: "openstreetmap.org API 0.6",
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (fs.existsSync(rawFile) && !force) {
    console.log(
      `[fetch] снимок уже есть: ${path.relative(clientDir, rawFile)}. ` +
        "Перезаписать — с --force.",
    );
    return;
  }

  const query = overpassQuery(area.fetch);
  const attempts = [];
  let payload = null;
  let source = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    process.stdout.write(`[fetch] Overpass ${endpoint} … `);
    const result = await fetchOverpass(endpoint, query);
    if (result.ok) {
      console.log(`ок, ${result.payload.elements.length} элементов`);
      payload = result.payload;
      source = { kind: "overpass", endpoint };
      break;
    }
    console.log(`не вышло (${result.reason})`);
    attempts.push(`${endpoint}: ${result.reason}`);
  }

  if (!payload) {
    console.log("[fetch] Overpass недоступен, пробуем OSM API …");
    const result = await fetchOsmApi(area.fetch);
    if (!result.ok) {
      attempts.push(`${OSM_API}: ${result.reason}`);
      throw new Error(
        "не удалось получить геоданные OSM: все источники недоступны.\n" +
          attempts.map((line) => `  - ${line}`).join("\n") +
          "\nСцена Кандлы без этих данных не строится: подменять контуры нельзя.",
      );
    }
    payload = result.payload;
    source = { kind: "osm-api", endpoint: OSM_API };
  }

  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(rawFile, JSON.stringify(payload));

  const meta = {
    source,
    license: "OpenStreetMap contributors, ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    query: source.kind === "overpass" ? query : `OSM API map bbox ${bboxString(area.fetch)}`,
    bbox: area.fetch,
    fetchedAt: new Date().toISOString(),
    dataTimestamp: payload.osm3s?.timestamp_osm_base ?? null,
    generator: payload.generator ?? null,
    elementCount: payload.elements.length,
  };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 1));

  console.log(
    `[fetch] сохранено: ${path.relative(clientDir, rawFile)} ` +
      `(${payload.elements.length} элементов, база ${meta.dataTimestamp})`,
  );
}

await main();
