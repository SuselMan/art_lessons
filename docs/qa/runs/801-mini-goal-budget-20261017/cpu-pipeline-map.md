# #801: Mini M70 — границы расчёта цели

Read-only17.10.2026. WT801база56c99aab. БезGPU, правок728/runtime,
новых процессов, зависимостей, тестовых запусков или заявлений о GPU времени.
Фокус — Mini1024, не большой лист/Room. Подробная карта ниже соответствует
исходникам728; её ожидаемые counts надо подтвердить на фактически загруженном
bundle, а не выдавать статический анализ за замер.

## Идентичность уже существующего Mini bundle

`temp/qa-disposable/mini-stand-build`728, SHA256:

| Файл | SHA256 |
|---|---|
| mini-VF3ACYIS.js | 2fed32ad961d8dd78db4f7f54a82663a016e2ec93b0f07e72b0abcd68be542af |
| chunk-KRDBJN65.js (controller70/Native) | eda41f7a5aca02449b66d7cc244cad93cf516c51833b5f6326bca7695291fff6 |
| chunk-7Q6CHNG6.js (interactive) | d83ae10fa6a2fce07484f947004b49cd36ed2cef8e714810310a446c33888850 |
| chunk-DWLEZPME.js (engine/Plan) | f7665d8ee9c2b2d0d8ab226324d0f99ee945d2106405f0d68a8d90f17ee9789c |

Entry явно импортирует KRDBJN65 дляv70. Существующий bundle не пересобирался.
Сборщик `docs/qa/scripts/build-mini-stand.mjs:13` задаётDEV=true;
Native выбирает diagnosticAlwaysPairedColour=true, поэтому цвет переносится
парой даже для одного пигмента.

## До первой job.ops

`mini-stand/index.html:123` присваивает window.__wcNative послеenginector,
но до installMiniPuddle. Ранний setter может сохранить/обернуть
engine._settlePlan.prepare. `controller-v70.ts:4` вызывает interactive adapter,
`interactive-controller.ts:13` сохраняетoriginalPrepare и создаётNativeTarget;
строка62 позже заменяет owner.prepare на()=>null. Поздняя замена owner.prepare
не обернёт уже захваченный Native prepare.

В interactive `_onEnd:77` сначала исполняется original_onEnd и последний
acceptLiveInput, затем scheduleLiveGoal(60). Deadline выставляется от
performance.now ПОСЛЕ этих действий. Поэтому UP→reset включает их время,
60ms debounce и округление до очередного RAF. `frame:48` в одном callback:
resetFromScratch, затем step(4).

Native `PuddleTarget.ts:81–175` reset синхронно выполняет cancel/invalidate,
clone raw buffers, alignP, contrast.prepare, background.capture, копииводы,
metadata, initialpublish и Plan.prepare. Это не операцииjob.ops.
Синхронная частьPlan.prepare включает fieldFor/allocations; capture/stitch
отложен в первуюjobop (`WatercolorSettlePlan.ts:471`).

## Ожидаемая статическая карта normal job

Условия: R40, standing1, S1, вода/пигментненулевые, pairedcolour,
обычныйAB, groupDry, no brush contacts (Mini специально их отключает),
без дополнительных диагностических cost-path/plateau опций.
Budget96, fullfrontsteps135, fastprefix8schedule25, inward10, carry14.
Индексы0-based ДО динамических preview-вставок:

| Индексы | Число | Работа/источникWatercolorSettlePlan.ts |
|---|---:|---|
| 0 | 1 | capture/stitch всех inputs471 |
| 1 | 1 | split mobile/fixed P/C741 |
| 2 | 1 | pressure seed mode10,560 |
| 3–27 | 25 | outward front prefix/unit,551–569 |
| 28 | 1 | inward seed mode12,579 |
| 29–38 | 10 | inward front:2flat+8relief,587–589 |
| 39 | 1 | coverage11/copy,band6,gather5,590 |
| 40–53 | 14 | paired carry16/15,812 |
| 54 | 1 | remobilization18,845 |
| 55–56 | 2 | presettle smoothing diffuseP/C,933 |
| 57 | 1 | core slice,936 |
| 58–63 | 6 | puddle diffusion+slice,938 |
| 64 | 1 | remaining afloat scale/copy,945 |
| 65–69 | 5 | final fine diffuseP/C,959 |
| 70 | 1 | final mobile/fixed sum+poolstreak,967 |
| 71 | 1 | groupTide seeds19,1377 |
| 72–74 | 3 | group inward10 grouped4+4+2,1382 |
| 75 | 1 | group band6+gather,1409 |
| 76–77 | 2 | tideP and tideC (7+blur5+14),1435 |

