import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/loaders/glTF";
// Лоадер glTF проверяет наличие UniversalCamera как side-effect.
import "@babylonjs/core/Cameras/universalCamera";

/**
 * Реестр внешних GLB-моделей по типам сущностей.
 *
 * Каждая запись описывает, чем заменить временную параметрическую геометрию.
 * Модель загружается лениво и подменяет геометрию внутри существующего
 * EntityVisual — бизнес-логика (позиции, статусы, проценты) не меняется.
 * Пока модель отсутствует или не загрузилась, сцена работает на параметрике.
 */
export interface EntityModelSpec {
  /** Путь от корня клиента (папка public). */
  url: string;
  /** Модель нормализуется к этой длине по самой длинной горизонтали (метры). */
  fitLength?: number;
  /** Доворот по Y после приведения к оси X (радианы). */
  rotationY?: number;
  /** Наклон по X (радианы) — для моделей, собранных в Z-up. */
  rotationX?: number;
  /** Подъём над уровнем земли после нормализации (метры). */
  offsetY?: number;
  /**
   * Не пересчитывать высоту: у моделей с осмысленным началом координат
   * (суда — ватерлиния по Y=0) днище должно остаться под водой, а не
   * встать на её поверхность.
   */
  preserveOriginY?: boolean;
  /** Добавлять меши модели в тени. */
  shadow?: boolean;
  /**
   * Сливать меши модели в один. По умолчанию выключено: у моделей с разными
   * наборами атрибутов вершин слияние либо падает, либо даёт битые буферы.
   */
  merge?: boolean;
}

export const MODEL_MANIFEST: Partial<Record<string, EntityModelSpec>> = {
  // Quaternius, CC0: https://poly.pizza/m/W2vMzztgIi
  // Комплект «Афина — суда, комплект 1»: портовый буксир, 31 × 13 м,
  // нос в +Z, Y=0 — ватерлиния.
  tug: {
    url: "/models/harbour-tug.glb",
    fitLength: 31.2,
    rotationY: Math.PI / 2,
    preserveOriginY: true,
    shadow: true,
  },
  // Sketlux, CC0 (оставлено как запасной вариант, если новая модель недоступна).
  vesselFallback: {
    url: "/models/src/container-ship-full.glb",
    fitLength: 190,
    offsetY: 1.5,
    shadow: true,
  },
  // Проектные модели Smarttwin (входящие архивы, см. README).
  // «Афина — суда, комплект 1»: контейнеровоз 185 м, тот же корпус с новой
  // дымовой трубой. Нос +Z, начало координат на ватерлинии (днище −7,3 м),
  // поэтому высоту не пересчитываем — иначе судно всплывёт над водой.
  vessel: {
    url: "/models/container-ship-athena.glb",
    fitLength: 185,
    rotationY: Math.PI / 2,
    preserveOriginY: true,
    shadow: true,
  },
  // Портовые здания (LOD1: 6,7 / 10,4 / 17,2 тыс. треугольников вместо
  // 39,5 / 45,7 / 273,4 тыс. — это фоновый ряд в 270 м от камеры).
  // Фасад моделей смотрит в +Z, в сцене лицевая сторона — к причалу (−Z).
  buildingKaispeicher: {
    url: "/models/buildings/kaispeicher-b.glb",
    fitLength: 40,
    rotationY: Math.PI,
    shadow: true,
  },
  buildingRdm: {
    url: "/models/buildings/rdm-loods.glb",
    fitLength: 80,
    rotationY: Math.PI,
    shadow: true,
  },
  buildingSteinwerder: {
    url: "/models/buildings/steinwerder.glb",
    fitLength: 130,
    rotationY: Math.PI,
    shadow: true,
  },
  // STS-кран: стрела уже направлена в −Z (морская сторона), как в сцене.
  crane: {
    url: "/models/crane-sts.glb",
    fitLength: 80,
    shadow: true,
  },
  // Тягачи: нос модели смотрит в +Z, в сцене техника едет по +X.
  tractorTerbergYt220: {
    url: "/models/tractor-terberg-yt220.glb",
    fitLength: 7,
    rotationY: Math.PI / 2,
    shadow: true,
  },
  tractorTerbergYt193: {
    url: "/models/tractor-terberg-yt193.glb",
    fitLength: 7,
    rotationY: Math.PI / 2,
    shadow: true,
  },
  tractorKalmarT2: {
    url: "/models/tractor-kalmar-t2.glb",
    fitLength: 7,
    rotationY: Math.PI / 2,
    shadow: true,
  },
};

