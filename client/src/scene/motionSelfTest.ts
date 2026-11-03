import { EntityMotion, shortestAngle } from "./motion";
import { demoRoute } from "./routes";

/**
 * Детерминированные сценарии движения, которые выполняются в браузере на
 * том же собранном модуле. Нужны, чтобы проверять поворот, дрожание доставки
 * и потерю данных, не дожидаясь удачного момента в живой сцене.
 *
 * В каждом сценарии есть прогрев: клиент никогда не начинает с одного
 * измерения, поэтому окно замера открывается после двух-трёх сообщений.
 */

const FRAME_MS = 16;
const WARMUP_MS = 4_500;

export interface MotionScenario {
  name: string;
  /** Максимальный шаг между кадрами, м. */
  maxStep: number;
  /** Медианный шаг, м: по нему видна постоянная скорость. */
  medianStep: number;
  /** Кадры, где объект практически стоял во время движения. */
  stallFrames: number;
  /** Максимальный поворот корпуса за кадр после сглаживания, °. */
  maxHeadingStepDeg: number;
  /** Максимальное отклонение от маршрута, м (0 — если маршрута нет). */
  maxRouteOffset: number;
  /** Смещение за время без данных, м. */
  displacement: number;
  stale: boolean;
  speed: number;
  /** Ожидаемая скорость по данным, м/с. */
  expectedSpeed: number;
}

export interface MotionSelfTestReport {
  scenarios: MotionScenario[];
  frames: number;
}

interface Frame {
  x: number;
  z: number;
  heading: number;
}

interface ScenarioInput {
  name: string;
  motion: EntityMotion;
  /** Подача измерений по времени кадра (мс от начала прогона). */
  feed: (frame: number, time: number) => void;
  durationMs: number;
  expectedSpeed: number;
  /** Прогрев до окна замера: буфер должен набрать историю. */
  warmupMs?: number;
  route?: ReturnType<typeof demoRoute>;
}

function runScenario(input: ScenarioInput): MotionScenario {
  const { name, motion, feed, durationMs, expectedSpeed, route } = input;
  const warmupMs = input.warmupMs ?? WARMUP_MS;
  const start = 10_000_000;
  let previous: Frame | null = null;
  let smoothed = 0;
  let maxStep = 0;
  let maxHeadingStep = 0;
  let maxOffset = 0;
  let stalls = 0;
  const steps: number[] = [];

  for (let frame = 0; frame <= (warmupMs + durationMs) / FRAME_MS; frame += 1) {
    const time = start + frame * FRAME_MS;
    feed(frame, time);
    const pose = motion.sample(time);
    smoothed +=
      shortestAngle(smoothed, pose.heading) * (1 - Math.exp((-FRAME_MS / 1000) * 6));
    if (frame * FRAME_MS >= warmupMs) {
      if (previous) {
        const step = Math.hypot(pose.x - previous.x, pose.z - previous.z);
        steps.push(step);
        maxStep = Math.max(maxStep, step);
        if (step < 0.002) {
          stalls += 1;
        }
        maxHeadingStep = Math.max(
          maxHeadingStep,
          Math.abs(shortestAngle(previous.heading, smoothed)),
        );
      }
      if (route) {
        maxOffset = Math.max(maxOffset, route.project(pose.x, pose.z).distance);
      }
      previous = { x: pose.x, z: pose.z, heading: smoothed };
    }
  }

  const sorted = [...steps].sort((a, b) => a - b);
  const stats = motion.stats(start + warmupMs + durationMs);
  return {
    name,
    maxStep: Number(maxStep.toFixed(3)),
    medianStep: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(3)),
    stallFrames: stalls,
    maxHeadingStepDeg: Number(((maxHeadingStep * 180) / Math.PI).toFixed(2)),
    maxRouteOffset: Number(maxOffset.toFixed(3)),
    displacement: 0,
    stale: stats.stale,
    speed: stats.speed,
    expectedSpeed,
  };
}

/** Измерения строго на маршруте с постоянной скоростью. */
function routeFeed(
  motion: EntityMotion,
  route: ReturnType<typeof demoRoute>,
  startS: number,
  speed: number,
) {
  let s = startS;
  return (frame: number) => {
    if (frame % 125 === 0) {
      s += speed * 2;
      const point = route.at(s);
      motion.pushSample({
        time: 10_000_000 + frame * FRAME_MS,
        x: point.x,
        z: point.z,
        heading: point.heading,
      });
    }
  };
}

