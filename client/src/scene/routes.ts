import type { Point2 } from "../domain/types";
import { createRoute, type Route } from "./motion";

/**
 * Маршруты демонстрационного движения. Геометрия повторяет траектории
 * демо-источника (движение по причальному проезду и эллипс буксира), поэтому
 * положение можно считать по пройденному расстоянию, а не по хордам между
 * измерениями.
 */

export type RouteKey = "truck-loop" | "tug-ellipse";

/** Причальный проезд: две полосы и развороты на концах. */
const TRUCK_MIN_X = -200;
const TRUCK_MAX_X = 200;
const TRUCK_LANE_NEAR = 56;
const TRUCK_LANE_FAR = 63;

function stadium(): Point2[] {
  const points: Point2[] = [];
  const radius = (TRUCK_LANE_FAR - TRUCK_LANE_NEAR) / 2;
  const centerZ = (TRUCK_LANE_NEAR + TRUCK_LANE_FAR) / 2;
  const arcSteps = 8;

  points.push({ x: TRUCK_MIN_X, z: TRUCK_LANE_NEAR });
  points.push({ x: TRUCK_MAX_X, z: TRUCK_LANE_NEAR });

  // Разворот за восточным торцом причала.
  for (let step = 1; step <= arcSteps; step += 1) {
    const angle = (Math.PI * step) / arcSteps;
    points.push({
      x: TRUCK_MAX_X + Math.sin(angle) * radius,
      z: centerZ - Math.cos(angle) * radius,
    });
  }

  points.push({ x: TRUCK_MIN_X, z: TRUCK_LANE_FAR });

  // Разворот за западным торцом.
  for (let step = 1; step <= arcSteps; step += 1) {
    const angle = (Math.PI * step) / arcSteps;
    points.push({
      x: TRUCK_MIN_X - Math.sin(angle) * radius,
      z: centerZ + Math.cos(angle) * radius,
    });
  }

  return points;
}

/** Эллипс буксира на акватории. */
function tugEllipse(): Point2[] {
  const points: Point2[] = [];
  const steps = 96;
  for (let step = 0; step < steps; step += 1) {
    const angle = (Math.PI * 2 * step) / steps;
    points.push({
      x: Math.cos(angle) * 118,
      z: -142 + Math.sin(angle) * 58,
    });
  }
  return points;
}

let cache: Record<RouteKey, Route> | null = null;

export function demoRoute(key: RouteKey): Route {
  if (!cache) {
    cache = {
      "truck-loop": createRoute(stadium(), true),
      "tug-ellipse": createRoute(tugEllipse(), true),
    };
  }
  return cache[key];
}
