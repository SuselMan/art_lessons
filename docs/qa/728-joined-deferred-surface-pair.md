# #728: Surface, отложенный joined UP — точность сохранена, время завершения выросло

Источник устройства: `3aab1eb948432a7dee76752e8c7c259552d1ba28`, root-интеграция deferred finish с сохранёнными `releaseDryTicket`, captured gesture, expedited lifecycle и publication/error guards; typed DEV constructor option default OFF. Own HTTPS5343/backend4539, 1010 web/shared SHA exact; фактические HTTP `?raw` Engine/Room/Plan совпали с манифестом. Пользовательские 5342/5330/5329 не менялись.

Raw: `/home/suselman/projects/pencil-agents/728-pure-water-plan/temp/pure-water-plan/causal-trace/deferred-surface-3aab-pair4/report.json`. Контроллер 55140 завершился EXIT0. Реальный Surface/Intel/Chrome154, собственный профиль/task, Surface RAM preflight >=1700 MiB/min500. Все четыре комнаты создавались через обычный UI, физический экспорт 1754×2480.

Это фиксированные native Engine `_onStart/_onMove/_onEnd` двух pigment400 жестов с одинаковым preset/RGB/physical seed. Глобальный crypto не переопределён, operation IDs реальные разные и сохранены сервером. Это **не** DOM PointerInput/per-frame pen latency тест. В обоих arms joinedTouch ON, mixed/async/material/split OFF, sourceRebase ON; только typed joinedFinishDeferred меняется. В no-overlap старый job явно заканчивается до второго DOWN.

| Контроль | OFF | ON |
| --- | ---: | ---: |
| overlap, второй UP CPU | 88.5 ms | 43.1 ms |
| overlap, max post-UP RAF wall interval | 1010.2 ms | 80.5 ms |
| overlap, natural completion | 3580.3 ms | **7961.0 ms** |
| overlap, RAF callbacks | 155 | 469 |
| no-overlap, второй UP CPU | 51.1 ms | 56.8 ms |
| no-overlap, max post-UP RAF wall interval | 866.1 ms | 960.1 ms |
| no-overlap, natural completion | 3448.6 ms | 3519.9 ms |

Оба парных сравнения: **38/38** уникальных упорядоченных полных field descriptors (dimensions/byte length/SHA/nonzero/absence) EXACT, whole RGBA EXACT, normalized material EXACT включая packed wet и dab time. `comparisons.fields=[]` означает пустой **список отличий**, а не отсутствие чтений. Во всех четырёх случаях принятые stroke IDs/payload проверены через REST после ACK. Настоящий UI Dry, meaningful Undo с изменением пикселей и `state=undone`, Redo того же target с `state=done`, свежий reader с теми же IDs/states: whole RGBA EXACT; alpha=288082 во всех финальных экспортных кадрах. Canonical field readbacks выполнялись только после natural completion.

## Что объясняет увеличение времени

В OFF старый job содержит 314 ops и после второго UP имеет `next=314`: он завершён синхронно внутри UP. В ON после UP тот же старый job имеет `next=1`, остаётся current и held successor=true. Очередь исполняет его оставшийся prefix перед будущим owned finish. `WatercolorSettleQueue.WET_SETTLE_OPS_PER_TICK=1`; обычный backlog берётся из `_opQueue.length`, held joined successor в этот счётчик не входит. Количество RAF выросло ровно на **314** (469−155), что согласуется с перенесённым на RAF старым job и его завершением. Повторный физический расчёт этим наблюдением не доказан: full fields/material exact, no-overlap длительность почти прежняя. Но и отдельная GPU service-time оценка отсутствует. Вывод: наблюдаемая регрессия прежде всего соответствует **scheduled waiting дополнительного старого job**, а не ускорению/удалению его работы. Реальный операторный CPU/GPU профиль необходим для количественного разложения.

Большая no-overlap пауза остаётся при `oldOps=0`, held=false и явном отсутствии predecessor на втором DOWN. Поэтому устранение только старого UP drain не закрывает brush400: собственная подготовка/первые физические units/queued GPU нового finish остаются кандидатами, точный проход пока не установлен.

Следующий изолированный эксперимент нашей ветки ограничен **overlap scheduled waiting**: readonly `scheduled-probe.js` снимает job identity, исходное/последнее next, количество actual tick/advance, held/backlog, CPU суммы и handoff old→future. Нет per-pass marks, GL sync/readbacks или обёрток самого operator; порядок, аргументы, return/error сохраняются. Probe default не установлен, CPU transparency test PASS. Эти счётчики проверят, что +314 RAF соответствует оставшимся old units, а не повторному prepare/execute. Они не дадут GPU service-time и не докажут performance transparency без контрольного no-probe прогона. Отдельную no-overlap ~0.9 s паузу исследует profiler; здесь её не локализуем и не правим.

Не удваивать произвольно solver units/rAF до causal gate. Deferred default остаётся OFF, пользовательский кандидат до разбора natural-duration регрессии не предлагается.

## Сохранённые ошибки fixture

- run1: неверный HTTP путь Plan (watercolor вместо actual raster); до CDP/input, fallback HTML200 отвергнут.
- run2/bootstrap1: ready ждал unlocked при выбранной `hand`; runtime/layer/paper/actor были исправны. Expanded census2 доказал `isDrawingTool(hand)=false`, видимый незаблокированный layer-1. Исправление — штатный store.setTool(watercolor)+2RAF до readiness, без `setLocked(false)`.
- pair3: OFF native завершён, UI Dry selector искал innerText, тогда как кнопка icon-only с title/aria-label. Сохранён partial; исправлен только selector.

Полный pair4 выполнен после этих исправлений в новом owned profile. Точное cleanup: собственный browser4456/profile/task удалены, HOME forward1449105 остановлен, VPS handle45502 EXIT255, contexts/transport закрыты. Surface после cleanup 3765.5 MiB. Own5343 immutable runtime сохранён для воспроизводимости; source/raw не удалены. Ни одной публикации.

## Незавершённый аппаратно CPU-кандидат bounded old-job tick

После анализа подготовлен отдельный **OFF** `joinedSuccessorBudgetEnabled`. Он не меняет общий backlog и не включает async/material. Optional Engine-owned lifecycle допустим только для exact held predecessor, текущего epoch, живого удержанного scratch и того же canonical target. При on-time RAF и отсутствии input выполняются максимум четыре прежних ordered units; после каждого `syncGpu`, через 4 ms wall CPU+GPU цикл прекращается. Следующий запуск — RAF, без цепочки немедленных tasks. При natural successor handoff будущий job не получает дополнительных advance; sync последней old unit может включать уже прежнюю initial prepare нового job и превысить soft budget. Один неделимый тяжёлый оператор тоже способен превысить бюджет. Default false, Room opt-in отсутствует, на устройстве **не запускался**.

CPU tests: cap/time/order, active/late/input-between-units, exact old→future handoff, epoch/target invalidation, no-job, sync thrown null и layer-scoped recovery/publication null. Эти тесты проверяют JS ordering/ownership с MockGL, а не время GPU и не полную физику. После нового запроса Ильи дополнительные эксперименты остановлены; готовится только reviewable local commit. Проверенная same-preset joined DOWN и экспериментальные deferred UP/budget — разные разрешения и уровни доказательств.
