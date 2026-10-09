# GL: ограниченное наблюдение старта мазка

DEV opt-in `new PencilEngine(canvas, { diagnosticGlTiming: true })`.
По умолчанию и в production наблюдатель отсутствует: нет новых чтений часов,
записей ring или диагностических closures на пути OFF. Строгий DEV query `wcGlTiming=1` проходит через Room watercolorQaOptions в constructor; production игнорирует его. Native/async/deferred/mixed presentation запрещены.
Manual frontend 5381 использует прежнюю рабочую копию и не изменён.

`getDiagnosticGlTiming()` вызывается после input и отдаёт независимую копию
последних 1024 записей. `getDiagnosticGlTimingStats()` сообщает capacity, recorded, dropped и observerErrors. Только синхронные DOWN и captured-owner UP открывают scope; moves, idle, replay и standalone display его не открывают. Record.scope различает down/up, а UP сохраняет actual stroke ID до завершения observer scope, даже когда engine уже очистил ID. Каждый DOWN получает engine-local input ordinal и actual userId/layerId; после создания actual strokeId source/display записи также содержат этот ID. Admission до создания strokeId имеет null; ordinal не глобальный multiuser ID. Span содержит start/end,
phase и необязательное числовое value; admission-lease: 1 принят / 0 не принят.
Фиксируются admission drain, полный DOWN (включая первый display и callback),
исчерпывание live generator, foreign-water import, scratch first-touch/base copies,
первый pigment submission, live composite и display submission.

Это elapsed CPU-side scope, а не GPU execution или физическая видимость.
Особенно foreign import, если его generator используется sliced replay, содержит
паузу между yields: для причин старта брать span внутри синхронного
`live-generator-exhaust`, а не трактовать все записи как exclusive CPU time.
Первый pigment marker ставится после фактического nib draw mode7 только при положительных opacity/deposit и inkStrength; bands отдельно не используются как свидетельство positive dose. Это positive submitted nib dose, не гарантия Q8 nonzero или pixels.
Display фиксируется только внутри synchronous DOWN/UP, с captured owner; последующие rAF frames не привязываются по последнему ordinal. Scratch spans включают lookup и могут быть cache hit; название не означает, что
каждый вызов выделил GPU ресурс. Admission complete span может также возникать
на UP/служебной границе; input ordinal не заменяет фазу вызова.

Ошибки диагностических часов изолированы; исходный material exception сохраняется.
Математика, порядок draws/copies, scheduler и lifecycle не изменены. Нет readback,
finish/fence, clock override, новых таймеров или устройства в этой проверке.

CPU validation: actual pointer path source-before-display, OFF observer absent,
bounded eviction/export ownership, original error identity, clock failure through
actual stroke+destroy; существующая joinedTouch/queued-history lifecycle матрица.
GPU/пиксельная/латентность проверка этого instrumentation ещё не проводилась.


UP prototype добавляет geometry/tail paint/full finish и nested capture/live
composite/reveal copies/diffusion preparation/new solver start+stitch, display,
pack/log/local+live callbacks/pending commit/settleLayers/strokeEnd callback.
UP scopes без соответствующего actual owned DOWN fail closed для observer,
сам исходный runtime остаётся исполняемым. Первый positive pigment marker только
в DOWN. DOWN gate фильтрует scope, чтобы UP drain не считался admission drain.

ONEGL32a evidence исторически относится к DOWN-only recorder (23 records); новая
UP версия ещё не проходила аппаратный замер. Указанные110.7/43.0 не приписаны
новым leaf phases задним числом. Nextcontroller сохраняет actual firstUP return/
secondDOWN begin и read-only beforeSecond center/eligibility wet с real clocks;
эти значения не названы whole-nib wet payload или предписанным100ms gap.
