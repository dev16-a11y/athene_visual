import type { Vessel } from "../domain/types";
import { computeProgress, deviationLabel, formatPercent } from "../metrics/progress";
import { store } from "../state/store";
import {
  deviationTone,
  formatNumber,
  operationLabel,
} from "../utils/format";

interface VesselTableProps {
  vessels: Vessel[];
  selectedId: string | null;
  searchQuery: string;
}

export function VesselTable({
  vessels,
  selectedId,
  searchQuery,
}: VesselTableProps) {
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? vessels.filter(
        (vessel) =>
          vessel.name.toLowerCase().includes(query) ||
          vessel.berth.includes(query) ||
          operationLabel(vessel.operation).toLowerCase().includes(query),
      )
    : vessels;

  return (
    <div className="vessel-table" aria-label="Список судов">
      <div className="vessel-table-head" role="row">
        <span>Судно и груз</span>
        <span>Операция</span>
        <span>Выполнено</span>
        <span>Причал</span>
        <span>Отклонение</span>
      </div>
      {filtered.length === 0 && (
        <div className="table-empty">Нет судов по заданному фильтру</div>
      )}
      {filtered.map((vessel) => {
        const progress = computeProgress(
          vessel.completedTeu,
          vessel.plannedTeu,
        );
        const tone = deviationTone(vessel.deviationMinutes);
        return (
          <button
            key={vessel.id}
            type="button"
            className={
              vessel.id === selectedId ? "vessel-row selected" : "vessel-row"
            }
            onClick={() => {
              store.select(vessel.id);
              store.focusEntity(vessel.id);
            }}
            aria-pressed={vessel.id === selectedId}
          >
            <span className="vessel-main">
              <span className="vessel-name">{vessel.name}</span>
              <span className="vessel-cargo">
                Контейнеры · {vessel.operation === "loading" ? "на борт" : "на берег"}
              </span>
            </span>
            <span className={`operation operation-${vessel.operation}`}>
              {operationLabel(vessel.operation)}
            </span>
            <span className="progress-cell">
              <span className="progress-top">
                <span>{formatPercent(progress)}</span>
                <span className="progress-volume">
                  {formatNumber(vessel.completedTeu)} /{" "}
                  {formatNumber(vessel.plannedTeu)} TEU
                </span>
              </span>
              <span className="progress-track">
                <span
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </span>
            </span>
            <span className="berth-pill">{vessel.berth}</span>
            <span className={`deviation deviation-${tone}`}>
              {deviationLabel(vessel.deviationMinutes)}
            </span>
          </button>
        );
      })}
      <div className="table-note">
        Процент вычислен из выполненных и плановых объёмов. Отклонение — от
        планового графика операции.
      </div>
    </div>
  );
}
