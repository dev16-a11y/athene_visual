import { describe, expect, it } from "vitest";
import {
  consistLimits,
  createRailDrive,
  displayedLoaded,
  stepRailDrive,
  vehicleOffsets,
  type RailDriveLimits,
} from "./railDrive";

const limits: RailDriveLimits = {
  minX: -70,
  maxX: 200,
  cruiseSpeed: 4,
  acceleration: 0.3,
  dwellSeconds: 30,
  tolerance: 0.05,
};

/** Прогон до устойчивого состояния: возвращает историю шагов. */
function run(
  state: ReturnType<typeof createRailDrive>,
  seconds: number,
  step = 1 / 60,
) {
  const history: Array<ReturnType<typeof createRailDrive>> = [];
  let current = state;
  for (let time = 0; time < seconds; time += step) {
    current = stepRailDrive(current, step, limits);
    history.push(current);
  }
  return history;
}

describe("vehicleOffsets", () => {
  it("ставит соседей на полусумму габаритов", () => {
    const offsets = vehicleOffsets([17.52, 26.72, 14.52]);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeCloseTo(22.12, 6);
    expect(offsets[2]).toBeCloseTo(42.74, 6);
  });

  it("для одной машины даёт ноль", () => {
    expect(vehicleOffsets([15])).toEqual([0]);
  });
});

describe("consistLimits", () => {
  it("сдвигает границы на свесы состава", () => {
    const offsets = vehicleOffsets([17.52, 26.72]);
    const bounds = consistLimits(offsets, 8.76, 13.36, -212, 212);
    expect(bounds.minX).toBeCloseTo(-212 + 22.12 + 13.36, 6);
    expect(bounds.maxX).toBeCloseTo(212 - 8.76, 6);
  });
});

describe("stepRailDrive", () => {
  it("разгоняется не быстрее заданного ускорения", () => {
    const history = run(createRailDrive(0), 3);
    for (let index = 1; index < history.length; index += 1) {
      const dv = history[index]!.speed - history[index - 1]!.speed;
      expect(dv).toBeLessThanOrEqual(limits.acceleration / 60 + 1e-9);
    }
    expect(history.at(-1)!.speed).toBeCloseTo(0.3 * 3, 1);
  });

  it("выходит на крейсерскую скорость и держит её", () => {
    const history = run(createRailDrive(-60), 25);
    expect(Math.max(...history.map((state) => state.speed))).toBeCloseTo(
      limits.cruiseSpeed,
      6,
    );
  });

  it("останавливается в конце пути, не переезжая границу", () => {
    const history = run(createRailDrive(150), 60);
    const maxX = Math.max(...history.map((state) => state.x));
    expect(maxX).toBeLessThanOrEqual(limits.maxX + 1e-9);
    expect(maxX).toBeCloseTo(limits.maxX, 2);
    const stop = history.find((state) => state.dwell > 0);
    expect(stop).toBeDefined();
    expect(stop!.speed).toBe(0);
    expect(stop!.direction).toBe(-1);
  });

  it("стоит на стоянке и не двигается", () => {
    const history = run(createRailDrive(150), 60);
    const dwellStates = history.filter(
      (state) => state.dwell > 0 && state.dwell < limits.dwellSeconds,
    );
    const xs = new Set(dwellStates.map((state) => state.x.toFixed(6)));
    expect(xs.size).toBe(1);
  });

  it("после стоянки уезжает назад", () => {
    const history = run(createRailDrive(150), 120);
    const reversed = history.filter((state) => state.direction < 0);
    expect(reversed.length).toBeGreaterThan(0);
    expect(reversed.at(-1)!.x).toBeLessThan(limits.maxX - 1);
    expect(reversed.at(-1)!.speed).toBeLessThan(0);
  });

  it("не прыгает на длинном кадре", () => {
    const state = createRailDrive(0);
    const after = stepRailDrive({ ...state, speed: 4 }, 3, limits);
    expect(after.speed).toBeLessThanOrEqual(4);
    expect(after.x - state.x).toBeLessThanOrEqual(4 * 0.25);
  });
});

describe("displayedLoaded", () => {
  it("пересчитывает загрузку на укороченный состав", () => {
    expect(displayedLoaded(11, 18, 7)).toBe(4);
    expect(displayedLoaded(18, 18, 7)).toBe(7);
    expect(displayedLoaded(0, 18, 7)).toBe(0);
  });

  it("не выходит за границы", () => {
    expect(displayedLoaded(100, 18, 7)).toBe(7);
    expect(displayedLoaded(-5, 18, 7)).toBe(0);
    expect(displayedLoaded(4, 0, 7)).toBe(0);
  });
});
