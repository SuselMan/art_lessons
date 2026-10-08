# #728: ожидаемый прирост и границы доказательств, 08.10.2026

Это прогноз по измеренным кандидатам, а не обещание FPS и не готовность production. Проценты не складываются: варианты затрагивают общие проходы. Ordinary Room QA frozen97e31b45 на Surface прошёл: кисть400, вода→пигмент, exact fields/material/whole, Dry/meaningful Undo/Redo/fresh. MRT87pairs/fallback0. В одной паре максимальный rAF39.2→71.1ms; общий выигрыш времени нельзя выдавать за улучшение каждого кадра.

| Направление | Измеренный эффект | Что можно ожидать сейчас |
|---|---|---|
| WebGL2 + MRT | Surface, весь фиксированный engine400 replay: среднее2.25%; sampled GPU brush P/C около40% | Небольшое ускорение всего сценария, не40% приложения |
| Front batching | Тот же Surface replay: среднее7.5%; Samsung отдельная серия около16.5% | Наиболее подтверждённый общий выигрыш, при этом длинный CPU slice может ухудшить отдельный кадр |
| MRT + batching | Surface forward/reverse:7–11.4%, среднее9.2% | Реалистичный текущий ориентир для этого сценария; Room/device matrix обязательна |
| Mixed admission | Actual Surface Room400 DOWN→sync readback715→63ms; Samsung standalone1246→157ms | Устранение конкретного барьера старта мокрого штриха; это верхняя граница readback, не физическая задержка пера |
| CPU contact cache | Подготовка заметно быстрее, whole replay без устойчивого выигрыша | Пока0 в плане общего ускорения; OFF |
| Bounded SMT superoptimization |105 max-деревьев, все эквивалентны в заданном домене; исходное уже оптимально по числу операций/глубине | Выигрыш не найден; это завершённый отрицательный поиск, не предел всех оптимизаций |
| GL static paper cache | Canonical1536 diffuse:28 изменённых bytes/max1 | Отклонён по точности; ожидаемый production выигрыш не заявляется |
| Native WebGPU static cache | Отдельные front/diffuse kernels34%/29%; прогретый whole100 около8% в малой серии | Перспективный локальный кандидат; переносить на Room400/Samsung нельзя |
| Native progressive queue | Pointer400 release→idle в последовательной серии39–73% быстрее | Потенциал очереди есть; unperturbed400 material parity и actual Room ещё не закрыты |
| WebGPU→GL canvas bridge | Surface1024 warm4.2/6.9ms против readback17.6/16.4ms; premultiplied fixture exact | Перенос без CPU RGBA readback дешевле, но это часть стоимости, не общий прирост WebGPU |
| WebGPU в Grafetto | Actual Room routing подключён, один origin-zero tile; foreign-water auxiliary реализован, аппаратно не проверен. Surface a83 INIT прошёл; исправленный fa86 first40: реальная операция/live/final/nonempty PASS, first40 и вода→пигмент40 функционально завершены; качество относительно GL/400 не проверено; Samsung прежний pen40 завершился GPU process exit0 | Прогноз общего выигрыша отсутствует; Samsung gate FAIL, причина driver/OOM/watchdog/compiler пока не установлена |
| GL2 carry MRT | Surface mixed400 OFF/ON/ON/OFF: все26fields/material/RGBA/tape exact, ON14pairs;5817.5/6601.9/5881.8/5871.1ms | Carry GPU95.65→65.34ms в одной отдельной серии (~32% этого участка), whole gain не обнаружен; OFF. GPU и wall — разные измерения |
| Удаление dead colour snapshot | Surface6arms GL400 все26fields/material/export/tape exact;9MiB storage,18MiB copytraffic, removed copy0.598msGPU | Whole OFF2984.0/ON2988.5ms: общего выигрыша не обнаружено; memory-only benefit, кандидат OFF |

## Проверки перед включением

