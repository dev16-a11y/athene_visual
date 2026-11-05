import { describe, expect, it } from "vitest";
import { EntityMotion, headingFromDirection, shortestAngle } from "./motion";
import { demoRoute } from "./routes";

const FRAME_MS = 16;

/** Прогон цикла отрисовки: возвращает позы на каждом кадре. */
function run(
  motion: EntityMotion,
  from: number,
  durationMs: number,
): Array<{ x: number; z: number; heading: number; t: number }> {
  const poses = [];
  for (let time = from; time <= from + durationMs; time += FRAME_MS) {
    poses.push({ ...motion.sample(time), t: time });
  }
  return poses;
}

function steps(poses: Array<{ x: number; z: number }>): number[] {
  const result: number[] = [];
  for (let index = 1; index < poses.length; index += 1) {
    result.push(
      Math.hypot(
        poses[index]!.x - poses[index - 1]!.x,
        poses[index]!.z - poses[index - 1]!.z,
      ),
    );
  }
  return result;
}

function deviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

describe("EntityMotion: прямой участок", () => {
  it("движется с постоянной скоростью, без остановок между сообщениями", () => {
    const motion = new EntityMotion("truck-test");
    motion.seed(-200, 56, 0);
    const speed = 11;
    const start = 1_000_000;
    // Сообщения раз в 300 мс: буфер держит задержку около интервала доставки.
    for (let index = 0; index < 30; index += 1) {
      const time = start + index * 300;
      motion.pushSample({
        time,
        x: -200 + (speed * index * 300) / 1000,
        z: 56,
        heading: 0,
      });
    }

    // Первую секунду буфер заполняется — меряем установившееся движение.
    const poses = run(motion, start + 3_000, 4_500);
    const distances = steps(poses);
    const expected = (speed * FRAME_MS) / 1000;

    expect(Math.min(...distances)).toBeGreaterThan(expected * 0.6);
    expect(Math.abs(deviation(distances) / expected)).toBeLessThan(0.35);
    // Ни одного кадра «стояния» посреди движения.
    expect(distances.filter((value) => value < expected * 0.25)).toHaveLength(0);
  });

  it("идёт строго по оси X и не уводит по Z", () => {
    const motion = new EntityMotion("truck-axis");
    motion.seed(0, 56, 0);
    const start = 500_000;
    for (let index = 0; index < 4; index += 1) {
      motion.pushSample({ time: start + index * 2_000, x: index * 22, z: 56, heading: 0 });
    }
    for (const pose of run(motion, start + 3_000, 2_000)) {
      expect(Math.abs(pose.z - 56)).toBeLessThan(0.001);
    }
  });
});

describe("EntityMotion: поворот", () => {
  it("на маршруте проходит дугу разворота, а не срезает её по хорде", () => {
    const route = demoRoute("truck-loop");
    const motion = new EntityMotion("truck-turn", { route });
    const start = 2_000_000;
    const speed = 11;
    const turnStart = 380; // у восточного торца причала

    const seedPose = route.at(turnStart);
    motion.seed(seedPose.x, seedPose.z, seedPose.heading);

    const poses: Array<{ x: number; z: number; heading: number; smoothed: number }> = [];
    let s = turnStart;
    let smoothed = seedPose.heading;
    for (let frame = 0; frame <= 1_400; frame += 1) {
      const time = start + frame * FRAME_MS;
      // Сообщения приходят раз в 2 с — как в демо-источнике.
      if (frame % 125 === 0) {
        s += speed * 2;
        const point = route.at(s);
        motion.pushSample({ time, x: point.x, z: point.z, heading: point.heading });
      }
      const pose = motion.sample(time);
      // Такую же доводку курса делает PortScene через кватернионы.
      smoothed += shortestAngle(smoothed, pose.heading) * (1 - Math.exp((-FRAME_MS / 1000) * 6));
      poses.push({ ...pose, smoothed });
    }

    const offRoute = poses.map((pose) => route.project(pose.x, pose.z).distance);
    // Точки лежат на маршруте: хорда между измерениями дала бы до 3,5 м промаха.
    expect(Math.max(...offRoute)).toBeLessThan(0.6);

    // Курс ни на одном кадре не перескакивает больше чем на 6°.
    const turns = poses.slice(1).map((pose, index) =>
      Math.abs(shortestAngle(poses[index]!.smoothed, pose.smoothed)),
    );
    expect(Math.max(...turns)).toBeLessThan((6 * Math.PI) / 180);

    // На дуге корпус действительно разворачивается.
    const headingSpan = Math.abs(
      shortestAngle(poses[0]!.heading, poses[poses.length - 1]!.heading),
    );
    expect(headingSpan).toBeGreaterThan((90 * Math.PI) / 180);
  });

  it("без маршрута остаётся на прямой между измерениями", () => {
    const motion = new EntityMotion("truck-chord", { mode: "telemetry" });
    motion.seed(0, 0, 0);
    const start = 3_000_000;
    motion.pushSample({ time: start, x: 0, z: 0, heading: 0 });
    motion.pushSample({ time: start + 2_000, x: 20, z: 20, heading: Math.PI / 2 });
    const poses = run(motion, start, 2_000);
    for (const pose of poses) {
      expect(Math.abs(pose.x - pose.z)).toBeLessThan(0.01);
    }
  });
});

