import { describe, expect, it } from "vitest";
import { computeProgress } from "../metrics/progress";
import {
  buildDemoSnapshot,
  buildHistory,
  DEMO_START_TICK,
} from "./demoWorld";

const BASE = Date.parse("2026-11-02T12:00:00.000Z");

describe("demo world", () => {
  it("matches the specification at the start of the demo", () => {
    const snapshot = buildDemoSnapshot(BASE, DEMO_START_TICK);
    const orion = snapshot.vessels.find((vessel) => vessel.name === "ORION");
    const vega = snapshot.vessels.find((vessel) => vessel.name === "VEGA");
    expect(orion?.completedTeu).toBe(1632);
    expect(orion?.plannedTeu).toBe(2400);
    expect(computeProgress(orion!.completedTeu, orion!.plannedTeu)).toBe(68);
    expect(vega?.completedTeu).toBe(1302);
    expect(vega?.plannedTeu).toBe(3100);
    expect(computeProgress(vega!.completedTeu, vega!.plannedTeu)).toBe(42);
    expect(orion?.berth).toBe("02");
    expect(vega?.berth).toBe("03");
  });

  it("keeps list, card and scene inputs consistent", () => {
    const snapshot = buildDemoSnapshot(BASE, DEMO_START_TICK);
    const totalCompleted = snapshot.vessels.reduce(
      (sum, vessel) => sum + vessel.completedTeu,
      0,
    );
    expect(snapshot.kpis.teuHandled).toBe(9906 + totalCompleted);
    expect(snapshot.kpis.teuHandled).toBe(12840);
  });

  it("raises exactly one warning during the demo", () => {
    const before = buildDemoSnapshot(BASE, 65);
    const after = buildDemoSnapshot(BASE, 66);
    expect(before.warnings).toHaveLength(0);
    expect(after.warnings).toHaveLength(1);
    expect(after.warnings[0]?.entityId).toBe("yard-b2");
  });

  it("produces a short reproducible history", () => {
    const points = buildHistory(BASE, 120);
    expect(points.length).toBeGreaterThan(5);
    expect(points[points.length - 1]?.sequence).toBe(120);
    const earlier = buildDemoSnapshot(BASE, 100);
    const later = buildDemoSnapshot(BASE, 120);
    expect(later.vessels[0]!.completedTeu).toBeGreaterThan(
      earlier.vessels[0]!.completedTeu,
    );
  });
});
