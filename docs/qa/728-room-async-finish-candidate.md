# #728: product Room принимает input через canonical FIFO

Кандидат от `451da1f141fcac218f95fc915af18b137f0b9b41`: typed `PencilEngineOptions.asyncFinish`, constructor применяет опцию, обычный Room передаёт true. Standalone по умолчанию остаётся synchronous; алгоритм FIFO/ownership/material не меняется. Это API для уже проверенного пути, а не повторная реализация очереди. Бюджет Room +1 ровно для constructor opt-in; новая логика в Room не добавлена.

## CPU

39 async tests PASS; первый meaningful test принимает опцию constructor вместо private mutation, доказывает immediate logical journal, отдельный nonempty preview, отсутствие sync complete/source deposition до FIFO и очистку owners после drain. При старом constructor без применения опции тот же тест FAIL на преждевременном физическом draw. Whole web TS PASS; lint без ошибок (существующие предупреждения), map 998/998 PASS. Логи: `temp/pure-water-plan/causal-trace/room-async-api-{tests,types,lint,map}.log`, old counterexample `room-async-old-contract.log`.

## Настоящий current Room, два автора

HOME immutable whole web/shared451,990SHA, own5331/backend4539. Backend7b11 отличается от current только forkRoutes, fork не проверяется. Actual custom физический640×480/GL0, два auth contexts, общий layer-1. Все intrinsic defaults сохранены, только async opt-in, Plan/rim OFF.

Corrected actual matrix30107 EXIT0/ownedChromeClosed:22 barriers,18 whole peer comparisons exact0, nonempty263304; ordinary reconnect и отдельный late auth reader exact0. ОБЯЗАТЕЛЬНЫЙ foreign pencil packet пришёл при canonical pending (`peerDuringSettle=true`); UI Dry captured pending=true/owners1; local Undo captured beforePending=true/beforeOwners1, затем отмена/recovery, Redo/layer remove/undo/redo. Raw HOME `/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/f52-room-native/temp/matrix-current-451-covered/report.json`.

Предыдущий60819 raw сохранён как fixture FAIL: reconnect snapshot seq5 bitmapHTTP200 штатно покрывает pencil stroke seq5, которого нет в resident replay log. Исполняемый **actual** серверный `isCoveredBySnapshot` подтвердил этот ID, tail seq6/Dry4 отрицательны. Corrected oracle требует эту функцию для каждого missing ID и точный common payload, исключая только local op.seq; не игнорирует Dry и не расширяет pixel tolerance. Нет claims полного raw resident identity там, где API сообщает покрытый snapshot prefix.

## Pending canonical owners + настоящий context loss

44022 EXIT0/ownedChromeClosed: два distinct native finish boundaries с разными strokeIds/sameScratch, оба queued при pending. Holder refs21 включают deposition и finish; это НЕ21 finish. Перед loseContext pending=true/refs19, bakeNetworkSnapshot=null, dirty остаётся true. B отправил новый native stroke, ACK пришёл A при actual gl.isContextLost=true. Подтверждённый журнал сохранён; actual lost/restored events, после restore owners0/pendingfalse/snapshot bake1228820B. Ordered UI Dry два автора wholeRGBA0/nonempty183720, независимый fresh fulljournal0/nonempty183720/GL0. Scope pending metadata owners, не carried physical checkpoint или сохранение unrecorded tail. Raw HOME `.../f52-room-native/temp/pending-loss-current-451/report.json`.

## Продуктовый gate ещё нужен

Hardware выше использует private opt-in прежнего source451 и доказывает путь; CPU доказывает public option forwarding. Перед интеграцией/включением на стенде проверить обычный Room на этой новой constructor опции **без private toggle**, поскольку caller bootstrap/snapshot readiness — отдельный контракт. Performance улучшение и same-tape Samsung proof описаны в `728-async-native400-clean.md`; оставшиеся50/67ms active и84/518ms tail не объявлены smooth60fps. Multiuser foreign pencil active856ms также остаётся performance ограничением.

## Actual Room constructor на Samsung, интегрированный 67f076f2

Полный источник `67f076f2865777ddbc070035ab7df9423fc9f76b`: 991 tracked web/shared SHA совпали в собственном HTTPS5331. Actual Adreno650, A4Fine1754×2480, обычный UI create/Room, `asyncFinish=true` уже после конструктора; private async setter отсутствует. Device fetch Engine/Room HTTP200 подтвердил constructor option и caller `asyncFinish: true`. Plan/rim/phase/fibres diagnostic OFF, sourceRebase/zeroContacts ON; intrinsic split=false. Backend4539 не менялся.

Clean no-trace/no-label, native4003s + следующий touch: вода active max50ms/tail368ms, nextTouch100.4ms послеlift/handler37.8ms; пигмент50/67ms, nextTouch83.7ms/handler37.5ms. По9 подтверждённых stroke chunks, pendingACK0. Natural pigment FIFO183→0 занял около80s с дальнейшим завершением reveals; это незакрытая длительность оседания, не input lock. Эти две adaptive arms не причинный speed A/B и не smooth60fps.

