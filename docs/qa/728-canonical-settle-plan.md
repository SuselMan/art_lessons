# #728: единый канонический план высыхания

`CanonicalWatercolorSettlePlan<B, T>` содержит подготовку, контактные импульсы,
water-front, diffusion, carry, group-tide, временную презентацию и финальную
запись в тайлы прежнего `WatercolorSettlePlan` (исходная версия `32213887`).
Алгоритм, параметры, Q8-границы проходов, владельцы ресурсов, динамическая
вставка операций и теги очереди сохранены. Старый класс стал GL-адаптером:
загрузка текстур и возможность MAX-плёнки. Он остаётся входом обычного движка.

Контракт `watercolor/SettlePlanContracts.ts` не содержит GL-типов/контекста.
Буфер предоставляет размеры, clear/copy/destroy. Копии и scissor используют
**GL bottom-up** координаты; native адаптер переворачивает Y относительно
высоты каждого источника/приёмника ровно один раз. `copyRegionInto` аргументы:
`out, sx, sy, dx, dy, width, height`.

`SettlePlanUploads<T>` получает тот же payload в той же позиции очереди.
Native `T` может быть собственным handle ресурса. Изменение размеров заменяет
его texture и откладывает освобождение старой до завершения GPU. Shared flow
нельзя загружать через `queue.writeTexture` впереди ещё не отправленных старых
проходов: нужна staging copy в command stream либо явная submit-граница.
RGBA flow и LUMINANCE foreign имеют старую GL-ориентацию загруженных строк;
native адаптер должен согласовать её со своей top-down field конвенцией.

## Проверка

116 существующих тестов плана проходят (timeout 20s для нагруженной CPU-среды).
Дополнительные 16 CPU trace случаев сравнивают общий план с замороженной старой
реализацией: full/half resolution, single/mixed colour, MAX/fallback film,
finish/abort. Каждый включает foreign water и два контакта. SHA256 учитывает
все упорядоченные аргументы проходов, копии, acquire/release, upload dimensions
и hash байтов, preview и domain. Проверяется повторный dispose. Трасса получена
**из старого файла git**, не из нового общего класса.

Регенерация: `npx tsx docs/qa/harness/728-canonical-plan/generate.mts`.
Тест: `npx vitest run apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.test.ts`.

Это доказательство CPU chronology для выбранных ветвей, не вычисления пикселей
в fake backend. WGSL/full-field hardware parity, интерактивная производительность,
Room-адаптер, запись/replay/undo остаются отдельными аппаратными воротами. Новый
план сам не делает submit, CPU readback, broadcast и не меняет animation/physics.
