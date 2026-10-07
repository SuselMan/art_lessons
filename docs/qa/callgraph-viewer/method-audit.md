# Аудит36 измеренных методов акварели

Версия`6aa14a43`. Предложения не реализованы и не прошли аппаратную проверку. «Без потерь» ниже — требуемый инвариант, а не уже доказанное свойство патча.

- Inclusive total нельзя суммировать. Self исключает только instrumented children.
- CPU GL submission не измеряет GPU duration.
- static-reference может относиться к иному receiver с тем же именем; это не доказанный runtime caller. ObservedCallers — ближайший instrumented caller, не обязательно прямой.
- Все proposals — гипотезы, ни одна здесь не реализована/не validated.
- Отмена вычислений ради приближённого результата, уменьшение field/resolution/iterations и decimation не считаются оптимизацией без потерь.

ПриоритетP1 означает начать проверку здесь, а не доказанное ускорение. В первую очередь: повторные clear, same-size copyTo без storage redefine, reuse geometry/flow и dirty composite. Выборочное scissor поля, уменьшение итераций и перестановка контактов отвергнуты как неэквивалентные без отдельного доказательства.

## Engine._onStart

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов2; total50.90ms; self16.60ms; max40.60ms.

Проверки доступа, создание состояния штриха, первый отпечаток и показ. O(первый отпечаток + незавершённый settle).

**Предложение.** Подготовить пул первого отпечатка заранее; устранить принудительный drain только для уже доказанного совместимого владельца.

**Инвариант.** Сохраняются captured inputs, порядок операций, wash identity и запреты доступа.

**Риск.** Обобщение joinedTouch на чужой цвет/слой может затереть следующий мазок.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:5877`.

Наблюдаемые ближайшие instrumented callers: PointerInput._handleDown ×2.

Статических ссылок: 3; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._onMove

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов362; total189.10ms; self65.20ms; max17.70ms.

Обрабатывает образец, скорость/нажим, генерацию дабов и покраску батча. O(образцы + созданные дабы).

**Предложение.** Переиспользовать массивы/числовой workspace геометрии; кэшировать неизменные настройки на штрих.

**Инвариант.** Тот же упорядоченный набор канонических дабов, скорость и timestamp.

**Риск.** Пропуск образцов меняет траекторию; вычисления в другом порядке меняют округление.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:6195`.

Наблюдаемые ближайшие instrumented callers: PointerInput._handleMove ×362.

Статических ссылок: 3; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._onEnd

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов2; total233.20ms; self19.20ms; max134.30ms.

Финальные дабы, taper/pooling/lift, завершение ленты и операция. O(конец + prepare + возможный drain).

**Предложение.** Убирать повторные вычисления метаданных финала; переносить только presentation-работу после фиксации immutable входов.

**Инвариант.** Не меняется конец штриха, serialized operation, порядок capture/commit.

**Риск.** Простой перенос solver после нового штриха нарушает ownership.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:6327`.

Наблюдаемые ближайшие instrumented callers: PointerInput._handleUp ×2.

Статических ссылок: 3; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._paintDabs

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов53; total246.40ms; self225.20ms; max51.10ms.

Канонизация дабов, выбор painter, покраска ленты. O(дабы + геометрия + покрытые тайлы/пиксели).

**Предложение.** Кэшировать codecDab результат по immutable батчу; повторно использовать геометрию отдельно для воды/пигмента там, где вершины идентичны.

**Инвариант.** Битово те же вершины и порядок waterPhase→pigmentPhase.

**Риск.** Повторные контакты неперестановочны, нельзя просто объединять дабы.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:7038`.

Наблюдаемые ближайшие instrumented callers: Engine._onStart ×2, Engine._onMove ×49, Engine._onEnd ×2.

Статических ссылок: 10; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._finishRibbonStroke

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов2; total108.80ms; self2.10ms; max66.50ms.

Связывает scratch, snapshot/reveal и settle plan. O(тайлы + план + capture).

