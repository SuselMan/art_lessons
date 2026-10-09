# GL: ограниченное наблюдение старта мазка

DEV opt-in `new PencilEngine(canvas, { diagnosticGlTiming: true })`.
По умолчанию и в production наблюдатель отсутствует: нет новых чтений часов,
записей ring или диагностических closures на пути OFF. Нет query/UI activation.
Manual frontend 5381 использует прежнюю рабочую копию и не изменён.

`getDiagnosticGlTiming()` вызывается после input и отдаёт независимую копию
последних 256 записей. Каждый DOWN получает input ordinal. Span содержит start/end,
phase и необязательное числовое value; admission-lease: 1 принят / 0 не принят.
Фиксируются admission drain, полный DOWN (включая первый display и callback),
исчерпывание live generator, foreign-water import, scratch first-touch/base copies,
первый pigment submission, live composite и display submission.

Это elapsed CPU-side scope, а не GPU execution или физическая видимость.
Особенно foreign import, если его generator используется sliced replay, содержит
паузу между yields: для причин старта брать span внутри синхронного
`live-generator-exhaust`, а не трактовать все записи как exclusive CPU time.
Первый pigment marker ставится после фактического draw submission nib/bands.
Scratch spans включают lookup и могут быть cache hit; название не означает, что
каждый вызов выделил GPU ресурс. Admission complete span может также возникать
на UP/служебной границе; input ordinal не заменяет фазу вызова.

Ошибки диагностических часов изолированы; исходный material exception сохраняется.
Математика, порядок draws/copies, scheduler и lifecycle не изменены. Нет readback,
finish/fence, clock override, новых таймеров или устройства в этой проверке.

CPU validation: actual pointer path source-before-display, OFF observer absent,
bounded eviction/export ownership, original error identity, clock failure through
actual stroke+destroy; существующая joinedTouch/queued-history lifecycle матрица.
GPU/пиксельная/латентность проверка этого instrumentation ещё не проводилась.
