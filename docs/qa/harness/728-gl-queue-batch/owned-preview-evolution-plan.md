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
