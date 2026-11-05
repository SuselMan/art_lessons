---
layer: engine-api
summary: PencilEngine
issues: [25]
tags: [webgl1, публичное-api, крупный]
---
# engine — PencilEngine

Публичное API движка (`PencilEngineAPI`) и вся его оркестрация: контекст WebGL1, слои и их
буферы, применение и реплей операций, вход в снапшоты (запекание и восстановление —
`src/oplog/SnapshotIO.ts`), undo/redo, вход в экспорт (сама сборка — `src/export`). Временные
буферы ленты и состояние продолжения штриха принадлежат `src/buffers/RibbonScratchPool.ts`
и `src/buffers/RibbonStrokeScratch.ts`; их жизненным циклом управляет движок. Снаружи ничто
не импортирует engine/src — только четыре двери в корне модуля:

- `index.ts` — сам движок и `PencilEngineAPI`;
- `paper.ts` — бумага для кода вне комнаты (предзагрузка, миниатюры выбора бумаги, тон). Отдельно
  от `index.ts`, потому что её берут App и выбор бумаги из стартового бандла, а `index.ts`
  притащил бы туда весь движок (#130, #663);
- `paperBake.ts` — константы, манифест и канал зацепа для офлайн-запекания бумаги в `scripts/`;
  импорты с `.js`, потому что их читает node;
- `snapshots.ts` — формат снапшота комнаты и отчёт о восстановлении для сетевого и
  диагностического кода Room.

## Заметки

- Десять тысяч строк в одном файле. Дробить его — отдельный разговор, но сейчас это и есть
  граница между движком и приложением.
- Mock-WebGL в vitest не рисует: проверки пикселей маркера в юнит-тестах меряют мок, а не
  движок. Настоящую картинку проверяй в браузере.
- `testing/` — моки WebGL для тестов движка — своего README не имеет и потому часть этого
  модуля.

Кэш повторного рисования ленты и парковку GPU-состояния заливок держит
`buffers/RibbonReplayCache`. Движок передаёт ему решения о пересборке слоя,
сушке и бюджете; порядок операций, очередь реплея и шаги пересборки остаются здесь.

Подготовка и нанесение одного пакета ленты вынесены в `dabs/RibbonStrokePainter`.
Движок делегирует ему генератор отрисовки, сохраняя прежний порядок пакетов,
границы кадров и задачи сушки.

Низкоуровневое рисование ленты и собственные GPU-объекты полос находятся
в `raster/RibbonPasses`. Движок вызывает его стадии инициализации на прежних
местах и освобождает программу и буфер при завершении работы.

GPU-проходы акварельного поля находятся в `raster/WatercolorPasses`: операции
поля, фронт воды, пересчёт разрешения, диффузия, перенос кистью и преобразование
пигмента в цвет. Рабочие текстуры остаются в движке. Пять этапов
инициализации сохраняют порядок GL-вызовов; восемь программ освобождаются при
завершении работы.

`raster/WatercolorSettlePlan` строит список GPU-шагов сушки и завершающий
возврат результата в тайлы; владеет текстурами движения кисти и чужой воды.
`watercolor/WatercolorSettleQueue` выполняет список по кадрам с прежним лимитом
нагрузки либо завершает его синхронно перед replay и повторным использованием
поля. Движок хранит поле, бюджет памяти и связывает завершение с композитом.

`raster/LayerCompositor` собирает слой из видимых тайлов, заменяет их временными
превью и смешивает слои в порядке снизу вверх. Он хранит признак устаревания
кэша ниже/выше активного слоя и программу смешивания. Буферы этих кэшей и
сборки кадра остаются у движка; после resize и восстановления контекста
композит получает их актуальные экземпляры через контекст. Экранный проход,
камера, запись операций и жизненный цикл акварельных reveal остаются в движке.

`brushLibrary.ts` — установка неизменяемых описаний импортированных кистей и проверенных CPU-ресурсов до их применения движком (ADR017).

Для версионных кистей с `behavior.strokeInput` авторский ввод хранит историю
реального курсора в image/world coordinates между жестами. `input/kritaStrokeInput`
задаёт pure history/fan laws; `PointerInput.onCursor` наблюдает реальные hover/contact
события без изменения скорости. Камерный viewport передаёт явный CSS/image zoom
пятым аргументом `setInfiniteCamera`, до округления размеров backing store. История
принадлежит экземпляру движка, а source
paint-information/fan continuation — `DabSystem`; preview копирует его целиком.
Fan — отдельный paint request, включая первый при t=0 на прежней позиции.

`Dab.sourceAngle` хранит каноническое raw direction в Float64 до преобразования
в brush rotation. `Dab.angle` сохраняет прежний Float32 формат; fixed tip shaping,
position-derived direction и mixer controls не заменяют sourceAngle у новой policy.
Fan insertion выполняется при авторском планировании, до source geometry/RNG,
а peer/history/undo/rebuild исполняют уже записанные requests. Per-request время
также сохраняется. Отсутствие policy оставляет прежний ввод и wire output.

Opt-in не включён в stock-каталоге. Копия C++ source-law receipts проверяет history
и fan math, но не полную Krita GUI/smoothing/distance pipeline. `sourceAtan2F32` задаёт переносимый закон AOSP13/FreeBSD binary32 без FMA и
проверен независимыми C++ fixtures. Он устраняет прежний host-Math.atan2 residual;
точное совпадение с произвольным установленным libm binary не обещается.
Independent-child input policy и native tool sampling требуют отдельной проверки.

`behavior.timing` — отдельный opt-in native line request planner. Он не требует
cursorHistory и не меняет legacy spline/deadband. `sourceDistanceTiming` вычисляет
сначала spatial, потом temporal factor с общими изменяемыми accumulators: успешная
ветка сбрасывает оба. Интервал ограничен исходными0.5ms/LONG_TIME; Rate и spacing
обновляются после каждого request и через50ms без даба. Допустимые Rate controls
пока pressure/off; generic random Rate и per-dab random Size/Rotation/Spacing
в50ms refresh требуют отдельного контракта RNG queries между paint requests.
Импортер не включает timing для этих комбинаций; их unsupported gaps остаются явными.

`DabSystem.continueTimedStroke` отдаёт raw requests по одному через generator,
включая coincident fan. Author queue должна выполнять inputs последовательно и
помещать finish после завершения предыдущего generator. Пока input приостановлен,
interleave/start/end/fork запрещены; prediction допустим между завершёнными inputs.
Совместимый `continueStroke` полностью собирает generator для синхронных клиентов;
не использовать его для неблокирующего большого catch-up.

`sourceTime` — исходное время F64; `t` сохраняет старую F32 кодировку. Time sensor
использует `sourceTime` и собственные period(ms)/periodic; independent child наследует
тот же clock с собственным period, интерполируя F64. Time-only кисть сохраняет прежний
spatial sampler с новым captured clock. Не заменять время batch timestamp: округление
1469.99999→1470 меняет фазу periodic1470 с почти1 на0. Renderer/replay не заводят timers.
128 fixtures скомпилированы из pinned native distance/timing methods с минимальными
Qt/data shims; rotation/map классификация сверена с Qt5.15.2 source. Это source-law
проверка, не полная Krita GUI/smoothing/libm/raster совместимость. Native stationary
fixtures сохраняют реальные weighted-mix координаты/времена, включая ULP drift.

Импортер включает timing/time controls только явным `timed_input=True`; stock builder
передаёт только явно включённые boolean policies. Старые defaults и CLI остаются OFF.
Canonical native keys не подменяются legacy AirbrushOption aliases. Активный Softness
sensor (например stock51) пока unsupported: его нельзя объявлять поддержанным через
произвольный Sharpness target. Каталог активируется отдельно после native/device QA.
