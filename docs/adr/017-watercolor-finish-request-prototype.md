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

Проверяем отдельно exact endpoints и плавность. Вводимый прототип должен показать
след сразу, а не скрывать input задержкой рисунка. Source577/cleaned4f доказали
native→history equality, но сами не устранили synchronous pen-up barrier.
