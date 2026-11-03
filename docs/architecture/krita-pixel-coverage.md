# Krita Pixel: карта реализации и оставшихся механизмов

Срез: `c1cda464ea9251e623d127b0c8dfa24038612528`; эталон законов — Krita
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`. Это карта кода для завершения
**Pixel / defaultpaintops brush**, а не объявление поддержки всех кистей или
план очередных аппаратных проверок. В этой итерации — только реализация кода;
тесты, браузеры, устройства и сборки приложения не запускались.

Принцип: один source author с общими option/query/RNG/distance kernels выдаёт
разрешённые готовые DRAW/recipes/fences; replay исполняет запись, не повторяет
кривые, случайность или состояние указателя. Общие source/context/resource/cost
контракты расширяются по механизмам, без имён пресетов, подмены descriptor и
отдельного renderer на каждую кисть. «CPU есть» не означает «публичный путь готов».

## Условные обозначения

- **Интеграция**: основной алгоритм уже существует, но отсутствуют конкретные
  admission, авторский адаптер, ресурсный или записанный путь.
- **Частичная реализация**: есть ограниченный kernel/legacy-путь, но отсутствует
  часть исходной семантики. Нельзя решить снятием guard.
- **Реализация**: необходим новый алгоритм/источник данных/ресурсная семантика.
- Ни одна строка не даёт нового READ/AUTHOR-разрешения. Старые записи и законы
  сохраняются; новый reader floor устанавливается до публикации новой истории.

## Полная карта направлений Pixel

| Механизм | Что действительно есть в текущем коде | Что осталось реализовать / подключить |
|---|---|---|
| Default Auto: circle/rectangle, fade, AA, ratio | `sourceDefaultAutoDab`, shared `sourceAutoGeometry`, native coverage profiles, canonical mask/cache/prepass. Закрытые исходные формы исполняются | **Частично:** spikes≠2 и native mask randomness закрыты. Density имеет отдельный seeded Default kernel, не универсальное разрешение на стохастические формы. Полный набор mask generator параметров требует собственных законов, не fallback circle |
| Gaussian Auto | `sourceGaussianDab`, коэффициенты/erf/native profiles, исходный compiled2 и текстурный compiled3; обычный и7 source kernel | **Интеграция:** rotating Gaussian storage helper уже committed; plain Scatter+DrawingAngle/fan admission и все read/capacity callers ещё не подключены. **Реализация:** иные закрытые параметры mask generator |
| Soft Auto | `sourceSoftCircleDab`, radial native compiled curve, closed plain/texture kernels | **Интеграция:** более широкие механизмы через те же kernels. Сохранить radial/source/profile correspondence; наличие произвольной кривой не означает её компиляцию |
| PNG/GBR alpha mask, pyramid/crop/transform | Оригинальный inverse-gray source, integer pyramid/LOD, crop, image geometry/transform/coverage, canonical image budget | **Интеграция:** image SizeTilt/RotationTilt и texture8 author binding. **Частично:** изображение с brightness/contrast/midpoint/autoadjust вне исходного закрытого контракта; не заменять его текущим alpha mask |
| Color-stamp / lightness-map image | Есть legacy `lightnessMaterialColor/Coverage/Mips`, color helpers; importer различает image material | **Реализация canonical closure:** двухканальный/цветной source, foreground alpha/color semantics, профили/LOD/ресурсные pins, recorded recipes и source-aware composition. Single inverse-gray PNG extractor намеренно отвергает `tip.material` |
| Imagepipe GIH | Incremental и random selection в author/cache, исходные frame assets, последовательный RNG и canonical image frames | **Интеграция/частично:** закрытые существующие selectors не равны всей системе GIH ranks/selection modes. Для иных dimensions/pressure/angle/random combinations нужны явные selection laws и bounded frame ownership; не выбирать кадр снова при replay |
| Кривые и комбинации сенсоров | `sourceOption`, `sourceOptionProgram`, `sourceCurve`; native compiled option tables, curveMode/strength/min/max; независимые sequential и per-stroke RNG | **Интеграция:** разрешать только consumers с готовым renderer/resource domain. **Реализация:** отсутствующие native compiler/provider inputs нельзя заменить линейной кривой или synthetic compiled metadata |
| Pressure / maximum pressure | Query kernel и обычный ingress есть; Size/Opacity/Flow работают в закрытых путях | Сохранить maxPressure registration order, early returns и indirect opacity. Подключение прочих option consumers — **интеграция**, не новый sensor kernel |
| Tilt X/Y, elevation/direction; DrawingAngle/locked angle | `sourceSensors`, native input history/fan; camera-aware source/world rotation для известных Auto/plainTilt | **Интеграция:** image tilt, Gaussian drawing-angle closure. Camera0/45/90 и mirror interplay должны проходить один закон. Нельзя переносить viewport rotation в записанный мировой рецепт дважды |
| Speed, barrel rotation, tangential pressure, perspective, elapsed time/distance/dab sequence | CPU sensor laws есть; browser packet сейчас передаёт speed0, rotation0, tangential0, perspective1; author ведёт time/distance/sequence | **Реализация ingress:** настоящее нормирование speed/native units, доступные pen fields и их отсутствие/defaults. Только затем admission. CPU evaluator сам не создаёт отсутствующую физическую величину |
| Fuzzy per dab / per stroke | `nativeRandom`, `sourceOption` ведут sequential stream и keyed per-stroke source; порядок sensor construction фиксирован, checkpoint сохраняет оба | **Интеграция:** соответствующие consumers и исходные sensor combinations; fuzzy не заменяет Scatter/density. Нельзя брать новый seed на Copy/yield/replay |
| Scatter | `sourceScatter`, query ordering и native geometry: оба axes2 RNG draws, single axis1 с Qt/F32 rounding; lazy disabled path; source author checkpoint | **Интеграция:** genuine Pencil1/2 Gaussian WASH с pressure Scatter и fan90. Позиции уже записываются; server RNG не нужен. Удержать target/tile fanout/work/CPU limits. Scatter≠density≠mask randomness≠Spray |
| Mirror | Native option/query kernels, material vs spacing mirror, saved mirror bits в recipes | **Интеграция:** закрытые pointer/source consumers ещё отказывают checked Mirror. Нужны общий camera parity/geometry/cache/Copy/checkpoint и соответствующие read bounds; не использовать второй spacing-only Mirror как материал |
| Spacing и fan corners | Native distance loop, automatic/manual/isotropic spacing, refresh, angle history, fan-before-normal; bounded cursor и очередь запросов | **Интеграция:** разрешение полного известного домена с source-specific bounds. Fan0t — отдельный paint request; нельзя убрать его из-за симметричной формы. **Частично:** независимый child input policy пока не исполнен |
| Airbrush / ignore distance / Rate | `SourceDistanceTiming`, source timing interval, Rate query и author refresh state существуют | **Реализация production producer:** monotonic elapsed-time scheduling без MOVE, pause/up/cancel/visibility и bounded backlog; deterministic emitted draw sequence/checkpoint. Нельзя открыть timing flag на event-only pointer path |
| Texture preparation | Импорт сохраняет period/crop/offset/POT padding; weighted gray + alpha-to-white + brightness/contrast/neutral/invert/cutoff preparation. Bank raw L8/root leases есть | **Частично:** PIL resampling не тождествен native Qt; downsample/clamped offsets помечаются unsupported. AutoInvertOnErase отсутствует. Проверять provenance preprocessing; texture alpha не primary inverse-gray, двойная инверсия запрещена |
| Texture hard Subtract | Закрытые material3–7, fixed/pressure/curve/native-default strength, saved phase и program/source bindings | **Интеграция:** новые комбинации источника/сенсоров через существующие законы; old ties-even неизменен. Не расширять old entrypoints неявно |
| Texture hard Multiply | Новый scalar half-up/mul3, material8 codec, standalone snapshot, lower Composite и named Executor8 committed | **Интеграция:** source8 binding/compiler role/adapter/encoder; named mixed recorded attachment, original read/author/server/frontend/cutover. Genuine Pencil5 ещё не допущена. Byte strength вычисляется один раз author и записывается, replay не вычисляет давление |
| Texture soft modes / прочие texture operators | Pinned native masking factory/texture source описывают отдельные soft laws и операции; current canonical paths их не реализуют | **Реализация:** explicit law+quantizer union для soft Multiply/Subtract и требуемых других native texture modes, потом source/resource/codec/author closure. Не заменять soft hard-операцией, strength0 не означает универсальный bypass |
| Wash / buildup / opacity / flow | `sourcePainterOpacity`, `sourcePrimaryComposition`, OVER/alphaDarken CPU laws; canonical target/composite, mixed coordinator, frozen snapshots/prefix replay | **Интеграция:** material8 в SAME lane/owner/candidate/handoff. **Частично:** не весь native composite registry/цветовые пространства; unsupported outer blends нельзя переименовать normal/OVER. Замена стабильного результата требует полного baseline и exact close |
| Masking brush / dual | Author умеет две roles, независимые distance/cache/options/fan state, SAME RNG pair; adapter/fences и legacy dual metadata есть | **Реализация coherent canonical closure:** master-size ownership, абсолютный/relative child size, independently timed/input child, source bundle/context, mask+primary pairing, supported mask composite law, budgets и cancellation. Shared extractors намеренно отказывают dual; legacy approximation не готовый native путь |
| Color sources / dynamic HSV/HSY | `sourceColorRgba8` и color native arithmetic helpers; importer/legacy behavior сохраняют часть modulations | **Реализация/интеграция:** native plain/gradient/pattern/random/color-source provider, foreground/background and color-space semantics, per-DRAW captured pigment/material color, recorded deterministic result. `source-color-provider-unresolved` нельзя убрать без provider. Цветовой kernel отдельно не является producer |
| Lightness/softness/sharpness options, threshold | Legacy lightness/threshold и отдельные coverage helpers существуют; raw settings частично сохранены | **Реализация canonical option consumers:** native order/alpha/color effect, dynamic size/softness mask identity, source cache/cost and resource representation. Canonical source effect guards отказывают alphaThreshold и ряд эффектов, source author material пока softness1/lightness1/sharpnessfalse |
| Eraser / blend modes / gamma-luminance / edge effects | Legacy editor имеет дополнительные эффекты, canonical profile выбирает конкретные проверенные законы | **Частично/реализация:** source-aware eraser/texture auto-invert, native blend registry, color-space conversion и edge effects в recorded composition. Gamma/luminance/wetMix/edgeBleed/grain/taper не поддерживаются canonical admission автоматически |
| Масштаб UI и lifetime | Prepared source/root/runtime, LOD/cost/reservations, source SHA/fullcontext, BEGIN/FIFO/Undo/cold infrastructure существуют | **Интеграция:** обычный size slider пока закрыт native-size equality; нужен единый source scale capacity+prepared runtime policy без подмены original descriptor. Release/reprepare/camera/RNG state и bounded overlap обязательны для каждого механизма |

Отдельно полный native texture mode frontier: `MULTIPLY`, `SUBTRACT`, `DARKEN`,
`OVERLAY`, `COLOR_DODGE`, `COLOR_BURN`, `LINEAR_DODGE`, `LINEAR_BURN`,
`HARD_MIX_PHOTOSHOP`, `HARD_MIX_SOFTER_PHOTOSHOP`, `HEIGHT`, `LINEAR_HEIGHT`,
`HEIGHT_PHOTOSHOP`, `LINEAR_HEIGHT_PHOTOSHOP`; `LIGHTNESS` и `GRADIENT` идут
отдельными ветками с сохранением alpha/цветовым ресурсом. На canonical пути
реализованы hard Subtract и новая hard Multiply, остальные требуют своих законов
и ресурсных consumers; общий masking factory не означает готовность всех texture
режимов. Gradient требует настоящего captured gradient/color source, не alpha LUT.

## Опорные native источники и текущие границы

Pinned Krita: `plugins/paintops/defaultpaintops/brush/kis_brushop.cpp` (paintAt/query),
`plugins/paintops/libpaintop/kis_brush_based_paintop.cpp` (spacing/material),
`libs/image/kis_paintop_utils.h` и `kis_distance_information.cpp` (fan/distance/time),
`plugins/paintops/libpaintop/KisScatterOption.cpp`, `KisRotationOption.cpp`,
`kis_texture_option.cpp`, `libs/ui/tool/strokes/KisMaskingBrushCompositeOp.h` и
`KisMaskingBrushCompositeOpFactory.cpp` (texture/masking laws),
`libs/pigment/KoIntegerMaths.h` и `KoColorSpaceMaths.h` (integer/color composition).
Официальная база ссылок: `https://github.com/KDE/krita/tree/bd6e8d061d2f0388c5b10278786cf0fe62e3135f`.
Локальные exact source pins/native provenance уже лежат в существующих source
fixtures/R52 reports. GPL reference код не копируется в production.

