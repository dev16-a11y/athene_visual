import type { Point2 } from "../domain/types";

/**
 * Движение отделено от данных: сервер присылает измерения, а визуальная
 * трансформация считается в цикле отрисовки по времени. Частота сообщений
 * (2 с у демо-источника) больше не задаёт частоту движения.
 *
 * Ключевая идея для маршрута: измерение переводится в пройденное расстояние
 * вдоль маршрута, а между измерениями расстояние интерполируется по времени.
 * Поэтому машина едет по траектории (а не по хорде) и не прыгает на каждом
 * сообщении: скорость меняется только там, где её изменили измерения.
 */

export interface MotionSample {
  /** Время измерения на той же шкале, что и `now` (мс). */
  time: number;
  x: number;
  z: number;
  /** Курс в радианах, как в Babylon: 0 — вдоль +X, π/2 — вдоль −Z. */
  heading: number;
}

export interface MotionPose {
  x: number;
  z: number;
  heading: number;
}

export type MotionMode = "telemetry" | "route";

export interface RouteProjection {
  /** Расстояние вдоль маршрута от начала, м. */
  s: number;
  /** Расстояние от точки до маршрута, м. */
  distance: number;
}

export interface Route {
  readonly length: number;
  readonly closed: boolean;
  project(x: number, z: number): RouteProjection;
  at(s: number): MotionPose;
}

/** Курс по направлению движения в системе сцены. */
export function headingFromDirection(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/** Кратчайшая разница двух углов в диапазоне (−π, π]. */
export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  if (delta <= -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

/** Кратчайшее смещение вдоль замкнутого маршрута. */
export function shortestAlongRoute(
  from: number,
  to: number,
  length: number,
): number {
  let delta = to - from;
  if (length <= 0) {
    return delta;
  }
  while (delta > length / 2) {
    delta -= length;
  }
  while (delta <= -length / 2) {
    delta += length;
  }
  return delta;
}

export function createRoute(points: Point2[], closed: boolean): Route {
  const list = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.z),
  );
  if (list.length < 2) {
    throw new Error("маршрут требует минимум двух точек");
  }
  const vertexCount = closed ? list.length : list.length - 1;
  const cumulative: number[] = [0];
  for (let index = 0; index < vertexCount; index += 1) {
    const current = list[index]!;
    const next = list[(index + 1) % list.length]!;
    cumulative.push(
      cumulative[index]! + Math.hypot(next.x - current.x, next.z - current.z),
    );
  }
  const length = cumulative[cumulative.length - 1]!;

  function segmentAt(s: number): { index: number; t: number } {
    if (length <= 0) {
      return { index: 0, t: 0 };
    }
    let value = s;
    if (closed) {
      value = ((value % length) + length) % length;
    } else {
      value = Math.min(Math.max(value, 0), length);
    }
    let low = 0;
    let high = vertexCount - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (cumulative[mid]! <= value) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    const start = cumulative[low]!;
    const span = cumulative[low + 1]! - start;
    return { index: low, t: span > 0 ? (value - start) / span : 0 };
  }

  function positionAt(s: number): Point2 {
    const { index, t } = segmentAt(s);
    const current = list[index % list.length]!;
    const next = list[(index + 1) % list.length]!;
    return {
      x: current.x + (next.x - current.x) * t,
      z: current.z + (next.z - current.z) * t,
    };
  }

  return {
    length,
    closed,
    at(s: number) {
      const point = positionAt(s);
      // Курс берём по хорде ±1,5 м: на углу поворота он меняется плавно,
      // а не скачком на 90°.
      const window = 1.5;
      const behind = positionAt(s - window);
      const ahead = positionAt(s + window);
      return {
        x: point.x,
        z: point.z,
        heading: headingFromDirection(
          ahead.x - behind.x,
          ahead.z - behind.z,
        ),
      };
    },
    project(x: number, z: number) {
      let best: RouteProjection = { s: 0, distance: Number.POSITIVE_INFINITY };
      for (let index = 0; index < vertexCount; index += 1) {
        const current = list[index]!;
        const next = list[(index + 1) % list.length]!;
        const dx = next.x - current.x;
        const dz = next.z - current.z;
        const spanSquared = dx * dx + dz * dz;
        const t =
          spanSquared > 0
            ? Math.min(
                1,
                Math.max(
                  0,
                  ((x - current.x) * dx + (z - current.z) * dz) / spanSquared,
                ),
              )
            : 0;
        const px = current.x + dx * t;
        const pz = current.z + dz * t;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < best.distance) {
          const span = Math.sqrt(spanSquared);
          best = { s: cumulative[index]! + span * t, distance };
        }
      }
      return best;
    },
  };
}

