// Подготовка географических слоёв Кандлы из сырого снимка OSM.
//
// Что делает: проектирует WGS84 → UTM 42N, переносит начало в локальную точку,
// строит согласованные слои land / water / shoreline / quay / intertidal и
// кладёт их в client/public/geo/kandla. Никаких обращений к сети: на входе
// только client/geo/raw/kandla-osm.json от fetch-kandla.mjs.
//
// Почему суша строится через маску, а не «прямоугольник минус вода»:
// в Кандле вода рукава не размечена полигоном — она задана линией берега
// (natural=coastline). Полигон воды собирать «на глазок» нельзя, поэтому
// классификация суша/вода считается по направленным линиям берега (в OSM суша
// слева от линии) на регулярной сетке, а контуры снимаются с маски. Так суша и
// вода получают общую границу по построению: щелей и наложений не остаётся.
//
// Запуск: node geo/scripts/prepare-kandla.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, "..", "..");
const area = JSON.parse(
  fs.readFileSync(path.join(clientDir, "geo", "kandla-area.json"), "utf8"),
);
const { lonLatToUtm } = await import(
  pathToFileURL(path.join(clientDir, "src", "scene", "kandla", "utm.ts")).href
);

const rawFile = path.join(clientDir, "geo", "raw", "kandla-osm.json");
const fetchMetaFile = path.join(clientDir, "geo", "raw", "kandla-fetch-meta.json");
const outDir = path.join(clientDir, "public", "geo", "kandla");

if (!fs.existsSync(rawFile)) {
  throw new Error(
    `нет сырых данных OSM: ${path.relative(clientDir, rawFile)}.\n` +
      "Сначала выполните: node geo/scripts/fetch-kandla.mjs",
  );
}

const raw = JSON.parse(fs.readFileSync(rawFile, "utf8"));
const fetchMeta = fs.existsSync(fetchMetaFile)
  ? JSON.parse(fs.readFileSync(fetchMetaFile, "utf8"))
  : {};

// ── Проекция ────────────────────────────────────────────────────────────────

const originUtm = lonLatToUtm(area.origin.lon, area.origin.lat, area.utmZone);

/** lon/lat → локальные метры: X на восток, Z на север. */
function toLocal(lon, lat) {
  const utm = lonLatToUtm(lon, lat, area.utmZone);
  return [utm.easting - originUtm.easting, utm.northing - originUtm.northing];
}

function bboxToLocal(box) {
  const [west, south] = toLocal(box.west, box.south);
  const [east, north] = toLocal(box.east, box.north);
  return { x0: Math.min(west, east), x1: Math.max(west, east), z0: Math.min(south, north), z1: Math.max(south, north) };
}

const fetchBox = bboxToLocal(area.fetch);
const sceneBox = bboxToLocal(area.scene);
const res = area.gridMetres;
const nx = Math.ceil((fetchBox.x1 - fetchBox.x0) / res);
const nz = Math.ceil((fetchBox.z1 - fetchBox.z0) / res);

// ── Разбор снимка ───────────────────────────────────────────────────────────

const ways = new Map();
const relations = [];
for (const element of raw.elements ?? []) {
  if (element.type === "way") ways.set(element.id, element);
  else if (element.type === "relation") relations.push(element);
}

function wayPoints(way) {
  if (!Array.isArray(way.geometry)) return [];
  return way.geometry.map((point) => toLocal(point.lon, point.lat));
}

function samePoint(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
}

