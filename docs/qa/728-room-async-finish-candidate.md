# #728: product Room принимает input через canonical FIFO

Кандидат от `451da1f141fcac218f95fc915af18b137f0b9b41`: typed `PencilEngineOptions.asyncFinish`, constructor применяет опцию, обычный Room передаёт true. Standalone по умолчанию остаётся synchronous; алгоритм FIFO/ownership/material не меняется. Это API для уже проверенного пути, а не повторная реализация очереди. Бюджет Room +1 ровно для constructor opt-in; новая логика в Room не добавлена.

## CPU

39 async tests PASS; первый meaningful test принимает опцию constructor вместо private mutation, доказывает immediate logical journal, отдельный nonempty preview, отсутствие sync complete/source deposition до FIFO и очистку owners после drain. При старом constructor без применения опции тот же тест FAIL на преждевременном физическом draw. Whole web TS PASS; lint без ошибок (существующие предупреждения), map 998/998 PASS. Логи: `temp/pure-water-plan/causal-trace/room-async-api-{tests,types,lint,map}.log`, old counterexample `room-async-old-contract.log`.

## Настоящий current Room, два автора

HOME immutable whole web/shared451,990SHA, own5331/backend4539. Backend7b11 отличается от current только forkRoutes, fork не проверяется. Actual custom физический640×480/GL0, два auth contexts, общий layer-1. Все intrinsic defaults сохранены, только async opt-in, Plan/rim OFF.

Corrected actual matrix30107 EXIT0/ownedChromeClosed:22 barriers,18 whole peer comparisons exact0, nonempty263304; ordinary reconnect и отдельный late auth reader exact0. ОБЯЗАТЕЛЬНЫЙ foreign pencil packet пришёл при canonical pending (`peerDuringSettle=true`); UI Dry captured pending=true/owners1; local Undo captured beforePending=true/beforeOwners1, затем отмена/recovery, Redo/layer remove/undo/redo. Raw HOME `/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/f52-room-native/temp/matrix-current-451-covered/report.json`.

Предыдущий60819 raw сохранён как fixture FAIL: reconnect snapshot seq5 bitmapHTTP200 штатно покрывает pencil stroke seq5, которого нет в resident replay log. Исполняемый **actual** серверный `isCoveredBySnapshot` подтвердил этот ID, tail seq6/Dry4 отрицательны. Corrected oracle требует эту функцию для каждого missing ID и точный common payload, исключая только local op.seq; не игнорирует Dry и не расширяет pixel tolerance. Нет claims полного raw resident identity там, где API сообщает покрытый snapshot prefix.

## Pending canonical owners + настоящий context loss

44022 EXIT0/ownedChromeClosed: два distinct native finish boundaries с разными strokeIds/sameScratch, оба queued при pending. Holder refs21 включают deposition и finish; это НЕ21 finish. Перед loseContext pending=true/refs19, bakeNetworkSnapshot=null, dirty остаётся true. B отправил новый native stroke, ACK пришёл A при actual gl.isContextLost=true. Подтверждённый журнал сохранён; actual lost/restored events, после restore owners0/pendingfalse/snapshot bake1228820B. Ordered UI Dry два автора wholeRGBA0/nonempty183720, независимый fresh fulljournal0/nonempty183720/GL0. Scope pending metadata owners, не carried physical checkpoint или сохранение unrecorded tail. Raw HOME `.../f52-room-native/temp/pending-loss-current-451/report.json`.

## Продуктовый gate ещё нужен

Hardware выше использует private opt-in прежнего source451 и доказывает путь; CPU доказывает public option forwarding. Перед интеграцией/включением на стенде проверить обычный Room на этой новой constructor опции **без private toggle**, поскольку caller bootstrap/snapshot readiness — отдельный контракт. Performance улучшение и same-tape Samsung proof описаны в `728-async-native400-clean.md`; оставшиеся50/67ms active и84/518ms tail не объявлены smooth60fps. Multiuser foreign pencil active856ms также остаётся performance ограничением.
