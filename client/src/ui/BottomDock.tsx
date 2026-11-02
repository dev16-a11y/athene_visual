import type { Snapshot } from "../domain/types";
import { computePercent, formatPercent } from "../metrics/progress";
import {
  formatNumber,
  formatShortTime,
} from "../utils/format";

interface BottomDockProps {
  snapshot: Snapshot;
  historyMode: boolean;
  dataSourceMode: "server" | "demo" | null;
}

interface MetricProps {
  label: string;
  value: string;
  unit: string;
  detail: string;
  hint: string;
  tone?: "ok" | "warn" | "danger";
}

function Metric({ label, value, unit, detail, hint, tone }: MetricProps) {
  return (
    <div className="metric" tabIndex={0} data-tip={hint} aria-label={hint}>
      <span className="metric-label">{label}</span>
      <span className={`metric-value${tone ? ` tone-${tone}` : ""}`}>
        {value}
        <span className="metric-unit">{unit}</span>
      </span>
      <span className="metric-detail">{detail}</span>
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
        <div className="dock-metrics">
          <Metric
            label="Обработано"
            value={formatNumber(kpis.teuHandled)}
            unit="TEU"
            detail={periodLabel}
            hint={`Суммарный объём грузовых операций за выбранный период (${period}). Показатель относится к периоду, а не к моменту времени.`}
          />
          <Metric
            label="Выполнение плана"
            value={formatPercent(planPercent, 1)}
            unit=""
            detail={`план ${formatNumber(kpis.planTeu)} TEU`}
            hint="Отношение обработанного объёма к плановому объёму за период. Рассчитывается как TEU факт / TEU план."
            tone={planPercent >= 80 ? "ok" : "warn"}
          />
          <Metric
            label="Доступность оборудования"
            value={formatPercent(availability, 1)}
            unit=""
            detail={`${kpis.availableEquipment} из ${kpis.totalEquipment} ед.`}
            hint="Доля доступного оборудования от общего парка на выбранный момент. Краны на обслуживании учитываются как недоступные."
            tone={availability >= 90 ? "ok" : "warn"}
          />
          <Metric
            label="Задействованные ресурсы"
            value={`${kpis.cranesInWork} · ${kpis.trucksActive} · ${kpis.railWagonsActive}`}
            unit=""
            detail="краны · авто · вагоны"
            hint="Активные ресурсы на выбранный момент: причальные краны, автотранспорт, железнодорожные вагоны. Не относится к периоду."
          />
        </div>
      </div>

      <div className="dock-side glass dock-side-right">
        <div className="dock-side-title">Период и источник</div>
        <div className="dock-side-value">
          {dataSourceMode === "server" ? "SignalR · сервер" : "Локальный поток"}
        </div>
        <div className="dock-side-note">
          TEU — 20-футовый эквивалент · демо {snapshot.sequence}
        </div>
      </div>
    </footer>
  );
}