describe("EntityMotion: остановка", () => {
  it("останавливается и не дрейфует", () => {
    const motion = new EntityMotion("truck-stop", { mode: "telemetry" });
    motion.seed(10, 56, 0);
    const start = 4_000_000;
    motion.pushSample({ time: start, x: 30, z: 56, heading: 0 });
    motion.pushSample({ time: start + 2_000, x: 32, z: 56, heading: 0 });
    for (let index = 2; index < 6; index += 1) {
      motion.pushSample({ time: start + index * 2_000, x: 32, z: 56, heading: 0 });
    }
    const poses = run(motion, start + 4_000, 3_000);
    const distances = steps(poses);
    expect(Math.max(...distances)).toBeLessThan(0.02);
    expect(Math.abs(poses[poses.length - 1]!.x - 32)).toBeLessThan(0.05);
  });

  it("на маршруте при нулевой скорости держит точку", () => {
    const route = demoRoute("truck-loop");
    const motion = new EntityMotion("truck-idle", { route });
    const point = route.at(40);
    motion.seed(point.x, point.z, point.heading);
    const start = 5_000_000;
    for (let index = 0; index < 4; index += 1) {
      motion.pushSample({
        time: start + index * 2_000,
        x: point.x,
        z: point.z,
        heading: point.heading,
      });
    }
    const poses = run(motion, start + 2_000, 4_000);
    for (const pose of poses) {
      expect(Math.hypot(pose.x - point.x, pose.z - point.z)).toBeLessThan(0.5);
    }
  });
});

describe("EntityMotion: неравномерная доставка", () => {
  it("рывки в доставке не превращаются в рывки визуала", () => {
    const motion = new EntityMotion("truck-jitter", {
      mode: "telemetry",
      delayMs: 320,
    });
    motion.seed(0, 56, 0);
    const start = 6_000_000;
    const speed = 10;
    // Интервалы 300…2600 мс, но позиции соответствуют времени измерения.
    const times = [0, 300, 2_400, 2_700, 5_100, 5_350];
    for (const offset of times) {
      motion.pushSample({
        time: start + offset,
        x: (speed * offset) / 1000,
        z: 56,
        heading: 0,
      });
    }

    // Задержка рендера растягивается до худшего интервала (2,6 с), поэтому
    // меряем после того, как буфер накопил историю.
    const poses = run(motion, start + 3_500, 1_800);
    const distances = steps(poses);
    const expected = (speed * FRAME_MS) / 1000;

    // Ни одного кадра с «телепортом» и ни одного с полной остановкой.
    expect(Math.max(...distances)).toBeLessThan(expected * 2.2);
    expect(distances.filter((value) => value < 0.0005)).toHaveLength(0);
    // Движение монотонно по X: назад машина не едет.
    for (let index = 1; index < poses.length; index += 1) {
      expect(poses[index]!.x).toBeGreaterThanOrEqual(poses[index - 1]!.x - 0.001);
    }
  });
});

