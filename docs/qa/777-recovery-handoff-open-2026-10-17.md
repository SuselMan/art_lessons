# #777: потеря отложенного recovery при смене доски — OPEN

Source candidate: 6967f6ee (#776); исправления #777 не внесены.
Baseline реальных Outbox + createOutboxVerdicts + createLostWorkBatcher + двух
engine: исходный Pencil stroke имеет ненулевые actual MockGL pixels;
target_gone удаляет его из done-журнала и IndexedDB; batch содержит один timer.
reset до quiet800ms очищает batch, callback recovery не вызывается. Ни в старом,
ни в новом engine нет recovery-stroke, durable storage пуст. Обычный тест FAIL
именно на последнем survival assertion (прочие условия выполнены); сохранён
как `it.fails('OPEN #777...')`, чтобы явно фиксировать неисправленное поведение.
Это общая content-pipeline ошибка, не GPU-сертификация акварели.

## Минимальный кандидат для отдельного обсуждения

Граница завершения verdict должна означать durable handoff, а не постановку
в RAM debounce: Outbox сохраняет ownership original payload до завершения
awaitable recovery callback. Callback завершает Promise после записи replacement
operations/intent в storage под captured OLD boardId, не после server ACK.
Текущий OutboxStorage уже хранит полный Operation + roomId, но не знает фазу
permanent-rejected/awaiting-recovery. Просто оставить исходную pending-запись
нельзя: resendAll повторит окончательно отклонённую operation. Нужен явно
обсуждённый terminal-recovery marker/переход или атомарный storage handoff.
Одних перестановки await и существующих put/delete недостаточно для crash-safe
замены: crash между записью replacement ops и удалением original может создать
дублированное recovery; обратный порядок теряет payload. Новый object store
не обязателен, но контракт OutboxEntry/хранилища и replay после reload меняется.
Ночью этот cross-module contract не реализован.

MAX_CONCURRENT_SENDS=2: если оба original runAttempt ждут callback recovery,
а callback ждёт whenIdle/ACK новых recovery operations, те не получают send-slot
и возникает deadlock. Допустимое completion — только durable storage.put/atomic
handoff: enqueue сейчас ждёт persist, а не send, поэтому запись replacement ops
не обязана ждать занятые network slots. После handoff старые slots освобождаются.
Debounce должен принадлежать captured board/очереди, а не читать новый engineRef.

Меньшая UX-мера: при добровольном switch синхронно flush старого batch ДО
смены board/engine refs, затем существующий whenIdle. Это помогает обычному
перелистыванию, но forced switch, unmount и browser crash не защищает и не
заменяет durable handoff. Flush в новый engine или resend permanent reject
не являются исправлением.

## Дополнительный подтверждённый terminal-verdict риск (04:40)

Baseline с настоящими Outbox и server operationRejectReason: room_frozen
проверен серверным gate на первом send, но ответ ещё на проводе. Board gate уже
сменился либо queue disposed; затем приходит permanent reject. Ownership guard
правильно не вызывает UI новой доски, однако исходная запись остаётся pending
в durable storage. После возврата и unfreeze resendAll отправляет тот же ID;
сервер уже разрешает его и впервые принимает прежний rejected tail.
Два теста FAIL именно на desired `accepted.has(original.id) === false`.
Сохранены как it.fails OPEN, runtime не менялся.

Accepted-only dedup моделируется узким Map seam, matching socketHandlers:
rejected operations не становятся journal row и не находятся findDuplicateOperation.
Gate — реальный production helper; это CPU seam regression, не API/PG сертификат.
Проблема существовала у disposed guard до #776 и остаётся у canSend gate.
#776 защищает board isolation callbacks, но НЕ terminal-verdict durability.
Нельзя исправлять её удалением target_gone payload: #777 lost-work baseline
показывает потерю содержимого. Нужна явно durable terminal-recovery phase из
плана, которая не участвует в normal resendAll, даже после reload/unfreeze.
