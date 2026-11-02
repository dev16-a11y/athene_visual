import { TICK_MS } from "../domain/constants";
import type {
  Crane,
  PortWarning,
  Snapshot,
  StateDelta,
  Train,
  Truck,
  Tug,
  Vessel,
  YardBlock,
} from "../domain/types";

const SHIFT_HOURS = 12;
const HISTORY_SPAN_TICKS = 900;
const HISTORY_STEP_TICKS = 6;

const VESSEL_SEEDS = [
  {
    id: "vessel-orion",
    name: "ORION",
    operation: "loading",
    berth: "02",
    plannedTeu: 2400,
    completedTeu: 1632,
    x: -102,
    deviationMinutes: 35,
  },
  {
    id: "vessel-vega",
    name: "VEGA",
    operation: "unloading",
    berth: "03",
    plannedTeu: 3100,
    completedTeu: 1302,
    x: 104,
    deviationMinutes: -10,
  },
] as const;

const CRANE_SEEDS = [
  { id: "crane-01", name: "STS-01", x: -162, berth: "02" },
  { id: "crane-02", name: "STS-02", x: -108, berth: "02" },
  { id: "crane-03", name: "STS-03", x: -54, berth: "02" },
  { id: "crane-04", name: "STS-04", x: 54, berth: "03" },
  { id: "crane-05", name: "STS-05", x: 108, berth: "03" },
  { id: "crane-06", name: "STS-06", x: 162, berth: "03" },
] as const;

const YARD_SEEDS = [
  { id: "yard-a1", block: "A1", x: -140, z: 122, capacityTeu: 2100, fill: 0.62 },
  { id: "yard-a2", block: "A2", x: -88, z: 122, capacityTeu: 1800, fill: 0.54 },
  { id: "yard-b1", block: "B1", x: -140, z: 188, capacityTeu: 2100, fill: 0.71 },
  { id: "yard-b2", block: "B2", x: -88, z: 188, capacityTeu: 1800, fill: 0.83 },
  { id: "yard-c1", block: "C1", x: 84, z: 122, capacityTeu: 2400, fill: 0.66 },
  { id: "yard-c2", block: "C2", x: 140, z: 188, capacityTeu: 2400, fill: 0.48 },
] as const;

const TRUCK_SEEDS = [
  { id: "truck-01", offset: 30, speed: 12, status: "moving", loaded: true },
  { id: "truck-02", offset: 140, speed: 10, status: "moving", loaded: true },
  { id: "truck-03", offset: 250, speed: 9, status: "moving", loaded: false },
  { id: "truck-04", offset: 330, speed: 11, status: "working", loaded: true },
  { id: "truck-05", offset: 390, speed: 0, status: "idle", loaded: false },
] as const;

const ROAD_MIN_X = -200;
const ROAD_MAX_X = 200;
const WARNING_TICK = 66;
export const DEMO_START_TICK = 60;

function iso(baseMs: number, tick: number): string {
  return new Date(baseMs + tick * TICK_MS).toISOString();
}

function buildVessels(baseMs: number, tick: number): Vessel[] {
  const planTeu = [2400, 3100];
  const startTeu = [1632, 1302];
  const rates = [4, 3];
  return VESSEL_SEEDS.map((seed, index) => {
    const completedTeu =
      startTeu[index] - DEMO_START_TICK * rates[index] + tick * rates[index];
    const startedAt = iso(baseMs, -10_800);
    return {
      id: seed.id,
      kind: "vessel",
      name: seed.name,
      position: { x: seed.x, z: -18 },
      heading: 0,
      status: "working",
      updatedAt: iso(baseMs, tick),
      cargo: "containers",
      operation: seed.operation,
      berth: seed.berth,
      plannedTeu: planTeu[index],
      completedTeu,
      startedAt,
      plannedFinish: new Date(baseMs + 2 * 3_600_000).toISOString(),
      deviationMinutes: seed.deviationMinutes,
      loa: 190,
      beam: 32,
    };
  });
}

function buildCranes(baseMs: number, tick: number): Crane[] {
  return CRANE_SEEDS.map((seed, index) => {
    const maintenance = seed.id === "crane-05";
    const spreaderLoad = !maintenance && (tick + index) % 4 < 2;
    return {
      id: seed.id,
      kind: "crane",
      name: seed.name,
      position: { x: seed.x, z: 12 },
      heading: 180,
      status: maintenance ? "maintenance" : "working",
      updatedAt: iso(baseMs, tick),
      berth: seed.berth,
      spreaderLoad: spreaderLoad ? 1 : 0,
      movesPerHour: maintenance ? 0 : 26 + (index % 3) * 2,
    };
  });
}

function buildTrucks(baseMs: number, tick: number): Truck[] {
  const span = ROAD_MAX_X - ROAD_MIN_X;
  return TRUCK_SEEDS.map((seed) => {
    const travelled = seed.offset + tick * seed.speed;
    const loop = ((travelled % (span * 2)) + span * 2) % (span * 2);
    const eastbound = loop < span;
    const x = eastbound ? ROAD_MIN_X + loop : ROAD_MAX_X - (loop - span);
    return {
      id: seed.id,
      kind: "truck",
      name: seed.id.replace("truck-", "Авто "),
      position: { x, z: eastbound ? 56 : 63 },
      heading: eastbound ? 0 : 180,
      status: seed.status,
      updatedAt: iso(baseMs, tick),
      loaded: seed.loaded,
      route: seed.status === "working" ? "quay" : "yard",
    };
  });
}

