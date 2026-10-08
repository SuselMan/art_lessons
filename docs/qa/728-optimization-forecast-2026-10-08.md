# #728: ожидаемый прирост и границы доказательств, 08.10.2026

Это прогноз по измеренным кандидатам, а не обещание FPS и не готовность production. Проценты не складываются: варианты затрагивают общие проходы. Источник ordinary Room QA — frozen97e31b45; аппаратная проверка этой комнаты ещё выполняется.

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
| Полная акварель WebGPU в Grafetto | Actual engine wiring готовится; ограничение один origin-zero tile, unsupported foreign wash явно отвергается | Честного прогноза общего выигрыша пока нет |

## Проверки перед включением

1. Ordinary Room: реальные CPU recipes, исходные dabs и единая очередь; Dry, meaningful Undo, exact Redo и новый reader. Для GL2/MRT/batching сравнить весь результат и доказать использование MRT без fallback.
2. Native: тот же контракт ввода и paper world, сохранение порядка других инструментов, retirement при rebuild/snapshot/context loss. Затем реальная комната и проверка1024 участка; ограничение нельзя выдавать за полноценную акварель всех размеров.
3. Самсунг: отдельный аппаратный запуск; Surface не заменяет Adreno. Физический first-visible onset измерять отдельно от синхронного readback.
4. Новые математические кандидаты: сначала доказательство области вычисления/Float32 порядка и exact gate, затем hardware timing. Не менять физику ради ускорения.

Подробные данные: [полный factorial](728-webgl-factorial-surface.md), [SMT поиск](harness/728-fit-superopt/README.md), [GL cache FAIL](harness/728-gl-static-paper/README.md), [bridge](harness/728-room-webgpu-bridge/README.md), [ночные результаты](728-morning-2026-10-08.md).