**Предложение.** Использовать уже накопленные bounds/metadata; устранять копию только если её version/owner идентичны и запись не менялась.

**Инвариант.** Snapshot содержит именно состояние до следующего батча; dry target прежний.

**Риск.** Alias pooled texture после release повреждает reveal и undo.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:8425`.

Наблюдаемые ближайшие instrumented callers: Engine._onEnd ×2.

Статических ссылок: 5; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._startSettle

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · no-change · вызовов2; total2.30ms; self0.20ms; max1.60ms.

Прокси к очереди и её lifecycle. O(1) собственный код; capture в дочернем start.

**Предложение.** Отдельное ускорение прокси не обосновано: оптимизировать capture/queue.

**Инвариант.** Сохранение beforeStart и lifecycle.

**Риск.** Малое self time, таймерная точность не позволяет обещать выигрыш.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:7795`.

Наблюдаемые ближайшие instrumented callers: Engine._finishRibbonStroke ×2.

Статических ссылок: 2; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._completeSettle

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов1; total38.50ms; self0.00ms; max38.50ms.

Синхронно завершает очередь settle. O(оставшиеся ops).

**Предложение.** Убирать из горячего input пути только при доказанном отсутствии зависимости; сам обязательный drain не выкидывать.

**Инвариант.** Ни одна новая операция не читает/перезаписывает незавершённое каноническое состояние.

**Риск.** Очередь одного shared field не допускает свободной перестановки.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:7873`.

Наблюдаемые ближайшие instrumented callers: Engine._finishRibbonStroke ×1.

Статических ссылок: 15; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._diffuseFieldFor

**Математическое условие.** ПустьC обнуляетA,B,coverage,CA,CB, а K=op0 обнуляет те же ресурсы до первого чтения. Тогда K∘C=K лишь при отсутствии чтений между ними и полном совпадении write-domain. Это доказуемое устранение мёртвой записи, не изменение solver.

P1 · proposal · вызовов2; total0.20ms; self0.20ms; max0.20ms.

Получает каноническое поле, аллоцирует или чистит 10 буферов. O(10·W·H), обычно W,H≥1536.

**Предложение.** Устранить 5 повторных clear только на reused поле, если capture гарантированно обнуляет их до любого чтения.

**Инвариант.** Каждый читаемый texel/channel определён тем же нулём до чтения, размер/фильтры поля прежние.

**Риск.** Уже пробованная scissor/уменьшение размера меняет границы solver; cold/outside-capture пути обязательны.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:8068`.

Наблюдаемые ближайшие instrumented callers: Plan.prepare ×2.

Статических ссылок: 2; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._display

**Математическое условие.** Composite является функцией слоя/version, camera и clock. Кэш допустим лишь для подвыражения с неизменными аргументами. Dirty union должен включать stencil/mipmap footprint каждого downstream sampler; иначе border texels отличаются.

P1 · proposal · вызовов114; total243.80ms; self232.00ms; max13.50ms.

Live composite, reveal, сборка FBO и paper compose. O(видимые тайлы + screen pixels + wet overlay).

**Предложение.** Кэшировать неизменный фон/слои по version; dirty-region со строгим halo всех фильтров; не собирать неизменные слойные части.

**Инвариант.** Экран каждого кадра равен полному composite при том же clock/camera.

**Риск.** Reveal/zoom/paper wetness расширяют dirty область; нельзя заморозить clock.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:9348`.

Наблюдаемые ближайшие instrumented callers: Engine._onStart ×2, Engine._onEnd ×2.

Статических ссылок: 23; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._displayIfNotSuspended

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · no-change · вызовов101; total1.10ms; self1.10ms; max0.10ms.

Запрашивает display через существующее объединение кадра. O(1).

**Предложение.** Сохранять текущую коалесценцию; самостоятельный рефакторинг не обоснован.

**Инвариант.** Не теряются ни последний dirty update, ни reveal tick.

**Риск.** 101 вызов всего1.1ms; расход находится ниже.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:2670`.

Наблюдаемые ближайшие instrumented callers: Queue.complete ×1, Queue.advance ×37.