/**
 * Распределение вариантов по сущностям одного типа. Выбор детерминирован
 * по id, поэтому конкретный тягач не меняется между перезагрузками.
 */
export const MODEL_VARIANTS: Record<string, string[]> = {
  truck: ["tractorTerbergYt220", "tractorTerbergYt193", "tractorKalmarT2"],
};

/**
 * Ключ манифеста для конкретной сущности: вариант из MODEL_VARIANTS или
 * сам тип. undefined — модели нет, остаётся параметрическая геометрия.
 */
export function resolveModelKey(
  kind: string,
  id: string,
): string | undefined {
  const variants = MODEL_VARIANTS[kind];
  if (variants && variants.length > 0) {
    let hash = 0;
    for (let index = 0; index < id.length; index++) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    const key = variants[hash % variants.length];
    if (MODEL_MANIFEST[key]) {
      return key;
    }
  }
  return MODEL_MANIFEST[kind] ? kind : undefined;
}

interface LoadedTemplate {
  /** Внешний узел (только поворот); клоны создаются под каждую сущность. */
  root: TransformNode;
}

/**
 * Кэш шаблонов привязан к сцене: клон создаётся через getScene() шаблона,
 * и шаблон из уже уничтоженной сцены (StrictMode монтирует сцену дважды)
 * клонировался бы в неё же. WeakMap очищается сборщиком вместе со сценой.
 */
const templateCache = new WeakMap<
  Scene,
  Map<string, Promise<LoadedTemplate | null>>
>();

/**
 * Загружает GLB-модель по спецификации и нормализует её:
 * внутренний узел масштабирует к fitLength, центрирует по X/Z и ставит на
 * землю; внешний узел отвечает за поворот. Повторные вызовы переиспользуют
 * загрузку; клон под каждую сущность делает swapInModel.
 */
