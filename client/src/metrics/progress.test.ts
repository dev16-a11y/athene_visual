import { describe, expect, it } from "vitest";
import {
  computePercent,
  computeProgress,
  deviationLabel,
  formatPercent,
} from "./progress";

describe("computePercent", () => {
  it("computes a ratio as a percentage", () => {
    expect(computePercent(1632, 2400)).toBe(68);
    expect(computePercent(1302, 3100)).toBeCloseTo(42, 5);
  });

  it("clamps to the 0..100 range", () => {
    expect(computePercent(5000, 2400)).toBe(100);
    expect(computePercent(-10, 2400)).toBe(0);
  });

  it("returns 0 for a non-positive or invalid total", () => {
    expect(computePercent(10, 0)).toBe(0);
    expect(computePercent(10, -5)).toBe(0);
    expect(computePercent(Number.NaN, 100)).toBe(0);
    expect(computePercent(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("computeProgress", () => {
  it("keeps one decimal for the vessel list and card", () => {
    expect(computeProgress(1632, 2400)).toBe(68);
    expect(computeProgress(1302, 3100)).toBe(42);
    expect(computeProgress(1, 3)).toBe(33.3);
  });

  it("does not produce NaN when the plan is empty", () => {
    expect(computeProgress(0, 0)).toBe(0);
  });
});

describe("formatPercent", () => {
  it("formats with the requested precision", () => {
    expect(formatPercent(68)).toBe("68%");
    expect(formatPercent(82.46, 1)).toBe("82.5%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("deviationLabel", () => {
  it("describes on-time and delayed operations", () => {
    expect(deviationLabel(0)).toBe("по графику");
    expect(deviationLabel(35)).toBe("+35 мин");
    expect(deviationLabel(-10)).toBe("-10 мин");
  });
});
