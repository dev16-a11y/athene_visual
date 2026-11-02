import type {
  Crane,
  PortEntity,
  PortWarning,
  Snapshot,
  Vessel,
  YardBlock,
} from "../domain/types";
import { computePercent, formatPercent } from "../metrics/progress";
import { store } from "../state/store";
import {
  formatNumber,
  formatShortTime,
  statusLabel,
  statusTone,
} from "../utils/format";
import { AlertIcon, CloseIcon, TargetIcon } from "./icons";
import { VesselCard } from "./VesselCard";

interface RightRailProps {
  snapshot: Snapshot;
  selectedId: string | null;
  selectedWarningId: string | null;
  selectedVessel: Vessel | null;
  nowMs: number;
  searchQuery: string;
}

function entityById(snapshot: Snapshot, id: string | null): PortEntity | null {
  if (!id) {
    return null;
  }
  return (
    snapshot.vessels.find((item) => item.id === id) ??
    snapshot.cranes.find((item) => item.id === id) ??
    snapshot.trucks.find((item) => item.id === id) ??
    snapshot.tugs.find((item) => item.id === id) ??
    snapshot.yards.find((item) => item.id === id) ??
    (snapshot.train.id === id ? snapshot.train : null)
  );
}

function kindLabel(entity: PortEntity): string {
  switch (entity.kind) {
    case "crane":
      return "Причальный кран";
    case "truck":
      return "Автотранспорт";
    case "tug":
      return "Буксир";
    case "train":
      return "Железнодорожный состав";
    case "yard":
      return "Контейнерная площадка";
    case "vessel":
      return "Судно";
    case "warehouse":
      return "Склад";
  }
}

function ObjectCard({ entity }: { entity: PortEntity }) {
  return (
    <section className="panel object-card" aria-label={`Карточка объекта ${entity.name}`}>
      <div className="panel-head">
        <div>
          <div className="panel-kicker">{kindLabel(entity)}</div>
          <h2 className="vessel-card-title">{entity.name}</h2>
        </div>
        <button
          type="button"
          className="icon-button small"
          onClick={() => store.select(null)}
          aria-label="Закрыть карточку"
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="object-card-body">
        <span className={`status-chip tone-${statusTone(entity.status)}`}>
          {statusLabel(entity.status)}
        </span>
        <span className="object-coords">
          X {entity.position.x.toFixed(0)} · Z {entity.position.z.toFixed(0)} м
        </span>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => store.focusEntity(entity.id)}
        >
          <TargetIcon size={14} />
          Приблизить камеру
        </button>
        <span className="card-hint">Локальная метрическая система</span>
      </div>
    </section>
  );
}

function CraneRow({ crane }: { crane: Crane }) {
  return (
    <button
      type="button"
      className="equipment-row"
      onClick={() => {
        store.select(crane.id);
        store.focusEntity(crane.id);
      }}
    >
      <span className={`dot tone-${statusTone(crane.status)}`} />
      <span className="equipment-name">{crane.name}</span>
      <span className="equipment-meta">
        {crane.status === "working" ? `${crane.movesPerHour} ход/ч` : statusLabel(crane.status)}
      </span>
      <span className="equipment-berth">{crane.berth}</span>
    </button>
  );
}

function YardRow({ yard }: { yard: YardBlock }) {
  const fill = computePercent(yard.occupiedTeu, yard.capacityTeu);
  const tone = fill >= 88 ? "danger" : fill >= 75 ? "warn" : "ok";
  return (
    <button
      type="button"
      className="yard-row"
      onClick={() => {
        store.select(yard.id);
        store.focusEntity(yard.id);
      }}
      title={`${yard.block}: ${formatNumber(yard.occupiedTeu)} из ${formatNumber(
        yard.capacityTeu,
      )} TEU, очередь ${yard.queuedTrucks} машин`}
    >
      <span className="yard-row-head">
        <span className="yard-name">{yard.block}</span>
        <span className={`yard-percent tone-${tone}`}>{formatPercent(fill)}</span>
      </span>
      <span className="progress-track thin">
        <span
          className={`progress-fill fill-${tone}`}
          style={{ width: `${fill}%` }}
        />
      </span>
      <span className="yard-sub">
        {formatNumber(yard.occupiedTeu)} / {formatNumber(yard.capacityTeu)} TEU
        {yard.queuedTrucks > 0 ? ` · очередь ${yard.queuedTrucks}` : ""}
      </span>
    </button>
  );
}