export function runMotionSelfTest(): MotionSelfTestReport {
  const scenarios: MotionScenario[] = [];

  // 1. Прямой участок причального проезда.
  {
    const route = demoRoute("truck-loop");
    const motion = new EntityMotion("straight", { route });
    const seed = route.at(60);
    motion.seed(seed.x, seed.z, seed.heading);
    scenarios.push(
      runScenario({
        name: "прямой участок",
        motion,
        feed: routeFeed(motion, route, 60, 11),
        durationMs: 8_000,
        expectedSpeed: 11,
        route,
      }),
    );
  }

  // 2. Поворот: дуга разворота у восточного торца причала.
  {
    const route = demoRoute("truck-loop");
    const motion = new EntityMotion("turn", { route });
    const seed = route.at(370);
    motion.seed(seed.x, seed.z, seed.heading);
    scenarios.push(
      runScenario({
        name: "поворот",
        motion,
        feed: routeFeed(motion, route, 370, 11),
        durationMs: 8_000,
        warmupMs: 2_500,
        expectedSpeed: 11,
        route,
      }),
    );
  }

  // 3. Остановка: машина стоит, измерения на месте.
  {
    const route = demoRoute("truck-loop");
    const motion = new EntityMotion("stop", { route });
    const point = route.at(40);
    motion.seed(point.x, point.z, point.heading);
    scenarios.push(
      runScenario({
        name: "остановка",
        motion,
        feed: (frame) => {
          if (frame % 125 === 0) {
            motion.pushSample({
              time: 10_000_000 + frame * FRAME_MS,
              x: point.x,
              z: point.z,
              heading: point.heading,
            });
          }
        },
        durationMs: 6_000,
        expectedSpeed: 0,
        route,
      }),
    );
  }

  // 4. Неравномерная доставка: интервалы 300…2600 мс, без маршрута.
  {
    const motion = new EntityMotion("jitter", { mode: "telemetry" });
    motion.seed(0, 56, 0);
    const speed = 10;
    const offsets = [0, 300, 2_400, 2_700, 5_100, 5_350, 7_900, 8_200, 10_400, 12_900];
    let cursor = 0;
    scenarios.push(
      runScenario({
        name: "неравномерная доставка",
        motion,
        feed: (frame, time) => {
          const elapsed = time - 10_000_000;
          while (cursor < offsets.length && offsets[cursor]! <= elapsed) {
            const offset = offsets[cursor]!;
            cursor += 1;
            motion.pushSample({
              time: 10_000_000 + offset,
              x: (speed * offset) / 1000,
              z: 56,
              heading: 0,
            });
          }
          void frame;
        },
        durationMs: 8_000,
        expectedSpeed: 10,
      }),
    );
  }

  // 5. Потеря данных: связь пропала, прогноз должен остановиться.
  {
    const motion = new EntityMotion("loss", {
      mode: "telemetry",
      staleAfterMs: 3_000,
    });
    motion.seed(0, 56, 0);
    motion.pushSample({ time: 10_000_000, x: 0, z: 56, heading: 0 });
    motion.pushSample({ time: 10_002_000, x: 20, z: 56, heading: 0 });
    let last: Frame | null = null;
    let displacement = 0;
    let stale = false;
    const frozenFrom = 10_000_000 + 4_000;
    for (let frame = 0; frame <= 9_000 / FRAME_MS; frame += 1) {
      const time = 10_000_000 + frame * FRAME_MS;
      const pose = motion.sample(time);
      if (time >= frozenFrom && last) {
        displacement = Math.max(
          displacement,
          Math.hypot(pose.x - last.x, pose.z - last.z),
        );
      }
      last = { x: pose.x, z: pose.z, heading: pose.heading };
      stale = motion.stats(time).stale;
    }
    scenarios.push({
      name: "потеря данных",
      maxStep: 0,
      medianStep: 0,
      stallFrames: 0,
      maxHeadingStepDeg: 0,
      maxRouteOffset: 0,
      displacement: Number(displacement.toFixed(3)),
      stale,
      speed: 0,
      expectedSpeed: 0,
    });
  }

  return { scenarios, frames: Math.round((WARMUP_MS + 10_000) / FRAME_MS) };
}