export interface MotionOptions {
  route?: Route;
  mode?: MotionMode;
  /** Насколько рендер отстаёт от данных (режим телеметрии). */
  delayMs?: number;
  /** Предел прогноза вперёд при потере данных. */
  maxExtrapolationMs?: number;
  /** После этого времени без данных состояние считается устаревшим. */
  staleAfterMs?: number;
  maxSamples?: number;
}

export interface MotionStats {
  mode: MotionMode;
  speed: number;
  samples: number;
  sampleAgeMs: number;
  stale: boolean;
  /** Отклонение от маршрута, м (для режима маршрута). */
  routeOffset: number;
}

const DEFAULTS = {
  delayMs: 320,
  maxExtrapolationMs: 900,
  staleAfterMs: 3200,
  maxSamples: 24,
};

interface TrackPoint {
  time: number;
  /** Пройденное расстояние вдоль маршрута (для режима маршрута). */
  s: number;
  sample: MotionSample;
}

/**
 * Состояние движения одной сущности.
 *
 * `route` — демонстрационный режим: положение считается по пройденному
 * расстоянию вдоль известного маршрута. На поворотах корпус идёт по
 * траектории, а не по хорде между двумя измерениями.
 *
 * `telemetry` — реальные данные: буфер измерений с метками времени, рендер
 * отстаёт на настраиваемую задержку и интерполируется между измерениями.
 */
export class EntityMotion {
  readonly id: string;
  private readonly route?: Route;
  private readonly delayMs: number;
  private readonly maxExtrapolationMs: number;
  private readonly staleAfterMs: number;
  private readonly maxSamples: number;

  private mode: MotionMode;
  private track: TrackPoint[] = [];
  private speed = 0;
  private hold: MotionPose = { x: 0, z: 0, heading: 0 };
  private lastSampleTime = 0;
  private hasSample = false;
  /** Видимое расстояние вдоль маршрута: догоняет расчётное с ограничением. */
  private displayS: number | null = null;
  private lastFrameTime = 0;
  private frameGapSeconds = 0.016;
  /** Показанная поза: к расчётной идёт с ограничением скорости. */
  private display: MotionPose | null = null;
  /** Оценка интервала между сообщениями: от неё зависит задержка рендера. */
  private intervalMs = 0;
  /** Худший интервал из последних измерений: по нему и держим задержку. */
  private intervalPeakMs = 0;
  /** Разрыв, после которого положение переносится сразу, а не догоняется. */
  private snapDistance = 45;
  /** После сброса шкалы не экстраполируем: показываем известное положение. */
  private snapPending = false;

  constructor(id: string, options: MotionOptions = {}) {
    this.id = id;
    this.route = options.route;
    this.mode = options.mode ?? (options.route ? "route" : "telemetry");
    this.delayMs = options.delayMs ?? DEFAULTS.delayMs;
    this.maxExtrapolationMs =
      options.maxExtrapolationMs ?? DEFAULTS.maxExtrapolationMs;
    this.staleAfterMs = options.staleAfterMs ?? DEFAULTS.staleAfterMs;
    this.maxSamples = options.maxSamples ?? DEFAULTS.maxSamples;
  }

  setMode(mode: MotionMode): void {
    this.mode = mode;
  }

  getMode(): MotionMode {
    return this.mode;
  }

  /** Начальное положение до первого измерения. */
  seed(x: number, z: number, heading: number): void {
    this.hold = { x, z, heading };
    if (this.route) {
      this.displayS = this.route.project(x, z).s;
    }
  }

  pushSample(sample: MotionSample): void {
    if (
      !Number.isFinite(sample.time) ||
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.z)
    ) {
      return;
    }
    const last = this.track[this.track.length - 1];
    if (last && sample.time < last.time) {
      return;
    }
    if (last && sample.time === last.time) {
      this.track[this.track.length - 1] = {
        time: sample.time,
        s: this.route ? this.route.project(sample.x, sample.z).s : 0,
        sample,
      };
      return;
    }