export function loadEntityModel(
  scene: Scene,
  key: string,
): Promise<LoadedTemplate | null> {
  const spec = MODEL_MANIFEST[key];
  if (!spec || scene.isDisposed) {
    return Promise.resolve(null);
  }
  let sceneCache = templateCache.get(scene);
  if (!sceneCache) {
    sceneCache = new Map();
    templateCache.set(scene, sceneCache);
  }
  let promise = sceneCache.get(key);
  if (!promise) {
    promise = SceneLoader.ImportMeshAsync("", spec.url, undefined, scene)
      .then((result) => {
        const outer = new TransformNode(`model-template-${key}`, scene);
        const inner = new TransformNode(`model-inner-${key}`, scene);
        inner.parent = outer;
        // Дети результата: корневые узлы цепляем к inner, остальные уже
        // имеют родителей внутри иерархии импорта.
        for (const node of result.meshes) {
          if (!node.parent) {
            node.parent = inner;
          }
        }
        // Слияние мешей модели: у судна-импорта 175 мешей, и клонировать и
        // пересчитывать границы по одному — минуты блокировки основного потока
        // и +350 draw calls на пару судов. Один мультиматериальный меш
        // сохраняет все материалы как под-меши.
        const imported = inner.getChildMeshes();
        const mergeable = imported.filter(
          (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
        );
        if (spec.merge && mergeable.length > 1) {
          try {
            const merged = Mesh.MergeMeshes(
              mergeable,
              true,
              true,
              undefined,
              true,
              true,
            );
            if (merged) {
              merged.parent = inner;
            }
          } catch (error) {
            // Слияние — оптимизация, а не требование: если у части мешей нет
            // материалов или геометрии, продолжаем с исходной иерархией.
            console.warn(
              `[models] слияние ${key} пропущено:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
        // Ориентация до замеров: модели из Z-up редакторов требуют наклона.
        inner.rotation.x = spec.rotationX ?? 0;
        const measure = () => {
          let minX = Infinity;
          let maxX = -Infinity;
          let minZ = Infinity;
          let maxZ = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const mesh of inner.getChildMeshes()) {
            // ВАЖНО: boundingBox.minimumWorld обновляется только через
            // refreshBoundingInfo(); computeWorldMatrix сам по себе не
            // пересчитывает границы — замер взял бы устаревшие значения.
            mesh.refreshBoundingInfo(false, false);
            const bounds = mesh.getBoundingInfo().boundingBox;
            for (const corner of [bounds.minimumWorld, bounds.maximumWorld]) {
              minX = Math.min(minX, corner.x);
              maxX = Math.max(maxX, corner.x);
              minZ = Math.min(minZ, corner.z);
              maxZ = Math.max(maxZ, corner.z);
              minY = Math.min(minY, corner.y);
              maxY = Math.max(maxY, corner.y);
            }
          }
          return { minX, maxX, minZ, maxZ, minY, maxY };
        };
        // Первый проход: грубая оценка длины для выбора масштаба.
        const rough = measure();
        if (!Number.isFinite(rough.minX)) {
          outer.dispose(false, true);
          return null;
        }
        const horizontal = Math.max(
          rough.maxX - rough.minX,
          rough.maxZ - rough.minZ,
          0.001,
        );
        const scale = spec.fitLength ? spec.fitLength / horizontal : 1;
        inner.scaling.setAll(scale);
        // Второй проход: точные границы уже в целевом масштабе.
        const exact = measure();
        inner.position.set(
          -((exact.minX + exact.maxX) / 2),
          // preserveOriginY — модель сама знает, где у неё вода или земля.
          (spec.preserveOriginY ? 0 : -exact.minY) + (spec.offsetY ?? 0),
          -((exact.minZ + exact.maxZ) / 2),
        );
        outer.rotation.y = spec.rotationY ?? 0;
        outer.setEnabled(false);
        return { root: outer };
      })
      .catch((error) => {
        console.warn(
          `[models] не удалось загрузить ${spec.url}:`,
          error instanceof Error ? error.message : error,
        );
        return null;
      });
    sceneCache.set(key, promise);
  }
  return promise;
}

export interface ModelSwapResult {
  /** Меши клона модели — новый список мешей визуала. */
  meshes: AbstractMesh[];
}
/**
 * Доводит центр габаритов клона до точки сущности.
 *
 * Нормализация в манифесте считает границы до постановки модели в иерархию
 * сцены, поэтому у моделей со смещёнными узлами остаётся сдвиг: например,
 * Steinwerder (два корпуса в разных узлах) уезжал от своего места на 19 м и
 * залезал в контейнерный двор. Здесь центр считается по фактическим мировым
 * границам и компенсируется в системе координат родителя — это работает и
 * для повёрнутых сущностей (буксир разворачивается по эллипсу).
 */
function alignToRoot(clone: TransformNode, entityRoot: TransformNode): void {
  const parent = clone.parent;
  if (!parent) {
    return;
  }
  clone.computeWorldMatrix(true);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mesh of clone.getChildMeshes()) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(false, false);
    const box = mesh.getBoundingInfo().boundingBox;
    for (const corner of [box.minimumWorld, box.maximumWorld]) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minZ = Math.min(minZ, corner.z);
      maxZ = Math.max(maxZ, corner.z);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return;
  }
  const target = entityRoot.getAbsolutePosition();
  const delta = new Vector3(
    target.x - (minX + maxX) / 2,
    0,
    target.z - (minZ + maxZ) / 2,
  );
  if (delta.lengthSquared() < 1e-6) {
    return;
  }
  // Мировая поправка → локальная система родителя (у него может быть поворот).
  const inverse = Matrix.Invert(parent.getWorldMatrix());
  clone.position.addInPlace(Vector3.TransformNormal(delta, inverse));
  clone.computeWorldMatrix(true);
}

/**
 * Подменяет визуал сущности внешней моделью: клонирует загруженный шаблон
 * внутрь entityRoot, переносит тени и метаданные. Вызывающий сам удаляет
 * временную параметрическую геометрию и обновляет список мешей визуала.
 */
export async function swapInModel(
  scene: Scene,
  entityRoot: TransformNode,
  entityKey: string,
  entityId: string,
  shadow: ShadowGenerator | null,
): Promise<ModelSwapResult | null> {
  const template = await loadEntityModel(scene, entityKey);
  if (!template || entityRoot.isDisposed() || scene.isDisposed) {
    return null;
  }
  const clone = template.root.clone(`model-${entityId}`, entityRoot);
  if (!clone) {
    return null;
  }
  clone.setEnabled(true);
  alignToRoot(clone, entityRoot);
  const meshes: AbstractMesh[] = [];
  for (const mesh of clone.getChildMeshes()) {
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      entityId,
      shadowCaster: Boolean(shadow),
    };
    if (shadow) {
      shadow.addShadowCaster(mesh, false);
    }
    mesh.receiveShadows = true;
    meshes.push(mesh);
  }
  return { meshes };
}
