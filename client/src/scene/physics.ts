import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
// Регистрирует компонент сцены (`scene.enablePhysics`) — без этого импорта
// метод отсутствует, а HavokPlugin остаётся бесполезным классом.
import "@babylonjs/core/Physics/physicsEngineComponent";

const GRAVITY = new Vector3(0, -9.81, 0);

export interface PhysicsHandle {
  pluginName: string;
  bodies: number;
}

/**
 * Havok подключается лениво: WASM весит 2 МБ, и грузить его при каждом
 * открытии сцены незачем. Вызывается из `PortScene` только при `?physics=1`
 * и из инструментов проверки.
 */
export async function enablePhysics(scene: Scene): Promise<PhysicsHandle> {
  if (scene.getPhysicsEngine()) {
    return {
      pluginName: scene.getPhysicsEngine()?.getPhysicsPluginName() ?? "unknown",
      bodies: countBodies(scene),
    };
  }
  // Динамический импорт: пакет попадает в отдельный чанк и не тянет WASM
  // в основную сборку. Путь к .wasm подставляем явно: Emscripten ищет его
  // рядом с JS-модулем, а Vite отдаёт предсобранный модуль из .vite/deps —
  // там бинарника нет, и браузер получает index.html вместо wasm.
  const [{ default: HavokPhysics }, { default: wasmUrl }] = await Promise.all([
    import("@babylonjs/havok"),
    import("@babylonjs/havok/lib/esm/HavokPhysics.wasm?url"),
  ]);
  const havok = await HavokPhysics({ locateFile: () => wasmUrl });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(GRAVITY, plugin);
  return { pluginName: plugin.name, bodies: countBodies(scene) };
}

/**
 * Невидимая плоскость на уровне причала: без неё тела проваливаются.
 * Коллайдер не участвует в рендере и не попадает в выбор мышью.
 */
export function addGroundCollider(scene: Scene, y = 2): Mesh {
  const ground = MeshBuilder.CreateGround(
    "physics-ground",
    { width: 900, height: 600, subdivisions: 1 },
    scene,
  );
  // Пол — только по берегу (z ≥ 0, как и сама площадка терминала):
  // над акваторией тестовые тела честно падают в воду, а не висят
  // на невидимой плоскости.
  ground.position.set(0, y, 300);
  ground.isVisible = false;
  ground.isPickable = false;
  ground.metadata = { skipShadow: true };
  new PhysicsAggregate(
    ground,
    PhysicsShapeType.BOX,
    { mass: 0, restitution: 0.1, friction: 0.6 },
    scene,
  );
  return ground;
}

/**
 * Тело для проверки интеграции: падает на плоскость и засыпает. Возвращает
 * меш, чтобы вызывающая сторона могла отследить его позицию.
 */
export function spawnTestCrate(
  scene: Scene,
  position: Vector3,
  size = 2,
): Mesh {
  const crate = MeshBuilder.CreateBox(
    "physics-crate",
    { size, width: size, height: size, depth: size },
    scene,
  );
  crate.position.copyFrom(position);
  crate.isPickable = false;
  new PhysicsAggregate(
    crate,
    PhysicsShapeType.BOX,
    { mass: 120, restitution: 0.2, friction: 0.5 },
    scene,
  );
  return crate;
}

export function countBodies(scene: Scene): number {
  const engine = scene.getPhysicsEngine();
  if (!engine) {
    return 0;
  }
  // Внутренний реестр v2-движка; публичного счётчика тел в API нет.
  const bodies = (engine as unknown as { _physicsBodies?: unknown })
    ._physicsBodies;
  return bodyCount(bodies);
}

function bodyCount(registry: unknown): number {
  if (registry instanceof Map) {
    return registry.size;
  }
  if (Array.isArray(registry)) {
    return registry.filter(Boolean).length;
  }
  return 0;
}