/** Собирает замкнутые кольца из набора кусков (участников отношения). */
function assembleRings(pieces) {
  const remaining = pieces.filter((piece) => piece.length >= 2).map((piece) => piece.slice());
  const rings = [];
  while (remaining.length) {
    let ring = remaining.shift();
    let guard = 0;
    while (!samePoint(ring[0], ring[ring.length - 1]) && guard < 500) {
      guard += 1;
      const tail = ring[ring.length - 1];
      let bestIndex = -1;
      let bestReversed = false;
      let bestDistance = Infinity;
      for (let index = 0; index < remaining.length; index += 1) {
        const piece = remaining[index];
        const head = piece[0];
        const back = piece[piece.length - 1];
        const dHead = Math.hypot(tail[0] - head[0], tail[1] - head[1]);
        const dBack = Math.hypot(tail[0] - back[0], tail[1] - back[1]);
        if (dHead < bestDistance) {
          bestDistance = dHead;
          bestIndex = index;
          bestReversed = false;
        }
        if (dBack < bestDistance) {
          bestDistance = dBack;
          bestIndex = index;
          bestReversed = true;
        }
      }
      if (bestIndex < 0 || bestDistance > 2) break;
      const piece = remaining.splice(bestIndex, 1)[0];
      ring = ring.concat((bestReversed ? piece.slice().reverse() : piece).slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Все полигоны объекта: way с замкнутым кольцом или отношение multipolygon. */
function polygonsOf(element) {
  if (element.type === "way") {
    const points = wayPoints(element);
    if (points.length >= 4 && samePoint(points[0], points[points.length - 1])) {
      return [{ outer: [points], inner: [] }];
    }
    return [];
  }
  const outer = [];
  const inner = [];
  for (const member of element.members ?? []) {
    if (member.type !== "way" || !Array.isArray(member.geometry)) continue;
    const points = member.geometry.map((point) => toLocal(point.lon, point.lat));
    if (points.length < 2) continue;
    (member.role === "inner" ? inner : outer).push(points);
  }
  const outerRings = assembleRings(outer);
  const innerRings = assembleRings(inner);
  if (!outerRings.length) return [];
  return [{ outer: outerRings, inner: innerRings }];
}

function linesOf(element) {
  if (element.type === "way") {
    const points = wayPoints(element);
    return points.length >= 2 ? [points] : [];
  }
  const lines = [];
  for (const member of element.members ?? []) {
    if (member.type !== "way" || !Array.isArray(member.geometry)) continue;
    const points = member.geometry.map((point) => toLocal(point.lon, point.lat));
    if (points.length >= 2) lines.push(points);
  }
  return lines;
}

const tag = (element, key) => element.tags?.[key];

const coastWays = [...ways.values(), ...relations].filter(
  (element) => tag(element, "natural") === "coastline",
);
const waterElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "natural") === "water",
);
const wetlandElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "natural") === "wetland",
);
const pierElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "man_made") === "pier",
);
const quayElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "man_made") === "quay",
);
const breakwaterElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "man_made") === "breakwater",
);
const tidalElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "waterway") === "tidal_channel",
);
const saltPondElements = [...ways.values(), ...relations].filter(
  (element) => tag(element, "landuse") === "salt_pond",
);

// ── Сшивка береговой линии в цепочки ────────────────────────────────────────
// Overpass отдаёт берег кусками. Продлевать куски «до бесконечности» по
// отдельности нельзя: на стыке двух кусков продления перекрываются и портят
// winding. Поэтому сначала склеиваем куски в максимальные цепочки.

