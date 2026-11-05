// Какая сцена показывается. Переключается конфигурацией, не кодом:
//   ?scene=kandla | ?scene=demo   — параметр запроса (приоритет)
//   VITE_SCENE=demo|kandla        — переменная окружения сборки
//   DEFAULT_SCENE_MODE            — значение по умолчанию
//
// Демо-терминал никуда не удалён: он собирается тем же кодом, что и раньше, и
// включается одной строкой. Пока основной режим — Кандла, демо-объекты не
// создаются вовсе, поэтому их подписи и маркеры тоже не появляются.

export type SceneMode = "demo" | "kandla";

/** Показывать при запуске без параметров и без переменной окружения. */
export const DEFAULT_SCENE_MODE: SceneMode = "kandla";

function asMode(value: string | undefined | null): SceneMode | null {
  return value === "demo" || value === "kandla" ? value : null;
}

export function resolveSceneMode(
  search: string = typeof window === "undefined" ? "" : window.location.search,
  env: string | undefined = import.meta.env.VITE_SCENE,
): SceneMode {
  const fromQuery = asMode(new URLSearchParams(search).get("scene"));
  if (fromQuery) {
    return fromQuery;
  }
  return asMode(env) ?? DEFAULT_SCENE_MODE;
}

/** Режим текущей загрузки страницы. */
export const SCENE_MODE: SceneMode = resolveSceneMode();
