import { useCallback, useEffect, useRef, useState } from "react";
import type { DataSourceHandlers } from "./data/types";
import { DemoDataSource } from "./data/demoSource";
import { ServerDataSource } from "./data/serverSource";
import type { PortDataSource } from "./data/types";
import type { DiagnosticsFrame } from "./domain/types";
import { formatAge, getDataAgeMs, getFreshness } from "./metrics/freshness";
import { SCENE_MODE } from "./domain/sceneMode";
import type { SceneHandle } from "./scene/kandla/KandlaScene";
import type { KandlaInfo } from "./scene/kandla/KandlaScene";
import type { SceneLabel } from "./scene/labels";
import { store, useAppState } from "./state/store";
import { BottomDock } from "./ui/BottomDock";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";
import { HistoryBar } from "./ui/HistoryBar";
import { LeftRail } from "./ui/LeftRail";
import { RightRail } from "./ui/RightRail";
import { TopBar } from "./ui/TopBar";
import { GeoCard } from "./ui/GeoCard";
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

/** Предел ожидания GLB: медленная сеть не должна держать экран вечно. */
const MODEL_WAIT_MS = 15_000;

/**
 * Режим сцены. `demo` — прежний терминал с телеметрией, `kandla` — геооснова
 * порта: у неё нет ни объектов, ни снимков, поэтому часть интерфейса,
 * привязанная к телеметрии, в этом режиме не показывается.
 */
const GEO_MODE = SCENE_MODE === "kandla";

/** Дополнительно к общему интерфейсу сцены: геопривязка нужна карточке. */
type KandlaHandle = SceneHandle & {
  getCameraGeo(): { lon: number; lat: number; radius: number; beta: number };
};

/**
 * Ожидание с потолком: если модели не пришли за отведённое время, сцену
 * всё равно показываем (на параметрике) — пустой экран хуже.
 */
function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      console.warn(
        `[app] модели не готовы за ${ms} мс, показываю сцену как есть`,
      );
      resolve();
    }, ms);
    void promise.then(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

export default function App() {
  const state = useAppState();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sceneLabels, setSceneLabels] = useState<SceneLabel[]>([]);
  // Сцена готова не тогда, когда создан движок, а когда встали GLB-модели:
  // до этого в кадре параметрическая геометрия, которую видно ~1,5 с.
  const [sceneReady, setSceneReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const kandlaRef = useRef<KandlaHandle | null>(null);
  const [kandlaInfo, setKandlaInfo] = useState<KandlaInfo | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [cameraGeo, setCameraGeo] = useState<{
    lon: number;
    lat: number;
    radius: number;
    beta: number;
  } | null>(null);
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
    // Геооснова статична: подключать к ней поток телеметрии терминала нечего.
    if (GEO_MODE) {
      return;
    }
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
    // Геооснове снимок не нужен: она собирается из локальных файлов, а не из
    // телеметрии. Демо-сцена, как и раньше, ждёт первый снимок.
    if ((!GEO_MODE && !hasSnapshot) || !canvasRef.current || sceneRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    let cancelled = false;
    // Сцена пересоздаётся — загрузка снова нужна, пока не встанут модели.
    setSceneReady(false);

    const onFrame = (frame: DiagnosticsFrame) => {
      // Кадры диагностики нужны только dev-панели.
      if (import.meta.env.DEV) {
        store.set({ diagnostics: frame });
      }
    };
    const onLabels = (next: SceneLabel[]) => setSceneLabels(next);

    const created: Promise<SceneHandle> = GEO_MODE
      ? import("./scene/kandla/KandlaScene").then(async ({ KandlaScene }) => {
          const scene = await KandlaScene.create(canvas, {
            onFrame,
            onLabels,
            onInfo: (info) => setKandlaInfo(info),
          });
          kandlaRef.current = scene as KandlaHandle;
          return scene;
        })
      : import("./scene/PortScene").then(async ({ PortScene }) => {
          const snapshot = store.displaySnapshot();
          if (!snapshot) {
            throw new Error("нет снимка для демонстрационной сцены");
          }
          return PortScene.create(canvas, snapshot, onFrame, onLabels);
        });

    void created
      .then(async (scene) => {
        if (cancelled) {
          scene.dispose();
          kandlaRef.current = null;
          return;
        }
        sceneRef.current = scene;
        // Модели догружаются параллельно: ждём их, пока держится загрузка.
        await withTimeout(scene.whenModelsReady(), GEO_MODE ? 8_000 : MODEL_WAIT_MS);
        if (!cancelled && sceneRef.current === scene) {
          setSceneReady(true);
        }
      })
      .catch((error) => {
        // Ошибка загрузки чанка (сеть, деплой) или отсутствие подготовленных
        // геоданных: без catch обещание повисало unhandled, а экран — навсегда
        // в «Подключении…».
        console.error("[app] не удалось собрать сцену:", error);
        // Сцену не покажем, но интерфейс — да: пусть виден статус и причина,
        // а не бесконечный экран загрузки.
        if (!cancelled) {
          setSceneError(error instanceof Error ? error.message : String(error));
          setSceneReady(true);
        }
      });

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      kandlaRef.current = null;
    };
  }, [hasSnapshot]);

  useEffect(() => {
    if (displaySnapshot && sceneRef.current) {
      sceneRef.current.setSnapshot(displaySnapshot);
    }
  }, [displaySnapshot]);

  // Координаты центра обзора: у геоосновы это единственная «живая» величина,
  // и её видно в карточке — так проверяется привязка камеры к карте.
  useEffect(() => {
    if (!GEO_MODE) {
      return;
    }
    const timer = window.setInterval(() => {
      const handle = kandlaRef.current;
      if (handle) {
        setCameraGeo(handle.getCameraGeo());
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

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
        aria-label={
          GEO_MODE
            ? "Трёхмерная географическая основа порта Кандла"
            : "Трёхмерная сцена контейнерного терминала"
        }
      />
      <div className="scene-vignette" aria-hidden="true" />
      {displaySnapshot && (
        <SceneLabels labels={sceneLabels} selectedId={state.selectedId} />
      )}

      {((!GEO_MODE && !displaySnapshot) || !sceneReady) && (
        <div className="loading-screen">
          <span className="loading-logo">
            <LogoMark size={54} />
          </span>
          <span className="loading-title">SMARTTWIN</span>
          <span className="loading-sub">
            {GEO_MODE
              ? "Загрузка территории и акватории Кандлы из OpenStreetMap…"
              : "Подключение к источнику данных и подготовка сцены…"}
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

        {/* Геооснова: вместо панелей телеметрии — карточка источника и
            координат обзора. Демо-панели привязаны к снимку порта, поэтому в
            этом режиме их нет. */}
        {GEO_MODE && (
          <GeoCard info={kandlaInfo} camera={cameraGeo} error={sceneError} />
        )}

        {!GEO_MODE && displaySnapshot && (
          <LeftRail
            snapshot={displaySnapshot}
            selectedId={state.selectedId}
            expandedGroup={state.expandedGroup}
            searchQuery={state.searchQuery}
          />
        )}

        {!GEO_MODE && displaySnapshot && (
          <RightRail
            snapshot={displaySnapshot}
            selectedId={state.selectedId}
            selectedWarningId={state.selectedWarningId}
            selectedVessel={selectedVessel}
            nowMs={nowMs}
            searchQuery={state.searchQuery}
          />
        )}

        {!GEO_MODE && displaySnapshot && (
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