function chainCoastlines(pieces) {
  const chains = pieces.map((piece) => piece.slice());
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i += 1) {
      for (let j = 0; j < chains.length; j += 1) {
        if (i === j) continue;
        const a = chains[i];
        const b = chains[j];
        if (samePoint(a[a.length - 1], b[0])) {
          chains[i] = a.concat(b.slice(1));
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
        if (samePoint(a[a.length - 1], b[b.length - 1])) {
          chains[i] = a.concat(b.slice().reverse().slice(1));
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}

const coastPieces = [];
for (const element of coastWays) {
  const points = linesOf(element);
  for (const line of points) coastPieces.push({ points: line, ids: [element.id] });
}
const coastChains = chainCoastlines(coastPieces.map((piece) => piece.points)).map((points) => ({
  points,
}));

if (!coastChains.length) {
  throw new Error(
    "в снимке нет natural=coastline: без линии берега сушу и воду не разделить. " +
      "Проверьте bbox загрузки и полноту ответа Overpass.",
  );
}

/** Продлевает цепочку за концы на 50 км, чтобы классификация не зависела от края. */
function extendChain(points, distance) {
  const result = points.slice();
  const head = result[0];
  const headNext = result[1] ?? [head[0] + 1, head[1]];
  const tail = result[result.length - 1];
  const tailPrev = result[result.length - 2] ?? [tail[0] - 1, tail[1]];
  const unit = (from, to) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  };
  const [hx, hz] = unit(headNext, head);
  const [tx, tz] = unit(tailPrev, tail);
  result.unshift([head[0] + hx * distance, head[1] + hz * distance]);
  result.push([tail[0] + tx * distance, tail[1] + tz * distance]);
  return result;
}

const windingChains = coastChains.map((chain) => extendChain(chain.points, 50_000));

// ── Маска суши ──────────────────────────────────────────────────────────────

/** Состояние (winding) в точке: сумма знаков пересечений луча на запад. */
function windingAt(x, z) {
  let acc = 0;
  for (const chain of windingChains) {
    for (let i = 1; i < chain.length; i += 1) {
      const [x1, z1] = chain[i - 1];
      const [x2, z2] = chain[i];
      if (z1 <= z === z2 <= z) continue;
      const xi = x1 + ((z - z1) * (x2 - x1)) / (z2 - z1);
      if (xi < x) acc += z2 > z1 ? 1 : -1;
    }
  }
  return acc;
}

function polygonContains(rings, x, z) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, zi] = ring[i];
      const [xj, zj] = ring[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

const waterPolygons = waterElements.flatMap((element) => polygonsOf(element));
const wetlandPolygons = wetlandElements.flatMap((element) => polygonsOf(element));

const pierPolygons = [];
const pierLines = [];
for (const element of pierElements) {
  const polygons = polygonsOf(element);
  if (polygons.length) {
    for (const polygon of polygons) pierPolygons.push({ element, polygon });
  } else {
    for (const line of linesOf(element)) pierLines.push({ element, points: line });
  }
}

const centreOf = (ring) => {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of ring) {
    sx += x;
    sz += z;
  }
  return [sx / ring.length, sz / ring.length];
};

// Семена для калибровки знака: вода — середина фарватера, суша — центр пирса.
const centreX = (fetchBox.x0 + fetchBox.x1) / 2;
const centreZ = (fetchBox.z0 + fetchBox.z1) / 2;
const tidalMid = (() => {
  // Берём точку фарватера, ближайшую к середине области загрузки: концы линии
  // Kandla Creek уходят далеко за пределы снимка.
  let best = null;
  let bestDistance = Infinity;
  for (const line of tidalElements.flatMap((element) => linesOf(element))) {
    for (const point of line) {
      const distance = Math.hypot(point[0] - centreX, point[1] - centreZ);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
  }
  return best;
})();
const landSeed = pierPolygons.length ? centreOf(pierPolygons[0].polygon.outer[0]) : null;
const waterSeed = tidalMid ?? null;

if (!waterSeed || !landSeed) {
  throw new Error(
    "не удалось откалибровать сушу и воду: в данных нет фарватера (waterway=tidal_channel) " +
      "или причальных сооружений (man_made=pier).",
  );
}

// Знак winding берём из правила OSM «суша слева от линии берега»: находим
// участок берега у центра области, откладываем по нормали точки в 60 м слева
// и справа и смотрим winding. Точка пирса для этого не годится: надводная
// площадка причала может лежать уже над водой.
function calibrate() {
  const cx = (fetchBox.x0 + fetchBox.x1) / 2;
  const cz = (fetchBox.z0 + fetchBox.z1) / 2;
  const candidates = [];
  for (const chain of coastChains) {
    for (let i = 1; i < chain.points.length; i += 1) {
      const [x1, z1] = chain.points[i - 1];
      const [x2, z2] = chain.points[i];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 60) continue;
      const mx = (x1 + x2) / 2;
      const mz = (z1 + z2) / 2;
      candidates.push({
        distance: Math.hypot(mx - cx, mz - cz),
        x: mx,
        z: mz,
        // Левая нормаль к направлению (dx, dz) в плоскости (x — восток, z — север).
        nx: -(z2 - z1) / length,
        nz: (x2 - x1) / length,
      });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates) {
    for (const offset of [60, 90, 120, 160]) {
      const left = [candidate.x + candidate.nx * offset, candidate.z + candidate.nz * offset];
      const right = [candidate.x - candidate.nx * offset, candidate.z - candidate.nz * offset];
      const leftState = windingAt(left[0], left[1]);
      const rightState = windingAt(right[0], right[1]);
      if (leftState !== rightState) {
        return { landState: leftState, waterState: rightState, land: left, water: right, offset };
      }
    }
  }
  throw new Error(
    "не удалось откалибровать сушу и воду по линии берега: слева и справа от " +
      "берега winding совпадает. Проверьте направление линий natural=coastline " +
      "в снимке (в OSM суша должна быть слева).",
  );
}

const calibration = calibrate();
const landState = calibration.landState;
const waterState = calibration.waterState;
const pierState = landSeed ? windingAt(landSeed[0], landSeed[1]) : null;
if (pierState !== null && pierState !== landState) {
  console.log(
    "[prepare] предупреждение: центр причального сооружения попал в акваторию " +
      `(winding ${pierState} при суше ${landState}) — надводная площадка стоит над водой, так и должно быть`,
  );
}

const mask = new Uint8Array(nx * nz); // 1 — суша
const rowStates = [];
const stateHistogram = new Map();
console.log(
  `[prepare] область ${nx}×${nz} ячеек по ${res} м; ветвление: суша ${landState}, вода ${waterState} ` +
    `(проба ${JSON.stringify(calibration.land.map((v) => +v.toFixed(0)))} / ${JSON.stringify(calibration.water.map((v) => +v.toFixed(0)))})`,
);
for (let j = 0; j < nz; j += 1) {
  const z = fetchBox.z0 + (j + 0.5) * res;
  const crossings = [];
  for (const chain of windingChains) {
    for (let i = 1; i < chain.length; i += 1) {
      const [x1, z1] = chain[i - 1];
      const [x2, z2] = chain[i];
      if (z1 <= z === z2 <= z) continue;
      const xi = x1 + ((z - z1) * (x2 - x1)) / (z2 - z1);
      crossings.push([xi, z2 > z1 ? 1 : -1]);
    }
  }
  crossings.sort((a, b) => a[0] - b[0]);
  let pointer = 0;
  let acc = 0;
  for (let i = 0; i < nx; i += 1) {
    const x = fetchBox.x0 + (i + 0.5) * res;
    while (pointer < crossings.length && crossings[pointer][0] <= x) {
      acc += crossings[pointer][1];
      pointer += 1;
    }
    rowStates.push(acc);
    stateHistogram.set(acc, (stateHistogram.get(acc) ?? 0) + 1);
    mask[j * nx + i] = acc === landState ? 1 : 0;
  }
}

const unexpectedStates = [...stateHistogram.keys()].filter(
  (state) => state !== landState && state !== waterState,
);
if (unexpectedStates.length) {
  console.log(
    `[prepare] внимание: у ${unexpectedStates.join(", ")} ячеек состояние вне «суша/вода» — ` +
      "вероятно, береговая линия пересекает сама себя",
  );
}

// Внутренние водоёмы (natural=water) — вода даже если берег не огибает их.
// Заливка построчная: перебирать все 34 млн ячеек на каждый полигон слишком
// дорого, а пересечения с горизонталью дают ровно те же ячейки.
for (const polygon of waterPolygons) {
  const rings = [...polygon.outer, ...polygon.inner];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const ring of polygon.outer) {
    for (const [x, z] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (maxX < fetchBox.x0 || minX > fetchBox.x1 || maxZ < fetchBox.z0 || minZ > fetchBox.z1) continue;
  const jStart = Math.max(0, Math.floor((minZ - fetchBox.z0) / res));
  const jEnd = Math.min(nz - 1, Math.ceil((maxZ - fetchBox.z0) / res));
  for (let j = jStart; j <= jEnd; j += 1) {
    const z = fetchBox.z0 + (j + 0.5) * res;
    const xs = [];
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i += 1) {
        const [x1, z1] = ring[i - 1];
        const [x2, z2] = ring[i];
        if (z1 <= z === z2 <= z) continue;
        xs.push(x1 + ((z - z1) * (x2 - x1)) / (z2 - z1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const iFrom = Math.max(0, Math.ceil((xs[k] - fetchBox.x0) / res - 0.5));
      const iTo = Math.min(nx - 1, Math.floor((xs[k + 1] - fetchBox.x0) / res - 0.5));
      for (let i = iFrom; i <= iTo; i += 1) mask[j * nx + i] = 0;
    }
  }
}

// ── Контуры маски ───────────────────────────────────────────────────────────

/** Границы между сушей и водой как направленные отрезки по сетке. */
function extractRings() {
  const segments = new Map();
  const stride = nx + 1;
  const key = (i, j) => i + stride * j;
  const push = (from, to) => {
    const k = key(from[0], from[1]);
    const list = segments.get(k);
    if (list) list.push(to);
    else segments.set(k, [to]);
  };
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : mask[j * nx + i]);
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (!at(i, j)) continue;
      // Обход по часовой стрелке в координатах сетки: суша остаётся слева.
      if (!at(i, j - 1)) {
        push([i, j], [i + 1, j]);
      }
      if (!at(i + 1, j)) {
        push([i + 1, j], [i + 1, j + 1]);
      }
      if (!at(i, j + 1)) {
        push([i + 1, j + 1], [i, j + 1]);
      }
      if (!at(i - 1, j)) {
        push([i, j + 1], [i, j]);
      }
    }
  }
  const rings = [];
  while (segments.size) {
    const [startKey] = segments.keys();
    const si = startKey % stride;
    const sj = (startKey - si) / stride;
    const ring = [[si, sj]];
    let current = startKey;
    let guard = 0;
    while (guard < 8_000_000) {
      guard += 1;
      const list = segments.get(current);
      if (!list || !list.length) break;
      const next = list.pop();
      if (!list.length) segments.delete(current);
      if (next[0] === si && next[1] === sj) break;
      ring.push(next);
      current = key(next[0], next[1]);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/**
 * Дуглас–Пекер по кускам по 250 точек. Полный DP на «лестнице» из сотен тысяч
 * точек вырождается в O(n²) и считает минуты; нарезка ограничивает время, а
 * качество не страдает: концы кусков всё равно лежат на исходном контуре.
 */
function simplifyChunked(points, tolerance, chunk = 250) {
  if (points.length <= chunk * 2) return simplify(points, tolerance);
  const result = [points[0]];
  for (let start = 0; start < points.length - 1; start += chunk) {
    const end = Math.min(points.length - 1, start + chunk);
    const part = simplify(points.slice(start, end + 1), tolerance);
    for (let i = 1; i < part.length; i += 1) result.push(part[i]);
  }
  return result;
}

function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const [x1, z1] = points[first];
    const [x2, z2] = points[last];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz) || 1;
    let index = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i += 1) {
      const [x, z] = points[i];
      const d = Math.abs(dz * (x - x1) - dx * (z - z1)) / length;
      if (d > distance) {
        distance = d;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const result = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) result.push(points[i]);
  return result;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Упрощение замкнутого кольца. Просто скормить кольцо Дугласу–Пекеру нельзя:
 * первая и последняя точки совпадают, хорда вырождается в ноль и алгоритм
 * выбрасывает весь контур. Поэтому делим кольцо по самой дальней от начала
 * точке и упрощаем две половины как обычные линии.
 */
function simplifyRing(points, tolerance) {
  if (points.length <= 4) return points.slice();
  let farthest = 1;
  let bestDistance = -1;
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (distance > bestDistance) {
      bestDistance = distance;
      farthest = i;
    }
  }
  const head = simplifyChunked(points.slice(0, farthest + 1), tolerance);
  const tail = simplifyChunked(points.slice(farthest), tolerance);
  return head.concat(tail.slice(1));
}

const rawRings = extractRings();
const simplifedRings = [];
for (const ring of rawRings) {
  const metres = ring.map(([i, j]) => [
    +(fetchBox.x0 + i * res).toFixed(2),
    +(fetchBox.z0 + j * res).toFixed(2),
  ]);
  const closed = metres.concat([metres[0]]);
  const reduced = simplifyRing(closed, area.simplifyMetres);
  const dedup = [];
  for (const point of reduced) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.05) dedup.push(point);
  }
  if (dedup.length >= 4 && Math.hypot(dedup[0][0] - dedup[dedup.length - 1][0], dedup[0][1] - dedup[dedup.length - 1][1]) < 0.1) {
    dedup.pop();
  }
  if (dedup.length >= 3) simplifedRings.push(dedup);
}