Точки единого изменения: shared `canonicalBrushCapability`, source DATA/schema и
source bindings; `sourceStrokeAuthorDescriptor` / `sourceStrokeAuthor` /
`sourceStampQuery` / `sourceStrokeMaterialAdapter` / `sourceCanonicalFrameEncoder`;
`canonicalAutoCapacity` / `canonicalImageCapacity`, `CanonicalMaskSourceBank`,
`TransformedMaskPrepass`, `CanonicalRgba8CompositePass`, `CanonicalFrameExecutor`,
`CanonicalWashLayerCoordinator`; затем engine ingress, original read lifetime и
server admission. Не снимать guards раньше наличия соответствующего consumer.
Protected `sourceDefaultAutoVectorShader.ts` в этом аудите не читался.

## Приоритеты реализации — сначала код, без очередного QA-цикла

1. **Закрыть image+Multiply/source8 целиком:** ownDATA capability + genuine source
   binding, исходный compiled2, fixed saved phase, image tilt/camera, byte strength,
   author adapter/encoder и named mixed recorded attachment. Продолжить SAME
   owner/resource/program model; старые3/7 не переписывать. Это открывает механизм
   Pencil5, а не отдельное исключение по её ID.
2. **Plain dynamic geometry:** Gaussian Scatter+DrawingAngle/fan+Mirror с готовыми
   kernels, rotating capacity и explicit read/author contract; затем native-size
   slider через тот же source scale/budget model. Не добавлять ещё один renderer.
