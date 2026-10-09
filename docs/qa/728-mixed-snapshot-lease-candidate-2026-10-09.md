# Mixed predecessor snapshot lease: OFF candidate

Локальный кандидат после product boundary доказательства из `728-product-next-down-boundary-2026-10-09.md`. Обычный water→pigment DOWN сейчас вызывает `_completeSettle()` до первой команды нового source. Это установленная граница CPU ожидания, но не объяснение всех GPU задержек.

## Изменение

Приватный `_wcJoinedTouchSnapshotLease` по умолчанию `false`, не имеет constructor/query включения. Не включает прежний широкий `_wcJoinedTouchMixed`. Разрешает пропустить DOWN drain только при existing joinedTouch, same wash/layer/signature, live scratch и действующем owned predecessor finish:

- Совпадают input, scratch, material и owned gesture.
- Owned target совпадает с текущим layer target, profile сохраняет normalizeDeposit.
- Preset — независимая копия исходного finish preset с равным содержимым.
- Color — независимая конечная копия с исходными значениями input.
- Finish, paints и имеющийся dry context не являются mutable scratch alias.

Для кандидата используется существующий captureCanonicalFinish и owned dry-context cloning. Порядок canonical finish не меняется: при следующем UP predecessor всё равно завершается. Физические операторы, preset/dab/operation payload и production defaults не изменены.

## Проверка

09.10: `npx vitest run src/engine/index.joinedTouch.test.ts --maxWorkers=2` — 13/13 PASS; `npx tsc --noEmit` — exit 0. Новый тест проверяет water→pigment valid lease без DOWN drain и обязательный drain при corrupt gesture, чужом target, alias color или отсутствии заранее захваченного finish. Existing product boundary тест остаётся PASS.

Это unit/mock GL проверка; не утверждение о fidelity, реальной GPU производительности или отзывчивости Samsung. Реальный долгий Samsung протокол ранее завершился до ввода из-за недоступного CDP socket; он не является отрицательным результатом кандидата.

## Следующий meaningful gate

После восстановления устройства отдельно собрать OFF/ON из фиксированного HEAD с private flag injection до первого stroke; один и тот же packed water→pigment log, одинаковые paper/preset/size/source passports. Проверить named mobile/fixed P/C, water/coverage/cost, декодированный whole export и exact operation history после canonical idle. Отдельный живой двухштриховый длинный 400 сценарий измеряет DOWN→first source submission, `_completeSettle` и rAF, а не физическое pen-to-photon. Пропавший пигмент, потерянный gesture, GL error, alias или неравный endpoint — FAIL, без whitelist. До этих gates кандидат не передаётся художнику и не включается по умолчанию.

### Важное ограничение существующего replay harness

`runPhysicalBatchSameTape` вызывает `appendOperation(..., remote)` и ждёт canonical idle после каждого op. Он не вызывает `_onStart` со вторым DOWN поверх unfinished predecessor, поэтому такой PASS не доказывает snapshot lease. Положительный gate обязан подтвердить в ON хотя бы один `_wcJoinedTouchLease === oldJob` до нового source и отсутствие DOWN drain, а в OFF — фактический drain. Сначала воспроизвести одинаковые decoded packed dabs/события с одинаковым межштриховым интервалом без idle, затем дождаться общего idle и сравнить fields/export/history. Отдельный последовательный replay остаётся canonical reference, но не заменяет этот overlapping input gate.
