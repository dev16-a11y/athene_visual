# Сторонний код в модуле воды

Вода акватории (`client/src/scene/water/`) — перенос из прототипа, который
использовал адаптированный код Ultra-Water. Ниже — что именно взято и под какой
лицензией.

## Ultra-Water

- Репозиторий: https://github.com/Humpalumps/Ultra-Water
- Лицензия: MIT, текст в [ULTRA-WATER-LICENSE.txt](ULTRA-WATER-LICENSE.txt)
- Коммит, от которого сделан перенос: `30ea65ecb0a66b137aa200d099965634bdd84d51`
  (машинночитаемая копия — [ultra-water-upstream.json](ultra-water-upstream.json))
- Использовано в: `client/src/scene/water/oceanShaders.ts` (спектр JONSWAP,
  направленность, каскады, Stockham IFFT, сборка смещений/наклонов/пены) и
  `client/src/scene/water/oceanSim.ts` (порядок проходов и параметры).
- Изменения относительно оригинала: разрешение каскадов снижено с 256² до 128²,
  расчёт выполнен на Babylon.js `EffectRenderer` / `EffectWrapper` /
  `MultiRenderTarget` вместо three.js.

```
MIT License

Copyright (c) 2026 Humpalumps
```

Полный текст — в [ULTRA-WATER-LICENSE.txt](ULTRA-WATER-LICENSE.txt).

## Материал поверхности

`client/src/scene/water/surface.ts` — материал из прототипа акватории (его
собственная реализация поверх результата FFT), а не из Ultra-Water. В нём
сохранены процедурное небо и хеш-шум прототипа; уведомления, которые прототип
приводит для своих прочих частей (three.js, UnrealEngineSkyAtmosphere, AgX из
Filament), к перенесённому коду не относятся — эти части в проект не попали.

## Babylon.js

- https://github.com/BabylonJS/Babylon.js, лицензия Apache-2.0.
- Подключается как npm-зависимость `@babylonjs/core` 8.56.2, копия в репозиторий
  не добавлена.