function WarningCard({
  warning,
  selected,
}: {
  warning: PortWarning;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      className={`warning-card severity-${warning.severity}${selected ? " selected" : ""}`}
      onClick={() => {
        store.selectWarning(warning.id, warning.entityId);
        store.focusEntity(warning.entityId);
      }}
    >
      <span className="warning-icon">
        <AlertIcon size={15} />
      </span>
      <span className="warning-body">
        <span className="warning-top">
          <span className="warning-title">{warning.title}</span>
          <span className="warning-time">{formatShortTime(warning.raisedAt)}</span>
        </span>
        <span className="warning-message">{warning.message}</span>
        <span className="warning-action">Показать объект на сцене</span>
      </span>
    </button>
  );
}

export function RightRail({
  snapshot,
  selectedId,
  selectedWarningId,
  selectedVessel,
  nowMs,
  searchQuery,
}: RightRailProps) {
  const cranesWorking = snapshot.cranes.filter(
    (crane) => crane.status === "working",
  ).length;
  const activeWarnings = snapshot.warnings.filter((warning) => warning.active);
  const query = searchQuery.trim().toLowerCase();
  const filteredWarnings = query
    ? activeWarnings.filter(
        (warning) =>
          warning.title.toLowerCase().includes(query) ||
          warning.message.toLowerCase().includes(query),
      )
    : activeWarnings;

  const selectedEntity = entityById(snapshot, selectedId);

  return (
    <aside className="rail rail-right" aria-label="Состояние терминала">
      {selectedVessel && <VesselCard vessel={selectedVessel} nowMs={nowMs} />}
      {!selectedVessel && selectedEntity && <ObjectCard entity={selectedEntity} />}

      <section className="panel" aria-label="Состояние оборудования">
        <div className="panel-head compact">
          <div>
            <div className="panel-kicker">Оборудование</div>
            <h2 className="panel-title">Причальные краны</h2>
          </div>
          <span className="panel-badge">
            {cranesWorking} / {snapshot.cranes.length} в работе
          </span>
        </div>
        <div className="equipment-list">
          {snapshot.cranes.map((crane) => (
            <CraneRow key={crane.id} crane={crane} />
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Заполнение площадок">
        <div className="panel-head compact">
          <div>
            <div className="panel-kicker">Контейнерные площадки</div>
            <h2 className="panel-title">Заполнение</h2>
          </div>
          <span className="panel-badge">TEU · сейчас</span>
        </div>
        <div className="yard-list">
          {snapshot.yards.map((yard) => (
            <YardRow key={yard.id} yard={yard} />
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Инциденты">
        <div className="panel-head compact">
          <div>
            <div className="panel-kicker">События</div>
            <h2 className="panel-title">Предупреждения и инциденты</h2>
          </div>
          <span className={activeWarnings.length > 0 ? "panel-badge alert" : "panel-badge"}>
            {activeWarnings.length}
          </span>
        </div>
        <div className="warning-list">
          {filteredWarnings.length === 0 && (
            <div className="empty-state">
              <AlertIcon size={16} />
              <span>
                {query
                  ? "Нет инцидентов по заданному фильтру"
                  : "Активных инцидентов нет"}
              </span>
            </div>
          )}
          {filteredWarnings.map((warning) => (
            <WarningCard
              key={warning.id}
              warning={warning}
              selected={warning.id === selectedWarningId}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}
