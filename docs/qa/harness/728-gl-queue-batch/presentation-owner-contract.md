# QA-only ownership coordinator: этап 1 перед root review

Принцип — serial canonical FIFO и отдельно owner-scoped presentation. `PresentationOwnerPrototype.ts` не подключён к Engine/Room, не делает GPU work и не обещает first-pixel или непрерывный DOWN. CPU state machine проверяет только порядок и владение. Никаких production defaults, нового physics или удаления existing admission guards.

Каждый admission обязан предоставить physical lease с отдельными `presentation` и `canonical-source` RGBA8 resources, размерами и identity. Сумма `w*h*4` проверяется, writable aliases между owners запрещены, ledger копируется при admission. Lease release обязан сам учитывать GPU-safe lifetime: coordinator не знает encoder/fence. Действительного adapter textures пока НЕТ. `captureCanonicalFinish()` остаётся metadata-only и не удовлетворяет этому договору сам по себе.

Максимум3 owners, explicit byte budget. UP (`seal`) detached metadata, видимость не меняется. FIFO start берёт первый ready owner, не обгоняет drawing owner. Пока один job активен, последующие visible owners остаются живыми. Landing разрешён только своему active token; retires только его overlay. Отмена/слой/dispose освобождают leases ровнораз, stale callback rejected, ошибки release не прерывают cleanup других owners. Канонический материал должен быть опубликован caller-ом атомарно ДО `land`; это пока внешний invariant, не реализованный compositor.

Четвёртый pending admission возвращает `capacity`; память — `memory`. Caller сохраняет ownership lease. Нет implicit queue.complete, silent drop или обещания бесконечных400rapid. До Room wiring требуется явный policy: input/preparation queue с отдельным лимитом и обратной связью либо другое ограничение; нельзя скрыть capacity как успешное касание.

## Два физических adapter варианта для следующего review

A. Собственные material/source-film textures на gesture: визуальный targetRGBA, strokeInk(P), strokeColor(C), strokeSolvent(V), coverageFilm — минимально5×4MiB=20MiB на1024tile/owner;3owners60MiB. Это нижняя оценка, исключает baseline/settled/field/scratch/reveal и multi-tile. Если нужны отдельные inkBase/colorBase/solventBase — ещё12MiB/owner, итого96MiB/3owners. Реальные aliases, dimensions, unique resource sum обязательны. Capture стабильного текущего film само по себе не делает будущий canonical baseline правильным: baseline должен fold после предыдущего landing.

B. Independent presentationRGBA плюс detached typed source commands, replayed MAX/field operations onto newly landed canonical baseline. GPU memory может быть ниже: presentation4MiB/owner плюс CPU F32 commands. Но opaque `scratch.runningSourceCommands` не подходит: его closures захватывают старые buffer destinations. Нужно typed payload с remappable role IDs и lifetime leases, оригинальный ordered draw/copy/MAX/Q8 ledger. Current settle finish already clears/rebases film and replays commands after prior land (`CanonicalWatercolorSettlePlan.ts1166–1186`); multi-gesture adaptation должна сохранить этот порядок раздельно для каждого gesture, не объединить MAX разных gestures и не заменить opacity/color arithmetic.

Оба варианта требуют captured-input primitive/whole26field/RGBA/material/history gates и ownership timeline. Не выбираем snapshot versus replay без измерения actual resource/CPU cost и root review. Прозрачность остаётся open.

Проверки этапа1: CPU7tests PASS; standalone coordinator TypeScript compile PASS; app+SW typecheck PASS; workspace web `lint:fix` exit0, существующие warnings без изменений engine. Тесты не подтверждают реальный allocator/texture ownership, pixel visibility, nonblocked input, GPU queue schedule или качество. Prototype остаётся только QA и ожидает root review перед adapter/Room wiring.
