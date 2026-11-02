import { useEffect, useRef, useState } from "react";
import {
  LAYER_LABELS,
  QUALITY_LABELS,
  PORT_NAME,
  TERMINAL_NAME,
} from "../domain/constants";
import type { LayerKey, QualityLevel } from "../domain/types";
import { store, useAppState } from "../state/store";
import { formatDate, formatTime } from "../utils/format";
import {
  ChevronIcon,
  CompassIcon,
  GaugeIcon,
  HistoryIcon,
  LayersIcon,
  LogoMark,
  SearchIcon,
} from "./icons";

interface TopBarProps {
  nowMs: number;
  onEnterHistory: () => void;
  onReturnLive: () => void;
  onRetryConnection: () => void;
}

const LAYER_ORDER: LayerKey[] = [
  "vessels",
  "cranes",
  "containers",
  "rail",
  "trucks",
  "warehouses",
  "water",
];

const QUALITY_ORDER: QualityLevel[] = ["low", "medium", "high"];

export function TopBar({
  nowMs,
  onEnterHistory,
  onReturnLive,
  onRetryConnection,
}: TopBarProps) {
  const state = useAppState();
  const [layersOpen, setLayersOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const history = state.viewMode === "history";
  const displayTime =
    history && state.historyAt
      ? state.historyAt
      : new Date(nowMs).toISOString();

  useEffect(() => {
    if (!layersOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLayersOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layersOpen]);

  const connectionLabel = history
    ? "Архив"
    : state.connection === "live"
      ? state.dataSourceMode === "server"
        ? "Онлайн"
        : "Демо-поток"
      : state.connection === "reconnecting"
        ? "Переподключение"
        : state.connection === "connecting"
          ? "Подключение"
          : state.connection === "demo"
            ? "Демо-поток"
            : "Нет связи";

  return (
    <header className="topbar glass">
      <div className="brand">
        <span className="brand-mark">
          <LogoMark size={34} />
        </span>
        <span className="brand-text">
          <span className="brand-name">SMARTTWIN</span>
          <span className="brand-sub">
            {PORT_NAME} · {TERMINAL_NAME}
          </span>
        </span>
      </div>

      <div className="topbar-divider" />

      <div className="area-select">
        <span className="area-label">Область обзора</span>
        <span className="area-value">
          Терминал №1 · причалы 02–03
          <ChevronIcon size={13} />
        </span>
      </div>

      <div className="mode-toggle" role="tablist" aria-label="Режим времени">
        <button
          type="button"
          role="tab"
          aria-selected={!history}
          className={!history ? "active" : ""}
          onClick={() => history && onReturnLive()}
        >
          Сейчас
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={history}
          className={history ? "active" : ""}
          onClick={() => !history && onEnterHistory()}
        >
          История
        </button>
      </div>

      <div className="clock">
        <span className="clock-time">
          {history && <HistoryIcon size={13} />}
          {formatTime(displayTime)}
        </span>
        <span className="clock-date">{formatDate(displayTime)}</span>
      </div>

      <div className="shift-select">
        <select
          aria-label="Смена"
          value={state.shift}
          onChange={(event) => store.setShift(event.target.value)}
        >
          <option>Смена 2 · 08:00–20:00</option>
          <option>Смена 1 · 00:00–08:00</option>
          <option>Смена 3 · 20:00–24:00</option>
        </select>
      </div>

      <label className="search">
        <SearchIcon size={14} />
        <input
          value={state.searchQuery}
          onChange={(event) => store.set({ searchQuery: event.target.value })}
          placeholder="Поиск судна, причала, инцидента"
          aria-label="Поиск"
        />
      </label>

      <div className="topbar-actions">
        <div className="layer-wrap" ref={popoverRef}>
          <button
            type="button"
            className={layersOpen ? "icon-button active" : "icon-button"}
            onClick={() => setLayersOpen((open) => !open)}
            aria-label="Управление слоями"
            aria-expanded={layersOpen}
          >
            <LayersIcon size={16} />
            <span className="icon-button-text">Слои</span>
          </button>
          {layersOpen && (
            <>
              <button
                type="button"
                className="popover-scrim"
                aria-label="Закрыть меню слоёв"
                onClick={() => setLayersOpen(false)}
              />
              <div className="popover layers-popover">
                <div className="popover-title">Слои сцены</div>
                {LAYER_ORDER.map((layer) => (
                  <label key={layer} className="layer-row">
                    <input
                      type="checkbox"
                      checked={state.layers[layer]}
                      onChange={() => store.toggleLayer(layer)}
                    />
                    <span className="checkmark" />
                    <span>{LAYER_LABELS[layer]}</span>
                  </label>
                ))}
                <div className="popover-separator" />
                <div className="popover-title">Качество графики</div>
                <div className="quality-row">
                  {QUALITY_ORDER.map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      className={
                        state.quality === quality
                          ? "quality-button active"
                          : "quality-button"
                      }
                      onClick={() => store.setQuality(quality)}
                    >
                      {QUALITY_LABELS[quality]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <select
          className="quality-select"
          aria-label="Качество графики"
          value={state.quality}
          onChange={(event) =>
            store.setQuality(event.target.value as QualityLevel)
          }
        >
          {QUALITY_ORDER.map((quality) => (
            <option key={quality} value={quality}>
              {QUALITY_LABELS[quality]}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="icon-button"
          onClick={() => store.resetCamera()}
          aria-label="Вернуть исходный ракурс"
          title="Вернуть исходный ракурс камеры"
        >
          <CompassIcon size={16} />
        </button>

        {import.meta.env.DEV && (
          <button
            type="button"
            className={
              state.showDiagnostics ? "icon-button active" : "icon-button"
            }
            onClick={() =>
              store.set({ showDiagnostics: !state.showDiagnostics })
            }
            aria-label="Диагностика"
          >
            <GaugeIcon size={16} />
          </button>
        )}

        <div
          className="demo-badge"
          title="Все данные прототипа демонстрационные"
        >
          <span className="demo-dot" />
          Демонстрационные данные
        </div>

        <div
          className={`connection connection-${history ? "history" : state.connection}`}
          title={
            state.dataSourceMode === "server"
              ? "Данные поступают с сервера SignalR"
              : "Данные формирует локальный демонстрационный источник"
          }
        >
          <span className="connection-dot" />
          <span className="connection-label">{connectionLabel}</span>
          {!history && state.dataSourceMode === "demo" && (
            <button
              type="button"
              className="retry-button"
              onClick={onRetryConnection}
              title="Повторить подключение к серверу"
            >
              сервер?
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
