// Подготовленные географические слои Кандлы.
//
// Данные лежат в public/geo/kandla и получены скриптами из geo/scripts:
// fetch-kandla.mjs (снимок OSM) → prepare-kandla.mjs (проекция, маска,
// контуры, упрощение). В рантайме сеть, кроме этих файлов, не используется:
// Overpass при обычном запуске не вызывается.

import { KANDLA_LAYER_BASE } from "./config";
import type { GeoBox } from "./config";

/** Кольцо в локальных метрах: [x, z]. */
export type Ring = [number, number];

export interface LandPolygon {
  outer: Ring[];
  holes: Ring[][];
  /** Площадь с вычетом дырок, км². */
  areaKm2: number;
}

export interface LineLayerItem {
  id: string;
  coords: Ring[];
}

export interface PierItem {
  id: string;
  role: "platform" | "open";
  coords: Ring[];
}

export interface IntertidalPolygon {
  wetland: string | null;
  coords: Ring[];
}

export interface KandlaMeta {
  name: string;
  title: string;
  subtitle: string;
  crs: string;
  projection: string;
  units: string;
  axis: { x: string; z: string; y: string };
  source: string;
  license: string;
  attribution: string;
  fetchedAt: string | null;
  dataTimestamp: string | null;
  gridMetres: number;
  simplifyMetres: number;
  utmZone: number;
  origin: { lon: number; lat: number; easting: number; northing: number };
  scene: GeoBox;
  fetch: GeoBox;
  bounds: {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
    scene: { x0: number; x1: number; z0: number; z1: number };
  };
  counts: {
    coastlineChains: number;
    coastlinePoints: number;
    landPolygons: number;
    landHoles: number;
    landVertices: number;
    waterfront: number;
    piers: number;
    openPiers: number;
    intertidal: number;
    inlandWaterBodies: number;
    saltPonds: number;
  };
  areasKm2: { land: number; water: number };
  calibration: { waterState: number; landState: number };
  controlPoints: {
    role: string;
    lon: number | null;
    lat: number | null;
    x: number;
    z: number;
    note: string;
  }[];
  derivations: string[];
  assumptions: string[];
}

export interface KandlaLayers {
  meta: KandlaMeta;
  land: LandPolygon[];
  water: { polygons: { outer: Ring[]; holes: Ring[][] }[] };
  shoreline: LineLayerItem[];
  quay: {
    front: LineLayerItem[];
    piers: PierItem[];
    openPiers: LineLayerItem[];
    breakwaters: LineLayerItem[];
  };
  intertidal: IntertidalPolygon[];
}

/** Понятная ошибка вместо пустой сцены, если данные не подготовлены. */
export class LayersMissingError extends Error {
  constructor(file: string, cause: unknown) {
    super(
      `не удалось прочитать слой «${file}» из ${KANDLA_LAYER_BASE}.\n` +
        "Подготовьте данные локально: npm run geo:fetch && npm run geo:prepare " +
        "(нужен доступ к Overpass API или OSM API). Сцена Кандлу без этих файлов " +
        `не строит.\nИсходная ошибка: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "LayersMissingError";
  }
}

async function readJson<T>(file: string): Promise<T> {
  const url = `${KANDLA_LAYER_BASE}${file}`;
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as T;
    if (!payload || typeof payload !== "object") {
      throw new Error("пустой ответ");
    }
    return payload;
  } catch (error) {
    throw new LayersMissingError(file, error);
  }
}

interface LandLayerFile {
  polygons: LandPolygon[];
}
interface WaterLayerFile {
  polygons: { outer: Ring[]; holes: Ring[][] }[];
}
interface LineLayerFile {
  lines: LineLayerItem[];
}
interface QuayLayerFile {
  front: LineLayerItem[];
  piers: PierItem[];
  openPiers: LineLayerItem[];
  breakwaters: LineLayerItem[];
}
interface IntertidalLayerFile {
  polygons: IntertidalPolygon[];
}

export async function loadKandlaLayers(): Promise<KandlaLayers> {
  const [meta, landFile, waterFile, shorelineFile, quayFile, intertidalFile] =
    await Promise.all([
      readJson<KandlaMeta>("meta.json"),
      readJson<LandLayerFile>("land.json"),
      readJson<WaterLayerFile>("water.json"),
      readJson<LineLayerFile>("shoreline.json"),
      readJson<QuayLayerFile>("quay.json"),
      readJson<IntertidalLayerFile>("intertidal.json"),
    ]);

  if (!Array.isArray(landFile.polygons) || landFile.polygons.length === 0) {
    throw new LayersMissingError("land.json", "нет ни одного полигона суши");
  }

  return {
    meta,
    land: landFile.polygons,
    water: { polygons: waterFile.polygons ?? [] },
    shoreline: shorelineFile.lines ?? [],
    quay: {
      front: quayFile.front ?? [],
      piers: quayFile.piers ?? [],
      openPiers: quayFile.openPiers ?? [],
      breakwaters: quayFile.breakwaters ?? [],
    },
    intertidal: intertidalFile.polygons ?? [],
  };
}