Статических ссылок: 22; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._resolveWithinSheet

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов71; total3.60ms; self3.40ms; max0.70ms.

Клиппинг запроса и получение тайлов внутри листа. O(пересечённые тайлы + cold allocation).

**Предложение.** Переиспользовать список targets для одинаковых tile-key/bounds внутри батча; preallocate необходимый ближайший тайл вне касания.

**Инвариант.** Точно те же contentRect, origins и размеры.

**Риск.** Не аллоцировать всю доску; учитывать GPU budget и transform.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:5808`.

Наблюдаемые ближайшие instrumented callers: Engine._paintDabs ×67, Engine._finishRibbonStroke ×2, Queue.complete ×1, Queue.advance ×1.

Статических ссылок: 4; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Engine._enforceGpuBudget

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · no-change · вызовов2; total0.30ms; self0.30ms; max0.30ms.

Контроль памяти и eviction/spill. O(кандидаты eviction), в записи2вызова.

**Предложение.** Сначала измерить реальную ветвь со spill; изменений по этому прогону не обосновано.

**Инвариант.** Не ухудшается потолок памяти, pin/holding и восстановимость.

**Риск.** Редкие тяжёлые spill не представлены2вызовами.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/index.ts:7944`.

Наблюдаемые ближайшие instrumented callers: Queue.complete ×1, Queue.advance ×1.

Статических ссылок: 3; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## PointerInput._handleDown

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · proposal · вызовов2; total52.80ms; self1.90ms; max42.20ms.

DOM pointerdown, координаты/ownership и вызов engine start. O(1)+engine.

**Предложение.** Кэшировать неизменную матрицу screen→world до camera/resize; сохранять event guards.

**Инвариант.** Те же координаты и accepted pointer identity.

**Риск.** Self1.9ms на2вызова; главный расход в engine.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/input/PointerInput.ts:383`.

Наблюдаемые ближайшие instrumented callers: .

Статических ссылок: 0; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## PointerInput._handleMove

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов183; total196.40ms; self7.30ms; max18.20ms.

Coalesced samples, timestamp/speed, callback engine move. O(coalesced samples).

**Предложение.** Переиспользовать временные структуры; вычислять матрицу один раз на неизменную camera version.

**Инвариант.** Каждый coalesced образец обрабатывается один раз в исходном порядке.

**Риск.** Decimation/последний образец меняет давление и повороты.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/input/PointerInput.ts:436`.

Наблюдаемые ближайшие instrumented callers: .

Статических ссылок: 0; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## PointerInput._handleUp

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · no-change · вызовов2; total234.20ms; self1.00ms; max135.10ms.

Закрывает pointer ownership и вызывает end. O(1)+engine.

**Предложение.** Отдельное ускорение не обосновано; исправлять дочерние prepare/capture/drain.

**Инвариант.** UP и cancel одинаково освобождают owner, финальный sample сохранён.

**Риск.** Нельзя трактовать117ms всей цепочки как стоимость DOM handler.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/input/PointerInput.ts:503`.

Наблюдаемые ближайшие instrumented callers: .

Статических ссылок: 0; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Queue.start

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов2; total2.10ms; self0.90ms; max1.40ms.

Drain предыдущего задания, немедленный capture op0 и rAF. O(предыдущие ops + capture).

**Предложение.** Разделить capture на строго эквивалентные bounded части лишь при immutable scratch; предварительно удалить повторные clear.

**Инвариант.** Op0 захватывает вход до следующего изменения; field принадлежит одному job.

**Риск.** Несвоевременный capture меняет картинку; CPU submission не ограничивает GPU backlog.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts:150`.

Наблюдаемые ближайшие instrumented callers: Engine._startSettle ×2.

Статических ссылок: 12; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Queue.tick

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов126; total34.10ms; self3.80ms; max2.30ms.

rAF политика late/drawing/backlog, запускает advance. O(число ops/tick).

**Предложение.** Адаптивный GPU-aware бюджет для независимых соседних шагов после lift; сохранять mandatory barriers.

