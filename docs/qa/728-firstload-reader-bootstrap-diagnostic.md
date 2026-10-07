# #728: actual first-load reader, bootstrap trace вместо ON claim

Run handle99236, wrapperPID2536424, terminal EXIT1. Raw VPS:
`728-firstload-sync/temp/surface-unit/engine-free-reader-1791390150/`.
Reader использовал уже durable47 normal Socket room; новый seed не выполнялся.
Surface own profile/task `qa728-firstload-reader6b`/`Grafetto728FirstloadReader6b`.
Перед запуском Chrome/Edge census0, RAM3733856KiB; runner pre3366.77MiB,
последняя RAM2030.57MiB, memoryAbort=false.

## Что реально случилось

Join form click был принят: trace получил room_state tail47/snapshotnull,
реальный replay выполнил47 append и39 _paintDabs. Последний paint завершился
на37231.8ms от navigation timeOrigin, затем setUnpainted(null)37232.1ms.
_log.entries.length=47; bakes0, pageerrors[]. Playwright locator.click отказал
по30s action observation timeout в фазе performing click. Это harness
INCONCLUSIVE, не physical Engine failure. Quiet endpoint, actor/source/paper
browser guards и экспорт ещё не достигнуты; никакой PNG/ON/Undo/snapshot PASS.
Все own resources закрыты finally: Chrome/task/profile, HOME forward1456411,
VPSforward session62180 terminal255. Источники5341 не менялись.

## Eligibility: причина следующего запрета, а не query conjecture

Actual OFF event перед append:
engine=true, flag=false, mode=join, alreadyHadSeq=0, snapshotSeq=null,
engineOpsLength=0, replayTail=47, latestKnownSeq=0.
Поэтому при flag=true тот же путь не пройдёт equality47===0.
Это отдельное code+runtime доказательство, не inference из39paint.

`roomStateHandler.ts` first/new board branch вызывает enterBoard и return
раньше loop folding tailseq. `index.tsx` enterBoard вызывает resetStream,
обнуляет latestKnownSeq, затем только паркует RoomStatePayload.
`engineWiring.ts` openParkedRoomState ждёт бумагу и вызывает restore(pending),
не отмечая authoritative head. Same-board reconnect loop работает иначе.

CPU предложение: отметить snapshot/tail authoritative watermark для новой
доски перед awaitPaper/restore, сохраняя Math.max с уже прибывшим peer seq.
Не ослаблять clear-prefix equality или skip semantics. Negative gate обязан
проверять head48 при held peer48 и отключённый elision для tail47. Snapshot
coverage и unknown/no-tail cases отдельно. Source/hardware повтор пока pending.

## Harness review

Commit eb070098 отделяет strict bake suppression replay47/semantic48 от stored49.
VM test исполняет actual room-probe.js: explicit enable не переносится в новый
context; restoreLayerFromSnapshot продолжает вызываться. Stored49 всё равно
должен иметь actual restore trace, paint0, HTTP index/blob49 и whole exact.
Actual HOME4539 snapshotRoutes92–93: null index→204; не-live participant→403.
Process exit выполняется только после awaited own contexts cleanup/disconnect.
Click noWaitAfter сам по себе не доказанным образом исправляет performing-click
ожидание; нужен evidence-based ready helper с отдельным action/restore deadline.