// Кольца-дырки вкладываем в ближайшее внешнее кольцо по точке.
const outers = [];
const holes = [];
for (const ring of simplifedRings) {
  const areaM2 = ringArea(ring);
  (areaM2 > 20_000 ? outers : holes).push({ ring, areaM2 });
}
const landPolygons = outers.map((outer) => ({ outer: outer.ring, holes: [], areaM2: outer.areaM2 }));
for (const hole of holes) {
  let best = null;
  let bestArea = Infinity;
  for (const polygon of landPolygons) {
    if (!polygonContains([polygon.outer], hole.ring[0][0], hole.ring[0][1])) continue;
    if (polygon.areaM2 < bestArea) {
      best = polygon;
      bestArea = polygon.areaM2;
    }
  }
  if (best) {
    best.holes.push(hole.ring);
  }
}
for (const polygon of landPolygons) {
  polygon.areaM2 = +(polygon.areaM2 / 1e6).toFixed(3);
  for (const hole of polygon.holes) {
    polygon.areaM2 -= ringArea(hole) / 1e6;
  }
  polygon.areaM2 = +polygon.areaM2.toFixed(3);
}

// ── Линии: береговая линия, причальный фронт ────────────────────────────────

function clipLineToBox(points, box) {
  const parts = [];
  let current = [];
  const inside = ([x, z]) => x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (inside(point)) {
      current.push(point);
      continue;
    }
    if (current.length >= 2) parts.push(current);
    current = [];
  }
  if (current.length >= 2) parts.push(current);
  return parts;
}

