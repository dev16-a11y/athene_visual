import { useCallback, useEffect, useRef, useState } from "react";
import type { DataSourceHandlers } from "./data/types";
import { DemoDataSource } from "./data/demoSource";
import { ServerDataSource } from "./data/serverSource";
import type { PortDataSource } from "./data/types";
import { formatAge, getDataAgeMs, getFreshness } from "./metrics/freshness";
import type { PortScene } from "./scene/PortScene";
import type { SceneLabel } from "./scene/labels";
import { store, useAppState } from "./state/store";
import { BottomDock } from "./ui/BottomDock";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";
import { HistoryBar } from "./ui/HistoryBar";
import { LeftRail } from "./ui/LeftRail";
import { RightRail } from "./ui/RightRail";
import { TopBar } from "./ui/TopBar";
import { SceneLabels } from "./ui/SceneLabels";
import { AlertIcon, LogoMark } from "./ui/icons";

/**
 * Обработчики источника данных, привязанные к поколению connect():
 * опоздавшие снимки и статусы от устаревшего подключения (гонка
 * «Переподключить» во время pending start) не трогают store — иначе
 * ложное «Соединение потеряно» сбрасывает статус нового источника.
 */
function createHandlers(
  mode: "server" | "demo",
  isStale: () => boolean,
): DataSourceHandlers {
  return {
    onSnapshot: (snapshot) => {
      if (isStale()) {
        return;
      }
      store.applySnapshot(snapshot);
      store.setConnection(mode === "server" ? "live" : "demo");
    },
    onDelta: (delta) => {
      if (isStale()) {
        return;
      }
      store.applyDelta(delta);
      store.setConnection(mode === "server" ? "live" : "demo");
    },
    onConnection: (connection) => {
      if (!isStale()) {
        store.setConnection(connection);
      }
    },
  };
}

