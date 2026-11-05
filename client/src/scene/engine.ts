import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
// Модульный WebGPU-движок не тянет расширения сам: без них падают
// createDynamicTexture, render targets и чтение пикселей. WebGL-движок
// подключает свои расширения внутри `Engines/engine`, WebGPU — нет.
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTarget";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.renderTargetTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.cubeTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.readTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.query";

export type PortEngine = Engine | WebGPUEngine;

export interface CreatedEngine {
  engine: PortEngine;
  backend: "WebGPU" | "WebGL 2" | "WebGL 1";
}

/**
 * Движок выбирается запросом `?engine=webgpu`. По умолчанию используется
 * WebGL 2 — он предсказуемее и не требует инициализации адаптера и WASM.
 * Если WebGPU недоступен (нет адаптера, отключён политикой), происходит
 * откат на WebGL 2 с предупреждением в консоли.
 */
export async function createPortEngine(
  canvas: HTMLCanvasElement,
): Promise<CreatedEngine> {
  const requested =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("engine");

  if (requested === "webgpu") {
    try {
      // preserveDrawingBuffer WebGPU-движок не принимает: снимок берётся
      // из render target, а не из канваса.
      const webgpu = new WebGPUEngine(canvas, {
        antialias: true,
        stencil: true,
      });
      await webgpu.initAsync();
      return { engine: webgpu, backend: "WebGPU" };
    } catch (error) {
      console.warn(
        "[engine] WebGPU недоступен, работаем на WebGL 2:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // preserveDrawingBuffer нужен проверочным скриптам (verify:water,
  // verify:motion): они читают пиксели канваса через drawImage/getImageData,
  // а без флага после отрисовки буфер уже очищен. Рантайм приложения его
  // не использует, но стоимостью в один flush пренебрегаем ради честных
  // пиксельных замеров.
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
  });
  return {
    engine,
    backend: engine.webGLVersion >= 2 ? "WebGL 2" : "WebGL 1",
  };
}