Итого78базовыхops. Однаop часто содержит несколькоGLdraw/copy; op count
не является числомdrawcalls или shaderpasses.

`present:661` имеет150ms throttle иshouldPreview. Каждый разрешённыйpreview
при одномoverlap добавляет2presentationcontinuations вops после текущейop
(`722`, splice`1329`). Итого реальныйjob count=78+2*N при этихусловиях;
Nзависит от времени. Carry/core/puddle/fine проходы могут
порождать такиеpreview; две presettle smoothing ops сами present не вызывают. Меняющиесяwater/AB/scale/metadata требуютновойкарты.

Native.step послепоследнейjobop СИНХРОННО вызывает job.finish→land,
финальныйpublish3copies иscratch.destroy (`PuddleTarget:185–192`). Этидействия
не отраженыотдельнымjobindex. Это важная отдельная граница измерения.

## Post job и controller completion

Nativepost всегда10closures (`PuddleTarget:190`):

| Локальныйpostindex | Работа |
|---|---|
| 0 | low gate copy |
| 1 | downsample P/C,2draw |
| 2–5 | low smooth радиусы2,4,8,4,по2draw |
| 6 | reconstructP+copy |
| 7 | reconstructC+copy |
| 8–9 | guardDryP/C,поdraw+copy |

Источник`BackgroundMix.ts:26–35`. Совокупно19draw/copy дляpost10.
Контроллер послеstate.done выполняет target.dry (ещёdraw+copy),
render(dryImage), presentation.setTarget, устанавливает goalReady и запускает
морфинг (`interactive-controller:50–52`). Этидействия внеjob/postiterations.
Дополнительные2RAFstableвQA — критерийнаблюдения, не solver work.

Для88base+post приstep4 требуетсяceil(88/4)=22callback, или21межкадровый
интервал. При60Hzидеальные интервалы~350ms, плюс60msdebounce и~33msдвухRAF
подтверждения (~443ms вместе). Это условная арифметика при60Hz, а не измерение
экрана; выполнениеGPU/CPU/пропущенныекадры/preview добавляются. Поэтому цель
<200ms невозможно обсуждать только как ускорениеshader, сохранивбезизменений
это расписание при60Hz.

## Безопасная наблюдательная инструментация

Раннийsetter: обернутьprepare (сохранитьthis/args/return), отдельноfinish и
собрать initial/finalops.length, perophostwall, passhistogram, drawcounts.
Не добавлятьreadPixels/gl.finish и не выдаватьhostwall заGPUtime. Измерять
UPentry, original_onEnddone,preparestart/end,firstop,lastjobop,finishstart/end,
post/goalReady+2RAF. Native resetpreludeдоprepare иpostпослеfinish можно получить
через lifecycle/pass markers; времяprepare не равно всемуreset.

НЕЛЬЗЯ in-place заменятьops[i]: Plan.wrapпроверяет ops[at]===entry, динамические
вставкисломаются. Для исключительноNative directstep можно вернутьjobfacade,
где exposedops — Proxyoriginalarray; numericget возвращает cachedtimedProxy
функции. Closedoriginalarray иfunctions остаютсянеизменны, spliceвиден,
WeakMaptagsоригинальныхфункцийсохранены. FacadeНЕпередаватьSettleQueue:
егоWeakMaptagsнаtimedProxyнеперенесены. Baseindex лучше хранитьWeakMapпо
оригинальнымinitialfunctions; появившиесяпозже помечатьpresentationchild,
не угадыватьphaseпоокончательномуindex. Finishwrapper сохраняетidempotency.
Отдельное наблюдение dynamiccounts обязательно даже если не нужныperopтаймеры.