**Инвариант.** Порядок ops прежний и drawing/lifecycle проверяются между шагами.

**Риск.** Меньше rAF без GPU замера может перегрузить очередь; animation timing меняется.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts:174`.

Наблюдаемые ближайшие instrumented callers: .

Статических ссылок: 2; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Queue.advance

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов126; total28.80ms; self8.60ms; max2.30ms.

Исполняет следующий op и commit последнего. O(текущий op).

**Предложение.** Сделать тяжёлую op bounded без изменения последовательности пиксельных операторов; измерять её отдельно.

**Инвариант.** Не меняются next, commit один раз, abort semantics.

**Риск.** В одном op скрыты сотни копий/контактов; считать advance единицей GPU недостаточно.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts:243`.

Наблюдаемые ближайшие instrumented callers: Queue.tick ×126.

Статических ссылок: 6; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Queue.complete

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов1; total38.50ms; self21.00ms; max38.50ms.

Синхронно выполняет все оставшиеся ops и вложенные jobs. O(остаток).

**Предложение.** В drain не выполнять промежуточные preview, если они нигде не читаются и не могут быть показаны до возврата.

**Инвариант.** Canonical поля/dry result прежние, пропущено только мёртвое presentation work.

**Риск.** Callback может читать preview; существующий diagnostic gate ещё нуждается в admission.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts:269`.

Наблюдаемые ближайшие instrumented callers: Engine._completeSettle ×1.

Статических ссылок: 5; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Queue.scheduleTick

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · no-change · вызовов127; total1.70ms; self1.70ms; max0.10ms.

Ставит один rAF на job. O(1).

**Предложение.** Изменений не требуется: уже guard s.raf исключает дубликаты.

**Инвариант.** Не меняется scheduler lifetime.

**Риск.** Доли ms и инструментирование, не bottleneck.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts:164`.

Наблюдаемые ближайшие instrumented callers: Queue.start ×2, Queue.tick ×125.

Статических ссылок: 6; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Plan.prepare

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов2; total65.70ms; self65.50ms; max63.30ms.

Выбор домена/масштаба, snapshot ресурсов и построение ops closures. O(тайлы + контакты + W·H CPU fields + ops).

**Предложение.** Один immutable flow raster на одинаковые water/pigment contact inputs; ленивое построение только после фиксации ownership; typed workspace для CPU raster.

**Инвариант.** Те же samples, conservative exchanges, fieldRect, rounding и chronological contacts.

**Риск.** Prepare65.7ms inclusive; нужно выделить brushDragField/allocations отдельными span перед численным обещанием.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorSettlePlan.ts:100`.

Наблюдаемые ближайшие instrumented callers: Engine._finishRibbonStroke ×2.

Статических ссылок: 1; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.fieldOp

**Математическое условие.** Замена A→tmp→B на swap exact только если все дальнейшие consumers используют обновлённый handle и нет владельца, ожидающего старыйhandle. Algebraic fusion не сохраняет Q(f(Q(g(x))))=Q(f(g(x))) в общем случае дляRG​BA8.

P1 · proposal · вызовов671; total19.70ms; self18.30ms; max1.30ms.

Полноэкранный полевой оператор по mode. O(W·H·kernel) GPU, O(bindings) CPU.

**Предложение.** Кэш состояний GL с централизованной инвалидацией; специализированные mode shader только с идентичной арифметикой; устранять identity-copy через безопасный swap.

**Инвариант.** Тот же mode, texture sampling, precision, order и intermediate quantization.

**Риск.** Fusing проходов меняет RGBA8 округление; рост shader ломал Adreno compiler.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:87`.

Наблюдаемые ближайшие instrumented callers: Engine._paintDabs ×438, Queue.advance ×80, Engine._display ×1, Engine._finishRibbonStroke ×2, Queue.complete ×150.

Статических ссылок: 46; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.waterFrontStep