const shoreline = [];
for (const chain of coastChains) {
  for (const part of clipLineToBox(chain.points, fetchBox)) {
    shoreline.push(part.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]));
  }
}

/** Расстояние от точки до отрезка. */
function distanceToSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Причальный фронт: участки береговой линии, вдоль которых стоят пирсы.
// Это не отдельный тег в OSM, а вывод из взаимного расположения объектов —
// основание вывода фиксируется в meta.derivations.
const quayFront = [];
const pierRings = pierPolygons.map((item) => item.polygon.outer[0]);
const pierRingSegments = [];
for (const ring of pierRings) {
  for (let i = 1; i < ring.length; i += 1) pierRingSegments.push([ring[i - 1], ring[i]]);
}
const frontThreshold = 90;
for (const chain of coastChains) {
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      const reduced = simplify(run, area.simplifyMetres);
      quayFront.push(reduced.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]));
    }
    run = [];
  };
  for (const point of chain.points) {
    let nearest = Infinity;
    for (const [a, b] of pierRingSegments) {
      nearest = Math.min(nearest, distanceToSegment(point, a, b));
      if (nearest < frontThreshold) break;
    }
    if (nearest <= frontThreshold) run.push(point);
    else flush();
  }
  flush();
}

// ── Дорожная сеть ────────────────────────────────────────────────────────────
// Дороги и рельсы берутся из того же снимка OSM (highway=*, railway=*). Линии
// режутся по маске суши: участки над водой (мосты) в слой не попадают —
// моделью моста займёмся отдельно, когда появятся данные о переправах.

const highwayWays = [...ways.values()].filter((element) => tag(element, "highway"));
const railwayWays = [...ways.values()].filter((element) => tag(element, "railway"));

/** Ячейка маски под точкой: true — суша. */
function maskAt(x, z) {
  const i = Math.floor((x - fetchBox.x0) / res);
  const j = Math.floor((z - fetchBox.z0) / res);
  if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
  return mask[j * nx + i] === 1;
}

/** Полная ширина покрытия по типу дороги, м. */
const ROAD_WIDTHS = {
  trunk: 16,
  trunk_link: 13,
  primary: 14,
  primary_link: 11,
  secondary: 11,
  secondary_link: 9,
  tertiary: 10,
  tertiary_link: 8,
  residential: 8,
  unclassified: 7,
  service: 6,
  track: 4.5,
};

