import type { ReactNode } from "react";
import type { Snapshot, Train, Truck } from "../domain/types";
import { store, type GroupKey } from "../state/store";
import { statusLabel, statusTone } from "../utils/format";
import { ChevronIcon, ShipIcon, TrainIcon, TruckIcon } from "./icons";
import { VesselTable } from "./VesselTable";

interface LeftRailProps {
  snapshot: Snapshot;
  selectedId: string | null;
  expandedGroup: GroupKey | null;
  searchQuery: string;
}

interface Count {
  label: string;
  count: number;
  tone: "ok" | "warn" | "danger" | "muted";
}

function groupButton(
  key: GroupKey,
  icon: ReactNode,
  title: string,
  total: number,
  counts: Count[],
  expanded: boolean,
) {
  return (
    <button
      key={key}
      type="button"
      className={expanded ? "group-head expanded" : "group-head"}
      onClick={() => store.set({ expandedGroup: expanded ? null : key })}
      aria-expanded={expanded}
    >
      <span className="group-icon">{icon}</span>
      <span className="group-title">
        <span>{title}</span>
        <span className="group-counts">
          {counts.map((count) => (
            <span
              key={count.label}
              className={`count-chip tone-${count.tone}`}
              data-tip={`${count.label}: ${count.count}`}
              tabIndex={0}
              aria-label={`${count.label}: ${count.count}`}
            >
              <span className="dot" />
              {count.count}
            </span>
          ))}
        </span>
      </span>
      <span className="group-total">{total}</span>
      <ChevronIcon size={14} />
    </button>
  );
}

function TrainRow({ train }: { train: Train }) {
  return (
    <button
      type="button"
      className="object-row"
      onClick={() => {
        store.select(train.id);
        store.focusEntity(train.id);
      }}
    >
      <span className="object-main">
        <span className="object-name">{train.name}</span>
        <span className="object-sub">
          Вагоны {train.loadedWagons} / {train.wagons} загружено
        </span>
      </span>
      <span className={`status-chip tone-${statusTone(train.status)}`}>
        {statusLabel(train.status)}
      </span>
    </button>
  );
}

function TruckRow({ truck }: { truck: Truck }) {
  return (
    <button
      type="button"
      className="object-row"
      onClick={() => {
        store.select(truck.id);
        store.focusEntity(truck.id);
      }}
    >
      <span className="object-main">
        <span className="object-name">{truck.name}</span>
        <span className="object-sub">
          {truck.route === "quay" ? "Причал" : "Площадка"} ·{" "}
          {truck.loaded ? "с контейнером" : "порожний"}
        </span>
      </span>
      <span className={`status-chip tone-${statusTone(truck.status)}`}>
        {statusLabel(truck.status)}
      </span>
    </button>
  );
}

export function LeftRail({
  snapshot,
  selectedId,
  expandedGroup,
  searchQuery,
}: LeftRailProps) {
  const vesselsWorking = snapshot.vessels.filter(
    (vessel) => vessel.status === "working",
  ).length;
  const vesselsDelayed = snapshot.vessels.filter(
    (vessel) => vessel.deviationMinutes > 30,
  ).length;

  const trucksMoving = snapshot.trucks.filter(
    (truck) => truck.status === "moving" || truck.status === "working",
  ).length;
  const trucksIdle = snapshot.trucks.length - trucksMoving;

  return (
    <aside className="rail rail-left" aria-label="Объекты терминала">
      <section className="panel groups-panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-kicker">Объекты</div>
            <h2 className="panel-title">Суда, вагоны, транспорт</h2>
          </div>
        </div>

        <div className="group-list">
          {groupButton(
            "vessels",
            <ShipIcon size={17} />,
            "Суда",
            snapshot.vessels.length,
            [
              { label: "В работе", count: vesselsWorking, tone: "ok" },
              {
                label: "С отклонением более 30 минут",
                count: vesselsDelayed,
                tone: "warn",
              },
            ],
            expandedGroup === "vessels",
          )}
          {expandedGroup === "vessels" && (
            <VesselTable
              vessels={snapshot.vessels}
              selectedId={selectedId}
              searchQuery={searchQuery}
            />
          )}

          {groupButton(
            "wagons",
            <TrainIcon size={17} />,
            "Вагоны",
            snapshot.train.wagons,
            [
              {
                label: "Загружено",
                count: snapshot.train.loadedWagons,
                tone: "ok",
              },
              {
                label: "Свободно",
                count: snapshot.train.wagons - snapshot.train.loadedWagons,
                tone: "muted",
              },
            ],
            expandedGroup === "wagons",
          )}
          {expandedGroup === "wagons" && (
            <div className="sub-list">
              <TrainRow train={snapshot.train} />
              <p className="table-note">
                Состав подан к складу 2. Погрузка вагонов синхронизирована с
                операциями на причалах.
              </p>
            </div>
          )}

          {groupButton(
            "vehicles",
            <TruckIcon size={17} />,
            "Автотранспорт",
            snapshot.trucks.length,
            [
              { label: "В движении и работе", count: trucksMoving, tone: "ok" },
              { label: "Ожидание и обслуживание", count: trucksIdle, tone: "muted" },
            ],
            expandedGroup === "vehicles",
          )}
          {expandedGroup === "vehicles" && (
            <div className="sub-list">
              {snapshot.trucks.map((truck) => (
                <TruckRow key={truck.id} truck={truck} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel legend-panel">
        <div className="legend-row">
          <span className="legend-dot tone-ok" /> В работе
          <span className="legend-dot tone-warn" /> Предупреждение
          <span className="legend-dot tone-danger" /> Критично
          <span className="legend-dot tone-muted" /> Ожидание
        </div>
        <p className="legend-note">
          Статусы поясняются при наведении и фокусе с клавиатуры. Координаты —
          локальная метрическая система, не геодезическая привязка.
        </p>
      </section>
    </aside>
  );
}
