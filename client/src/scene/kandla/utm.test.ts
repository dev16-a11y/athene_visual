// Проекция должна быть именно той, что заявлена: EPSG:32642 (UTM, зона 42N).
// Контрольные значения — из независимых источников (proj4js / epsg.io), поэтому
// тест ловит не «код согласован сам с собой», а расхождение с эталоном.

import { describe, expect, it } from "vitest";

import { centralMeridian, lonLatToUtm, utmToLonLat, utmZone } from "./utm";
import { createGeoFrame, formatGeo } from "./geo";

describe("UTM 42N", () => {
  it("определяет зону по долготе", () => {
    expect(utmZone(70.22)).toBe(42);
    expect(utmZone(-0.5)).toBe(30);
    expect(utmZone(0)).toBe(31);
    expect(utmZone(180)).toBe(60);
  });

  it("считает осевой меридиан", () => {
    expect(centralMeridian(42)).toBeCloseTo(69, 10);
  });

  it("совпадает с эталонными координатами", () => {
    // epsg.io / proj4: 70.22E 23.02N → 42N.
    const point = lonLatToUtm(70.22, 23.02, 42);
    expect(point.easting).toBeCloseTo(625015.64, 1);
    expect(point.northing).toBeCloseTo(2546254.3, 1);

    // Ноль на экваторе и осевом меридиане зоны — 500000 м на восток.
    const axis = lonLatToUtm(69, 0, 42);
    expect(axis.easting).toBeCloseTo(500000, 3);
    expect(axis.northing).toBeCloseTo(0, 3);
  });

  it("обратен сам себе", () => {
    for (const [lon, lat] of [
      [70.22, 23.02],
      [70.19, 22.99],
      [70.26, 23.06],
      [70.5, 24.5],
    ] as const) {
      const utm = lonLatToUtm(lon, lat, 42);
      const back = utmToLonLat(utm.easting, utm.northing, 42);
      expect(back.lon).toBeCloseTo(lon, 9);
      expect(back.lat).toBeCloseTo(lat, 9);
    }
  });

  it("масштаб в метрах: 0,001° по широте ≈ 111 м", () => {
    const a = lonLatToUtm(70.22, 23.02, 42);
    const b = lonLatToUtm(70.22, 23.021, 42);
    expect(b.northing - a.northing).toBeGreaterThan(110);
    expect(b.northing - a.northing).toBeLessThan(112);
  });
});

describe("геопривязка сцены", () => {
  const frame = createGeoFrame(42, {
    lon: 70.22,
    lat: 23.02,
    easting: 625015.638,
    northing: 2546254.297,
  });

  it("начало координат — в нуле", () => {
    const origin = frame.geoToWorld(70.22, 23.02);
    expect(origin.x).toBeCloseTo(0, 1);
    expect(origin.z).toBeCloseTo(0, 1);
  });

  it("оси: X на восток, Z на север", () => {
    const east = frame.geoToWorld(70.221, 23.02);
    const north = frame.geoToWorld(70.22, 23.021);
    expect(east.x).toBeGreaterThan(90);
    expect(Math.abs(east.z)).toBeLessThan(2);
    expect(north.z).toBeGreaterThan(100);
    expect(Math.abs(north.x)).toBeLessThan(2);
  });

  it("worldToGeo обратен geoToWorld", () => {
    const world = frame.geoToWorld(70.2235, 23.031);
    const geo = frame.worldToGeo(world.x, world.z);
    expect(geo.lon).toBeCloseTo(70.2235, 9);
    expect(geo.lat).toBeCloseTo(23.031, 9);
  });

  it("форматирует координаты", () => {
    expect(formatGeo(70.22, 23.02)).toBe("23.02000° N, 70.22000° E");
  });
});

