// Адаптер FFT-расчёта волн на Babylon.js. Перенос из прототипа акватории
// (ocean-sim.js), тот же порядок проходов и те же render targets.
//
// Отличия от прототипа:
//  * класс на TypeScript, вместо window.BABYLON — модульные импорты;
//  * добавлены проверка возможностей движка, отчёт об ошибках компиляции
//    шейдеров и явная остановка расчёта;
//  * `update(dt)` принимает уже ограниченный dt (ограничение — в index.ts),
//    чтобы после возврата во вкладку не было скачка фазы;
//  * размер каскада жёстко 128×128 и не зависит от настроек качества.
//
// Шейдеры и параметры spectra — из Humpalumps/Ultra-Water (MIT, commit
// 30ea65ecb0a66b137aa200d099965634bdd84d51); уведомления в docs/licenses/.

import { EffectRenderer, EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { MultiRenderTarget } from "@babylonjs/core/Materials/Textures/multiRenderTarget";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { RenderTargetWrapper } from "@babylonjs/core/Engines/renderTargetWrapper";
import type { Scene } from "@babylonjs/core/scene";
// Без этого расширения у модульного движка нет createMultipleRenderTarget.
import "@babylonjs/core/Engines/Extensions/engine.multiRender";

import {
  ASSEMBLE_FRAG,
  CASCADE_LENGTH_LIST,
  CASCADE_LENGTHS,
  EVOLVE_FRAG,
  FFT_FRAG,
  INIT_FRAG,
  OCEAN_FFT_SIZE,
  OCEAN_LOG_N,
  OCEAN_LOOP_SECONDS,
  defaultOceanParams,
  jonswapParams,
  type OceanParams,
} from "./oceanShaders";

const N = OCEAN_FFT_SIZE;
const NOISE_SEED = 1337;
/**
 * Границы каскадов по волновому числу: каждый каскад отвечает за свой диапазон,
 * чтобы волны не дублировались между каскадами. Шесть длин волн на границу —
 * как в прототипе.
 */
const CUT = CASCADE_LENGTHS.slice(1).map((length) => ((2 * Math.PI) / length) * 6);

/** Что именно мешает запуску FFT-воды: показывается в консоли и в диагностике. */
export interface OceanSupport {
  supported: boolean;
  reason: string;
}

/**
 * Проверка возможностей до создания ресурсов: FFT-вода требует WebGL2,
 * MRT (в WebGL2 — ядро) и рендер в float/half-float текстуры. На WebGL1 и на
 * устройствах без плавающих render targets вода не создаётся вовсе, а сцена
 * переходит на прежний шейдер воды.
 */
export function checkOceanSupport(engine: AbstractEngine): OceanSupport {
  if (engine.isWebGPU) {
    // Шейдеры прототипа — GLSL ES 3.0; WGSL-версии каскадов нет. Молча
    // подсовывать GLSL в WebGPU нельзя: Babylon его не скомпилирует.
    return {
      supported: false,
      reason: "WebGPU: перенесённые GLSL-шейдеры FFT не переведены на WGSL",
    };
  }
  // webGLVersion объявлен в ThinEngine/Engine, в AbstractEngine его нет.
  const webGLVersion = (engine as AbstractEngine & { webGLVersion?: number }).webGLVersion ?? 1;
  if (webGLVersion < 2) {
    return { supported: false, reason: "нужен WebGL2 (texelFetch и MRT)" };
  }
  const caps = engine.getCaps();
  if (!caps.textureFloatRender || !caps.textureHalfFloatRender) {
    return {
      supported: false,
      reason: "нет рендера в float/half-float текстуры",
    };
  }
  if (!caps.drawBuffersExtension) {
    return { supported: false, reason: "нет MRT (несколько render targets)" };
  }
  return { supported: true, reason: "ok" };
}

/**
 * Расчёт волн: JONSWAP-спектр → эволюция фазы → Stockham IFFT → сборка
 * каскадов (смещения, наклоны, пена). Считается целиком на GPU.
 */
export class OceanSim {
  private readonly engine: AbstractEngine;
  private readonly renderer: EffectRenderer;
  private readonly passes: EffectWrapper[];
  private readonly initPass: EffectWrapper;
  private readonly evolvePass: EffectWrapper;
  private readonly fftPass: EffectWrapper;
  private readonly assemblePass: EffectWrapper;

  private readonly spectrum: MultiRenderTarget;
  private readonly ping: MultiRenderTarget;
  private readonly pong: MultiRenderTarget;
  private readonly cascades: MultiRenderTarget[][];

  /** Смещения (xyz) и пена (w) по каскадам, для материала поверхности. */
  readonly displacement: Texture[] = [];
  /** Наклоны (xy) и их квадраты (zw) по каскадам. */
  readonly slope: Texture[] = [];
  readonly cascadeLengths: number[] = CASCADE_LENGTH_LIST;

  /** Время симуляции, секунды. Заворачивается на OCEAN_LOOP_SECONDS. */
  time = 0;
  params: OceanParams;
  private dirty = true;
  private parity = 0;
  private initialized = false;

  constructor(scene: Scene, params: Partial<OceanParams> = {}) {
    const engine = scene.getEngine();
    this.engine = engine;
    this.params = { ...defaultOceanParams(), ...params };

    this.renderer = new EffectRenderer(engine);

    const target = (
      name: string,
      width: number,
      height: number,
      count: number,
      type: number,
      linear = false,
    ): MultiRenderTarget => {
      const rt = new MultiRenderTarget(
        name,
        { width, height },
        count,
        scene,
        {
          types: Array<number>(count).fill(type),
          samplingModes: Array<number>(count).fill(
            linear ? Texture.BILINEAR_SAMPLINGMODE : Texture.NEAREST_SAMPLINGMODE,
          ),
          generateMipMaps: false,
          generateDepthBuffer: false,
          generateStencilBuffer: false,
          drawOnlyOnFirstAttachmentByDefault: false,
        },
      );
      for (const texture of rt.textures) {
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.gammaSpace = false;
      }
      return rt;
    };

    // Спектр лежит стопкой по каскадам: 128×128, четыре ряда.
    this.spectrum = target(
      "ocean-spectrum",
      N,
      N * 4,
      1,
      Constants.TEXTURETYPE_FLOAT,
    );
    this.ping = target("ocean-fft-ping", N, N * 4, 2, Constants.TEXTURETYPE_HALF_FLOAT);
    this.pong = target("ocean-fft-pong", N, N * 4, 2, Constants.TEXTURETYPE_HALF_FLOAT);
    this.cascades = CASCADE_LENGTH_LIST.map((_, index) =>
      [0, 1].map((slice) =>
        target(
          `ocean-cascade-${index}-${slice}`,
          N,
          N,
          2,
          Constants.TEXTURETYPE_HALF_FLOAT,
          true,
        ),
      ),
    );

    const pass = (
      name: string,
      source: string,
      uniforms: string[],
      samplers: string[],
    ): EffectWrapper =>
      new EffectWrapper({
        engine,
        name,
        fragmentShader: adaptShader(source),
        vertexShader:
          "attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}",
        attributeNames: ["position"],
        uniformNames: uniforms,
        samplerNames: samplers,
        useShaderStore: false,
      });

    this.initPass = pass(
      "ocean_spectrum_init",
      INIT_FRAG,
      ["uSpecA", "uSpecB", "uLength", "uCut", "uCapFade", "uSeed"],
      [],
    );
    this.evolvePass = pass(
      "ocean_spectrum_evolve",
      EVOLVE_FRAG,
      ["uLength", "uTime"],
      ["uH0"],
    );
    this.fftPass = pass("ocean_stockham_ifft", FFT_FRAG, ["uSub", "uVertical"], [
      "uIn0",
      "uIn1",
    ]);
    this.assemblePass = pass(
      "ocean_assemble",
      ASSEMBLE_FRAG,
      ["uCascade", "uLambda", "uDt", "uFoamRecovery"],
      ["uIn0", "uIn1", "uPrev"],
    );
    this.passes = [this.initPass, this.evolvePass, this.fftPass, this.assemblePass];

    for (let index = 0; index < CASCADE_LENGTH_LIST.length; index += 1) {
      this.displacement.push(this.cascades[index][0].textures[0]);
      this.slope.push(this.cascades[index][0].textures[1]);
    }
  }

  /** Правки параметров требуют пересчёта спектра — он делается на следующем кадре. */
  setParams(partial: Partial<OceanParams>): void {
    this.params = { ...this.params, ...partial };
    this.dirty = true;
  }

  /**
   * Форсирует полный пересчёт спектра и обнуление каскадов на следующем шаге.
   * Нужен после восстановления потерянного WebGL-контекста: Babylon
   * перевыделяет render targets, но их содержимое при этом теряется, а
   * спектр считается только один раз при старте.
   */
  resync(): void {
    this.dirty = true;
    this.initialized = false;
  }

  /** Все ли шейдеры скомпилировались; используется для диагностики. */
  get compileErrors(): string[] {
    return this.passes
      .map((pass) => pass.effect?.getCompilationError())
      .filter((error): error is string => Boolean(error));
  }

  isReady(): boolean {
    return this.passes.every((pass) => pass.effect?.isReady());
  }

  /**
   * Один шаг расчёта. Возвращает false, пока шейдеры не готовы: материал
   * поверхности до этого момента не обновляется (иначе получит пустые текстуры).
   */
  update(dtSeconds: number): boolean {
    if (!this.isReady()) {
      return false;
    }
    if (!this.initialized) {
      // Первый кадр: каскады обнуляются, иначе пена начнётся со случайного
      // мусора в памяти.
      for (const pair of this.cascades) {
        for (const rt of pair) {
          const target = rt.renderTarget;
          if (!target) {
            continue;
          }
          this.engine.bindFramebuffer(target);
          this.engine.clear(new Color4(0, 0, 0, 1), true, false, false);
          this.engine.unBindFramebuffer(target);
        }
      }
      this.initialized = true;
    }

    const params = this.params;
    if (this.dirty) {
      const wind = jonswapParams(params.windSpeed, params.fetchKm);
      const swell = jonswapParams(params.swellWindSpeed, params.swellFetchKm);
      const rad = Math.PI / 180;
      this.draw(this.initPass, this.spectrum, (effect) => {
        effect.setArray4("uSpecA", [
          params.waveScale,
          params.windDirection * rad,
          params.spreadBlend,
          params.windSwell,
          params.swellScale * params.waveScale,
          params.swellDirection * rad,
          1,
          params.swellSwell,
        ]);
        effect.setArray4("uSpecB", [
          wind.alpha,
          wind.peakOmega,
          params.gamma,
          params.shortWavesFade,
          swell.alpha,
          swell.peakOmega,
          params.gamma,
          params.shortWavesFade,
        ]);
        effect.setFloat4(
          "uLength",
          CASCADE_LENGTHS[0],
          CASCADE_LENGTHS[1],
          CASCADE_LENGTHS[2],
          CASCADE_LENGTHS[3],
        );
        effect.setFloat4("uCut", CUT[0], CUT[1], CUT[2], 0);
        effect.setFloat("uCapFade", params.capillaryFade);
        effect.setUInt("uSeed", NOISE_SEED);
      });
      this.dirty = false;
    }

    // Скачок dt после возврата во вкладку срезан вызывающей стороной.
    const dt = Math.min(dtSeconds, 0.05) * params.timeScale;
    this.time = (this.time + dt) % OCEAN_LOOP_SECONDS;

    this.draw(this.evolvePass, this.ping, (effect) => {
      effect.setTexture("uH0", this.spectrum.textures[0]);
      effect.setFloat4(
        "uLength",
        CASCADE_LENGTHS[0],
        CASCADE_LENGTHS[1],
        CASCADE_LENGTHS[2],
        CASCADE_LENGTHS[3],
      );
      effect.setFloat("uTime", this.time);
    });

    let source = this.ping;
    let destination = this.pong;
    for (let direction = 0; direction < 2; direction += 1) {
      for (let step = 1; step <= OCEAN_LOG_N; step += 1) {
        const input = source;
        this.draw(this.fftPass, destination, (effect) => {
          effect.setInt("uSub", 1 << step);
          effect.setInt("uVertical", direction);
          effect.setTexture("uIn0", input.textures[0]);
          effect.setTexture("uIn1", input.textures[1]);
        });
        [source, destination] = [destination, source];
      }
    }

    const next = this.parity ^ 1;
    for (let cascade = 0; cascade < CASCADE_LENGTH_LIST.length; cascade += 1) {
      const pair = this.cascades[cascade];
      this.draw(this.assemblePass, pair[next], (effect) => {
        effect.setTexture("uIn0", source.textures[0]);
        effect.setTexture("uIn1", source.textures[1]);
        effect.setTexture("uPrev", pair[this.parity].textures[0]);
        effect.setInt("uCascade", cascade);
        effect.setFloat("uLambda", params.choppiness);
        effect.setFloat("uDt", dt);
        effect.setFloat("uFoamRecovery", params.foamRecovery);
      });
      this.displacement[cascade] = pair[next].textures[0];
      this.slope[cascade] = pair[next].textures[1];
    }
    this.parity = next;
    this.engine.restoreDefaultFramebuffer();
    return true;
  }

  private draw(
    pass: EffectWrapper,
    target: MultiRenderTarget,
    bind: (effect: NonNullable<EffectWrapper["effect"]>) => void,
  ): void {
    pass.onApplyObservable.clear();
    pass.onApplyObservable.add(() => {
      const effect = pass.effect;
      if (effect) {
        bind(effect);
      }
    });
    // EffectRenderer умеет принимать RenderTargetTexture; MultiRenderTarget
    // наследует его, но в типах 8.56.2 указан только RenderTargetWrapper.
    this.renderer.render(
      pass,
      target as unknown as RenderTargetWrapper,
    );
  }

  dispose(): void {
    for (const pass of this.passes) {
      pass.dispose();
    }
    for (const rt of [this.spectrum, this.ping, this.pong, ...this.cascades.flat()]) {
      rt.dispose();
    }
    this.renderer.dispose();
  }
}

/**
 * Babylon сохраняет явные layout-выходы WebGL2, но для MRT адаптер прототипа
 * проставляет location=0 там, где он объявлен без location. Оставлено как в
 * прототипе: без этого init-проход не собирается на части драйверов.
 */
function adaptShader(source: string): string {
  return source.replace("out vec4 outColor;", "layout(location = 0) out vec4 outColor;");
}
