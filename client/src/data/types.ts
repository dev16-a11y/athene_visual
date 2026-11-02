import type {
  ConnectionState,
  HistoryInfo,
  Snapshot,
  StateDelta,
} from "../domain/types";

export type DataSourceHandlers = {
  onSnapshot: (snapshot: Snapshot) => void;
  onDelta: (delta: StateDelta) => void;
  onConnection: (state: ConnectionState) => void;
};

export interface PortDataSource {
  readonly mode: "server" | "demo";
  start(): Promise<void>;
  stop(): void;
  setPaused(paused: boolean): void;
  fetchHistory(): Promise<HistoryInfo>;
  fetchAt(at: string): Promise<Snapshot>;
}
