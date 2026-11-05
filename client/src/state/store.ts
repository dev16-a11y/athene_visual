import { useSyncExternalStore } from "react";
import { QUALITY_SCALE } from "../domain/constants";
import type {
  ConnectionState,
  DiagnosticsFrame,
  HistoryInfo,
  LayerKey,
  QualityLevel,
  Snapshot,
  StateDelta,
  Vessel,
} from "../domain/types";
import { acceptSnapshot, applyDelta } from "../data/stateMerge";

export type GroupKey = "vessels" | "wagons" | "vehicles";

export interface AppState {
  liveSnapshot: Snapshot | null;
  historySnapshot: Snapshot | null;
  viewMode: "live" | "history";
  historyInfo: HistoryInfo | null;
  historyAt: string | null;
  historyLoading: boolean;
  connection: ConnectionState;
  dataSourceMode: "server" | "demo" | null;
  clockOffsetMs: number;
  selectedId: string | null;
  selectedWarningId: string | null;
  expandedGroup: GroupKey | null;
  quality: QualityLevel;
  layers: Record<LayerKey, boolean>;
  diagnostics: DiagnosticsFrame | null;
  showDiagnostics: boolean;
  layersOpen: boolean;
  searchQuery: string;
  focus: { entityId: string; nonce: number } | null;
  cameraHomeNonce: number;
  shift: string;
}

const allLayersOn: Record<LayerKey, boolean> = {
  vessels: true,
  cranes: true,
  containers: true,
  rail: true,
  trucks: true,
  water: true,
  warehouses: true,
};

function initialState(): AppState {
  return {
    liveSnapshot: null,
    historySnapshot: null,
    viewMode: "live",
    historyInfo: null,
    historyAt: null,
    historyLoading: false,
    connection: "connecting",
    dataSourceMode: null,
    clockOffsetMs: 0,
    selectedId: null,
    selectedWarningId: null,
    expandedGroup: "vessels",
    quality: "medium",
    layers: { ...allLayersOn },
    diagnostics: null,
    showDiagnostics: import.meta.env.DEV,
    layersOpen: false,
    searchQuery: "",
    focus: null,
    cameraHomeNonce: 0,
    shift: "Смена 2 · 08:00–20:00",
  };
}

class AppStore {
  private state: AppState = initialState();
  private listeners = new Set<() => void>();
  /** Сколько разностей уже пришло: первая выставляет часы точно. */
  private clockSamples = 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): AppState => this.state;

  getState(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)): void {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) {
      listener();
    }
  }

  applySnapshot(snapshot: Snapshot): void {
    this.set({ liveSnapshot: acceptSnapshot(this.state.liveSnapshot, snapshot) });
    // Часы и по снимкам ведём через syncClock: прямое присваивание на
    // каждом reconnect/resume скачком сдвигало шкалу времени движения.
    this.syncClock(snapshot.serverTime);
  }

  /**
   * Смещение часов сервера обновляем и по разностям, и по снимкам: иначе
   * оно остаётся снимком момента подключения и уезжает от реального.
   * Сглаживаем, чтобы дрожание доставки не превращалось в дрожание шкалы.
   */
  private syncClock(serverTime: string | undefined): void {
    if (!serverTime) {
      return;
    }
    const measured = Date.parse(serverTime) - Date.now();
    if (!Number.isFinite(measured)) {
      return;
    }
    const current = this.state.clockOffsetMs;
    this.clockSamples += 1;
    const next =
      this.clockSamples <= 2 || Math.abs(measured - current) > 5_000
        ? measured
        : current + (measured - current) * 0.2;
    this.set({ clockOffsetMs: next });
  }

  applyDelta(delta: StateDelta): void {
    const merged = applyDelta(this.state.liveSnapshot, delta);
    this.set({ liveSnapshot: merged });
    this.syncClock(delta.serverTime);
  }

  setConnection(connection: ConnectionState): void {
    this.set({ connection });
  }

  select(entityId: string | null): void {
    if (!entityId) {
      this.set({ selectedId: null, selectedWarningId: null });
      return;
    }
    const snapshot = this.displaySnapshot();
    const entity = snapshot?.vessels.find((item) => item.id === entityId);
    this.set({
      selectedId: entityId,
      selectedWarningId: null,
      expandedGroup: entity ? "vessels" : this.state.expandedGroup,
    });
  }

  selectWarning(warningId: string, entityId: string): void {
    this.set({ selectedWarningId: warningId, selectedId: entityId });
  }

  focusEntity(entityId: string): void {
    this.set({
      focus: { entityId, nonce: (this.state.focus?.nonce ?? 0) + 1 },
    });
  }

  resetCamera(): void {
    this.set({ cameraHomeNonce: this.state.cameraHomeNonce + 1 });
  }

  toggleLayer(layer: LayerKey): void {
    this.set({
      layers: { ...this.state.layers, [layer]: !this.state.layers[layer] },
    });
  }

  setQuality(quality: QualityLevel): void {
    this.set({ quality });
  }

  setShift(shift: string): void {
    this.set({ shift });
  }

  displaySnapshot(): Snapshot | null {
    return this.state.viewMode === "history" && this.state.historySnapshot
      ? this.state.historySnapshot
      : this.state.liveSnapshot;
  }

  selectedVessel(): Vessel | null {
    if (!this.state.selectedId) {
      return null;
    }
    return (
      this.displaySnapshot()?.vessels.find(
        (vessel) => vessel.id === this.state.selectedId,
      ) ?? null
    );
  }

  qualityScale() {
    return QUALITY_SCALE[this.state.quality];
  }
}

export const store = new AppStore();

export function useAppState(): AppState {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
