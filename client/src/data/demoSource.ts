import { TICK_MS } from "../domain/constants";
import type {
  ConnectionState,
  HistoryInfo,
  Snapshot,
} from "../domain/types";
import {
  buildDemoSnapshot,
  buildHistory,
  DEMO_START_TICK,
  demoDelta,
} from "./demoWorld";
import type { PortDataSource } from "./types";

type Handlers = {
  onSnapshot: (snapshot: Snapshot) => void;
  onDelta: (delta: ReturnType<typeof demoDelta>) => void;
  onConnection: (state: ConnectionState) => void;
};

export class DemoDataSource implements PortDataSource {
  readonly mode = "demo" as const;
  private baseTimeMs = 0;
  private tick = DEMO_START_TICK;
  private timer: number | null = null;
  private paused = false;
  private lastSnapshot: Snapshot | null = null;

  constructor(private readonly handlers: Handlers) {}

  start(): Promise<void> {
    this.baseTimeMs = Date.now() - DEMO_START_TICK * TICK_MS;
    this.tick = DEMO_START_TICK;
    const snapshot = buildDemoSnapshot(this.baseTimeMs, this.tick);
    this.lastSnapshot = snapshot;
    this.handlers.onConnection("demo");
    this.handlers.onSnapshot(snapshot);
    this.timer = window.setInterval(() => this.advance(), TICK_MS);
    return Promise.resolve();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    // «offline» не шлём: stop() вызывают только при размонтировании
    // (UI уже уходит) или при устаревшем поколении connect() — его статус
    // не должен трогать новое подключение.
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) {
      const current = this.snapshotAt(Date.now());
      this.lastSnapshot = current;
      this.handlers.onSnapshot(current);
      this.handlers.onConnection("demo");
    }
  }

  async fetchHistory(): Promise<HistoryInfo> {
    const points = buildHistory(this.baseTimeMs, this.tick);
    return {
      from: points[0]?.at ?? new Date(this.baseTimeMs).toISOString(),
      to: points[points.length - 1]?.at ?? new Date().toISOString(),
      points,
    };
  }

  async fetchAt(at: string): Promise<Snapshot> {
    const tick = Math.max(
      0,
      Math.round((Date.parse(at) - this.baseTimeMs) / TICK_MS),
    );
    return buildDemoSnapshot(this.baseTimeMs, tick);
  }

  private snapshotAt(nowMs: number): Snapshot {
    this.tick = Math.max(
      0,
      Math.floor((nowMs - this.baseTimeMs) / TICK_MS),
    );
    return buildDemoSnapshot(this.baseTimeMs, this.tick);
  }

  private advance(): void {
    // Пауза проверяем до сборки снимка: полный snapshot строить и мутировать
    // tick каждые 2 с вхолостую незачем.
    if (this.paused) {
      return;
    }
    const next = this.snapshotAt(Date.now());
    const delta = demoDelta(this.lastSnapshot ?? next, next);
    this.lastSnapshot = next;
    this.handlers.onDelta(delta);
  }
}
