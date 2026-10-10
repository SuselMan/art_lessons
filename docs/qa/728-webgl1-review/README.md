# #728: единый WebGL1 кандидат для ручного выбора

Основа: origin/main f52635e346d9f188ec5562968a74ce884613b6f2. Ветка agents/728-webgl1-review. Это кандидат, не готовая production оптимизация. Окончательный выбор делает Илья на настоящем планшете.

## Набор

| Изменение | Источник | Основание и ограничения |
|---|---|---|
| Bounded solver batching: до4 соседних contact/front единиц, бюджет8мс после sync каждой единицы | 73e26757 +249e62cb | Исторический replay Surface−59%, Samsung−53,7%; живая плавность не доказана, длинные кадры возможны. Текущий GL Plan сохраняет теги, canonical/WebGPU extraction не переносится. |
| Точное вынесение loop-invariant выражений из CPU contact raster | b65f8d3f, адаптация к текущему GL Plan | Историческая real-input CPU серия около6%, реальная Room без устойчивого выигрыша UP. Не меняет Math.exp, FP порядок, Q8 и геометрию. |
| Переиспользование трёх Float32 массивов внутри одного eager prepare | 25214ed3 | Меньше allocations; каждый prefix обнуляется, RGBA upload остаётся независимым. Отдельное ускорение общего сценария не доказано. Lazy генераторы не затрагиваются. |
| Переиспользование wet overlay GL storage при одинаковом размере | 75f10444 | Убирает повторное выделение storage, сохраняет полную перезапись и восстановление context. Отдельный whole-performance выигрыш не заявляется. |

Текущий main уже использует joined admission в production. В обоих DEV review режимах оно тоже включено, чтобы baseline не оказался искусственно медленнее production. Другие experimental режимы выключены: async finish, mixed lease, deferred finish, WebGL2/MRT, native WebGPU, physical batch2, contact cache, exp memo и static paper cache. Front batching входит в solver batching; проценты не складываются.

## Режимы

Только DEV `VITE_QA_WATERCOLOR_REVIEW=1` передаёт Engine `watercolorReview:true`. Это включает указанный набор. `VITE_QA_WATERCOLOR_REVIEW=0` запускает исходный путь main, включая прежний texImage2D для wet overlay. Standalone API omitted и production оставляют набор OFF. Параметры сохраняются при создании новых комнат через env соответствующего frontend; ручного ввода query flags не требуется.

На Samsung используются два localhost frontend через ADB reverse и один существующий изолированный QA backend4558. Приватные URL комнат и процессы хранятся вне tracked документов.

## Проверки

139 integration tests: settle queue, Plan, foreign-water contact uploads/field order, wet storage и joined admission. Ещё CPU adverse/expression/workspace oracle tests проверяют точные результаты hoist. Полный workspace/e2e/scripts typecheck PASS после локальной генерации актуального Prisma client. Production build PASS; map:check PASS; map:rules0errors/5existingwarnings; lint0errors/existingwarnings.

Samsung hardware OFF/ON/ON/OFF: фиксированный журнал, кисть400/Fine, чистая вода и два пересекающихся пигментных мазка на1024×1024; поле/material/export сравниваются после idle. Meaningful Undo, exact Redo и Dry проверяются отдельно. Итоги серии и параметры сохраняются рядом после завершения. Это replay/cohort, не физическая задержка пера и не человеческое одобрение анимации. Семь retained material records — не полный26field historical gate и не проверка каждой промежуточной итерации.

Первая серия с уходом Samsung в Doze сохранена как INVALID TIMING: первый OFF55сек нельзя сравнивать с ON3,6сек. Она не используется для расчёта ускорения. Четыре результата этой серии сохраняют одинаковый материал/Undo/Redo. Повтор выполняется на бодрствующем планшете; изменение screen timeout возвращается после проверки.

## Ручной сценарий

В двух комнатах одинаковые бумага, размер листа и начальные настройки. Сравнить: первый мазок, два быстрых пересекающихся мокрых мазка, третий сразу после них, кисть400, растекание после отрыва, Dry/Undo/Redo. Назвать, какой вариант приятнее и где остаётся остановка, скачок цвета или потеря пигмента. Ускорение replay само по себе не является критерием выбора.

Запись экрана подтверждает поведение интерфейса, но физический pen-to-pixel требует внешней камеры, одновременно видящей перо и экран. Такая метрика в этой сборке не объявляется измеренной.

## Результат бодрствующего Samsung

OFF 7537.8/7535.2мс, ON 3567.2/3591.3мс. Средние 7536.50→3579.25мс, снижение 52.51%. Все четыре arms exact по перечисленным выходам, meaningfulUndo/exactRedo PASS, GL0/lostfalse. Ticks449→191. Actual API WebGL1, flags OFF/ON подтверждены. В ON7 workspace reuses; выделено1031940B против requested2063880B в соответствующем prepare cohort. Это не сокращение всей памяти движка на50%. Полный компактный результат: samsung-fixed-replay.json.

## Actual Room проверка

Samsung Chrome155, Fine1024×1024, watercolor normal:100:100:PB29:round, size400. Через реальные CDP pointer events, без ожидания settle между жестами, записаны две packed операции (1978 символов каждая); GL0/lostfalse, экспорт непустой559773B, UI Undo/Redo исполнены. Отдельный exact Undo/Redo oracle относится к fixed replay выше; для этой живой сцены live export после UI Redo отдельно не сравнивался. Короткая запись samsung-live-input.mp4 содержит **автоматический CDP ввод**, не руку Ильи и не измерение physical pen-to-photon. Данные samsung-live-input.json. QA комната отделена от двух чистых комнат для человека.

Дополнительный тест Engine подтверждает defaultOFF и запрет включения review в production даже при requested:true.

Frontend-only changes; API/DB код не менялся. Зависимости переиспользованы через symlink overlay: lockfile отличается от донора только дополнительным @webgpu/types/app metadata, все необходимые версии одинаковы, @grafetto/shared указывает на эту рабочую копию. Актуальный Prisma client сгенерирован локально для полного typecheck, не в работающем backend.
