#787: профиль1000 мокрых операций на настоящем Samsung

Runtime `d32f8e66` (frontend6cd), harness5bb30bca. Один normal512² room,10Socketавторов×100штрихов×8packed dabs; recorded span29м58.2с, не реальный30-минутный soak. Все1002API ID present, wet material сохранён. Actual physical затем canonical сняты ДО независимого fullAPI OFF oracle:0diff/GL0. Last-material age30.960с. Seed4.414с; engine/history/target18.648/19.040/19.442с отnavigation. RoomOpen ready11.974с:join518,paper179,replay11277мс. Oracle после measurement12.289с. Все45с пределы соблюдены. FlagsOFF/стандартные300MiB.

Hook поймал dev-engine assignment с пустым log доhydrate. Методологическая проверка:1000recorded IDs вperOp,55000generatornext,88485draws. На Adreno фактический контекст WebGL1, обаEXTtimer недоступны. GPUms не измерены; `disjoint=false` безEXT не является доказательством GPUtiming. Drawcounts и shaderSHA сохранены. Никакого gl.finish/readPixels диагностический hook не добавлял во время measurement.

| Вложенный wall bucket | Calls | Wall ms | Max call ms |
|---|---:|---:|---:|
|ribbon generator next|55000|9489.0|141.1|
|resolver revision miss|1001|96.5|3.0|
|layerPixelOps, включая resolver|1001|162.1|3.1|
|puddle finish, включаяaccept|1000|539.9|104.4|
|puddle accept, включаяmaterialRender|1000|524.5|104.4|
|materialRender|1001|410.5|104.2|
|puddle present|1105|33.7|1.7|

Эти значения НЕ суммировать: bucket вложены.9.489с — JS walltime внутри generator.next, включая синхронные GL вызовы/driver waits/возможную компиляцию. Это НЕ чистое CPU вычисление и НЕ время GPU. По отдельной операции median4.30ms/p9551.60/max146.20ms, также walltime с driver waits.

Источник dispatch `index.ts` при historybatch c `_displaySuspendDepth>0` выбирает synchronous `_paintDabs`→`_paintRibbonDabs`, который исчерпывает generator через next. Профиль не содержит ни одного `_stepRebuildJob` вызова. В этом пути `_runSlice` не нужен; существующий gl.finish в `_runSlice`/`_stepRebuildJob` относится к sliced remote/rebuild. Сам gl.finish hook не считал, поэтому абсолютное отсутствие иных driver-sync не доказано. Нельзя убирать TDR guards на основании этого прогона.

LongtaskObserver:93task, max656мс, sum12464мс с начала документа; самый656мс начался доengineassignment и пересёк его. Внутри assignment→profilestop началась91task,max386мс. Сумма clipped overlap этого окна12012.8мс. Это подтверждённые main-thread longtasks, но не отдельное измерение физического UIframe/GPU. Первыйdisplay+2RAF остаётся partialvisible proxy.

Большая частьdraws — реальное material painting:86000draws под ribbonDabsNext,1001materialRender,1001acceptInput-подобных pass подaccept. Per-op с вложеннымиfinish88001draws, то есть≈88draw на8исходныхdab. Program families поfragmentSHA: WC_FIELD_ADD90faf1…24042draw; RIBBONf2def7…22000; native/DAB1d8375…16000,796b72…9001,9277fd…8000; WC_FIELD_OPae45ac…8029. Counts — неGPUcostдоли.55next/operation отражает yieldграницы нескольких материальных passes, не55исходныхdab.

Вывод: resolver/cachemiss≈0.1с не объясняет11.3с replay. Следующий узкий probe при отдельном разрешении — coarse wall counters GL-call families внутри ribbon.next (draw/copyTexSub/texImage/readback/finish), толькоагрегаты, без per-draw stacks/query. На Intel EXT можно отдельно сверить GPUcost, однако переносить цифры другойGPU наAdreno нельзя. Не предлагаем ни cache, ни изменение физики/порядкаокругления, ни удаление guards без измерения.

Shared QA backend/другойVegaоператор; одинtrial, wrappersдобавляютoverhead, неisolatedbenchmark. Battery100%AC37.9→37.9°C. Всеownroom/context/socket/auth удаленыfinally, оригинальнаявкладка восстановлена. OwnSSH4062478/session79566 остановлен; remote9235/userChrome не тронуты. Raw`787-samsung-profile-20261017` остаётся толькодо guarded finish.