/** Класс для сцены: дорога / улица / проезд. */
function roadClass(kind) {
  if (["trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link"].includes(kind)) {
    return "road";
  }
  if (kind === "residential" || kind === "unclassified") return "street";
  return "service";
}

/**
 * Линия → участки на суше: точки в воде выбрасываются, линия рвётся.
 * Так дорога кончается у кромки воды, а не висит над акваторией.
 */
function landRuns(points) {
  const runs = [];
  let run = [];
  for (const point of points) {
    if (maskAt(point[0], point[1])) {
      run.push(point);
    } else {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}

const roadsOut = [];
for (const element of highwayWays) {
  const kind = tag(element, "highway");
  if (!ROAD_WIDTHS[kind]) continue;
  const cls = roadClass(kind);
  const width = ROAD_WIDTHS[kind];
  for (const points of linesOf(element)) {
    for (const part of clipLineToBox(points, fetchBox)) {
      for (const run of landRuns(part)) {
        const reduced = simplify(run, area.simplifyMetres);
        if (reduced.length < 2) continue;
        roadsOut.push({
          id: `way/${element.id}`,
          kind,
          cls,
          width,
          name: element.tags?.name ?? null,
          coords: reduced.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
        });
      }
    }
  }
}

// Рельсы: главный путь, ветки, сортировочные и подъездные — всё в один слой,
// различается классом. Ширина коридора (балласт) единая.
const railLinesOut = [];
for (const element of railwayWays) {
  const kind = tag(element, "railway");
  const usage = tag(element, "usage") ?? null;
  const service = tag(element, "service") ?? null;
  const cls = usage === "main" || (!usage && !service) ? "main" : "industrial";
  for (const points of linesOf(element)) {
    for (const part of clipLineToBox(points, fetchBox)) {
      for (const run of landRuns(part)) {
        const reduced = simplify(run, area.simplifyMetres);
        if (reduced.length < 2) continue;
        railLinesOut.push({
          id: `way/${element.id}`,
          kind,
          cls,
          usage,
          service,
          gauge: element.tags?.gauge ?? null,
          name: element.tags?.name ?? null,
          coords: reduced.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
        });
      }
    }
  }
}

// ── Крановые пути ────────────────────────────────────────────────────────────
// В OSM рельсы портальных кранов не размечены — их нет нигде в этой области.
// Выводим схематично из причального фронта: два рельса параллельно линии
// кордона, в сторону суши. Геометрия — заглушка для будущих моделей кранов,
// параметры (отступ и колея) — проектные допущения, не данные OSM.

const CRANE_RAIL = {
  /** Отступ ближнего рельса от кромки кордона, м. */
  setback: 15,
  /** Колея (между рельсами), м. */
  gauge: 20,
};

/** Смещение линии в сторону на distance; side подбирается по маске суши. */
function offsetLine(points, distance, side) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * side * distance;
    const nz = (dx / len) * side * distance;
    out.push([points[i][0] + nx, points[i][1] + nz]);
  }
  return out;
}

const craneRailsOut = [];
for (const [frontIndex, front] of quayFront.entries()) {
  if (front.length < 2) continue;
  // Сторона суши: где при смещении на 10 м больше точек на суше.
  const testSide = (side) => {
    const probe = offsetLine(front, 10, side);
    return probe.filter((point) => maskAt(point[0], point[1])).length;
  };
  const side = testSide(1) >= testSide(-1) ? 1 : -1;
  for (const [railIndex, offset] of [CRANE_RAIL.setback, CRANE_RAIL.setback + CRANE_RAIL.gauge].entries()) {
    const rail = landRuns(offsetLine(front, offset, side)).filter((run) => run.length >= 2);
    for (const [runIndex, run] of rail.entries()) {
      const reduced = simplify(run, area.simplifyMetres);
      if (reduced.length < 2) continue;
      craneRailsOut.push({
        id: `crane-front-${frontIndex}-rail-${railIndex}-${runIndex}`,
        front: `quay-front-${frontIndex}`,
        setback: offset,
        coords: reduced.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
      });
    }
  }
}

// ── Вспомогательные площади ─────────────────────────────────────────────────

const wetlandOut = [];
for (const element of wetlandElements) {
  const kind = element.tags?.wetland ?? null;
  for (const polygon of polygonsOf(element)) {
    for (const ring of polygon.outer) {
      if (ring.length < 4) continue;
      const touches = ring.some(
        ([x, z]) => x >= fetchBox.x0 && x <= fetchBox.x1 && z >= fetchBox.z0 && z <= fetchBox.z1,
      );
      if (!touches) continue;
      wetlandOut.push({
        wetland: kind,
        coords: ring.map(([px, pz]) => [+px.toFixed(2), +pz.toFixed(2)]),
      });
    }
  }
}

