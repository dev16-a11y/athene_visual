import type { ReactNode } from "react";
import type { Snapshot } from "../domain/types";
import { computePercent, formatPercent } from "../metrics/progress";
import { formatNumber, formatShortTime } from "../utils/format";
import {
  ContainerIcon,
  CraneIcon,
  GaugeIcon,
  ShipIcon,
  TargetIcon,
  TrainIcon,
  TruckIcon,
} from "./icons";

interface BottomDockProps {
  snapshot: Snapshot;
  historyMode: boolean;
  dataSourceMode: "server" | "demo" | null;
}

function Ring({
  percent,
  label,
  detail,
  hint,
  accent,
}: {
  percent: number;
  label: string;
  detail: string;
  hint: string;
  accent: "cyan" | "green";
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = (circumference * clamped) / 100;
  return (
    <div
      className="dock-ring"
      tabIndex={0}
      data-tip={hint}
      aria-label={hint}
      role="img"
    >
      <div className="ring-chart" data-accent={accent}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle className="ring-track" cx="32" cy="32" r={radius} />
          <circle
            className="ring-value"
            cx="32"
            cy="32"
            r={radius}
            strokeDasharray={`${filled} ${circumference - filled}`}
          />
        </svg>
        <span className="ring-percent">{Math.round(clamped)}%</span>
      </div>
      <span className="dock-ring-label">{label}</span>
      <span className="dock-ring-detail">{detail}</span>
    </div>
  );
}

function ResourceChip({
  icon,
  value,
  label,
  hint,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div
      className="dock-res"
      tabIndex={0}
      data-tip={hint}
      aria-label={hint}
    >
      <span className="dock-res-icon">{icon}</span>
      <span className="dock-res-value">{value}</span>
      <span className="dock-res-label">{label}</span>
    </div>
  );
}

export function BottomDock({
  snapshot,
  historyMode,
  dataSourceMode,
}: BottomDockProps) {
  const { kpis } = snapshot;
  const planPercent = computePercent(kpis.teuHandled, kpis.planTeu);
  const availability = computePercent(
    kpis.availableEquipment,
    kpis.totalEquipment,
  );
  const period = `${formatShortTime(kpis.periodStart)}–${formatShortTime(
    kpis.periodEnd,
  )}`;
  const periodLabel = historyMode ? "за период среза" : "за текущую смену";

  return (
    <footer className="dock" aria-label="Показатели терминала">
      <div className="dock-side glass dock-side-left">
        <div className="dock-side-title">{historyMode ? "Архив среза" : "Смена"}</div>
        <div className="dock-side-value">{period}</div>
        <div className="dock-side-note">
          {historyMode ? "Историческое состояние" : "Текущее состояние"}
        </div>
      </div>

      <div className="dock-center glass">
        <div className="dock-grid">
          <div
            className="dock-chip"
            tabIndex={0}
            data-tip={`Суммарный объём грузовых операций за выбранный период (${period}). Показатель относится к периоду, а не к моменту времени.`}
            aria-label="Обработанный объём"
          >
            <span className="dock-chip-icon">
              <ContainerIcon size={26} />
            </span>
            <span className="dock-chip-main">
              <span className="dock-chip-value">
                {formatNumber(kpis.teuHandled)}
                <span className="dock-chip-unit">TEU</span>
              </span>
              <span className="dock-chip-sub">
                план {formatNumber(kpis.planTeu)} TEU · {periodLabel}
              </span>
            </span>
          </div>

          <span className="dock-divider" aria-hidden="true" />

          <Ring
            percent={planPercent}
            label="Выполнение плана"
            detail={formatPercent(planPercent, 1)}
            hint={`Отношение обработанного объёма к плановому объёму за период. Рассчитывается как TEU факт / TEU план (${period}).`}
            accent="cyan"
          />
          <Ring
            percent={availability}
            label="Доступность"
            detail={`${kpis.availableEquipment}/${kpis.totalEquipment} ед.`}
            hint="Доля доступного оборудования от общего парка на выбранный момент. Краны на обслуживании учитываются как недоступные."
            accent="green"
          />

          <span className="dock-divider" aria-hidden="true" />

          <ResourceChip
            icon={<ShipIcon size={22} />}
            value={`${snapshot.vessels.length}`}
            label="суда"
            hint="Число судов в акватории терминала на выбранный момент."
          />
          <ResourceChip
            icon={<CraneIcon size={22} />}
            value={`${kpis.cranesInWork}`}
            label="краны"
            hint="Причальные краны в работе на выбранный момент."
          />
          <ResourceChip
            icon={<TruckIcon size={22} />}
            value={`${kpis.trucksActive}`}
            label="авто"
            hint="Активный автотранспорт на выбранный момент."
          />
          <ResourceChip
            icon={<TrainIcon size={22} />}
            value={`${kpis.railWagonsActive}`}
            label="вагоны"
            hint="Задействованные железнодорожные вагоны на выбранный момент."
          />
        </div>
      </div>

      <div className="dock-side glass dock-side-right">
        <div className="dock-side-title">
          <GaugeIcon size={11} /> Период и источник
        </div>
        <div className="dock-side-value">
          {dataSourceMode === "server" ? "SignalR · сервер" : "Локальный поток"}
        </div>
        <div className="dock-side-note">
          <TargetIcon size={11} /> TEU — 20-футовый эквивалент · демо {snapshot.sequence}
        </div>
      </div>
    </footer>
  );
}
