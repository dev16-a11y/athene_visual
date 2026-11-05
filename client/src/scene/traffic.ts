/**
 * Правило «не ближе, чем до впереди идущего» для техники на замкнутом маршруте.
 *
 * Маршрут причального проезда — одна замкнутая петля: туда по одной полосе,
 * обратно по другой. Все машины идут в одну сторону вдоль дуги, поэтому
 * разбирать столкновения в 2D не нужно: достаточно следить за расстоянием
 * вдоль маршрута и не подъезжать к впереди идущей машине ближе её габарита.
 *
 * Функция чистая: считает только ограничения (дуговую координату, дальше
 * которой машине нельзя), а плавность обеспечивает `EntityMotion` —
 * он подходит к этой границе по тормозной кривой.
 */

export interface ConvoyMember {
  id: string;
  /** Пройденное расстояние вдоль маршрута, м. */
  s: number;
}

export interface ConvoyRule {
  /** Минимальный интервал между центрами машин, м. */
  gap: number;
  /** Насколько далеко вперёд смотрим, м. */
  lookahead: number;
}

/**
 * Габарит автопоезда от центра машины: тягач + прицеп-шасси. Цифры — по
 * GLB-версии тягача (нос +3.4, корма достроенного шасси −15.9). Параметрический
 * fallback-тягач короче (нос +8.75, контейнер до −6.8): до подмены GLB конвой
 * держит пару метров лишнего зазора — безопасно, но свободнее, чем с GLB.
 */
export const TRUCK_RIG = { front: 3.4, rear: 15.9 } as const;
/** Зазор, который оставляем стоящему позади машины. */
export const TRUCK_CLEARANCE = 2.5;
/** Интервал между центрами: корма переднего + нос заднего + зазор. */
export const TRUCK_GAP = TRUCK_RIG.rear + TRUCK_RIG.front + TRUCK_CLEARANCE;
/**
 * Дальность поиска впереди идущей. Инвариант: строго меньше полудлины петли
 * (~411 м) — иначе ahead() переберёт весь круг и «сзади идущая» станет
 * «впереди идущей», запрет поедет против потока.
 */
export const TRUCK_LOOKAHEAD = 140;

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

/** Кратчайшее смещение вдоль замкнутого маршрута (копия правила из motion). */
function ahead(
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

/**
 * Для каждой машины — дуговая координата, дальше которой ей двигаться нельзя.
 *
 * Ограничение ставится по ближайшей машине впереди в пределах `lookahead`.
 * Машины, идущие в противоположную сторону, на этой петле физически находятся
 * на другой полосе (у них другое `s`), поэтому в расчёт не попадают.
 *
 * Машина уже нарушившая интервал (например, данные пришли с перекрытием)
 * получает ограничение позади себя — визуализация догонит его с той же
 * тормозной кривой, без рывка.
 */
export function planConvoy(
  length: number,
  members: ConvoyMember[],
  rule: ConvoyRule,
): Map<string, number> {
  const limits = new Map<string, number>();
  if (length <= 0 || members.length < 2) {
    return limits;
  }
  for (const member of members) {
    let nearest: number | null = null;
    for (const other of members) {
      if (other.id === member.id) {
        continue;
      }
      const distance = ahead(member.s, other.s, length);
      if (distance < 0 || distance > rule.lookahead) {
        continue;
      }
      if (nearest === null || distance < nearest) {
        nearest = distance;
      }
    }
    if (nearest === null) {
      continue;
    }
    limits.set(member.id, wrap(member.s + nearest - rule.gap, length));
  }
  return limits;
}
