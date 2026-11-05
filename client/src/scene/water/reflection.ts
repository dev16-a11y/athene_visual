// Планарное отражение акватории.
//
// Отражение рисуется в отдельную текстуру зеркальной камерой относительно
// плоскости воды (y = WATER_LEVEL) и подмешивается материалом поверхности.
// Регистрация в scene.customRenderTargets обязательна: материал поверхности —
// ShaderMaterial, он сам не запрашивает отрисовку render target.

import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { WATER_LEVEL } from "./config";

export interface OceanReflectionOptions {
  /** Сторона текстуры отражения. */
  size: number;
  /** Поверхность воды: её нельзя отражать саму в себе. */
  water: AbstractMesh;
  /** Цвет очистки в линейном пространстве (небо без геометрии). */
  clearColor: Color4;
}

export interface OceanReflection {
  readonly texture: MirrorTexture;
  readonly size: number;
  /** Сколько объектов попадает в отражение (диагностика). */
  reflectableCount(): number;
  /** Проход включён и зарегистрирован в сцене. */
  isActive(): boolean;
  setEnabled(enabled: boolean): void;
  setSize(size: number): void;
  /** Пересобрать список отражаемых объектов (после загрузки/удаления моделей). */
  refresh(): void;
  dispose(): void;
}

/**
 * Границы области, отражение которой имеет смысл: дальше вглубь суши объекты
 * не попадают в воду (она заканчивается на линии причала), а проход отражений
 * на них только тратит draw calls.
 */
const REFLECTION_MAX_LAND_Z = 45;
const REFLECTION_MAX_SEA_DEPTH = 3000;
const REFLECTION_MAX_HALF_WIDTH = 2400;

/**
 * Объект, который не должен попадать в отражение: маркеры выбора, подписи и
 * вспомогательная геометрия — они либо висят в воздухе, либо дублируют UI.
 */
function isReflectable(mesh: AbstractMesh, water: AbstractMesh): boolean {
  if (mesh === water || mesh.isDisposed()) {
    return false;
  }
  if (!mesh.isEnabled() || !mesh.isVisible) {
    return false;
  }
  if (mesh.getTotalVertices() === 0 || mesh.material === null) {
    return false;
  }
  const name = mesh.name;
  if (
    name.startsWith("selection-") ||
    name.startsWith("label") ||
    name.startsWith("probe-")
  ) {
    return false;
  }
  if (mesh.metadata?.noReflection === true) {
    return false;
  }
  // Отсечение по габаритам в мировых координатах: дальние склады и цеха за
  // терминалом в воде не видны, а в проходе отражений стоили бы полный кадр.
  // По Z правило «весь меш или ничего» — осознанное упрощение (см. README);
  // по X меш отсекается только если он целиком вне окна: проверка одного
  // min-угла роняла бы протянутый издалека меш вместе с видимой частью.
  const box = mesh.getBoundingInfo().boundingBox;
  if (box.maximumWorld.z > REFLECTION_MAX_LAND_Z) {
    return false;
  }
  if (box.minimumWorld.z < -REFLECTION_MAX_SEA_DEPTH) {
    return false;
  }
  if (
    box.maximumWorld.x < -REFLECTION_MAX_HALF_WIDTH ||
    box.minimumWorld.x > REFLECTION_MAX_HALF_WIDTH
  ) {
    return false;
  }
  return true;
}

export function createOceanReflection(
  scene: Scene,
  options: OceanReflectionOptions,
): OceanReflection {
  let size = options.size;
  let active = true;
  let disposed = false;
  let refreshScheduled = false;

  const mirror = new MirrorTexture("ocean-reflection", size, scene, true);

  /**
   * Плоскость воды: нормаль вниз и сдвиг на 2 см под уровень — так в отражение
   * не попадает сама поверхность, и на кромке причала нет полосы собственных
   * отражённых пикселей. Смещение задано относительно фактического уровня воды,
   * а не константой демо-сцены.
   */
  mirror.mirrorPlane = new Plane(0, -1, 0, WATER_LEVEL - 0.02);

  /**
   * Отражение рисуется без тональной компрессии и гаммы: материал воды
   * смешивает его в линейном пространстве и тонально сжимает кадр один раз,
   * как и остальные материалы сцены. Без этого отражение проходило бы ACES и
   * гамму дважды и выглядело выцветшим.
   */
  mirror.disableImageProcessing = true;
  mirror.gammaSpace = false;
  mirror.clearColor = options.clearColor;
  /**
   * Отражение обновляется через кадр: при движении камеры разница незаметна,
   * а проход стоит почти столько же, сколько основной рендер (весь список
   * объектов рисуется второй раз).
   */
  mirror.refreshRate = 2;
  mirror.hasAlpha = false;

  const collect = (): AbstractMesh[] => {
    const list: AbstractMesh[] = [];
    for (const mesh of scene.meshes) {
      if (isReflectable(mesh, options.water)) {
        list.push(mesh);
      }
    }
    return list;
  };

  const refresh = (): void => {
    if (scene.isDisposed || disposed) {
      return;
    }
    // Вода не должна попадать в собственное отражение ни при каких условиях.
    mirror.renderList = collect();
  };

  const scheduleRefresh = (): void => {
    if (refreshScheduled || scene.isDisposed || disposed) {
      return;
    }
    refreshScheduled = true;
    scene.onAfterRenderObservable.addOnce(() => {
      refreshScheduled = false;
      refresh();
    });
  };

  refresh();

  const newMeshObserver = scene.onNewMeshAddedObservable.add(() => scheduleRefresh());
  const removedMeshObserver = scene.onMeshRemovedObservable.add(() => scheduleRefresh());

  if (active) {
    scene.customRenderTargets.push(mirror);
  }

  return {
    texture: mirror,
    get size() {
      return size;
    },
    reflectableCount: () => mirror.renderList?.length ?? 0,
    isActive: () => active && scene.customRenderTargets.includes(mirror),
    setEnabled(enabled: boolean): void {
      if (enabled === active) {
        return;
      }
      active = enabled;
      if (enabled) {
        if (!scene.customRenderTargets.includes(mirror)) {
          scene.customRenderTargets.push(mirror);
        }
        refresh();
      } else {
        // Проход действительно снимается: текстура перестаёт обновляться и
        // сцена не тратит на неё ни одной draw call.
        scene.customRenderTargets = scene.customRenderTargets.filter(
          (target) => target !== mirror,
        );
      }
    },
    setSize(next: number): void {
      if (next === size || next <= 0) {
        return;
      }
      size = next;
      mirror.resize({ width: size, height: size });
    },
    refresh,
    dispose(): void {
      scene.onNewMeshAddedObservable.remove(newMeshObserver);
      scene.onMeshRemovedObservable.remove(removedMeshObserver);
      disposed = true;
      if (!scene.isDisposed) {
        scene.customRenderTargets = scene.customRenderTargets.filter(
          (target) => target !== mirror,
        );
      }
      mirror.dispose();
      active = false;
    },
  };
}
