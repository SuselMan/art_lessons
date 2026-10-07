# #728: изолированный WebGL2 adapter и paired brush MRT

Прототип OFF; default engine context остаётся WebGL1. Не production migration.
Основан на source62db047b; root имеет эквивалентные предыдущие diagnostics.

## Включение

Новый engine на свежем canvas: `new PencilEngine(canvas, { ...options, diagnosticWebgl2: true })`.
Без WebGL2 бросает ошибку; скрытого fallback в другой backend нет.
Room не включает опцию и нет production query flag.

После init/paperReady: `engine._watercolorPasses.warmBrushMrt()`; затем
`engine._watercolorPasses.diagnosticBrushMrt = true`. False оставляет обычную пару
brushPass на том же native WebGL2 context — контроль syntax-only против MRT.
Первый MRT FBO completeness check выполняется на первом pulse; warm исключает
shader compile, но не этот первый driver sync. Не приписывать его solve work.

`brushPairStats`: pairs (каждый заменяет2draws одним), fallbacks, pixels
(сумма scissor area). Поле должно быть одинаковым в сравниваемых scenarios;
две исходные copy-back операции сохраняются после pair, chronological ordering
не меняется. Не уменьшаются contacts, substeps, diffusion iterations или Q8 writes.

## Adapter subset

Единственный underlying native WebGL2 context владеет всеми engine textures,
framebuffers и canvas. Proxy только связывает native receiver и переводит API:
- shaderSource: version300, attribute→in, varying→out/in, texture2D→texture,
  gl_FragColor→location0 output; все literal production shader exports проходят
  CPU syntax transformation test. Уже300 source не преобразуется повторно.
- EXT_blend_minmax→core MIN/MAX, ANGLE instancing→core entrypoints.
- LUMINANCE/LUMINANCE_ALPHA/ALPHA Uint8/null uploads→RGBA bytes с исходными
  sampler semantics; aligned source rows/UNPACK_ALIGNMENT учтены. Restore
  сбрасывает tracked alignment4. Неизвестные legacy overloads fail closed.

Это сознательно ограниченный адаптер известных engine API, не общий WebGL1 shim.
Легаси RGBA expansion требует paper примерно2×, luminance planes4× texture
storage и дополнительного CPU расширения при соответствующей upload. Native
filtering/mipmap и MAX route должны быть проверены аппаратно; обычная версия
на vendor без WebGL1 EXT_blend_minmax имела иной fallback, поэтому не обещается
идентичность всех devices/routes только на основании core availability.

Нет вторичного context, readPixels, upload pixels на каждый MRT pulse либо
cross-context blit. Поэтому это путь к настоящему сокращению GPU brush work.

## MRT операция

Source соответствует root verified fixture (`728-webgl2-brush/shaders.mjs`).
Консервативные integerFraction/channelLimit функции unchanged production.
В каждом из четырёх направлений outgoing/incoming вычисляются один раз по
unchanged pre-contact pigment/color. Затем оба record результата обновляются
в исходном арифметическом порядке, записываются одновременно в две RGBA8
attachments. Floor-byte переносы и общая capacity bound сохранены; source/output
alias и размеры проверяются. Оба outputs получают обычную mip invalidation.
Pooled textures после pulse отсоединяются от долгоживущего MRT FBO; init/restore/
destroy освобождают program/FBO. WebGL1 маршрут не компилирует MRT и fallback
остаётся исходной парой draws.

Изолированный benchmark root показал ~42% timer improvement с identical fixtures.
Это НЕ результат для полного engine: framebuffer attachment setup/detach,
legacy adapter overhead и остальные passes могут изменить end-to-end benefit.

## Проверки и незавершённые gates

98 tests/2 files проходят, включая обычный Plan и новые5 adapter/MRT tests:
production shader syntax subset, aligned L/LA/A channel bytes, restore alignment,
native receiver/core extension bindings, conservative MRT expression, GL1 fallback.
Это CPU/source tests, **не реальная компиляция/растеризация GLSL300**. Offline GPU
compiler здесь не установлен; actual shader link выполняет аппаратный root.
Web typecheck, oxlint и map:check также обязательны перед включением на стенде.

1. Salted actual link всех programs на Surface, затем Samsung. GL alive/error0;
   проверить первоначальный paperReady, draw400, water-only и foreign-water.
2. Full engine WebGL1 vs WebGL2 syntax-only baseline: intermediate material
   RGBA records, whole tile/layers/export, undo/redo/newFilm. Отдельно pressure,
   round/chisel, old preloaded snapshot и context restoration. Не тестировать
   на пользовательских комнатах до проверки свежего isolated room.
3. Syntax-only vs MRT: все records/export exact, одинаковые ops/ACK/REST, draw
   count уменьшается наpairs. Проверить двухцветный/contact-return сценарий.
4. GPU timer/coarse trace и start/UP latency; first FBO check учитывать отдельно.
   Browser Viz/Skia gap мог иметь другую причину и здесь не объявлен решённым.

До этих gates прототип не предназначен для пользователя или production main.
