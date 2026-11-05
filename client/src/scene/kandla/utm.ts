// Проекция WGS84 → UTM и обратно (серия Снайдера для поперечной Меркатора).
//
// Зачем своя: сцена живёт в метрах, а исходные данные OSM — в градусах. Для
// Кандлы используется зона 42N (EPSG:32642). Библиотеку ради двух функций не
// тянем: формулы короткие и проверяются тестом на контрольных точках,
// посчитанных независимо (см. utm.test.ts).
//
// Точность серии — единицы сантиметров на десятки километров от осевого
// меридиана, то есть заведомо выше точности самой карты OSM. Это не повод
// называть результат геодезическим: см. README, раздел о допущениях.

/** Большая полуось WGS84, м. */
export const WGS84_A = 6378137;
/** Полярное сжатие WGS84. */
export const WGS84_F = 1 / 298.257223563;

const E2 = WGS84_F * (2 - WGS84_F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const FALSE_EASTING = 500000;
const FALSE_NORTHING_SOUTH = 10000000;

const DEG = Math.PI / 180;

/** Метры в системе UTM. */
export interface UtmPoint {
  /** Easting, м. */
  easting: number;
  /** Northing, м. */
  northing: number;
}

/** Градусы WGS84. */
export interface LonLat {
  lon: number;
  lat: number;
}

/** Осевой меридиан зоны, градусы. */
export function centralMeridian(zone: number): number {
  return zone * 6 - 183;
}

/** Меридианная дуга от экватора до широты, м. */
function meridianArc(latRad: number): number {
  return (
    WGS84_A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256) * latRad -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 * E2 * E2) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * E2 * E2) / 256 + (45 * E2 * E2 * E2) / 1024) * Math.sin(4 * latRad) -
      ((35 * E2 * E2 * E2) / 3072) * Math.sin(6 * latRad))
  );
}

/**
 * WGS84 → UTM. Широты южного полушария получают false northing 10 000 000,
 * как и положено в UTM.
 */
export function lonLatToUtm(lon: number, lat: number, zone: number): UtmPoint {
  const latRad = lat * DEG;
  const lonRad = lon * DEG;
  const dLon = lonRad - centralMeridian(zone) * DEG;

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const n = WGS84_A / Math.sqrt(1 - E2 * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = EP2 * cosLat * cosLat;
  const a = cosLat * dLon;

  const m = meridianArc(latRad);

  const easting =
    FALSE_EASTING +
    K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120);

  const northing =
    (lat < 0 ? FALSE_NORTHING_SOUTH : 0) +
    K0 *
      (m +
        n *
          tanLat *
          (a * a / 2 +
            ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));

  return { easting, northing };
}

/** UTM → WGS84. */
export function utmToLonLat(easting: number, northing: number, zone: number): LonLat {
  const x = easting - FALSE_EASTING;
  const y = northing - (northing < 0 ? FALSE_NORTHING_SOUTH : 0);

  const m = y / K0;
  const mu =
    m /
    (WGS84_A *
      (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256));

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const j1 = (3 * e1) / 2 - (27 * e1 ** 3) / 32;
  const j2 = (21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32;
  const j3 = (151 * e1 ** 3) / 96;
  const j4 = (1097 * e1 ** 4) / 512;

  const fp =
    mu +
    j1 * Math.sin(2 * mu) +
    j2 * Math.sin(4 * mu) +
    j3 * Math.sin(6 * mu) +
    j4 * Math.sin(8 * mu);

  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);

  const c1 = EP2 * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const n1 = WGS84_A / Math.sqrt(1 - E2 * sinFp * sinFp);
  const r1 =
    (WGS84_A * (1 - E2)) / Math.pow(1 - E2 * sinFp * sinFp, 1.5);
  const d = x / (n1 * K0);

  const lat =
    (fp -
      ((n1 * tanFp) / r1) *
        (d * d / 2 -
          ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
          ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) *
            d ** 6) /
            720)) /
    DEG;

  const lon =
    centralMeridian(zone) +
    ((d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) /
        120) /
      cosFp) /
    DEG;

  return { lon, lat };
}

/** Номер зоны UTM по долготе. */
export function utmZone(lon: number): number {
  // 180° — граница: полосы 60-й зоны заканчиваются на 180, а формула даёт 61.
  return Math.min(60, Math.floor((lon + 180) / 6) + 1);
}