3. **Timed producer:** завершить elapsed-time airbrush/Rate/ignoreDistance state
   machine поверх существующего author и FIFO с bounded ownership.
4. **Dual/masking closure:** master/child geometry, independent streams, composite
   operator, one shared RNG sequence, source roots и recorded fences.
5. **Остальные материал/цветовые механизмы:** soft texture и оставшиеся texture
   laws, lightness/color stamps, source color providers/dynamic color,
   softness/sharpness; затем оставшиеся Auto mask parameters и composite laws.
   Расширять формат по смысловым данным, а не по номеру очередного пресета.

Фаза «код без тестов» не превращает незапущенные проверки в PASS. В этой карте
нет нового процента готовности. Каталог125 содержит исторические/QA revisions;
36 pure admission positives старого среза — не36 production brushes, а27 ранее
проверенных пресетов — не покрытие всего Pixel.19 пропущенных importer engines
(Spray/Deform/Sketch/Filter и прочие) **вне Pixel**; их нельзя включить в обещание
завершить Pixel или объявить исправленными через Scatter. Production deploy,
новый каталог, protocol/runtime cutover и Grafetto push здесь не выполнялись.

## Реализация 3 ноября: незапущенный код

После исходного среза добавлены общие контракты source2/source8, независимые
READ/AUTHOR-политики protocol10, оригинальные CAS/SHA-привязки и смешанная
recorded-доставка. В рабочем дереве реализованы динамическая Auto-геометрия
(включая spikes2..64), primary/mask planes, первые10 alpha masking operators,
source2 buildup/erase, парные lightness/RGB ресурсы и их LOD/prepass, material
options и per-DRAW RGB. Новые параметры записываются автором; replay не повторяет
sensor/curve/RNG-запросы. Ввод получает доступные twist/tangential и нормированную
скорость в координатах вида; timed airbrush имеет отдельный bounded producer.