export default function App() {
  const state = useAppState();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sceneLabels, setSceneLabels] = useState<SceneLabel[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PortScene | null>(null);
  const sourceRef = useRef<PortDataSource | null>(null);
  const generationRef = useRef(0);

  const connect = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const isStale = () => generation !== generationRef.current;
    sourceRef.current?.stop();
    sourceRef.current = null;
    store.set({ dataSourceMode: null });
    store.setConnection("connecting");

    const server = new ServerDataSource(createHandlers("server", isStale));
    try {
      await server.start();
      if (generation !== generationRef.current) {
        server.stop();
        return;
      }
      sourceRef.current = server;
      store.set({ dataSourceMode: "server" });
    } catch {
      server.stop();
      if (generation !== generationRef.current) {
        return;
      }
      const demo = new DemoDataSource(createHandlers("demo", isStale));
      store.set({ dataSourceMode: "demo" });
      try {
        await demo.start();
      } catch {
        store.setConnection("offline");
        return;
      }
      if (generation !== generationRef.current) {
        demo.stop();
        return;
      }
      sourceRef.current = demo;
    }
  }, []);

  useEffect(() => {
    void connect();
    return () => {
      generationRef.current += 1;
      sourceRef.current?.stop();
      sourceRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      state.connection !== "offline" ||
      state.dataSourceMode !== "server"
    ) {
      return;
    }
    const timer = window.setTimeout(() => void connect(), 5_000);
    return () => window.clearTimeout(timer);
  }, [state.connection, state.dataSourceMode, connect]);

  const displaySnapshot =
    state.viewMode === "history" && state.historySnapshot
      ? state.historySnapshot
      : state.liveSnapshot;
  const hasSnapshot = Boolean(state.liveSnapshot);

  useEffect(() => {
    if (!hasSnapshot || !canvasRef.current || sceneRef.current) {
      return;
    }
    const snapshot = store.displaySnapshot();
    if (!snapshot) {
      return;
    }
    let cancelled = false;
    void import("./scene/PortScene")
      .then(async ({ PortScene }) => {
        if (cancelled || !canvasRef.current || sceneRef.current) {
          return;
        }
        // Создание асинхронное: WebGPU-движку нужно дождаться адаптера.
        const scene = await PortScene.create(
          canvasRef.current,
          snapshot,
          (frame) => {
            // Кадры диагностики нужны только dev-панели: в production они
            // ре-рендерили App каждые 500 мс без пользы.
            if (import.meta.env.DEV) {
              store.set({ diagnostics: frame });
            }
          },
          (next) => setSceneLabels(next),
        );
        if (cancelled) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
      })
      .catch((error) => {
        // Ошибка загрузки чанка (сеть, деплой): без catch обещание
        // повисало unhandled, а экран — навсегда в «Подключении…».
        console.error("[app] не удалось загрузить модуль сцены:", error);
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [hasSnapshot]);

  useEffect(() => {
    if (displaySnapshot && sceneRef.current) {
      sceneRef.current.setSnapshot(displaySnapshot);
    }
  }, [displaySnapshot]);

  const enterHistory = useCallback(async () => {
    const source = sourceRef.current;
    if (!source) {
      return;
    }
    store.set({
      viewMode: "history",
      historyLoading: true,
      historyInfo: null,
      historyAt: null,
    });
    source.setPaused(true);
    try {
      const info = await source.fetchHistory();
      const last = info.points[info.points.length - 1];
      if (!last) {
        throw new Error("History is empty");
      }
      const snapshot = await source.fetchAt(last.at);
      store.set({
        historyInfo: info,
        historyAt: last.at,
        historySnapshot: snapshot,
        historyLoading: false,
      });
    } catch {
      store.set({
        viewMode: "live",
        historyLoading: false,
        historyInfo: null,
        historyAt: null,
        historySnapshot: null,
      });
      source.setPaused(false);
    }
  }, []);

  const selectHistoryPoint = useCallback((at: string) => {
    const source = sourceRef.current;
    if (!source) {
      return;
    }
    store.set({ historyLoading: true });
    void source
      .fetchAt(at)
      .then((snapshot) => {
        store.set({
          historySnapshot: snapshot,
          historyAt: at,
          historyLoading: false,
        });
      })
      .catch(() => store.set({ historyLoading: false }));
  }, []);

  const returnLive = useCallback(() => {
    sourceRef.current?.setPaused(false);
    store.set({
      viewMode: "live",
      historySnapshot: null,
      historyAt: null,
      historyLoading: false,
    });
  }, []);

  const ageMs = displaySnapshot
    ? state.viewMode === "history"
      ? 0
      : getDataAgeMs(
          displaySnapshot.serverTime,
          nowMs,
          state.clockOffsetMs,
        )
    : Number.POSITIVE_INFINITY;
  const freshness = getFreshness(ageMs);
  const showStale =
    state.viewMode === "live" &&
    Boolean(displaySnapshot) &&
    (freshness !== "fresh" ||
      state.connection === "reconnecting" ||
      state.connection === "offline");

  const selectedVessel =
    displaySnapshot?.vessels.find((vessel) => vessel.id === state.selectedId) ??
    null;

  return (
    <div className="app" data-quality={state.quality}>
      <canvas
        ref={canvasRef}
        className="scene-canvas"
        aria-label="Трёхмерная сцена контейнерного терминала"
      />
      <div className="scene-vignette" aria-hidden="true" />
      {displaySnapshot && (
        <SceneLabels labels={sceneLabels} selectedId={state.selectedId} />
      )}

      {!displaySnapshot && (
        <div className="loading-screen">
          <span className="loading-logo">
            <LogoMark size={54} />
          </span>
          <span className="loading-title">SMARTTWIN</span>
          <span className="loading-sub">
            Подключение к источнику данных и подготовка сцены…
          </span>
        </div>
      )}

      <div className="ui-layer">
        <TopBar
          nowMs={nowMs}
          onEnterHistory={() => void enterHistory()}
          onReturnLive={returnLive}
          onRetryConnection={() => void connect()}
        />

        {displaySnapshot && (
          <LeftRail
            snapshot={displaySnapshot}
            selectedId={state.selectedId}
            expandedGroup={state.expandedGroup}
            searchQuery={state.searchQuery}
          />
        )}

        {displaySnapshot && (
          <RightRail
            snapshot={displaySnapshot}
            selectedId={state.selectedId}
            selectedWarningId={state.selectedWarningId}
            selectedVessel={selectedVessel}
            nowMs={nowMs}
            searchQuery={state.searchQuery}
          />
        )}

        {displaySnapshot && (
          <BottomDock
            snapshot={displaySnapshot}
            historyMode={state.viewMode === "history"}
            dataSourceMode={state.dataSourceMode}
          />
        )}

        {/* Диагностика — только в dev-сборке, в презентационном виде её нет. */}
        {import.meta.env.DEV && state.showDiagnostics && (
          <DiagnosticsPanel
            frame={state.diagnostics}
            connection={state.connection}
            viewMode={state.viewMode}
          />
        )}
      </div>

      {state.viewMode === "history" && (
        <HistoryBar
          info={state.historyInfo}
          currentAt={state.historyAt}
          loading={state.historyLoading}
          onSelect={selectHistoryPoint}
          onReturnLive={returnLive}
        />
      )}

      {showStale && displaySnapshot && (
        <div
          className={
            state.connection === "offline"
              ? "data-alert alert-danger"
              : state.connection === "reconnecting"
                ? "data-alert alert-warning"
                : "data-alert alert-warning"
          }
          role="status"
        >
          <AlertIcon size={15} />
          <span>
            {state.connection === "offline"
              ? "Соединение потеряно"
              : state.connection === "reconnecting"
                ? "Переподключение к потоку данных"
                : "Данные устарели"}
            {" · "}
            {freshness === "offline"
              ? "показано последнее известное состояние"
              : `последнее обновление ${formatAge(ageMs)}`}
          </span>
          <button
            type="button"
            className="alert-action"
            onClick={() => void connect()}
          >
            Переподключить
          </button>
        </div>
      )}
    </div>
  );
}
