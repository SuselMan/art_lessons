# Раннее движение пигмента после UP: ограниченный QA-кандидат

Actual `water-dab`, commit ab7ed61f: seal owner 2 = 20617.5 ms;
первый material reveal = 22805.5 ms, после predecessor land. Разрыв 2188 ms.
Шесть кадров от UP имеют MAX RGB delta 1; пигмент визуально неподвижен.

`hold()` получает before + startedAt=null, без pending. Production
`_advanceWashReveal` выбирает pending при startedAt=null и сразу возвращается,
когда pending отсутствует. Запуск часов на seal сам по себе не даёт нового
расчётного поля: fade к тому же source не решает задачу.

## Следующий эксперимент, физика canonical неизменна

Разделить immutable source P/C/V/coverage и отдельно эволюционирующий visual
P/C. На seal и только после seal инициализировать visual поля из собственного
материала. Каждый шаг читает оба старых P/C, пишет пару новых; нельзя случайно
читать уже записанный P. Для первого прототипа рассмотреть **существующие**
GL transport passes, портировать их новую формулу не требуется. Это ещё не
готовый код: совпадение сигнатур, условий покрытия и donor CFL требует review.

Начать с 128×128 visual сетки над тем же world rect 1024×1024. Downsampling и
preview precision являются явной аппроксимацией показа. Она никогда не
участвует в history, replay, water import, canonical finish или source recipe.
Сохранённые исходные PC/V/coverage и typed commands остаются неизменными.
После predecessor land существующий exact material rebase пересобирает source
по тем же immutable commands; visual epoch сбрасывается. После собственного
land окончательный endpoint — только original canonical target.

Visual transport надо render-композить тем же material composite, а не
распространять RGB-картинку blur: так перемещаются пигмент и цвет с ограничением
по воде. Для disconnected dry regions обязательный негативный контроль.
Не утверждать соответствие настоящей акварели по одному stencil.

## Физический ledger и барьеры

На owner: две пары PC ping-pong, water и coverage = 6 RGBA8 textures 128²,
393216 bytes. На 3 owners = 1179648 bytes. Нужна отдельная полная visual target
для held.pending: 1024² RGBA8 = 4 MiB/owner, всего ещё 12 MiB. Нельзя ссылаться
на source.presentation как на borrowed pending без изменения release-контракта:
production reveal cleanup возвращает pending в reveal pool, а physical source
имеет собственного владельца. Это доказуемый double-release/alias риск.

Предпочтение: до первого DOWN резервировать ещё три явно owned linear targets
в reveal pool ledger. Итог добавки 13.125 MiB; прежние 156+32+8 MiB сохраняются.
Никаких скрытых allocations на DOWN, никаких leases без физической identity.
Проверить максимальное число одновременно занятых original reveal slots; не
тихо поднять верхнюю границу slotCount=8 без отдельного budget доказательства.

Только sealed owner. Активное перо имеет приоритет; максимум один visual шаг
за frame. GPU стоимость пока НЕ измерена: 128² не означает гарантированное
ускорение или отсутствие backlog. Cancel/retire ждёт GPU fence и проверяет
owner token + epoch. Старый preview не может перезаписать новый epoch/pending.

## Gates перед Room-смотринами

1. CPU physical ledger, distinct inputs/outputs, immutable command/source reads,
   reset epoch, cancellation fence, отказ 4-го pending, no DOWN allocation.
2. Same-input GPU transport: nonnegative P, bounded mass drift Q8, P/C paired
   old-input ordering, no transport between separated puddles.
3. Source vs canonical target/history unchanged, actual saved packed tape.
4. Actual UP filmstrip: раннее движение до predecessor land; water-dab delta
   shape, не просто появление из прозрачности. Отдельный чистый latency cohort.
5. GPU counters/wall отдельно: visual шаги не должны задерживать canonical FIFO
   или вносить новый touch-to-pigment stall.

Если existing passes требуют полного canonical solve/domain и не имеют
безопасного отдельного material transport — сначала отрицательный feasibility
отчёт; не подменять их случайным blur/fade ради движения.

## Concrete offline port 4f9e2020

`SealedPreviewGlPort` calls shipped `wcResample` mode0 and `diffuseStep`, two
separate P/C outputs. S=8, radiusPx=8 produce one preview texel radius, king
stencil only; world origin and paper dimensions are divided by the same S.
Coverage alpha is the existing diffusion domain; reduced solvent is retained
separately but **not read by this operator**, exactly as production diffuse.
Therefore an inherited water-puddle coverage is required. A pigment-only
footprint cannot expand outside its existing domain with this pass alone.

Important negative boundary: production resample mode0 reads four texels near
q=8*destination center, not the full 8x8 source block. This is a sparse visual
reduction and may miss faint/small dabs. It is NOT mass-preserving reduction.
Do not claim source-to-preview mass equality; measure it and require nonzero
70px dab and connected water domain. If this fails, an explicit area reduction
pass or finer grid is needed; do not silently change canonical resampling.

Within a diffusion step, shared coverage/paper donor fractions move each vec4
independently; each pair flux is antisymmetric before Q8 storage, total drift
from quantization remains measured. Production bound 8*(D+B)<=.96 supports
nonnegativity; clamp and RGBA8 quantization remain the shipped expressions.
Radius1 still allows an existing diagonal endpoint face; no claim of supercover
wet-path gating. Disconnected-puddle negative must include a dry gap >=2 cells,
and separately document diagonal touching as the shipped primitive semantics.

CPU 5 tests PASS: resource aliases rejected before commands, immutable bindings
(not immutable GPU contents), old PC ordered outputs, explicit paper world
transform, idempotent retirement, no release before a matching fence ticket.
Port must supply a real GPU-idle fence; metadata does not prove completion.
Next GPU fixture MUST hash all eight original source fields before/after
init/step/reset/cancel, compare positivity/mass drift and separated domains,
then original2 saved-tape endpoint. No Room wiring and no hardware gain claimed.

## Retained water ownership before predecessor land

Concrete admission path `owner-fifo-install.mjs` sets
`initial.solventLoad = prior.lease.fields.solventLoad` (same-wash restriction),
then `PrewarmedGlOwnerPool.take(initial)` calls `source.copyTo(destination)` for
that role. The destination is the new owner's **distinct owned1024 texture**;
it is not a later borrow of canonical fields. The same GL context preserves
previous source draws → copy → new source draws command order. Admission rejects
feedback aliases and different dimensions; prior source lease remains alive
until its FIFO land/cancellation fence. No readback/fence is needed on DOWN for
this immutable snapshot copy. Actual GPU contents are still a required gate.

Later own material source chunks merge new solvent film over that retained own
base. Preview reduction after seal reads own `solventLoad` only; it derives
visual donor coverage alpha from `clamp(V.b/max(V.a,.002),0,1)` for V.a>.002.
It must not use `source.coverage` alpha as substitute for inherited water.
This conversion is **presentation approximation**, not canonical domain code.

A predecessor land can trigger exact source rebase and mutate own retained
material under a new epoch. Before that mutation, preview must stop producing,
ensure any issued old preview commands precede rebase in GL command order, then
reset its epoch and reinitialize from the newly owned source. Cancellation must
retain physical resources until true GPUidle; matching metadata alone is not
an implementation of that fence. Preview output is never used by canonical.
