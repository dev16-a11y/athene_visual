import { describe, expect, it } from "vitest";
import {
  formatAge,
  getDataAgeMs,
  getFreshness,
  isStale,
} from "./freshness";
import { OFFLINE_AFTER_MS, STALE_AFTER_MS } from "../domain/constants";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");

describe("getDataAgeMs", () => {
  it("uses the server timestamp, not the local receive time", () => {
    expect(
      getDataAgeMs("2026-11-02T11:59:58.000Z", NOW),
    ).toBe(2_000);
  });

  it("applies the measured server clock offset", () => {
    expect(
      getDataAgeMs("2026-11-02T11:59:58.000Z", NOW, 2_000),
    ).toBe(4_000);
  });

  it("never returns a negative age", () => {
    expect(getDataAgeMs("2026-11-02T12:00:10.000Z", NOW)).toBe(0);
  });

  it("returns infinity for an invalid timestamp", () => {
    expect(getDataAgeMs("not-a-date", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("freshness classification", () => {
  it("keeps fresh data below the stale threshold", () => {
    expect(getFreshness(STALE_AFTER_MS - 1)).toBe("fresh");
    expect(isStale(STALE_AFTER_MS - 1)).toBe(false);
  });

  it("marks data stale at the threshold", () => {
    expect(getFreshness(STALE_AFTER_MS)).toBe("stale");
    expect(isStale(STALE_AFTER_MS)).toBe(true);
  });

  it("marks data offline after the longer timeout", () => {
    expect(getFreshness(OFFLINE_AFTER_MS)).toBe("offline");
  });
});

describe("formatAge", () => {
  it("produces human readable age", () => {
    expect(formatAge(400)).toBe("сейчас");
    expect(formatAge(12_400)).toBe("12 с назад");
    expect(formatAge(125_000)).toBe("2 мин назад");
    expect(formatAge(Number.POSITIVE_INFINITY)).toBe("нет данных");
  });
});
