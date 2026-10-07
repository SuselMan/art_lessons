# #728: временный предпросмотр акварельного материала

Эксперимент OFF. Пользовательский стенд 5329 не менялся.

## Наблюдение

Read-only выборка Samsung nc3z6y в ye6OIPLN: 45 операций, asyncError=null,
контекст жив, очередь/settle/owners/films пусты. 120 выборок за 60 секунд также
были idle. Это НЕ запись самого выпадения preview из-за cap. Исходный код
выделяет полный viewport RGBA на каждый film и при 64 MiB возвращает null.
Устройство с viewport 2560×1600 достигает cap после четырёх таких буферов.

## Первый этап cd80c163

Один owner по layerId; бюджет включает заявленное число material/scratch planes.
Ключи delivery отделены от cumulative raster. Retirement не перерисовывает
оставшиеся marks. Replacement проходит через позицию/opacity слоя; canonical
export с includeWashReveal=false его не читает. Восемь CPU проверок и web TS PASS.

## Локальный material prototype

Собственный RibbonStrokePainter, scratch/pool и PaperWetness; фиксированный
projected target без создания соседних tiles. Цвет и preset передаются каждому
batch, gesture bridge не пересекает разные strokeId. Примитивы ribbon/material
общие с обычным рендерером; solver, журнал и canonical wet map не вызываются.
На первом owner GPU-копируется каноническая база слоя. Во время backlog растр
заменяет видимый слой целиком: он не добавляет второй раз пигмент поверх базы.
При handoff проверяются scratches/reveals соответствующего слоя. Loss забывает
ресурсы без GL-delete. Отдельное поле влажности объединяется только для экрана.

10 новых CPU тестов PASS; 39 существующих async tests PASS; web TS PASS.
Engine test действительно вызывает ribbon primitives, а не generic StampPainter,
сохраняет два accepted strokes, повторно использует owner и проверяет сумму
allocated pool live+free+output относительно reservation. Это MockGL, НЕ
аппаратное доказательство картинки, плавности или физической эквивалентности.

## Открыто перед включением

- Полный межслойный cap и изменение camera extent пока явно требуют fallback /
  reprojection; admission error нельзя оставить в продукте и терять input.
- Peer WC live packets пока идут старым путём; нельзя считать multiplayer live UX
  исправленным. Их presentation нельзя записывать в paintedTotal watermark.
- Projected resolution и округление могут менять видимые детали и grain origin;
  это presentation-only, а не доказательство full material parity.
- Нужны actual native Samsung water→pigment, visible intermediate screenshots,
  ограниченная память, natural canonical handoff без halo/doublepig, затем
  same-journal Dry/Undo/Redo/fresh canonical equality и cancellation/resize/peer.

## Проверка живого локального предпросмотра на Vega, 7 октября

Immutable79, 999 SHA; raw HOME `680-lifetime-hardware/temp/live-material-preview-79df/qa-ui-1791375149998/report.json`. Первый запуск до рисования остановился на отсутствующих generated paper assets; raw сохранён. Повтор EXIT0, собственный Chrome закрыт. RAM1784.6→min1399.8MiB.

Вода180 и пигмент86 нанесены без ожидания завершения воды, canonical pending=true, один cumulative owner. Пигмент виден сразу, вода имеет серую подложку. Активный rAF max22ms обоих жестов; tail28/22ms; следующий pointer handler16.6/18.6ms. Это узкий сценарий, не400px и не Samsung. Предварительный мазок уже и плотнее финального: через примерно14s canonical расширяется/светлеет. Непрерывность перехода, peer и исчерпание бюджета остаются открытыми.

После ordered UI Dry native/fresh пять accepted операций; fullRGBA1754×2480 exact0/max0, nonemptyAlpha137970 у обоих. Отдельный rgba-oracle.json сохранён рядом с локальной копией PNG в temp. Экспорт не доказывает качество живого перехода.

Room включает типизированную constructor option materialPresentation; standalone defaultOFF. Видимая база с незавершённым reveal пока требует отдельного исправления; её неподтверждённый patch сохранён в temp, в этот источник не включён.

## Отзыв живого предпросмотра и временный откат

Илья15:18–15:22 подтвердил liveUX FAIL: размытый предварительный материал долго заменяется настоящим мазком, пропадает при zoom. Причина: fullview replacement owner перекрывает canonical/reveal весь solver; cameraextent fallback или camera cleanup удаляет единственный pending visible deposit. Immediatecolor и finalDryRGBA не закрывали этот контракт.

