import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import type { HistoryInfo, Snapshot, StateDelta } from "../domain/types";
import { getHistory, getSnapshot, getSnapshotAt, HUB_URL } from "./api";
import type { PortDataSource } from "./types";
import type { DataSourceHandlers } from "./types";

const START_TIMEOUT_MS = 4_500;

export class ServerDataSource implements PortDataSource {
  readonly mode = "server" as const;
  private connection: HubConnection | null = null;
  private stopped = false;
  private paused = false;

  constructor(private readonly handlers: DataSourceHandlers) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.handlers.onConnection("connecting");
    const connection = new HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect([0, 1_000, 3_000, 8_000])
      .configureLogging(LogLevel.Warning)
      .build();
    this.connection = connection;

    let snapshotTimer: number | null = null;
    const firstSnapshot = new Promise<void>((resolve, reject) => {
      snapshotTimer = window.setTimeout(
        () => reject(new Error("SignalR snapshot timeout")),
        START_TIMEOUT_MS,
      );
      connection.on("snapshot", (snapshot: Snapshot) => {
        if (snapshotTimer !== null) {
          window.clearTimeout(snapshotTimer);
          snapshotTimer = null;
        }
        this.handlers.onSnapshot(snapshot);
        this.handlers.onConnection("live");
        resolve();
      });
    });
    firstSnapshot.catch(() => undefined);

    connection.on("delta", (delta: StateDelta) => {
      if (this.paused) {
        return;
      }
      this.handlers.onDelta(delta);
      this.handlers.onConnection("live");
    });

    connection.onreconnecting(() => {
      if (!this.stopped) {
        this.handlers.onConnection("reconnecting");
      }
    });

    connection.onreconnected(async () => {
      if (this.stopped) {
        return;
      }
      try {
        const snapshot = await getSnapshot();
        this.handlers.onSnapshot(snapshot);
        this.handlers.onConnection("live");
      } catch {
        this.handlers.onConnection("reconnecting");
      }
    });

    connection.onclose(() => {
      if (!this.stopped) {
        this.handlers.onConnection("offline");
      }
    });

    try {
      await connection.start();
      await firstSnapshot;
    } catch (error) {
      if (snapshotTimer !== null) {
        window.clearTimeout(snapshotTimer);
        snapshotTimer = null;
      }
      await connection.stop().catch(() => undefined);
      this.connection = null;
      throw error;
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.connection) {
      void this.connection.stop().catch(() => undefined);
      this.connection = null;
    }
    this.handlers.onConnection("offline");
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused && this.connection?.state === HubConnectionState.Connected) {
      void getSnapshot()
        .then((snapshot) => {
          this.handlers.onSnapshot(snapshot);
          this.handlers.onConnection("live");
        })
        .catch(() => undefined);
    }
  }

  fetchHistory(): Promise<HistoryInfo> {
    return getHistory();
  }

  fetchAt(at: string): Promise<Snapshot> {
    return getSnapshotAt(at);
  }
}
