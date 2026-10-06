# 017 — Изолированный прототип асинхронного FinishRequest

Дата: 2026-10-08. Задача: #728 «Акварель: ночные исправления».
Статус: согласованный принцип; runtime-прототип ещё не реализован, default OFF.

Operation Log остаётся источником истины. Приём pointer input и его логические
данные отделяются от выполнения канонической очереди GPU. Solver, RGBA8 порядок
записей и сухой endpoint не меняются. Визуальный transient не может писать dose,
становиться landed wash, persisted checkpoint или операцией журнала.

FinishRequest удерживает material gesture и immutable finish metadata до capture.
Последовательность oldland → exact source rebase → capture следующего film остаётся
прежней. Подтверждённые peer операции участвуют в той же canonical FIFO. Epoch
инвалидирует старые requests при Undo/clear/delete/rebuild/loss; потеря контекста
забывает GL owners без вызовов GL, сохраняя подтверждённый журнал.

Обычные Dry/export/snapshot обязаны дождаться canonical FIFO либо явно отказать
в незавершённом состоянии. Нельзя возвращать успешный экспорт provisional PNG.

## Узкая граница, которую необходимо извлечь

`_paintStrokeDabs` одновременно выполняет четыре обязанности: записывает dab.t,
сэмплирует и квантует PaperWet, вызывает GPU painter и принимает его standing Map,
затем drain/deposit PaperWet и live-packet metadata. Отложить весь этот метод —
значит изменить записанный wet profile из-за времени ожидания. Вызвать обычный
GPU painter для transient — значит повторно изменить water clock/standing и
общий dabPool. Оба обхода нарушают исходный контракт.

Поэтому первый необходимый прототип разделяет логическую подготовку batch и
GPU исполнение. Подготовка при input сохраняет immutable dabs/prevDab/wet/seed,
waterByDab, across, clocks/contacts и результат standing. GPU request использует
эти значения без повторного исполнения logical state. Metadata ownership
отдельный от защищённого material film; newFilm не может очистить материал
pending request до capture. Предварительная картинка имеет отдельные буферы
и не читает/пишет канонические источники.

Практический критерий извлечения: при immediate execution новые prepared batches
дают те же scalar state, standing/dabPool, uniforms и целые P/C/V/coverage, что
существующий RibbonStrokePainter. Только после этого включается deferred FIFO.
Простой callback в `_finishRibbonStroke` или очередь pointer events не заменяют
этот критерий. Подробные ownership/cancellation gates описаны в
`docs/qa/728-async-finish-design.md`.

### Разделение владельцев, необходимое после prepareDelivery

Текущая extraction44c487d7 только отделяет CPU delivery без изменения immediate
execution. Для следующего генератора нужно захватить весь batch: drawable/prev,
profile/preset/color, bands/deposits/across/water/standing, foreign donor chunks,
reach/composite bounds, seed и результат noteFinish. GPU continuation создаётся
после этого, а foreign import остаётся перед первым material draw. Mutable
vertex arrays и donor lists копируются. Выполнение continuation не пересчитывает
water clock, wet sampling, стоянку и выделение частиц пигмента.

Logical gesture и material gesture — разные владельцы. Input может закончить
логический chunk и начать следующий, но physical filmGesture меняется только
в очереди перед соответствующим GPU batch. Oldland должен смотреть physical
owner, не самый новый logical gesture. Ни temporary swap всего scratch, ни
возврат snapshot всех скаляров после landing не подходят: они откатят уже
принятые стоянки/контакты следующего batch. FinishRequest берёт свои brushTravel,
wetContacts/paints/dryCtx в момент логической границы; Plan.prepare перестаёт
читать эти mutable коллекции без request. Pending request закрывает возможность
spill/checkpoint до безопасной canonical границы.

Presentation хранит только отдельный transient target и prepared geometry/color.
Обычный `_paintDabs` использовать для него нельзя: он меняет water clocks и
общий dabPool. Существующий prediction target AccumulationBuffer тоже не
решение: watercolor путь для него явно возвращает undefined, то есть следа
вообще не будет. Нужен небольшой независимый presentation draw; его качество и
видимость проверяются отдельно от dry endpoint, без заявления новой физики.

Проверяем отдельно exact endpoints и плавность. Вводимый прототип должен показать
след сразу, а не скрывать input задержкой рисунка. Source577/cleaned4f доказали
native→history equality, но сами не устранили synchronous pen-up barrier.

### CPU preparation seam (not an active Room queue)

The painter can now prepare logical water delivery at input time while owning
immutable GPU inputs for later single-use execution. Original dab keys remain
available to PaperWetness and recorded standing maps. Material-film ownership
can stay behind the logical film; snapshots/spills refuse that unresolved
state. Finish metadata owns its contact, donor and paint lists.

Cancellation closes a paused foreign-water generator. Normal cancellation
destroys its auxiliary scratch; context-loss cancellation forgets the stale
handles without returning them to the pool. Both branches have CPU regression
coverage. No engine caller currently enables this seam: canonical FIFO,
transient presentation and readiness barriers are still required before this
can be tested as a responsiveness candidate. The runtime on 5316 is unchanged.
