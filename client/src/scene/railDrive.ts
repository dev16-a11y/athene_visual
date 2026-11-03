/**
 * Кинематика состава по прямому пути.
 *
 * Чистая арифметика без Babylon: разгон, торможение, стоянка, реверс.
 * Вынесена отдельно, чтобы её можно было проверить тестами без сцены.
 *
 * Состав жёстко закреплён за локомотивом: машины всегда стоят позади него
 * вдоль пути и не разворачиваются. Меняется только знак скорости — так
 * состав и «сдаёт назад», как настоящий маневровый.
 */

export interface RailDriveState {
  /** Положение центра локомотива вдоль пути, метры. */
  x: number;
  /** Скорость со знаком: положительная — вдоль +X, м/с. */
  speed: number;
  /** Куда состав поедет после текущей стоянки. */
  direction: 1 | -1;
  /** Остаток стоянки, секунды. */
  dwell: number;
}

export interface RailDriveLimits {
  /** Крайние допустимые положения локомотива: состав должен влезть в путь. */
  minX: number;
  maxX: number;
  /** Крейсерская скорость, м/с. */
  cruiseSpeed: number;
  /** Ускорение и замедление, м/с². */
  acceleration: number;
  /** Длительность стоянки на конце, секунды. */
  dwellSeconds: number;
  /** Допуск на точку остановки, метры. */
  tolerance?: number;
}

export function createRailDrive(x: number): RailDriveState {
  return { x, speed: 0, direction: 1, dwell: 0 };
}

/** Один шаг движения. Возвращает новое состояние, вход не меняется. */
export function stepRailDrive(
  state: RailDriveState,
  deltaSeconds: number,
  limits: RailDriveLimits,
): RailDriveState {
  // Кадр после возврата во вкладку может быть длинным: не телепортируем состав.
  const dt = Math.min(0.25, Math.max(0, deltaSeconds));
  if (dt === 0) {
    return state;
  }
  if (state.dwell > 0) {
    return { ...state, dwell: Math.max(0, state.dwell - dt), speed: 0 };
  }

  const tolerance = limits.tolerance ?? 0.05;
  const stopX = state.direction > 0 ? limits.maxX : limits.minX;
  const remaining = Math.abs(stopX - state.x);
  // Тормозной путь v²/2a: скорость, с которой ещё успеем встать в точке.
  const braking = Math.sqrt(
    2 * limits.acceleration * Math.max(0, remaining - tolerance),
  );
  const target = state.direction * Math.min(limits.cruiseSpeed, braking);
  const maxDelta = limits.acceleration * dt;
  const speed =
    state.speed < target
      ? Math.min(target, state.speed + maxDelta)
      : Math.max(target, state.speed - maxDelta);

  let x = state.x + speed * dt;
  if (state.direction > 0 ? x > stopX : x < stopX) {
    x = stopX;
  }

  const atStop = Math.abs(stopX - x) <= tolerance && Math.abs(speed) <= maxDelta + 1e-6;
  if (atStop) {
    return {
      x: stopX,
      speed: 0,
      direction: (state.direction * -1) as 1 | -1,
      dwell: limits.dwellSeconds,
    };
  }
  return { x, speed, direction: state.direction, dwell: 0 };
}

/**
 * Сколько вагонов показать загруженными, если на путь выставлена только часть
 * состава: данные считают загрузку по полному числу вагонов, а моделей на
 * сцене меньше.
 */
export function displayedLoaded(
  loadedWagons: number,
  dataWagons: number,
  shownWagons: number,
): number {
  if (dataWagons <= 0 || shownWagons <= 0) {
    return 0;
  }
  const ratio = Math.round((loadedWagons / dataWagons) * shownWagons);
  return Math.max(0, Math.min(shownWagons, ratio));
}

/**
 * Смещения центров машин от центра локомотива вдоль состава.
 * Соседние машины сцеплены: расстояние между центрами равно полусумме
 * их габаритных длин (couplerPitch из паспорта моделей).
 */
export function vehicleOffsets(pitches: number[]): number[] {
  const offsets = [0];
  for (let index = 1; index < pitches.length; index += 1) {
    offsets.push(
      offsets[index - 1]! + (pitches[index - 1]! + pitches[index]!) / 2,
    );
  }
  return offsets;
}

/**
 * Диапазон положений локомотива, при котором весь состав остаётся в
 * границах пути: учитываются свес носа локомотива и хвоста последней машины.
 */
export function consistLimits(
  offsets: number[],
  frontHalf: number,
  rearHalf: number,
  trackMin: number,
  trackMax: number,
): { minX: number; maxX: number } {
  const tail = offsets[offsets.length - 1] ?? 0;
  return {
    minX: trackMin + tail + rearHalf,
    maxX: trackMax - frontHalf,
  };
}