// ── Контрольные точки ───────────────────────────────────────────────────────
// Нужны, чтобы проверять прямое и обратное преобразование уже в сцене.

function controlPoint(role, lon, lat, note) {
  const [x, z] = toLocal(lon, lat);
  return { role, lon, lat, x: +x.toFixed(2), z: +z.toFixed(2), note };
}

const pierSorted = pierPolygons
  .map((item) => centreOf(item.polygon.outer[0]))
  .sort((a, b) => a[1] - b[1]);
const northBerth = pierSorted[pierSorted.length - 1];
const southBerth = pierSorted[0];

const controlPoints = [
  controlPoint("origin", area.origin.lon, area.origin.lat, "начало локальной системы"),
  ...(northBerth
    ? [
        {
          role: "berth-north",
          lon: null,
          lat: null,
          x: +northBerth[0].toFixed(2),
          z: +northBerth[1].toFixed(2),
          note: "центр северного причального сооружения (из pier)",
        },
      ]
    : []),
  ...(southBerth
    ? [
        {
          role: "berth-south",
          lon: null,
          lat: null,
          x: +southBerth[0].toFixed(2),
          z: +southBerth[1].toFixed(2),
          note: "центр южного причального сооружения (из pier)",
        },
      ]
    : []),
  ...(waterSeed
    ? [{ role: "creek", lon: null, lat: null, x: +waterSeed[0].toFixed(2), z: +waterSeed[1].toFixed(2), note: "середина фарватера Kandla Creek" }]
    : []),
];

// ── Запись слоёв ────────────────────────────────────────────────────────────

fs.mkdirSync(outDir, { recursive: true });

const write = (name, payload) => {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(payload));
  const size = (fs.statSync(path.join(outDir, name)).size / 1024).toFixed(1);
  console.log(`[prepare] ${name.padEnd(18)} ${size} КБ`);
};

const shared = {
  /** Исходная система координат данных: WGS84 / EPSG:4326. */
  sourceCrs: "EPSG:4326",
  /** Система, в которой посчитаны метры. */
  crs: `EPSG:${area.epsg}`,
  /** В сцене — метры этой проекции минус начало координат. */
  projection: `EPSG:${area.epsg} минус начало`,
  units: "m",
  axis: { x: "east", z: "north", y: "up" },
  source: "OpenStreetMap",
  license: "ODbL 1.0",
  attribution: "© OpenStreetMap contributors",
  fetchedAt: fetchMeta.fetchedAt ?? null,
  dataTimestamp: fetchMeta.dataTimestamp ?? null,
  gridMetres: res,
  simplifyMetres: area.simplifyMetres,
};

write("land.json", {
  ...shared,
  layer: "land",
  polygons: landPolygons.map((polygon) => ({
    outer: polygon.outer,
    holes: polygon.holes,
    areaKm2: polygon.areaM2,
  })),
});

write("water.json", {
  ...shared,
  layer: "water",
  note:
    "та же граница, что у суши, с обратным обходом: вода — дополнение суши " +
    "внутри прямоугольника загрузки, поэтому стыки совпадают по построению",
  polygons: landPolygons.map((polygon) => ({
    outer: polygon.outer.slice().reverse(),
    holes: polygon.holes.map((hole) => hole.slice().reverse()),
  })),
});

write("shoreline.json", {
  ...shared,
  layer: "shoreline",
  lines: shoreline.map((coords, index) => ({ id: `shoreline-${index}`, coords })),
});

write("quay.json", {
  ...shared,
  layer: "quay",
  note:
    "подтверждённые границы причального фронта: участки natural=coastline в створе " +
    "man_made=pier; отдельные теги man_made=quay в этой области OSM отсутствуют",
  front: quayFront.map((coords, index) => ({ id: `quay-front-${index}`, coords })),
  piers: pierPolygons.map(({ element, polygon }) => ({
    id: `way/${element.id}`,
    role: "platform",
    coords: polygon.outer[0].map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  })),
  openPiers: pierLines.map(({ element, points }) => ({
    id: `way/${element.id}`,
    role: "open",
    coords: points.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
  })),
  breakwaters: breakwaterElements.flatMap((element) =>
    linesOf(element).map((points, index) => ({
      id: `way/${element.id}#${index}`,
      coords: points.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]),
    })),
  ),
});

write("intertidal.json", {
  ...shared,
  layer: "intertidal",
  note: "natural=wetland из OSM (в основном mangrove); landuse=salt_pond в слой не входит",
  polygons: wetlandOut,
});

write("roads.json", {
  ...shared,
  layer: "roads",
  note:
    "осевые линии highway=* из OSM; ширина покрытия назначена по типу дороги, " +
    "участки над водой (мосты) вырезаны по маске суши — их моделируем отдельно",
  lines: roadsOut,
});

