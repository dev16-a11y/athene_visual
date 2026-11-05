import { describe, expect, it } from "vitest";
import {
  planConvoy,
  TRUCK_CLEARANCE,
  TRUCK_GAP,
  TRUCK_RIG,
} from "./traffic";

const LOOP = 800;
const RULE = { gap: TRUCK_GAP, lookahead: 140 };

describe("planConvoy", () => {
  it("оставляет интервал до впереди идущей машины", () => {
    const limits = planConvoy(
      LOOP,
      [
        { id: "a", s: 0 },
        { id: "b", s: 100 },
      ],
      RULE,
    );
    expect(limits.get("a")).toBeCloseTo(100 - TRUCK_GAP, 6);
    expect(limits.has("b")).toBe(false);
  });

  it("считает интервал через точку начала маршрута", () => {
    const limits = planConvoy(
      LOOP,
      [
        { id: "a", s: 790 },
        { id: "b", s: 10 },
      ],
      RULE,
    );
    expect(limits.get("a")).toBeCloseTo(790 + 20 - TRUCK_GAP, 6);
  });

  it("не ограничивает машину, если впереди никого нет в пределах обзора", () => {
    const limits = planConvoy(
      LOOP,
      [
        { id: "a", s: 0 },
        // 300 м позади: формально это 500 м вперёд по петле, но это уже
        // не «впереди идущая» — обзор ограничен.
        { id: "b", s: 300 },
      ],
      RULE,
    );
    expect(limits.size).toBe(0);
  });

  it("берёт ближайшую машину, а не первую попавшуюся", () => {
    const limits = planConvoy(
      LOOP,
      [
        { id: "a", s: 0 },
        { id: "b", s: 60 },
        { id: "c", s: 120 },
      ],
      RULE,
    );
    expect(limits.get("a")).toBeCloseTo(60 - TRUCK_GAP, 6);
    expect(limits.get("b")).toBeCloseTo(120 - TRUCK_GAP, 6);
  });

  it("разводит машины, оказавшиеся в одной точке", () => {
    const limits = planConvoy(
      LOOP,
      [
        { id: "a", s: 40 },
        { id: "b", s: 40 },
      ],
      RULE,
    );
    expect(limits.get("a")).toBeCloseTo(40 - TRUCK_GAP, 6);
    expect(limits.get("b")).toBeCloseTo(40 - TRUCK_GAP, 6);
  });

  it("ничего не делает на пустом списке и без длины", () => {
    expect(planConvoy(LOOP, [], RULE).size).toBe(0);
    expect(planConvoy(0, [{ id: "a", s: 0 }], RULE).size).toBe(0);
  });

  it("интервал покрывает габарит автопоезда", () => {
    expect(TRUCK_GAP).toBeGreaterThan(TRUCK_RIG.front + TRUCK_RIG.rear);
    expect(TRUCK_GAP).toBeCloseTo(
      TRUCK_RIG.front + TRUCK_RIG.rear + TRUCK_CLEARANCE,
      6,
    );
  });
});