function buildTugs(baseMs: number, tick: number): Tug[] {
  const angle = tick * 0.012 + 0.6;
  const x = Math.cos(angle) * 118;
  const z = -142 + Math.sin(angle) * 58;
  const heading = (Math.atan2(Math.cos(angle), -Math.sin(angle)) * 180) / Math.PI;
  return [
    {
      id: "tug-atlas",
      kind: "tug",
      name: "ATLAS",
      position: { x, z },
      heading,
      status: "moving",
      updatedAt: iso(baseMs, tick),
      course: (angle * 180) / Math.PI + 90,
    },
  ];
}

function buildTrain(baseMs: number, tick: number): Train {
  return {
    id: "train-01",
    kind: "train",
    name: "Состав 2047",
    position: { x: 12, z: 82 },
    heading: 90,
    status: "working",
    updatedAt: iso(baseMs, tick),
    wagons: 18,
    loadedWagons: Math.min(18, 11 + Math.floor(tick / 40)),
  };
}

function buildYards(baseMs: number, tick: number): YardBlock[] {
  return YARD_SEEDS.map((seed) => {
    const warningPressure = seed.id === "yard-b2" && tick >= WARNING_TICK;
    const fill = warningPressure
      ? 0.91
      : Math.min(0.97, seed.fill + tick * 0.00006);
    return {
      id: seed.id,
      kind: "yard",
      name: `Площадка ${seed.block}`,
      block: seed.block,
      position: { x: seed.x, z: seed.z },
      heading: 0,
      status: warningPressure ? "warning" : "working",
      updatedAt: iso(baseMs, tick),
      capacityTeu: seed.capacityTeu,
      occupiedTeu: Math.round(seed.capacityTeu * fill),
      queuedTrucks: warningPressure ? 7 : (seed.block.charCodeAt(0) + tick) % 3,
    };
  });
}

function buildWarnings(baseMs: number, tick: number): PortWarning[] {
  if (tick < WARNING_TICK) {
    return [];
  }
  return [
    {
      id: "warning-yard-b2",
      severity: "warning",
      entityId: "yard-b2",
      title: "Площадка B2 заполнена на 91%",
      message:
        "Очередь на въезд — 7 машин. Рекомендуется перенаправить поток на площадку C2.",
      raisedAt: iso(baseMs, WARNING_TICK),
      active: true,
    },
  ];
}

function buildKpis(baseMs: number, tick: number) {
  const shiftStart = new Date(baseMs);
  shiftStart.setHours(8, 0, 0, 0);
  const periodStart = shiftStart.toISOString();
  const periodEnd = new Date(
    shiftStart.getTime() + SHIFT_HOURS * 3_600_000,
  ).toISOString();
  const vessels = buildVessels(baseMs, tick);
  const completed = vessels.reduce((sum, vessel) => sum + vessel.completedTeu, 0);
  return {
    periodStart,
    periodEnd,
    teuHandled: 9906 + completed,
    planTeu: 42000,
    availableEquipment: 31,
    totalEquipment: 34,
    cranesInWork: 5,
    trucksActive: 4,
    railWagonsActive: 11,
    workersOnShift: 46,
  };
}

export function buildDemoSnapshot(baseTimeMs: number, tick: number): Snapshot {
  const safeTick = Math.max(0, Math.floor(tick));
  const vessels = buildVessels(baseTimeMs, safeTick);
  return {
    mode: "demo",
    sequence: safeTick,
    serverTime: iso(baseTimeMs, safeTick),
    kpis: buildKpis(baseTimeMs, safeTick),
    vessels,
    cranes: buildCranes(baseTimeMs, safeTick),
    trucks: buildTrucks(baseTimeMs, safeTick),
    tugs: buildTugs(baseTimeMs, safeTick),
    train: buildTrain(baseTimeMs, safeTick),
    yards: buildYards(baseTimeMs, safeTick),
    warehouses: [],
    warnings: buildWarnings(baseTimeMs, safeTick),
    history: buildHistory(baseTimeMs, safeTick),
  };
}

export function buildHistory(baseTimeMs: number, tick: number) {
  const from = Math.max(0, tick - HISTORY_SPAN_TICKS);
  const points = [] as Snapshot["history"];
  for (let t = from; t <= tick; t += HISTORY_STEP_TICKS) {
    points.push({ at: iso(baseTimeMs, t), sequence: t });
  }
  if (points[points.length - 1]?.sequence !== tick) {
    points.push({ at: iso(baseTimeMs, tick), sequence: tick });
  }
  return points;
}

export function demoDelta(previous: Snapshot, next: Snapshot): StateDelta {
  const delta: StateDelta = {
    sequence: next.sequence,
    serverTime: next.serverTime,
  };
  if (JSON.stringify(previous.vessels) !== JSON.stringify(next.vessels)) {
    delta.vessels = next.vessels;
  }
  if (JSON.stringify(previous.cranes) !== JSON.stringify(next.cranes)) {
    delta.cranes = next.cranes;
  }
  if (JSON.stringify(previous.trucks) !== JSON.stringify(next.trucks)) {
    delta.trucks = next.trucks;
  }
  if (JSON.stringify(previous.tugs) !== JSON.stringify(next.tugs)) {
    delta.tugs = next.tugs;
  }
  if (JSON.stringify(previous.train) !== JSON.stringify(next.train)) {
    delta.train = next.train;
  }
  if (JSON.stringify(previous.yards) !== JSON.stringify(next.yards)) {
    delta.yards = next.yards;
  }
  if (JSON.stringify(previous.warnings) !== JSON.stringify(next.warnings)) {
    delta.warnings = next.warnings;
  }
  delta.kpis = next.kpis;
  return delta;
}
