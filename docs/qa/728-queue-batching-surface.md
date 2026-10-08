# Surface: объединение front-проходов в срезе

Standalone actual-engine бандл97508016, кисть400, Fine, фиксированный zigzag. Одинаковые операции, параметры материала и входные поля. Четыре свежих экземпляра движка последовательно; shader cache прогрет после первого, поэтому init отдельно и ускорение первого полного запуска не приписывается кандидату.

| Расписание | Replay, мс | Срезы | Срезы с несколькими примитивами |
| --- | ---: | ---: | ---: |
| baseline | 21178.8 | 1239 | 0 |
| front | 19547.1 | 1143 | 32 |
| presentation | 21017.7 | 1235 | 0 |
| front + presentation | 19442.6 | 1143 | 32 |

В этом прогоне объединение front сократило общее время replay примерно на8%. Presentation отдельно эффекта почти не дало: нужные проходы не объединились. Во всех вариантах полные поля и итоговые пиксели совпали; undo/redo и GL/lost gates прошли. Порядок вычислительных примитивов сохраняется; front-кандидаты выполнили124 дополнительных GPU-синхронизации внутри срезов. Это уменьшение ожиданий между частями расчёта, а не измеренное ускорение самих шейдеров.

Обратный порядок подтвердил выигрыш front на том же Surface: baseline20957мс, front19424мс (7.3%), combined19497мс, presentation21107мс. Все поля/whole hashes снова exact, Undo/Redo и GL/lost gates прошли. Перед включением остаются Samsung, живой input во время расчёта и реальный Room replay. Статистика срезов — CPU wall time; не FPS/physical input latency. Флаги production не изменены.

Артефакт на диске: `temp/fast-watercolor-night/queue-batch-surface-1791415501736.json`.

Обратный порядок: `temp/fast-watercolor-night/queue-batch-reverse-surface-1791417105954.json`.

## Samsung

Actual SM-T970/Adreno, Chrome154, тот же immutable975 tape, Fine400. Порядок front→baseline:19781→23696мс (16.5% выигрыш front),1146→1235срезов. Всего32среза с несколькими примитивами. Полные поля, wholeRGBA и материал совпали; meaningful Undo/Redo,GL0/lostfalse. Максимальный CPUсрез front32.8мс против baseline22.7мс: общее ускорение не доказывает улучшение каждого кадра. Нужны живойinput и normalRoom gates до default ON.

Артефакт: `temp/fast-watercolor-night/queue-batch-samsung-1791417470774.json`. Первая попытка не открыла QAURL из-за shell-разделителя в запросе; workload не выполнялся, retained отдельно.