    const s = this.route ? this.route.project(sample.x, sample.z).s : 0;
    this.track.push({ time: sample.time, s, sample });
    if (this.track.length > this.maxSamples) {
      this.track.shift();
    }

    if (last) {
      const dt = (sample.time - last.time) / 1000;
      if (dt > 0.05) {
        this.intervalMs = this.intervalMs * 0.4 + dt * 1000 * 0.6;
        // Задержка должна покрывать самый долгий разрыв из последних
        // измерений: иначе рендер уходит вперёд данных и дёргается.
        const window = this.track.slice(-5);
        this.intervalPeakMs = Math.max(
          dt * 1000,
          ...window.slice(1).map((point, index) => point.time - window[index]!.time),
        );
        const travelled = this.route
          ? Math.abs(
              shortestAlongRoute(last.s, s, this.route.length),
            )
          : Math.hypot(sample.x - last.sample.x, sample.z - last.sample.z);
        const measured = travelled / dt;
        // Быстрая сходимость: прогноз между сообщениями опирается на неё,
        // поэтому отставание оценки превращалось бы в рывок на каждом пакете.
        this.speed = this.speed * 0.25 + measured * 0.75;
        if (travelled < 0.35) {
          this.speed = 0;
        }
      }
    }

    this.hold = { x: sample.x, z: sample.z, heading: sample.heading };
    this.lastSampleTime = sample.time;
    this.hasSample = true;
    this.snapPending = false;
  }

  /**
   * Сброс временной шкалы: после возврата во вкладку или переподключения
   * накопленный разрыв не проигрываем. Положение на экране сохраняем, чтобы
   * возврат не выглядел прыжком; первое свежее измерение либо догоняется
   * плавно, либо переносит сразу, если разрыв слишком велик.
   */
  resync(now: number, pose?: MotionPose): void {
    if (pose) {
      this.hold = { ...pose };
      if (this.route) {
        this.displayS = this.route.project(pose.x, pose.z).s;
      }
    }
    // История после разрыва бесполезна: шкала другая, и проигрывать её нельзя.
    this.track = [];
    this.hasSample = false;
    this.speed = 0;
    this.lastFrameTime = 0;
    this.display = { ...this.hold };
    this.lastSampleTime = now;
    this.snapPending = true;
  }

  sample(now: number): MotionPose {
    if (!this.hasSample) {
      return this.hold;
    }
    this.frameGapSeconds =
      this.lastFrameTime > 0
        ? Math.min(0.1, Math.max(0.001, (now - this.lastFrameTime) / 1000))
        : 0.016;
    this.lastFrameTime = now;
    if (this.snapPending) {
      return this.hold;
    }

    if (this.mode === "route" && this.route) {
      const pose = this.sampleAlongRoute(now);
      this.hold = pose;
      return pose;
    }
    return this.sampleTelemetry(now);
  }

  /** Пройденное расстояние интерполируется по времени между измерениями. */
  private sampleAlongRoute(now: number): MotionPose {
    const route = this.route!;
    const newest = this.track[this.track.length - 1]!;
    let targetS: number;

    if (now >= newest.time) {
      // Впереди измерений: доезжаем по последней скорости, но не дольше,
      // чем позволяет доверие к данным.
      const horizon = Math.min(now - newest.time, this.staleAfterMs) / 1000;
      targetS = newest.s + this.speed * horizon;
    } else {
      let index = this.track.length - 1;
      while (index > 0 && this.track[index - 1]!.time > now) {
        index -= 1;
      }
      const next = this.track[index]!;
      const previous = this.track[Math.max(0, index - 1)]!;
      if (next === previous) {
        targetS = next.s;
      } else {
        const span = next.time - previous.time;
        const t =
          span > 0 ? Math.min(1, Math.max(0, (now - previous.time) / span)) : 1;
        targetS =
          previous.s + shortestAlongRoute(previous.s, next.s, route.length) * t;
      }
    }

    // Догоняем расчётное расстояние с запасом по скорости: поправка после
    // измерения (например, первое определение скорости) растворяется, а не
    // прыгает. На установившемся движении ограничитель не срабатывает.
    if (this.displayS === null) {
      this.displayS = targetS;
    } else {
      const diff = shortestAlongRoute(this.displayS, targetS, route.length);
      if (Math.abs(diff) > this.snapDistance) {
        // Разрыв слишком велик (долгое отсутствие данных, переподключение):
        // показываем фактическое положение, а не ползём к нему минуту.
        this.displayS = targetS;
      } else {
        // Догоняем с запасом: поправку любого размера разбираем примерно
        // за секунду, а не ползём к ней со скоростью стоящей машины.
        const rate = Math.min(
          30,
          Math.max(Math.abs(this.speed) * 1.6, Math.abs(diff) / 1.2),
        );
        const limit = rate * this.frameGapSeconds;
        this.displayS += Math.sign(diff) * Math.min(Math.abs(diff), limit);
      }
    }
    return route.at(this.displayS);
  }

  private sampleTelemetry(now: number): MotionPose {
    // Задержка не меньше интервала доставки: иначе рендер оказывается впереди
    // данных и вынужден экстраполировать, а на каждом сообщении дёргаться.
    const target = Math.min(
      3_000,
      Math.max(this.delayMs, this.intervalPeakMs * 1.1),
    );
    const renderTime = now - target;
    const newest = this.track[this.track.length - 1]!;
    if (renderTime >= newest.time) {
      const led =
        Math.min(renderTime - newest.time, this.maxExtrapolationMs) / 1000;
      const previous = this.track[this.track.length - 2];
      if (!previous || this.speed < 0.15) {
        return this.followPose(newest.sample);
      }
      const heading = headingFromDirection(
        newest.sample.x - previous.sample.x,
        newest.sample.z - previous.sample.z,
      );
      return this.followPose({
        x: newest.sample.x + Math.cos(heading) * this.speed * led,
        z: newest.sample.z - Math.sin(heading) * this.speed * led,
        heading: newest.sample.heading,
      });
    }

    let index = this.track.length - 1;
    while (index > 0 && this.track[index - 1]!.time > renderTime) {
      index -= 1;
    }
    const next = this.track[index]!;
    const previous = this.track[Math.max(0, index - 1)]!;
    if (next === previous) {
      return this.followPose(next.sample);
    }
    const span = next.time - previous.time;
    const t =
      span > 0
        ? Math.min(1, Math.max(0, (renderTime - previous.time) / span))
        : 1;
    return this.followPose({
      x: previous.sample.x + (next.sample.x - previous.sample.x) * t,
      z: previous.sample.z + (next.sample.z - previous.sample.z) * t,
      heading:
        previous.sample.heading +
        shortestAngle(previous.sample.heading, next.sample.heading) * t,
    });
  }

  /**
   * Показ позы с ограничением скорости: любая поправка (смена задержки,
   * подстройка часов, первое измерение скорости) растворяется за доли
   * секунды вместо прыжка. В установившемся движении ограничитель не
   * срабатывает: цель идёт ровно со скоростью объекта.
   */
  private followPose(target: MotionPose): MotionPose {
    if (!this.display) {
      this.display = { ...target };
      return this.display;
    }
    const dx = target.x - this.display.x;
    const dz = target.z - this.display.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.0005) {
      this.display.heading = target.heading;
      return this.display;
    }
    if (distance > this.snapDistance) {
      this.display = { ...target };
      return this.display;
    }
    const rate = Math.min(
      30,
      Math.max(Math.abs(this.speed) * 1.6, distance / 0.8),
    );
    const share = Math.min(1, (rate * this.frameGapSeconds) / distance);
    this.display.x += dx * share;
    this.display.z += dz * share;
    this.display.heading = target.heading;
    return this.display;
  }

  /** Сырые измерения: для отладки и замеров в браузере. */
  trace(): Array<{ time: number; s: number; x: number; z: number }> {
    return this.track.map((point) => ({
      time: point.time,
      s: Number(point.s.toFixed(2)),
      x: point.sample.x,
      z: point.sample.z,
    }));
  }

  stats(now: number): MotionStats {
    const age =
      this.lastSampleTime > 0
        ? now - this.lastSampleTime
        : Number.POSITIVE_INFINITY;
    const projection = this.route
      ? this.route.project(this.hold.x, this.hold.z)
      : { s: 0, distance: 0 };
    return {
      mode: this.mode,
      speed: Number(this.speed.toFixed(2)),
      samples: this.track.length,
      sampleAgeMs: Number.isFinite(age) ? Math.round(age) : -1,
      stale: age > this.staleAfterMs,
      routeOffset: Number(projection.distance.toFixed(2)),
    };
  }
}