write("rail.json", {
  ...shared,
  layer: "rail",
  note:
    "осевые линии railway=* из OSM (главные, подъездные, сортировочные); " +
    "крановые пути выведены схематично из причального фронта и помечены как производные",
  lines: railLinesOut,
  craneRails: {
    derivedFrom: "quay.front",
    setback: CRANE_RAIL.setback,
    gauge: CRANE_RAIL.gauge,
    note:
      "в OSM крановые рельсы не размечены: пути параллельны кордону, " +
      "в сторону суши, с фиксированным отступом и колеёй — заготовка для моделей кранов",
    lines: craneRailsOut,
  },
});

const landAreaKm2 = landPolygons.reduce((sum, polygon) => sum + polygon.areaM2, 0);
const waterAreaKm2 =
  ((fetchBox.x1 - fetchBox.x0) * (fetchBox.z1 - fetchBox.z0)) / 1e6 - landAreaKm2;

write("meta.json", {
  ...shared,
  name: area.name,
  title: area.title,
  subtitle: area.subtitle,
  scene: area.scene,
  fetch: area.fetch,
  /** Прямоугольник, по которому запрошен снимок OSM (может быть шире fetch). */
  snapshotBbox: fetchMeta.bbox ?? area.fetch,
  utmZone: area.utmZone,
  origin: {
    lon: area.origin.lon,
    lat: area.origin.lat,
    easting: +originUtm.easting.toFixed(3),
    northing: +originUtm.northing.toFixed(3),
  },
  bounds: {
    x0: +fetchBox.x0.toFixed(2),
    x1: +fetchBox.x1.toFixed(2),
    z0: +fetchBox.z0.toFixed(2),
    z1: +fetchBox.z1.toFixed(2),
    scene: {
      x0: +sceneBox.x0.toFixed(2),
      x1: +sceneBox.x1.toFixed(2),
      z0: +sceneBox.z0.toFixed(2),
      z1: +sceneBox.z1.toFixed(2),
    },
  },
  counts: {
    coastlineChains: coastChains.length,
    coastlinePoints: coastChains.reduce((sum, chain) => sum + chain.points.length, 0),
    landPolygons: landPolygons.length,
    landHoles: landPolygons.reduce((sum, polygon) => sum + polygon.holes.length, 0),
    landVertices: landPolygons.reduce(
      (sum, polygon) =>
        sum +
        polygon.outer.length +
        polygon.holes.reduce((inner, hole) => inner + hole.length, 0),
      0,
    ),
    waterfront: quayFront.length,
    piers: pierPolygons.length,
    openPiers: pierLines.length,
    intertidal: wetlandOut.length,
    inlandWaterBodies: waterPolygons.length,
    saltPonds: saltPondElements.length,
    roads: roadsOut.length,
    roadsByClass: roadsOut.reduce((acc, line) => {
      acc[line.cls] = (acc[line.cls] ?? 0) + 1;
      return acc;
    }, {}),
    railLines: railLinesOut.length,
    craneRails: craneRailsOut.length,
  },
  areasKm2: { land: +landAreaKm2.toFixed(2), water: +waterAreaKm2.toFixed(2) },
  calibration: { waterState, landState, waterSeed, landSeed },
  controlPoints,
  derivations: [
    "land/water — маска по направленным линиям natural=coastline (суша слева), сетка " +
      `${res} м, контуры обрезаны по прямоугольнику загрузки`,
    "вода рукава в OSM не размечена полигоном: она следует из береговой линии",
    "причальный фронт — участки берега ближе 90 м к man_made=pier",
    "внутренние водоёмы natural=water вырезаны из суши по контуру OSM",
    `дороги и рельсы — осевые линии highway/railway из снимка; ширина покрытия назначена ` +
      `по типу (${Object.entries(ROAD_WIDTHS).slice(0, 4).map(([k, v]) => `${k} ${v} м`).join(", ")} …)`,
    `крановые пути — параллельный перенос причального фронта в сторону суши: ` +
      `отступ ${CRANE_RAIL.setback} м, колея ${CRANE_RAIL.gauge} м; в OSM таких объектов нет`,
  ],
  assumptions: [
    "высоты условные: поверхность суши плоская, +2,6 м над водой — не измерение",
    "глубины и линия прилива не переносились: в источнике их нет",
    "граница загрузки не является юридической границей порта",
    "ширина дорожного покрытия и колея крановых путей — проектные допущения, не данные OSM",
  ],
});

console.log(
  `[prepare] суша ${landAreaKm2.toFixed(2)} км², вода ${waterAreaKm2.toFixed(2)} км², ` +
    `полигонов ${landPolygons.length} (дыр ${landPolygons.reduce((s, p) => s + p.holes.length, 0)}), ` +
    `точек контура ${landPolygons.reduce((s, p) => s + p.outer.length, 0)}`,
);
console.log(
  `[prepare] дороги ${roadsOut.length} линий ` +
    `(${Object.entries(roadsOut.reduce((acc, l) => ({ ...acc, [l.cls]: (acc[l.cls] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ")}), ` +
    `рельсы ${railLinesOut.length}, крановые пути ${craneRailsOut.length}`,
);
