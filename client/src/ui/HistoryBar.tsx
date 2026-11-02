import type { HistoryInfo } from "../domain/types";
import { formatDateTimeSeconds } from "../utils/format";
import { HistoryIcon } from "./icons";

interface HistoryBarProps {
  info: HistoryInfo | null;
  currentAt: string | null;
  loading: boolean;
  onSelect: (at: string) => void;
  onReturnLive: () => void;
}

export function HistoryBar({
  info,
  currentAt,
  loading,
  onSelect,
  onReturnLive,
}: HistoryBarProps) {
  const points = info?.points ?? [];
  const index = Math.max(
    0,
    points.findIndex((point) => point.at === currentAt),
  );
  const max = Math.max(0, points.length - 1);

  return (
    <div className="history-bar glass" role="region" aria-label="Просмотр истории">
      <span className="history-mode">
        <HistoryIcon size={14} />
        История
      </span>
      <span className="history-time">
        {currentAt ? formatDateTimeSeconds(currentAt) : "Загрузка среза…"}
      </span>
      <input
        className="history-slider"
        type="range"
        min={0}
        max={max}
        step={1}
        value={index}
        disabled={loading || points.length < 2}
        onChange={(event) => {
          const point = points[Number(event.target.value)];
          if (point) {
            onSelect(point.at);
          }
        }}
        aria-label="Выбор момента истории"
      />
      <span className="history-range">
        {points[0] ? formatDateTimeSeconds(points[0].at) : "—"} —{" "}
        {points[points.length - 1]
          ? formatDateTimeSeconds(points[points.length - 1]!.at)
          : "—"}
      </span>
      <span className="history-status">
        {loading ? "Загрузка…" : `Срезов: ${points.length}`}
      </span>
      <button type="button" className="primary-button compact" onClick={onReturnLive}>
        Вернуться к текущему
      </button>
    </div>
  );
}