1. Ordinary Room: реальные CPU recipes, исходные dabs и единая очередь; Dry, meaningful Undo, exact Redo и новый reader. Для GL2/MRT/batching сравнить весь результат и доказать использование MRT без fallback.
2. Native: тот же контракт ввода и paper world, сохранение порядка других инструментов, retirement при rebuild/snapshot/context loss. Затем реальная комната и проверка1024 участка; ограничение нельзя выдавать за полноценную акварель всех размеров.
3. Самсунг: отдельный аппаратный запуск; Surface не заменяет Adreno. Физический first-visible onset измерять отдельно от синхронного readback.
4. Новые математические кандидаты: сначала доказательство области вычисления/Float32 порядка и exact gate, затем hardware timing. Не менять физику ради ускорения.

Подробные данные: [полный factorial](728-webgl-factorial-surface.md), [SMT поиск](harness/728-fit-superopt/README.md), [GL cache FAIL](harness/728-gl-static-paper/README.md), [bridge](harness/728-room-webgpu-bridge/README.md), [ночные результаты](728-morning-2026-10-08.md).

Дополнительно: [ordinary Room GL gate](728-room-webgl-factorial-surface.md), [статусы36 методов](callgraph-viewer/method-status-2026-10-08.md), [memory/ownership proof альтернативы кешу](harness/728-gl-static-paper/stencil-alternative.md). Исследования отдельных кандидатов закончены положительными или отрицательными gates;17 методов по-прежнему имеют непроверенные предложения. «Все методы оптимизированы» было бы неверным итогом.

### Дальнейшая практическая работа

- Сначала закрыть production-path admission/peer/history матрицу и физический первый видимый пигмент. Для непрерывного рисования это важнее процентного выигрыша dry replay.
- GPU: измерить долю carry15/16 и проверить MRT именно этих двух операторов с общими OLD inputs, сохранив каждую Q8 границу. Brush MRT дал небольшой whole gain; переносить40% на carry нельзя.
- Native Room: a83 убирает28MiB ненужных standalone ресурсов и eager pipelines. Surface INIT прошёл: runtime519.8ms, RAM2218→1819MiB. Реальный first40 выявил обращение live composite к standalone fields; исправлена явная передача owner coverage/P/C; fa86 first40 и вода→пигмент40 функционально PASS. [Отчёт](728-room-native-fa86-surface.md). Это API ошибка, не доказанная GPU арифметика или driver причина. [First40 FAIL](728-room-native-first40-surface.md), [INIT PASS](harness/728-room-native-init/README.md). Samsung прежний first40 GPU process потерян; причина не установлена.
- Native foreign-water auxiliary импорт реализован по прежней CPU chronology/modes20/1; вода→пигмент40 в Room завершилась без ошибок, exact material/GL parity ещё не доказана. Production build исключает backend explicit DEV guard; default flags OFF.

Подробности carry MRT: [26fields exact / whole gain отсутствует](harness/728-gl-carry-mrt/README.md).

### Приоритет после расширенного аппаратного профиля

Surface mixed400/Fine: отдельный passes cohort без ошибок и с exact26fields/material/RGBA. WaterFront252 вызова /687.57GPUms, fieldOp215/372.83, diffuse39/83.93, brush408/81.30, resample40/9.63. Это затраты, а не ожидаемые проценты ускорения. Отдельные transfers: clear44/11.14, copyTo22/7.04, copyRegion444/11.53GPUms. Складывать независимые cohorts и вычитать их из wall нельзя. Raw GL uploads/draws и CPU finish не покрыты из-за bound adaptedGL proxy; профиль не исчерпывает критический путь.

1. Оптимизировать front с неизменными sampling/Float32/Q8; отклонённый GL paper cache не возвращать без exact gate.
2. Разобрать очередь: количество slices, ожидания rAF, GPU synchronization и onset; измерить до первого видимого пигмента отдельно от dry replay.
3. GL2+batching проверять на реальных Room400/history/peer, сохранять default OFF до матрицы.
4. WebGPU: следующий gate400 и exact source/settle material относительно GL, затем Undo/Redo/участники; первые Room40 функциональные PASS не доказывают ускорения.
