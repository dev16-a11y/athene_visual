export type EntityKind =
  | "vessel"
  | "crane"
  | "truck"
  | "tug"
  | "train"
  | "yard"
  | "warehouse";

export type EntityStatus =
  | "working"
  | "moving"
  | "idle"
  | "warning"
  | "critical"
  | "maintenance";

export type VesselOperation = "loading" | "unloading";

export interface Point2 {
  x: number;
  z: number;
}

export interface EntityBase {
  id: string;
  kind: EntityKind;
  name: string;
  position: Point2;
  heading: number;
  status: EntityStatus;
  updatedAt: string;
}

export interface Vessel extends EntityBase {
  kind: "vessel";
  cargo: "containers";
  operation: VesselOperation;
  berth: "02" | "03";
  plannedTeu: number;
  completedTeu: number;
  startedAt: string;
  plannedFinish: string;
  deviationMinutes: number;
  loa: number;
  beam: number;
}

export interface Crane extends EntityBase {
  kind: "crane";
  berth: "02" | "03";
  spreaderLoad: 0 | 1;
  movesPerHour: number;
  status: EntityStatus;
}

export interface Truck extends EntityBase {
  kind: "truck";
  loaded: boolean;
  route: "quay" | "yard";
}

export interface Tug extends EntityBase {
  kind: "tug";
  course: number;
}

export interface Train extends EntityBase {
  kind: "train";
  wagons: number;
  loadedWagons: number;
}

export interface YardBlock extends EntityBase {
  kind: "yard";
  block: string;
  capacityTeu: number;
  occupiedTeu: number;
  queuedTrucks: number;
}

export interface Warehouse extends EntityBase {
  kind: "warehouse";
  code: string;
}

export type PortEntity =
  | Vessel
  | Crane
  | Truck
  | Tug
  | Train
  | YardBlock
  | Warehouse;

export type WarningSeverity = "warning" | "critical";

export interface PortWarning {
  id: string;
  severity: WarningSeverity;
  entityId: string;
  title: string;
  message: string;
  raisedAt: string;
  active: boolean;
}

export interface Kpis {
  periodStart: string;
  periodEnd: string;
  teuHandled: number;
  planTeu: number;
  availableEquipment: number;
  totalEquipment: number;
  cranesInWork: number;
  trucksActive: number;
  railWagonsActive: number;
  workersOnShift: number;
}

export interface HistoryPoint {
  at: string;
  sequence: number;
}

export interface Snapshot {
  mode: "demo";
  sequence: number;
  serverTime: string;
  kpis: Kpis;
  vessels: Vessel[];
  cranes: Crane[];
  trucks: Truck[];
  tugs: Tug[];
  train: Train;
  yards: YardBlock[];
  warehouses: Warehouse[];
  warnings: PortWarning[];
  history: HistoryPoint[];
}

export interface StateDelta {
  sequence: number;
  serverTime: string;
  vessels?: Vessel[];
  cranes?: Crane[];
  trucks?: Truck[];
  tugs?: Tug[];
  train?: Train;
  yards?: YardBlock[];
  warnings?: PortWarning[];
  kpis?: Kpis;
}

export type ConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "demo";

export type QualityLevel = "low" | "medium" | "high";

export type LayerKey =
  | "vessels"
  | "cranes"
  | "containers"
  | "rail"
  | "trucks"
  | "water"
  | "warehouses";

export interface DiagnosticsFrame {
  fps: number;
  drawCalls: number;
  activeMeshes: number;
  totalVertices: number;
  resolution: string;
  backend: string;
}

export interface HistoryInfo {
  from: string;
  to: string;
  points: HistoryPoint[];
}
