# #728: прямое выполнение подготовленного source в существующем GL

QA-only, без Room wiring и без изменения production defaults. `PreparedGlSourceDraw.ts` использует существующий stamp program и `RibbonPasses.drawRibbonBands`; shader не увеличивается. Радиус/центр/угол/нажим берутся из сохранённой команды напрямую: Dab.size и delivery заново не вычисляются. Неизменяемый record принадлежит `TypedGlSourceReplayPrototype`, который late-bind читает базу только после predecessor land.

`createPreparedGlSourcePort` выполняет реальные AccumulationBuffer.clear/copyTo, source draw и WatercolorPasses.fieldOp(mode=1,k=1, original GL scissor). Проверяет MAX/add соответствие и запрещает source/sum texture feedback. Не вводит await/yield между P/C sums. Hardness передаётся отдельно как сохранённая настройка исходного preset; этот uniform не читается режимами 6/7, но нужен для точного повторения состояния общего stamp program.

Offline proof: 20 сочетаний round/chisel × coverage/solvent/pigment/color/halo × MAX/add. Оригинальный drawRibbonNibPass и binder дают одинаковую упорядоченную последовательность GL API, включая clip-fluid, tau, nonzero world origin, pressure .031 и нецелый radius. Это проверка вызовов JavaScript, не байтов GPU. Ribbon gate проверяет точную передачу тех же Float32 vertices (включая signed zero), uniforms и target; поскольку применяется существующий drawRibbonBands, kernel не меняется. Отдельный port gate проверяет реальные сигнатуры copy/sum и отрицательные alias/blend controls.

Полный coordinator/snapshot/replay/binder suite: 18 tests. Строгая проверка типов — `npx tsc -p docs/qa/harness/728-gl-queue-batch/prepared-gl-tsconfig.json --noEmit`.

Открыто до Room integration: captured production source corpus→новый port whole-fields GPU gate; foreign solvent import и много тайлов; физический release fence; finish plan, owner lifecycle и presentation публикация. Текущие API fixtures не доказывают, что прозрачность или третий DOWN исправлены. Никакой аппаратный прогон в этом этапе не выполнялся.

## Actual CPU source corpus

Дополнительный `preparedGlSourceCorpus.test.ts` использует настоящий RibbonStrokePainter и prepareCanonicalStrokeChunk: 16 combinations round/chisel × combined-segment OFF/ON × film OFF/ON × 1/4 input dabs. Каждая подготовленная команда сначала совпадает с записью реального painter, затем настоящий RibbonPasses оригинально исполняет сохранённые исходные аргументы и prepared GL port исполняет canonical record. Все упорядоченные GL calls совпадают; Float32 bufferData сравнивается по uint32 bit pattern. Исходные stamp begin/end/MAX/add и ribbon вызовы сохраняются. Цель — CPU/API equivalence, MockGL не является доказательством реальных texture pixels. Общий suite теперь 34 tests PASS.

## Подготовленный аппаратный gate

`prepared-gl-source-controller.mjs` запускает отдельные source-only engines, Fine/1024, 4 dabs кисти ~400. Round/chisel combined+film, и round unsegmented+add; каждая пара original/prepared получает одинаковые входы. Оригинальный painter сохраняет resource allocation, phase, clear/copy/sum/scissor и composite; заменяются только stamp/ribbon binders. Для stamp внутри уже открытого painter target binder `ownStampTarget=false`, что offline trace также проверяет. Это узкая проверка binder, не вся typed owner state machine.

Собираются SHA256, размер и nonzero всех 12 target/source roles; readback только после source. Отрицательный контроль меняет tau всех color-команд на 0.3 и обязан нарушить сравнение полей. Computed source SHA passport и RAM guard 1700/500; созданные страницы закрываются. Аппаратный результат пока отсутствует.
