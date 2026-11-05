import { useEffect, useState } from "react";
import {
  LAYER_LABELS,
  QUALITY_LABELS,
  PORT_NAME,
  TERMINAL_NAME,
} from "../domain/constants";
import type { LayerKey, QualityLevel } from "../domain/types";
import { SCENE_MODE } from "../domain/sceneMode";
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

/**
 * Сцена-геооснова: у неё нет ни смен, ни поиска по судам, ни истории телеметрии,
 * поэтому соответствующие элементы шапки не показываются — но сама шапка,
 * качество графики и возврат камеры остаются на месте.
 */
const GEO_MODE = SCENE_MODE === "kandla";

export function TopBar({
  nowMs,
  onEnterHistory,
  onReturnLive,
  onRetryConnection,
}: TopBarProps) {
  const state = useAppState();
  const [layersOpen, setLayersOpen] = useState(false);

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

  const connectionLabel = GEO_MODE
    ? "Геооснова"
    : history
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
            {GEO_MODE ? "Кандла · Deendayal Port, Гуджарат" : `${PORT_NAME} · ${TERMINAL_NAME}`}
          </span>
        </span>
      </div>

      <div className="topbar-divider" />

      <div className="area-select">
        <span className="area-label">Область обзора</span>
        <span className="area-value">
          {GEO_MODE ? "Территория и акватория · OSM" : "Терминал №1 · причалы 02–03"}
          {!GEO_MODE && <ChevronIcon size={13} />}
        </span>
      </div>

      {!GEO_MODE && (
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
      )}

      <div className="clock">
        <span className="clock-time">
          {history && <HistoryIcon size={13} />}
          {formatTime(displayTime)}
        </span>
        <span className="clock-date">{formatDate(displayTime)}</span>
      </div>

      {!GEO_MODE && (
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
      )}

      {!GEO_MODE && (
      <label className="search">
        <SearchIcon size={14} />
        <input
          value={state.searchQuery}
          onChange={(event) => store.set({ searchQuery: event.target.value })}
          placeholder="Поиск судна, причала, инцидента"
          aria-label="Поиск"
        />
      </label>
      )}

      <div className="topbar-actions">
        {!GEO_MODE && (
        <div className="layer-wrap">
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
        )}

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

        {GEO_MODE ? (
          <div
            className="demo-badge"
            title="Геоданные: OpenStreetMap, лицензия ODbL 1.0"
          >
            <span className="demo-dot" />
            © OpenStreetMap contributors
          </div>
        ) : (
          <div
            className="demo-badge"
            title="Все данные прототипа демонстрационные"
          >
            <span className="demo-dot" />
            Демонстрационные данные
          </div>
        )}

        <div
          className={`connection connection-${GEO_MODE ? "geo" : history ? "history" : state.connection}`}
          title={
            GEO_MODE
              ? "Статическая географическая основа: телеметрия сцены не подключена"
              : state.dataSourceMode === "server"
                ? "Данные поступают с сервера SignalR"
                : "Данные формирует локальный демонстрационный источник"
          }
        >
          <span className="connection-dot" />
          <span className="connection-label">{connectionLabel}</span>
          {!GEO_MODE && !history && state.dataSourceMode === "demo" && (
            <button
              type="button"
              className="retry-button"
              onClick={onRetryConnection}
              title="Повторить подключение к серверу"
            >
              Сервер
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
