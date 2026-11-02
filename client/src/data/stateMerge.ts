import type { Snapshot, StateDelta } from "../domain/types";

/**
 * Merges an incremental update into the last known snapshot.
 * Out-of-order and duplicate deltas are ignored so a late packet can never
 * roll the terminal back. A stale snapshot (e.g. after reconnect) is replaced
 * only by a snapshot with a newer sequence.
 */
export function applyDelta(
  snapshot: Snapshot | null,
  delta: StateDelta,
): Snapshot {
  if (!snapshot || delta.sequence <= snapshot.sequence) {
    return snapshot ?? emptySnapshot(delta);
  }

  return {
    ...snapshot,
    sequence: delta.sequence,
    serverTime: delta.serverTime,
    vessels: mergeById(snapshot.vessels, delta.vessels),
    cranes: mergeById(snapshot.cranes, delta.cranes),
    trucks: mergeById(snapshot.trucks, delta.trucks),
    tugs: mergeById(snapshot.tugs, delta.tugs),
    train: delta.train ?? snapshot.train,
    yards: mergeById(snapshot.yards, delta.yards),
    warnings: delta.warnings ?? snapshot.warnings,
    kpis: delta.kpis ?? snapshot.kpis,
  };
}

export function acceptSnapshot(
  current: Snapshot | null,
  incoming: Snapshot,
): Snapshot {
  if (current && incoming.sequence < current.sequence) {
    const currentTime = Date.parse(current.serverTime);
    const incomingTime = Date.parse(incoming.serverTime);
    // A restarted server starts a new sequence epoch. Accept its snapshot when
    // the measurement time is newer even though the counter moved backwards.
    if (Number.isFinite(incomingTime) && incomingTime > currentTime) {
      return incoming;
    }
    return current;
  }
  return incoming;
}

function mergeById<T extends { id: string }>(
  existing: T[],
  patch: T[] | undefined,
): T[] {
  if (!patch || patch.length === 0) {
    return existing;
  }
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of patch) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

function emptySnapshot(delta: StateDelta): Snapshot {
  return {
    mode: "demo",
    sequence: delta.sequence,
    serverTime: delta.serverTime,
    kpis: delta.kpis ?? {
      periodStart: delta.serverTime,
      periodEnd: delta.serverTime,
      teuHandled: 0,
      planTeu: 0,
      availableEquipment: 0,
      totalEquipment: 0,
      cranesInWork: 0,
      trucksActive: 0,
      railWagonsActive: 0,
      workersOnShift: 0,
    },
    vessels: delta.vessels ?? [],
    cranes: delta.cranes ?? [],
    trucks: delta.trucks ?? [],
    tugs: delta.tugs ?? [],
    train:
      delta.train ??
      ({
        id: "train-01",
        kind: "train",
        name: "Состав",
        position: { x: 0, z: 78 },
        heading: 90,
        status: "idle",
        updatedAt: delta.serverTime,
        wagons: 0,
        loadedWagons: 0,
      } as Snapshot["train"]),
    yards: delta.yards ?? [],
    warehouses: [],
    warnings: delta.warnings ?? [],
    history: [],
  };
}