Обе arms завершили UI Dry/Undo/Redo и следующий pigment100/Dry/Undo/Redo. Whole straightRGBA nativeDry→Redo и nextpigmentDry→Redo: все4 сравнения0px/max0, GL0/lostfalse, owners0. Water export прозрачен ожидаемо; meaningful следующие pigment endpoints255771/2303848 alpha-positive pixels, исходный pigment4002303662. Самостоятельный fresh/multiuser здесь не заявлен; предыдущие gates выше отдельные.

Raw VPS: `temp/pure-water-plan/causal-trace/native-product67_1791367801495/{report.json,rgba-comparison.json,*png}`. Tool65117 EXIT0, own1452/1453 closed finally. Более ранние raw `native-product67_1791367141714` — RAMpreflight1433<1700 до вкладки; `...1791367763927` — неверно escaped fixture regex доinput, own1451 closed. Исправление только контроллера, не продукта.

Короткий отдельный onscreen tone probe: tool34365 EXIT0, own1454 closed, raw `temp/pure-water-plan/causal-trace/native-tone67_1791368108377`. Actual shader fetch HTTP200 содержит `WC_WET_PAPER_TONE_SHARE=0.50`, `WC_WET_PAINT_TONE_SHARE=0.12`; screenshot до последующего Dry снят после natural idle, без active readback. Однако вода180 проходит по уже широкой pigment400 полосе: чистая бумага почти не отделяется визуально. Это подтверждает источник коэффициентов, **не** читаемость barepaper wet/dry. Нужен отдельный paired screen before/afterDry с раздельными bare/painted ROI. Samsung released после own closure, новых GPU прогонов не было.

## Раздельная экранная проверка wet-tone, Samsung67

Tool14062 EXIT0/own1458 CLOSED. Raw `temp/pure-water-plan/causal-trace/native-tonePaired67_1791368769286`, включая before/afterDry screen PNG, `screen-roi-comparison.json`, `tone-contact.png`. Same fullsource67/991SHA, Adreno650, RAMpre1939MiB, no privateflags; coefficients.50/.12 подтверждены actual fetchedshader. Camera world→CSS mapping: barewater world350..650/y1050, paintedwater1100..1400/y1050 (pigment100 подwater180), drycontrol350..650/y1550. Все операции seq1..8 подтверждены. BeforeDry CPUwet samples0.7488/0.8800/0, afterorderedUIDry все0; GL0/lostfalse.

В full onscreen кадре barewater читается как мягкое слегка серое пятно, исчезающее послеDry; поверх краски эффект слабее. На288pixel interiorROI barewet meanRGB239.70 vsdry246.19 (−6.50/255≈2.6% белого, max9), painted signedRGB[−3.26,−2.58,−3.11] (max7); сухойcontrol wholeROI0/max0. Это наблюдаемый screencontrast, а не универсальный психофизический порог читаемости. Сухую краску/кончик/физику не меняли. Повторные GPU проверки для этих чисел не использовались.

OfflineROI parser исправлен: CDP screenshot2800×1669 включает дополнительную высоту относительно innerHeight; CSS→pixel scaling должен быть из ширины одинаковым по X/Y (2.126≈devicePixelRatio2.125), не независимоеheight/innerHeight. Проверено пересечение ROI с actualstroke и неизменный drycontrol. Первоначальное нулевое сравнение неправильногоROI не было результатом продукта и не сохранялось как PASS.

## Surface product67: startup остаётся непроверенным

Диагностировался только собственный Windows Chrome profile `C:\ProgramData\grafetto\qa728-root-f685`, browserPID19116/renderer10980, port9340 через rootforward9460, targetA74E87CB61B943CEBFBDB4E12DAAF2EE. Ранее root видел interactive DOM безbody; в текущем процессе renderer CPU вырос320→407s, GPUchild18288 всего1.16s. CDP json/list отвечает/titleGrafetto, однако Page.enable/Debugger.enable/pause/Runtime.evaluate каждый bounded5s timeout. BrowserTracing.start такжеtimeout, stop возвращает «Tracing was stopped before start has been completed»: stack samples отсутствуют. Конкретная startup-причина не установлена; ни native paint, ни GPU/GL/engine-ready проверка не получены. Это не Surface PASS и не доказанный WebGL/материальный дефект.

Cleanup: CDP own target close, затем taskGrafetto728RootQA удалена только после exact profile/9340 Arguments check; browser19116 Stop-Process после exact CIM CommandLine ownership guard. Postcheck19116/10980/18288/5952 отсутствуют. Profile/raw сохранены, пользовательские Chrome и задачаGrafettoChrome не тронуты. Raw `temp/pure-water-plan/causal-trace/surface-own-{diagnosis,processes,browser-trace,cleanup,post-cleanup}.json`. Hardwaretool4180/68092 terminalEXIT0, cleanup40951EXIT0; диагностическиеtimeouts отражены raw, exit0 не превращаетихвPASS.
