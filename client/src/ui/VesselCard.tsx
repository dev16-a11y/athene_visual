import { computeProgress, deviationLabel, formatPercent } from "../metrics/progress";
import { store } from "../state/store";
import type { Vessel } from "../domain/types";
import {
  deviationTone,
  formatDateTime,
  formatNumber,
  operationLabel,
  statusLabel,
} from "../utils/format";
import { CloseIcon, TargetIcon } from "./icons";

interface VesselCardProps {
  vessel: Vessel;
  nowMs: number;
}

export function VesselCard({ vessel, nowMs }: VesselCardProps) {
  const progress = computeProgress(vessel.completedTeu, vessel.plannedTeu);
  const tone = deviationTone(vessel.deviationMinutes);
  const remaining = Math.max(0, vessel.plannedTeu - vessel.completedTeu);
  const finishDelta = Date.parse(vessel.plannedFinish) - nowMs;

  return (
    <section className="panel vessel-card" aria-label={`Карточка судна ${vessel.name}`}>
      <div className="panel-head">
        <div>
          <div className="panel-kicker">Карточка судна</div>
          <h2 className="vessel-card-title">{vessel.name}</h2>
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

      <div className="vessel-card-meta">
        <span className={`status-chip tone-${vessel.status === "working" ? "ok" : "muted"}`}>
          {statusLabel(vessel.status)}
        </span>
        <span>{operationLabel(vessel.operation)}</span>
        <span>Причал {vessel.berth}</span>
        <span>Контейнеры</span>
      </div>

      <div className="vessel-progress-head">
        <span>Выполнение операции</span>
        <strong>{formatPercent(progress)}</strong>
      </div>
      <div className="progress-track large">
        <span className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="vessel-progress-foot">
        <span>
          {formatNumber(vessel.completedTeu)} из{" "}
          {formatNumber(vessel.plannedTeu)} TEU
        </span>
        <span>осталось {formatNumber(remaining)} TEU</span>
      </div>

      <dl className="fact-grid">
        <div>
          <dt>Объём задания</dt>
          <dd>{formatNumber(vessel.plannedTeu)} TEU</dd>
        </div>
        <div>
          <dt>Выполненный объём</dt>
          <dd>{formatNumber(vessel.completedTeu)} TEU</dd>
        </div>
        <div>
          <dt>Начало операции</dt>
          <dd>{formatDateTime(vessel.startedAt)}</dd>
        </div>
        <div>
          <dt>Плановое завершение</dt>
          <dd>{formatDateTime(vessel.plannedFinish)}</dd>
        </div>
        <div>
          <dt>Отклонение от графика</dt>
          <dd className={`deviation-text deviation-${tone}`}>
            {deviationLabel(vessel.deviationMinutes)}
          </dd>
        </div>
        <div>
          <dt>До завершения</dt>
          <dd>
            {finishDelta > 0
              ? `${Math.floor(finishDelta / 3_600_000)} ч ${Math.floor(
                  (finishDelta % 3_600_000) / 60_000,
                )} мин`
              : "просрочено"}
          </dd>
        </div>
      </dl>

      <div className="card-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => store.focusEntity(vessel.id)}
        >
          <TargetIcon size={14} />
          Приблизить камеру
        </button>
        <span className="card-hint">
          {vessel.loa} × {vessel.beam} м · местная система координат
        </span>
      </div>
    </section>
  );
}