**Математическое условие.** D_{k+1}(x)=min(D_k(x),min_n[D_k(n)+c(x,n)]) сохраняется только при идентичном c и read-domain. Кэш c допустим при неизменных water/paper uniforms; region уменьшать можно лишь вне точного dependency cone каждого шага.

P1 · proposal · вызовов252; total8.00ms; self7.70ms; max0.40ms.

Один шаг relaxation стоимости фронта по бумаге и воде. O(W·H·stencil) на шаг.

**Предложение.** Кэшировать инвариантные paper/foreign costs; exact-support active region с halo только после доказательства границ.

**Инвариант.** Точно то же рекуррентное min-relaxation на каждом шаге, same texel values.

**Риск.** Меньше итераций/больше stride не тождественно; нулевой внешний фон не всегда верен.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:174`.

Наблюдаемые ближайшие instrumented callers: Queue.complete ×126, Queue.advance ×126.

Статических ссылок: 2; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.wcResample

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов152; total3.00ms; self2.60ms; max0.10ms.

Mean2×2 или base+up(new−old), max; scissor overlap. O(rect pixels).

**Предложение.** Объединять соседние disjoint прямоугольники одного src/dst/mode с одинаковым mapping и scissor семантикой; cache uniforms.

**Инвариант.** Каждый texel читается/записывается ровно как раньше; clampRect неизменен.

**Риск.** Нельзя менять mean на bilinear или убирать промежуточную quantization.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:220`.

Наблюдаемые ближайшие instrumented callers: Queue.start ×48, Queue.complete ×20, Queue.advance ×84.

Статических ссылок: 4; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.diffuseStep

**Математическое условие.** Для fixed gate линейный stencil L сохраняется кэшированием coefficients, но Q(L(Q(Lx))) обычно не равноQ(L²x). Поэтому убрать промежуточную запись или заменить серию blur одним kernel без потерь нельзя.

P2 · proposal · вызовов26; total1.70ms; self1.50ms; max0.30ms.

Один water-gated diffusion stencil. O(W·H·stencil) на шаг.

**Предложение.** Кэшировать paper geometry/coefficients по immutable wet gate; не пересчитывать инвариантные выборки там, где тождественно.

**Инвариант.** Те же коэффициенты и промежуточные округления для всех каналов.

**Риск.** Без GPU trace26 вызовов не доказывают bottleneck; fusion steps обычно не exact.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:255`.

Наблюдаемые ближайшие instrumented callers: Queue.complete ×13, Queue.advance ×13.

Статических ссылок: 1; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.brushPass

**Математическое условие.** Для записиR_i=T_i(R_{i−1};F_i,W_i) последовательные T_i обычно не коммутируют. Допустим cache самого F_i, если inputs идентичны; недопустимо заменить T_n∘…∘T_1 одним усреднённым контактом.

P1 · proposal · вызовов1406; total12.70ms; self11.60ms; max0.20ms.

Хронологический контакт, перенос source при flow/water/pigment. O(contact scissor pixels),1406вызовов.

**Предложение.** Один flow texture для пары pigment/color; точный tight support rect плюс stencil halo; cache binds/uniforms.

**Инвариант.** Парные records читают прежний pre-contact pigment, порядок контактов сохраняется.

**Риск.** Нельзя объединять последовательные перекрывающиеся контакты: операторы не коммутируют.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:296`.

Наблюдаемые ближайшие instrumented callers: Queue.complete ×1292, Queue.advance ×114.

Статических ссылок: 2; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.pigmentColor

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов42; total1.10ms; self1.00ms; max0.10ms.

Single pigment shortcut color=deposit·tau. O(W·H).

**Предложение.** Кэшировать результат по deposit version/tau; пропускать повтор при неизменной версии.

**Инвариант.** RGBA8 запись прежнего умножения, нет feedback loop; все sampler units безопасны.

