import { describe, expect, it } from "vitest";
import type { Snapshot, StateDelta } from "../domain/types";
import { acceptSnapshot, applyDelta } from "./stateMerge";

function snapshot(sequence = 5): Snapshot {
  return {
    mode: "demo",
    sequence,
    serverTime: "2026-11-02T12:00:00.000Z",
    kpis: {
      periodStart: "2026-11-02T08:00:00.000Z",
      periodEnd: "2026-11-02T20:00:00.000Z",
      teuHandled: 12840,
      planTeu: 42000,
      availableEquipment: 31,
      totalEquipment: 34,
      cranesInWork: 5,
      trucksActive: 4,
      railWagonsActive: 11,
      workersOnShift: 46,
    },
    vessels: [
      {
        id: "vessel-orion",
        kind: "vessel",
        name: "ORION",
        position: { x: -102, z: -18 },
        heading: 0,
        status: "working",
        updatedAt: "2026-11-02T12:00:00.000Z",
        cargo: "containers",
        operation: "loading",
        berth: "02",
        plannedTeu: 2400,
        completedTeu: 1632,
        startedAt: "2026-11-02T06:00:00.000Z",
        plannedFinish: "2026-11-02T18:00:00.000Z",
        deviationMinutes: 35,
        loa: 190,
        beam: 32,
      },
    ],
    cranes: [],
    trucks: [],
    tugs: [],
    train: {
      id: "train-01",
      kind: "train",
      name: "Состав 2047",
      position: { x: 12, z: 82 },
      heading: 90,
      status: "working",
      updatedAt: "2026-11-02T12:00:00.000Z",
      wagons: 18,
      loadedWagons: 11,
    },
    yards: [],
    warehouses: [],
    warnings: [],
    history: [],
  };
}

function delta(sequence: number, completedTeu: number): StateDelta {
  return {
    sequence,
    serverTime: "2026-11-02T12:00:02.000Z",
    vessels: [
      {
        ...snapshot().vessels[0]!,
        completedTeu,
        updatedAt: "2026-11-02T12:00:02.000Z",
      },
    ],
  };
}

describe("applyDelta", () => {
  it("merges a newer update by stable identifier", () => {
    const next = applyDelta(snapshot(5), delta(6, 1640));
    expect(next.sequence).toBe(6);
    expect(next.vessels[0]?.completedTeu).toBe(1640);
    expect(next.kpis.teuHandled).toBe(12840);
  });

  it("ignores a duplicate delta", () => {
    const current = snapshot(5);
    expect(applyDelta(current, delta(5, 9999))).toBe(current);
  });

  it("ignores a late delta so the terminal does not roll back", () => {
    const current = applyDelta(snapshot(5), delta(8, 1660));
    const late = applyDelta(current, delta(6, 1200));
    expect(late).toBe(current);
    expect(late.vessels[0]?.completedTeu).toBe(1660);
  });

  it("keeps the last known snapshot when a delta is dropped", () => {
    const current = snapshot(10);
    const merged = applyDelta(current, delta(9, 1));
    expect(merged.vessels[0]?.completedTeu).toBe(1632);
    expect(merged.sequence).toBe(10);
  });
});

describe("acceptSnapshot", () => {
  it("rejects a snapshot older than the current one", () => {
    const current = snapshot(10);
    expect(acceptSnapshot(current, snapshot(4))).toBe(current);
  });

  it("accepts an equal or newer snapshot after a reconnect", () => {
    const current = snapshot(10);
    const newer = snapshot(11);
    expect(acceptSnapshot(current, newer)).toBe(newer);
    expect(acceptSnapshot(current, snapshot(10))).not.toBe(current);
  });

  it("accepts a reset sequence when the server measurement time is newer", () => {
    const current = snapshot(100);
    const restarted = snapshot(60);
    restarted.serverTime = "2026-11-02T12:10:00.000Z";
    expect(acceptSnapshot(current, restarted)).toBe(restarted);
  });

  it("rejects a late snapshot from the same epoch", () => {
    const current = snapshot(100);
    const late = snapshot(40);
    late.serverTime = "2026-11-02T11:59:00.000Z";
    expect(acceptSnapshot(current, late)).toBe(current);
  });
});