describe("EntityMotion: потеря данных и восстановление", () => {
  it("после потери связи прогноз ограничен, состояние помечается устаревшим", () => {
    const motion = new EntityMotion("truck-stale", {
      mode: "telemetry",
      staleAfterMs: 3_000,
    });
    motion.seed(0, 0, 0);
    const start = 7_000_000;
    motion.pushSample({ time: start, x: 0, z: 0, heading: 0 });
    motion.pushSample({ time: start + 2_000, x: 20, z: 0, heading: 0 });

    const last = motion.sample(start + 4_500);
    const frozen = motion.sample(start + 40_000);
    const stats = motion.stats(start + 40_000);

    expect(stats.stale).toBe(true);
    // Дальше предела прогноза не уезжает: 900 мс при 10 м/с.
    expect(frozen.x - last.x).toBeLessThan(12);
    expect(frozen.x).toBeGreaterThanOrEqual(last.x);
  });

  it("после возврата во вкладку показывает известное и не проигрывает разрыв", () => {
    const motion = new EntityMotion("truck-resync");
    motion.seed(0, 56, 0);
    const start = 8_000_000;
    for (let index = 0; index < 4; index += 1) {
      motion.pushSample({ time: start + index * 2_000, x: index * 20, z: 56, heading: 0 });
    }
    const before = motion.sample(start + 4_000);
    motion.resync(start + 120_000, before);

    const after = motion.sample(start + 120_500);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.001);

    // Первое свежее измерение возвращает на актуальную позицию.
    motion.pushSample({ time: start + 120_000, x: 400, z: 56, heading: 0 });
    const fresh = motion.sample(start + 120_100);
    expect(Math.abs(fresh.x - 400)).toBeLessThan(1);
  });
});

describe("маршруты", () => {
  it("стадион причала замкнут и имеет ожидаемую длину", () => {
    const route = demoRoute("truck-loop");
    expect(route.closed).toBe(true);
    // 2 × 400 м прямых + 2 полуокружности радиусом 3,5 м.
    expect(route.length).toBeGreaterThan(820);
    expect(route.length).toBeLessThan(824);
    const start = route.at(0);
    const end = route.at(route.length - 0.001);
    expect(Math.hypot(start.x - end.x, start.z - end.z)).toBeLessThan(0.01);
  });

  it("эллипс буксира лежит на воде и замкнут", () => {
    const route = demoRoute("tug-ellipse");
    for (let s = 0; s < route.length; s += 7) {
      const point = route.at(s);
      expect(point.z).toBeLessThan(-80);
    }
    expect(route.length).toBeGreaterThan(500);
  });

  it("курс соответствует направлению движения", () => {
    expect(headingFromDirection(1, 0)).toBeCloseTo(0, 6);
    expect(Math.abs(headingFromDirection(-1, 0))).toBeCloseTo(Math.PI, 6);
    expect(headingFromDirection(0, -1)).toBeCloseTo(Math.PI / 2, 6);
  });
});
describe("EntityMotion: интервал до впереди идущей машины", () => {
  const start = 2_000_000;
  const speed = 11;

  function loopMotion(): EntityMotion {
    const motion = new EntityMotion("truck-follow", {
      route: demoRoute("truck-loop"),
    });
    motion.seed(-200, 56, 0);
    for (let index = 0; index < 40; index += 1) {
      const time = start + index * 2_000;
      const travelled = (speed * index * 2_000) / 1000;
      motion.pushSample({
        time,
        x: -200 + (travelled % 400),
        z: 56,
        heading: 0,
      });
    }
    return motion;
  }

  it("не заезжает за линию, даже если данные тянут вперёд", () => {
    const motion = loopMotion();
    const route = demoRoute("truck-loop");
    motion.setLeadLimit(60);
    const poses = run(motion, start + 40 * 2_000, 20_000);
    const last = poses[poses.length - 1]!;
    const s = route.project(last.x, last.z).s;
    // Линия — 60 м от начала маршрута; допуск на один кадр подхода.
    expect(s).toBeLessThanOrEqual(60.5);
  });

  it("останавливается плавно, без прыжка на последнем кадре", () => {
    const motion = loopMotion();
    motion.setLeadLimit(60);
    const poses = run(motion, start + 40 * 2_000, 12_000);
    const tail = steps(poses).slice(-120);
    expect(Math.max(...tail)).toBeLessThan(0.4);
  });

  it("после снятия ограничения продолжает движение без рывка", () => {
    const motion = new EntityMotion("truck-follow", {
      route: demoRoute("truck-loop"),
    });
    motion.seed(-200, 56, 0);
    // Данные идут всё время: ограничение снимаем на ходу, как когда
    // впереди идущая машина уезжает.
    for (let index = 0; index < 70; index += 1) {
      const time = start + index * 2_000;
      const travelled = (speed * index * 2_000) / 1000;
      motion.pushSample({
        time,
        x: -200 + (travelled % 400),
        z: 56,
        heading: 0,
      });
    }
    motion.setLeadLimit(60);
    run(motion, start + 40 * 2_000, 10_000);
    motion.setLeadLimit(null);
    const poses = run(motion, start + 51 * 2_000, 4_000);
    const tail = steps(poses).slice(-40);
    expect(Math.max(...tail)).toBeLessThan(0.6);
    expect(Math.min(...tail)).toBeGreaterThan(0);
  });
});