**Риск.** Другая tau или запись deposit должна инвалидировать кэш.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:331`.

Наблюдаемые ближайшие instrumented callers: Queue.complete ×5, Queue.advance ×37.

Статических ссылок: 3; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Passes.gradientField

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P3 · no-change · вызовов8; total0.00ms; self0.00ms; max0.00ms.

Ленивый cached fibre shader, обычно прогрет. O(1) cache hit, compilation cold.

**Предложение.** Изменений не требуется на hit; keep warmup и explicit context invalidation.

**Инвариант.** Тот же shader/noise seed; восстановление контекста пересоздаёт handles.

**Риск.** 8вызовов ниже разрешения таймера; компиляцию отдельно проверять salted на Adreno.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/raster/WatercolorPasses.ts:366`.

Наблюдаемые ближайшие instrumented callers: Passes.fieldOp ×8.

Статических ссылок: 2; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Buffer.clear

**Математическое условие.** Полная clear является dead store только если для каждого texel/channel существует последующая запись до первого чтения. Partial overwrite, pooledoutside и readback нарушают условие.

P1 · proposal · вызовов221; total2.90ms; self2.20ms; max0.20ms.

Обнуляет текстуру и инвалидирует mipmap. O(W·H) GPU,221вызов.

**Предложение.** Удалять clear только при полном overwrite до любого чтения либо уже доказанном clean generation.

**Инвариант.** Каждый read видит тот же ноль, включая pooled unused outside rect.

**Риск.** clear state/scissor/colorMask и context loss делают глобальный clean bit ненадёжным.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:311`.

Наблюдаемые ближайшие instrumented callers: Engine._resolveWithinSheet ×6, Engine._paintDabs ×48, Engine._display ×132, Queue.start ×12, Queue.complete ×12, Engine._diffuseFieldFor ×10.

Статических ссылок: 194; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Buffer.copyTo

**Математическое условие.** При одинаковых extent/format и действующем storage texImage-copy и texSubImage-copy задают один массив dst[x,y,c]=src[x,y,c] для всехtexels. За пределамиcopy область пуста. Размер/формат dest и mip invalidation должны совпасть.

P1 · proposal · вызовов247; total1.40ms; self1.40ms; max0.10ms.

Полная копия через copyTexImage2D, storage redefine. O(W·H),247вызовов.

**Предложение.** Same-size exact-copy через copyTexSubImage2D в уже allocated dest: избежать переопределения storage.

**Инвариант.** Те же RGBA pixels, destination размеры/format/filters, mip invalidation и framebuffer restore.

**Риск.** copyTo иногда меняет физический размер dest: такой путь должен остаться прежним.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:409`.

Наблюдаемые ближайшие instrumented callers: Engine._paintDabs ×34, Engine._finishRibbonStroke ×14, Queue.start ×4, Queue.complete ×36, Queue.advance ×159.

Статических ссылок: 37; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Buffer.copyRegionInto

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов1512; total3.00ms; self3.00ms; max0.10ms.

Копирует прямоугольник framebuffer в существующую texture. O(rect pixels),1512вызовов.

**Предложение.** Сократить только доказанно дублирующиеся copies по source version и rect; объединять disjoint same-source adjacent rect.

**Инвариант.** Не затрагиваются gaps и overlapping chronology; destination прочитана тем же состоянием.

**Риск.** Copy cache должен учитывать каждый write/clear/pool reuse; 3ms CPU не отражают bandwidth GPU.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:443`.

Наблюдаемые ближайшие instrumented callers: Queue.start ×16, Engine._display ×2, Engine._finishRibbonStroke ×4, Queue.complete ×1316, Queue.advance ×174.

Статических ссылок: 29; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## Buffer.readPixels

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов1; total15.20ms; self0.10ms; max15.20ms.

Синхронно читает RGBA в CPU массив. O(W·H)+GPU synchronization.

**Предложение.** Переиспользовать supplied into; читать только необходимый rect, если потребитель действительно использует subset.

**Инвариант.** CPU bytes и row order соответствуют тем же pixels; full consumer сохраняет full read.

**Риск.** Один15.2ms read в этом сценарии, не объясняет817ms сам по себе.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Определение: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:321`.

Наблюдаемые ближайшие instrumented callers: .

