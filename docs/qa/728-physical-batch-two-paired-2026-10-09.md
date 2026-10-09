# Физические шаги settle: paired Surface gate

Один последовательный OFF→ON cohort на настоящем Surface завершён без ошибок. Source `99acba42c216b396871bc82057fef21b705eb4b0`, observer `217d5c99`; остальные диагностические scheduler-флаги выключены. Четыре исходных packed 400px штриха воспроизведены в свежих собственных контекстах через один CDP transport. Это standalone actual engine replay, не совместная Room и не измерение физической задержки пера.

| Проверка | OFF | ON |
| --- | ---: | ---: |
| Replay до readback/export | 6064.6 мс | 4005.5 мс |
| Readback/export отдельно | 2893.8 мс | 2511.1 мс |
| Записанные rAF интервалы | 364 | 240 |
| Максимальный rAF интервал | 17.2 мс | 32.9 мс |

В этом одном ordered cohort replay сократился на 34.0%. Это наблюдение, а не устойчивый benchmark или обещание такой же скорости на Samsung. Уменьшение числа кадров согласуется с исполнением двух исходных упорядоченных физических шагов за tick; каждый исходный вызов и его fence сохраняются. Полный GPU timestamp здесь не записывался.

Exact gates PASS: все 25 записей полей/материала (включая явное отсутствие), исходная packed tape, только предсказанная индексация seq после fixture layer, decoded whole 1024². Whole SHA обоих arms: `3442d38e889df65f75ed5706a1b8d8d4d568a0cb308440892228455ffe9551e2`. Флаги после replay соответствуют каждому arm; неизвестных HTTP/console/page ошибок нет, GL0, context lost false.

RAM preflight OFF2055 / ON1704 MiB; минимальная1454, после закрытия1705. Собственные контексты закрыты, CDP transport отключён; реальный Browser.close не вызывается. Предыдущий OFF-only cohort с ошибкой второго CDP handshake сохранён отдельно и не считается paired результатом.

Данные: `temp/fast-watercolor-night/physical-batch-two-session-surface-20261009/report.json`. Приватный origin и immutable source/HTTP/paper паспорта остаются вне Git. Defaults не изменены; требуется отдельная проверка обычного живого Room, Undo/Redo и поведения под длительной нагрузкой.
