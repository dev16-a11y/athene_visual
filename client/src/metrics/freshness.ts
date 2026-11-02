import { OFFLINE_AFTER_MS, STALE_AFTER_MS } from "../domain/constants";

export type FreshnessLevel = "fresh" | "stale" | "offline";

export function getDataAgeMs(
  serverTime: string,
  clientNowMs: number,
  clockOffsetMs = 0,
): number {
  const serverMs = Date.parse(serverTime);
  if (!Number.isFinite(serverMs)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, clientNowMs + clockOffsetMs - serverMs);
}

export function getFreshness(ageMs: number): FreshnessLevel {
  if (ageMs >= OFFLINE_AFTER_MS) {
    return "offline";
  }
  if (ageMs >= STALE_AFTER_MS) {
    return "stale";
  }
  return "fresh";
}

export function isStale(ageMs: number, thresholdMs = STALE_AFTER_MS): boolean {
  return ageMs >= thresholdMs;
}

export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs)) {
    return "нет данных";
  }
  if (ageMs < 1_000) {
    return "сейчас";
  }
  if (ageMs < 60_000) {
    return `${Math.floor(ageMs / 1_000)} с назад`;
  }
  return `${Math.floor(ageMs / 60_000)} мин назад`;
}
