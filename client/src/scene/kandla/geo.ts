// Географическая привязка сцены: перевод координат между WGS84 и локальными
// метрами.
//
// Соглашение по осям (то же, что у демо-терминала, поэтому вода, камера и свет
// работают без переворотов):
//   X — на восток,  Z — на север,  Y — вверх;
//   1 единица сцены = 1 метр;  локальное начало — KANDLA_AREA.origin.
//
// Babylon.js использует левостороннюю систему с Y вверх. Пара «X на восток,
// Z на север» переводит карту в неё без зеркалирования: север остаётся севером,
// восток — востоком, поворот на 180° вокруг вертикали не требуется.
//
// Обратные друг другу geoToWorld и worldToGeo считаются через одну проекцию
// (EPSG:32642) и одно начало, поэтому «круг» lon/lat → XZ → lon/lat замкнут.

import { lonLatToUtm, utmToLonLat } from "./utm";

export interface GeoOrigin {
  lon: number;
  lat: number;
  /** Абсолютные координаты начала в UTM, м. */
  easting: number;
  northing: number;
}

export interface GeoFrame {
  /** Номер зоны UTM. */
  zone: number;
  origin: GeoOrigin;
  /** WGS84 → локальные метры (X на восток, Z на север). */
  geoToWorld(lon: number, lat: number): { x: number; z: number };
  /** Локальные метры → WGS84. */
  worldToGeo(x: number, z: number): { lon: number; lat: number };
}

export function createGeoFrame(zone: number, origin: GeoOrigin): GeoFrame {
  return {
    zone,
    origin,
    geoToWorld(lon: number, lat: number) {
      const utm = lonLatToUtm(lon, lat, zone);
      return {
        x: utm.easting - origin.easting,
        z: utm.northing - origin.northing,
      };
    },
    worldToGeo(x: number, z: number) {
      return utmToLonLat(x + origin.easting, z + origin.northing, zone);
    },
  };
}

/** Человекочитаемая запись координат: 23.02000° N, 70.22000° E. */
export function formatGeo(lon: number, lat: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lon).toFixed(5)}° ${ew}`;
}
