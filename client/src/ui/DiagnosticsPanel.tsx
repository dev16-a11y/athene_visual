import type { ConnectionState, DiagnosticsFrame } from "../domain/types";
import { formatNumber } from "../utils/format";

interface DiagnosticsPanelProps {
  frame: DiagnosticsFrame | null;
  connection: ConnectionState;
  viewMode: "live" | "history";
}

export function DiagnosticsPanel({
  frame,
  connection,
  viewMode,
}: DiagnosticsPanelProps) {
  return (
    <div className="diagnostics glass" aria-label="Диагностика">
      <div className="diagnostics-head">
        <span>Диагностика</span>
        <span className="diagnostics-mode">dev</span>
      </div>
      {!frame && <div className="diagnostics-row">Сбор данных…</div>}
      {frame && (
        <>
          <div className="diagnostics-row">
            <span>Кадр</span>
            <strong>{frame.fps} FPS</strong>
          </div>
          <div className="diagnostics-row">
            <span>Draw calls</span>
            <strong>{frame.drawCalls}</strong>
          </div>
          <div className="diagnostics-row">
            <span>Активные меши</span>
            <strong>{formatNumber(frame.activeMeshes)}</strong>
          </div>
          <div className="diagnostics-row">
            <span>Вершины</span>
            <strong>{formatNumber(frame.totalVertices)}</strong>
          </div>
          <div className="diagnostics-row">
            <span>Разрешение</span>
            <strong>{frame.resolution}</strong>
          </div>
          <div className="diagnostics-row">
            <span>Режим</span>
            <strong>{frame.backend}</strong>
          </div>
        </>
      )}
      <div className="diagnostics-row">
        <span>Соединение</span>
        <strong>{viewMode === "history" ? "архив" : connection}</strong>
      </div>
    </div>
  );
}