Это **код в интеграции**, а не подтверждённая визуальная совместимость. После
крупного блока frontend production typecheck (607 roots) нашёл12 диагностик;
причины исправлены, повторная проверка назначена после следующего связного блока.
Server production typecheck (67 roots) завершился без диагностик. Тесты,
приложение, устройства и производственная сборка в этой фазе не запускались.

Сейчас единый texture8 расширяется до image/Auto +14 hard/soft alpha laws через
одну реализацию с параметром режима. Старые3–7 сохраняют свои законы; история
выбирает версию по исходной записи. Следующие незавершённые области: полный
GIH selection/ranks и цветные pipes, mask randomness/density для всех Auto,
color-source/gradient providers, texture LIGHTNESS/GRADIENT, UI source scale
с записанной неизменяемой идентичностью и оставшиеся composite/color-space laws.
Число подтверждённых кистей и состояние тестового стенда этим кодом не изменены.

Следующий кодовый checkpoint: production typecheck клиента —611 roots/0 diagnostics,
сервера —67/0; общий контракт перед ним —66/0. Включены общий image/Auto texture8,
многомерный GIH и выбранный sourceScale через подготовку, BEGIN, frame и snapshot.
После этого продолжается реализация ColorSource: uniform random и gradient RGBA.
Эти результаты компиляции не подтверждают визуальное поведение или отзывчивость.

### Pixel CODE FIRST: цветные текстуры, 3 ноября

Lightness/Gradient получили явные gray/alpha ресурсы и захваченный на START
RGBA LUT; BEGIN, кадры и сохранение истории несут ту же таблицу.
Сервер: 67 production roots, 0 diagnostics (compile11); shared: 67, 0
(compile15). Frontend compile9: 613 roots, 7 diagnostics; исправления в работе.
Это проверка типов, приложение, тесты и устройства не запускались.
Остаётся отдельный spatial color путь для total_random и pattern/lockedpattern;
один записанный цвет даба его не заменяет.

Frontend compile11 завершён: 613 production roots, 0 diagnostics.
Текущий блок ColorTexture компилируется во всех трёх пакетах; поведение ещё
не проверялось.