Статических ссылок: 21; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## GL.drawArrays

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов5235; total10.60ms; self10.60ms; max0.10ms.

Raw GL submission; ближайшие обёртки скрывают реальные painters. 5235команд, стоимость GPU неизвестна.

**Предложение.** Оптимизация на уровне вызывающих проходов: state cache, exact redundant-work elimination; raw draw менять нечем.

**Инвариант.** Тот же ordered command stream либо доказанная наблюдаемая эквивалентность.

**Риск.** 2µs mean—CPU enqueue, не shader duration; уменьшение draw count не гарантирует меньше GPU pixels.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Наблюдаемые ближайшие instrumented callers: Engine._paintDabs ×1127, Passes.fieldOp ×671, Engine._display ×1315, Engine._finishRibbonStroke ×8, Passes.wcResample ×152, Passes.waterFrontStep ×252, Passes.pigmentColor ×42, Passes.diffuseStep ×26, Passes.brushPass ×1406, Queue.complete ×186, Queue.advance ×40.

Статических ссылок: 31; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## GL.clear

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P1 · proposal · вызовов221; total0.70ms; self0.70ms; max0.10ms.

Raw очистка bound framebuffer. 221команда, GPU pixels не записаны.

**Предложение.** Только caller-specific read-before-write анализ, не глобальный skip clear.

**Инвариант.** Прежние write mask/scissor/clear value и нулевой backing.

**Риск.** Нужны region/resource identity и state trace.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Наблюдаемые ближайшие instrumented callers: Buffer.clear ×221.

Статических ссылок: 194; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## GL.readPixels

**Математическое условие.** Эквивалентность требует одинаковых аргументов, порядка побочных эффектов и округлений. Предложение устраняет повторное вычисление/передачу либо планирует те же операции; общего доказательства ускорения здесь нет. Для no-change изменение не предлагается.

P2 · proposal · вызовов1; total15.10ms; self15.10ms; max15.10ms.

Raw GPU→CPU read и возможное ожидание очереди. 1вызов15.1ms.

**Предложение.** Локализовать caller и необходимый rect; перенос diagnostic read вне UX пути допустим лишь для диагностического потребителя.

**Инвариант.** Результат и доступность bytes до первого consumer прежние.

**Риск.** WebGL1 не даёт обычного PBO async-read; удалять canonical read нельзя.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Наблюдаемые ближайшие instrumented callers: Buffer.readPixels ×1.

Статических ссылок: 21; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

## GL.texImage2D

**Математическое условие.** Разрешён stable-size update при том же storage-format и полной записи payload. Тогда texSubImage задаёт тот же массив содержимого; allocation metadata/zero-init обязаны остаться эквивалентны.

P1 · proposal · вызовов211; total7.40ms; self7.40ms; max3.60ms.

Allocation или upload texture,211вызовов. O(upload bytes/driver allocation); max3.6msCPU.

**Предложение.** Separate allocation vs upload; stable-size flow/wet textures update texSubImage2D, keyed pool lifetime.

**Инвариант.** Тот же format/type/pixelStore/content включая untouched bytes; zero-init и ownership соблюдены.

**Риск.** Pooling без budget/lifetime controls увеличивает память; texImage null и pixelupload разные задачи.

**Проверка.** CPU negative control + exact field/material/PNG parity live/replay/undo/redo; свежие/pooled ресурсы, несколько цветов/слоёв, crossing tile seam, context loss. Затем A/B на реальном устройстве с GPU trace и одинаковым журналом; отдельно latency и natural completion.

Наблюдаемые ближайшие instrumented callers: Engine._resolveWithinSheet ×6, Engine._paintDabs ×68, Engine._display ×49, Engine._finishRibbonStroke ×14, Engine._diffuseFieldFor ×10, Plan.prepare ×3, Queue.start ×11, Queue.complete ×33, Queue.advance ×12.

Статических ссылок: 16; полный перечень с точными строками6aa14a43 — в JSON. Разрешение динамического receiver отдельно не доказано.