Временный кандидат отключает обе Room constructor options asyncFinish/materialPresentation, сохраняя canonicalring/tone/fibres f685. Отключение только materialPresentation возвращало бы genericStamp и потому недостаточно. Известный sync-drain/newtouch performance риск остаётся; откат направлен на настоящий живой материал, morph и zoom, а не на обещание плавности400.

Rollback208 actualVega90950: source999 exact, constructor false/false, errors[], RAM1879.9/min1291MiB, ownChromeClosed. Actualwheel zoom0.413409→0.244490 while settle=true, настоящий мазок остаётся. NativeDry→RedoRGBA1754×2480 exact0/nonempty138696, Undo changes35951px. Fresh alpha0; log6ops lacksRedo (controller closed sender withoutawaitACK). Поэтому freshPASS отозван; надо отдельный reader bootstrap/ACKguard. Только типизированный Room opt-in false/false включён на5329 по прямому запросу пользователя, источник208; canonical не менялся.

## Отдельный CPU эксперимент pending world overlay

WatercolorPendingMarks ведёт immutable batch identities без GL и без физического оператора. Matching request.execute completion должен удалить только принятую отметку; будущие marks остаются. RetirementO(1), layer dirty coalesced onceframe. Это лишь metadata seam, ещё не подключённый renderer и не доказательство solverprogress visibility. Два CPU отрицательных теста покрывают повторный/stale callback, разныеслои и replacement послеclear.

Следующий renderer обязан: всегда рисовать canonical evolvingbase; поверх него — только ещё не исполненные marks с world bounds. Копия oldbase внутриoverlay недопустима (doublepaint/shadow). Существующий Raster включает base и lowres512, поэтому его нельзя просто перенести изreplacement вsource-over. Нужен отдельный bounded transparent deposition/transport с точным retirement и worldtiles/camerareprojection; кадровый replay всего pendinghistoryO(n²) также не принят как финальное решение.

## Fresh-only с подтверждённым Redo, 7 октября

ReadonlyDB подтвердил семь операций комнаты1fQL29E2: RedoAAvjyCuOrq seq7 targetingLSi8WRFDAu. Первый freshresourcepreflightFAIL:1427.6MiB<1700, Chrome не создавался. После остановки толькоownunused5331/1401253 (cwd/argv/clients[] проверены) новыйreader запущен на5329 с тем жеsource208/999SHA. Пользовательские вкладки/операции не затрагивались.

Session75355 EXIT0/ownChromeClosed; HOME raw `680-lifetime-hardware/temp/live-material-rollback-208/fresh-ack-1791377697340/report.json`. Pre1750.9/min1346.7MiB; AMD Radeon/GL0/lostfalse; constructorasync/materialfalse. Exact7IDs+serverSeq1–7 awaited beforeexport, paperReady/displaySuspendDepth0/settle/rebuild/pendingquiet. NativeRedo→fresh wholeRGBA1754×2480 exact0/max0; both nonemptyAlpha138696. Oracle VPS `temp/pure-water-plan/causal-trace/rollback-ui-1791375948540/fresh-ack7-rgba.json`. Старыйemptyfresh6ops/безRedo не переписан: это отдельный beforeACK/readiness fixture failure. Новый контроль закрывает только существующий180/86/zoom/DryUndoRedo room, не400perf/peer/storedsnapshot.

## CPU анализ первого настоящего dab после касания

DabSystem.startStroke возвращает первыйdab сразу, _onStart synchronously paint+display; spline не ждёт второгоpoint. Hotnext доstrokeLayerId drains предыдущийsettle: удалить барьер без copyback/sourceownership proof нельзя. Coldfirst getOrCreate/filmBuffers может создать8полноразмерных RGBA8plane (1536² по9MiB, всего72MiB). Existing64MiB freecap допускает7, не8. Новый ribbonScratchAdmission только вычисляет допуск (2CPUtestsPASS/TS0), не подключён кruntime и не создаёт GL. Считаются всеfree sizes, rejects unknown/corrupt metadata, неevicts live. Idlewarm не решает обязательные copy/clear и hotdrain, можетсамdelay input; причинность требуетactualGPUphase.

Read-only first-real-deposit-probe.js вtemp сохраняетincomingPointerData.timeStamp, _onStartstart/end, первые CPUtimestampphase +aggregates drain/checkpoint/paint/display/textureAllocate/clear; max3starts, stoprestore, no tracing/perpassmarks/readPixels/finish. VM verifies exactthis/return/once/restore. Это не доказательствоfirstvisiblepixel/GPUwall. Стенды не менялись.
