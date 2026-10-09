# ONE GL400: план допуска к замеру

Статус: OFFLINE. Три prerequisites реализованы, CPU preflight PASS; аппаратный запуск только после allocation и review. База timing a5562f7d + follow-up.
Manual5381 и xvnlQGhW не используются. Нет нового frontend/backend/device.

Реализованные prerequisites (проверить actual served bytes до запуска):

1. Ordinary Room DEV option должна реально передать diagnosticGlTiming в constructor;
   проверять фактический engine observer и source/parser SHA, а не наличие query.
2. Ring export должен содержать capacity/recorded/dropped/observerErrors. Для полного
   tape недостаточно молчаливого eviction. Собирать source/scratch/import/drain
   только внутри synchronous DOWN scope, чтобы moves и idle/replay не вытесняли
   нужные записи. Display outside DOWN отдельно bounded и явно отличим.
3. Первый pigment marker только для положительного submitted pigment dose;
   нулевая вода тоже исполняет ink pass. Marker не доказывает видимые pixels.

## Contextless допускающие проверки

- Parser DEV/prod/duplicate flags/incompatible native; constructor opt-in identity,
  OFF observer null; противоречивые режимы reject до expensive initialization.
- Фиксированный Fixed400Tape: QAwater001/QApigmt002, production mottleSeed по
  неизменному ID, один preset normal:100:100:PB29:round, size400, pressure .8;
  production PointerInput→DabSystem CPU path уже существует в Fixed400Production.
- Не пропускать trajectory samples при позднем RAF; минимум authored offset,
  реальные RAF и scheduler часы, без clock override. Временной интервал между UP
  первого и DOWN второго минимальный последовательный: никакого idle ожидания.
- Wet payload проверять отдельно: одинаковая записанная geometry не гарантирует
  одинаковые wet bytes при разных длительностях RAF. One run не paired equality.
- Negative guards: missing observer, empty positive pigment trace, dropped>0,
  observerErrors>0, missing actual pending, mismatched preset/target/color/IDs,
  flags stale vs runtime — INCOMPLETE/INVALID, не performance regression.

## ONE аппаратный сценарий после allocation

Один own frontend отдельного WT, shared4558; один own room, одна Surface context.
FreshRAM>=1700MiB, passive wait<=30s, abort<500MiB, hard120s, без retry.
Разрешение root требуется после native RELEASE. Trusted CA; own forward9352,
не запускать новый backend/DB и не трогать пользовательский Chrome.

Source passport до context: Engine, PointerInput, DabSystem, RibbonStrokePainter,
RibbonStrokeScratch, WatercolorSettleQueue, watercolorPresets, paperWetness,
Room+actual parser, timing helper, fixed tape+controller; paper/noise bytes отдельно.
Проверить actual constructor DEV timing ON / joinedTouch ON / mixedLease ON /
native+async+deferred OFF. Сохранить IDs, seeds, presets, pressure, packed dabs/wet
hashes после input; не исправлять/нормализовать их задним числом.

Первый фиксированный мокрый pigment400, сразу второй другого цвета400. Оба
trajectory полностью воспроизведены. Перед вторым DOWN записать pending и wash
identity; после него actual lease/admission choice + drain spans. Lease fallback
не считать accepted: классифицировать отдельно, с причиной eligibility.

Сохранять компактно: firstDOWN, secondDOWN begin/end, positive first-pigment
submission, display submission, UP/recovery RAF gaps, ring stats/rows и actual
op counts/hashes. Drain/generator/import/scratch/liveComposite spans nested,
не складывать их как exclusive CPU time. Глобальный RAFgap без CPUspan coverage
— unexplained wall stall, не доказанный GPU wait. Ни finish/readPixels/fence,
ни тяжёлые captures внутри timed input. Final readback только после измерений.

Durable artifact сохранить ДО assert/finish; partial stage/last await тоже.
Finally bounded own context/forward/frontend cleanup; RELEASE сразу независимо
от offline анализа. Итог — CPU submission attribution одного сценария, не
physical stylus latency и не общая оценка ускорения.


## Подготовленный contextless gate

`docs/qa/harness/728-gl-timing/GlTiming400Gate.mjs` принимает actual exported
ring/stats и ожидаемые два stroke IDs, user/layer, actual pending-before-second.
Проверяет positive owned source→display→DOWN end, lease decision, dropped/errors0
и отсутствие противоречия lease+drain. 4 negative/positive Node tests PASS.
Тесты runtime parser→actual Engine constructor и zero-pigment water PASS.
Это допускающий контракт, не исполненный hardware controller.
