# #747 — конечные большие листы: рабочий журнал 17.10.2026

Это промежуточное состояние, не итог успешного QA. Задача остаётся критическим блокером.

## Требование

Акварель M70 должна работать на любом конечном размере, который поддерживает приложение, включая A4 1240×1754, A3 1754×2480 и A2 2480×3508 в обеих ориентациях. Бесконечный холст не входит в релиз. Нельзя подменять исправление запретом, уменьшением листа, незаметной сушкой или старой моделью акварели.

## Ветка и принцип

Рабочая ветка `agents/747-single-rect`. Исходный проверенный ночной кандидат интегрирован через `477be600`. Текущий кандидат подключения больших листов — `ed934037`, уточнения координат/производительности — `6cddeca2`.

Сырой мокрый материал остаётся общим для слоя. Канонические поля сохраняются страницами RGBA8; ограниченные GPU-окна читают одну неизменную версию материала. Глобальные Contrast/retained components/Background считаются на сетке всего листа. Окно 1536² имеет внутреннюю область 256² и запас 640; проверяемый граф зависимостей текущего M70 требует 612. Одинаковые окна рассчитываются один раз. Новый многотайловый путь использует явный минимальный домен 1536, прежний малый путь сохранён. Политика M70 и минимум 1024 малого поля теперь заданы независимо от DEV/review.

## Уже проверено

- Web TypeScript: exit 0 после подключения, глобальных координат и группировки окон.
- Целевая регрессия: 30 файлов, 241 тест, PASS (до последнего подключения группировки; отдельные тесты группировки 5 PASS).
- Независимый CPU-оракул чтения страниц, отрицательных координат, clamp/zero и частичных краёв: PASS.
- Координаты A4/A3/A2 в обеих ориентациях: сохранены нижний и правый неполные тайлы.
- Частичные ошибки выделения scratch/presentation: освобождение и повторная попытка проверены, включая настоящий pinned-budget failure.
- map:check PASS, новые файлы покрыты существующими модулями. MockGL не является проверкой акварельных пикселей.

## Найдено на настоящем GPU

На AMD Vega последовательный A/B в одном контексте, лист 1536²: вода совпала; P отличались 2 канала, C — 11, максимум одна ступень из 255. GL ошибок и потери контекста не было. Повтор с промежуточными захватами показал: reference P/C, solver P/C/coverage и все пять coarse Background полей совпадают побайтно. Первое отличие — после финального full-resolution восстановления. Подробности и воспроизводимый harness: `../747-native-window-20261017/` и `../../harness/747/native-paged-ab.cjs`.

Исправление сохраняет прежнюю глобальную UV-интерполяцию через viewport всего листа с локальным FBO. Математика смешивания и прежний монолитный путь не изменены. Повтор на Vega прерван потерей SSH/CDP-доступа; это не результат GPU-теста и не доказательство OOM. Повтор на Samsung Adreno 650 прошёл: все промежуточные поля и итоговые P/C/coverage побайтно совпали, GL0, потери контекста нет. Доказательство `../747-native-window-20261017/samsung-global-uv-pass.json`, runtime `6cddeca2`.

Первоначально 1536² пересчитывался 36 раз из-за совпадающих окон. Группировка сокращает это до одного расчёта, A4 — до 3, A3 — до 18, A2 — до 60. На Samsung проверочный standalone расчёт 1536²: reference 820.5 ms, paged 2784.5 ms. Это не измерение задержки в UI. Фактическую скорость комнаты ещё измеряем.

Из ревью дополнительно исправлен владелец временных буферов: большие источники и их settle-план теперь используют один и тот же ограниченный пул. Отдельный тест проверяет, что ни один буфер не возвращается в чужой пул.

## Ещё не доказано

- Повтор исправления координат на Vega: Samsung уже прошёл, Vega недоступен.
- Перенос зависимости через искусственные границы окна с ненулевым origin; CPU-граф не заменяет GPU-проверку.
- Реальная комната A4/A3/A2: pointer, края, сушка, Undo/Redo, совместное рисование и холодный перезаход.
- Общая память и скорость больших заполненных листов на всех устройствах. GPU-кеш 120 MiB ограничивает только подключённые буферы: отдельно есть общий solver/front-field, обычные тайлы, бумага, CPU-поля и backing. Называть 120 MiB общим бюджетом нельзя.
- Строгий межустройственный детерминизм #748 остаётся отдельным открытым блокером.

## Временные ресурсы

Используется прежний общий backend 4558 и прежний QA frontend 5384 с отдельным временным WorkingDirectory drop-in на эту ветку; production не менялся. Владение, TTL и исходная конфигурация записаны QA-оператором в зарегистрированном приватном каталоге. На недоступной Vega остаётся собственный Chrome PID 647965 с отдельным профилем; его очистка ожидает восстановления SSH. Это явно незавершённая уборка. Новые постоянные сервисы не создавались.

## Уточнение после проверки настоящей комнаты и широкого домена

Ночной лимит пользователь снял в 09:07; работа над критическим блокером продолжается.

A4 portrait на Samsung: настоящий pen ввод через обе границы 1024 одновременно дал видимый материал во всех четырёх тайлах. Мазок у нижнего правого края принят. Сухой результат совпал с независимым полным replay на физической области листа; Undo сушки → Redo сушки восстановили точные пиксели четырёх тайлов. GL ошибок нет. Это частичный успех: цикл Undo/Redo занял около 58 секунд каждый (включая ожидание и чтение результата), что неприемлемо и требует отдельного измерения. A3/A2 и второй участник пока не проверены.

Независимый A/B: физический лист 2048×512, расчётный домен 2048×1536, окна с ненулевыми origin. Начальные глобальные и все оконные reference P/C на физической области совпадают. Затем solver расходится: P 10396 каналов (max65), C 20380 (max99); итог P 10272 (max15), C 20006 (max29). GL0, контекст жив. Совпадение выходного coverage здесь не доказывает совпадение фронта: publish возвращает сырой contour. Таким образом, прежний успешный тест 1536² недостаточен. Гипотеза округления локальных координат пикселя проверена на Samsung: замена четырёх выражений на gl_FragCoord не изменила ни counts/max, ни material hashes. Эксперимент откатан, исходные shader SHA сохранены. Следующая проверка — промежуточные стадии solver и нулевой padding за физическими границами листа.

Полная engine регрессия: 2360 тестов PASS, один устаревший тест запрета большого листа исправлен по новому требованию; его файл после правки 4/4 PASS. map:rules отдельно обнаруживает существующий ночной импорт engine → lib/restoreGeneration.ts (8ccf41fc); этот gate не зелёный. Последние изменения shader source намеренно нарушают SHA guard до GPU-проверки, hash заранее не обновляется.

## RCA чтения расчётных ячеек (QA эксперименты, не принятый runtime)

Все входы первого front-прохода (pressure/coverage/mask/source, world ROI) совпали. Уже первый проход расходится на 30 каналов/max1; обход ускоренного prefix front обычным native front не убирает отличие. Scoped NEAREST только для source front убрал все измеренные front-отличия. Причина связана с чтением математически целочисленных ячеек через LINEAR при разных размерах FBO.

QA-only вариант point front + point fieldOp centre reads (с сохранением аппаратного LINEAR для дробного кольца mode6.d и корректным учётом alias) дал точное совпадение финальных P/C/coverage и всех coarse полей. До финального смешивания остался один канал C/max1: x1342,y291 в GL координатах, на committed core окна origin512. Отдельный point diffusion и повтор gl_FragCoord его не устранили; shader эксперимент снова откатан. Нельзя считать full solver equivalence доказанной.

ВАЖНО: reference hashes изменились относительно старого hardware-LINEAR расчёта. Эти пробы подтверждают причину, но не доказывают сохранение утверждённого target. Пока все sampler-коррекции только в QA harness, production/runtime не принят. Перед включением нужны old/new native A/B, малый лист, совместимость записанных операций и явная версия политики расчёта.

## Штатный кандидат после интеграции

`0f0dd9c1`: M70 S1 явно выбирает дискретные чтения в primitive field/front/diffuse и group tide. Fractional mode6 ring интерполируется явно четырьмя NEAREST taps с весами в пиксельных координатах. Legacy primitive default и исходная shader-ветка оставлены. Scoped sampler state восстанавливается при вложенных вызовах, alias и исключениях; validation не принимает несовпадающие сетки/scale/feedback.

Настоящий Samsung, без любых QA_POINT/QA_MANUAL overrides: горизонтальный домен 2048×1536 и вертикальный 1536×2048 прошли ALL full-phase reference/solved P/C/coverage/coarse/final, ноль отличающихся каналов, GL0/errors0. Это новый corrected M70 candidate; старый утверждённый native golden ещё сравниваем отдельно. CPU 4 файла/30 тестов PASS, web typecheck exit0. Полная engine регрессия запущена.

`089be3e2` отключает только неиспользуемые промежуточные preview-копии больших окон, сохраняя initial/final публикацию. `a983dc26` передаёт native владение одноразовым восстановленным окном вместо второй копии шести плоскостей; общий сырой материал в CPU pages не меняется. 8 lifecycle/ownership тестов PASS. Ускорение в настоящей комнате пока не измерено.

`58f7e98e` переносит неизменённый restore-generation helper из lib в открытый вход engine: map:rules теперь exit0, пять существующих warnings; 4 Room restore теста PASS.


## Текущий статус после измерения задержек (17 октября, 10:55)

**Готового исправления больших листов пока нет.** На A4 мазки принимаются и сухие пиксели проверены, но ожидание результата слишком долгое. A3/A2 в настоящей комнате ещё не пройдены.

### Что найдено и исправлено

- При расчёте разных частей большого листа один и тот же материал мог давать разные цвета. Причина: аппаратное сглаживание чтения целых расчётных ячеек зависело от размера текстуры. В новом M70-кандидате целые ячейки читаются точно, дробное кольцо смешивается явно. Samsung: горизонтальный и вертикальный широкие домены, компактный пример и 1536² совпали побайтно во всех проверенных стадиях. Между разными GPU это ещё не доказано.
- M70 мог неожиданно переключать большой размер кисти на половинное разрешение. Теперь S1 выбирается до проверки размера; целевые тесты проходят.
- Новый shader M70 затронул общий исходник старого инструмента. Исправлено отдельной программой только для M70 mode6; четыре прежних shader-строки восстановлены точно. После разделения Samsung defaultX и 1536² снова совпали; 39 CPU-тестов прошли.
- Кеш заранее списывал память под mip-уровни даже у расчётных текстур, которые их не создают. Теперь учитывает их при реальном выделении и сначала освобождает место. Бюджет остаётся 120 MiB. 58 тестов проходят; реальное ускорение пока измеряется.
- Проверка однородного CPU backing занимала лишнее время: проход по каждому байту заменён проходом по 32-битным значениям без копии. 15 тестов проходят. Это не устранило основной тормоз.

### Что найдено, но ещё не исправлено

- Даже короткий мазок на A4 вызывает сотни выгрузок и загрузок GPU-буферов. В измеренном прогоне: 1024 выгрузки и 912 загрузок, около 28 секунд от нажатия до покоя и 17 секунд после отпускания. Чтение пикселей для отчёта было после измерения. Это неприемлемая задержка.
- Диагностическое увеличение кеша до 320 MiB ускорило ожидание, но не устранило его и не принято в продукт. Готовится хранение временной анимации только вокруг мокрого участка; полный исходный материал и сухая цель должны сохраниться.
- Компактный рисунок пока запускает сетку окон по всему листу: A3 — 18 расчётов, A2 — 60. Уменьшение области расчёта исследуется отдельно и ещё не включено.

### Что именно уже проверили руками через настоящий браузер Samsung

- На A4 провести акварельный мазок через вертикальную и горизонтальную границы внутренних тайлов: материал виден во всех четырёх частях.
- Нарисовать возле нижнего правого края A4: ввод принимается.
- Высушить результат и сравнить с независимым полным воспроизведением на физическом листе: пиксели совпадают.
- Отменить сушку, затем повторить её: четыре тайла возвращаются к тем же пикселям. Скорость этой операции ещё неудовлетворительна.
- Рассчитать одинаковый материал целиком и частями на широком и высоком домене: новый M70-кандидат совпадает побайтно на Samsung. Это отдельная проверка расчёта, а не совместного рисования.

### Что ещё не проверено

- Полный сценарий A3/A2 в обеих ориентациях: ввод, края, сушка, собственные Undo/Redo, второй участник, перезаход.
- Удовлетворительная скорость живого ввода и Undo на любом большом листе после последней оптимизации.
- Плотно заполненные большие листы и долгие совместные сеансы.
- Визуальное отличие нового M70 от прежнего native-эталона; строгий межустройственный результат.
- Surface: отдельный WebGL smoke прошёл на Intel, но запуск расчёта в headless-контексте потерял GPU-процесс до получения engine context. Это не успешный тест акварели. Собственные процессы Surface убраны. Vega недоступна, iPad не проверен.

Полный engine-прогон и проверка TypeScript запущены повторно после последних изменений. QA frontend/backend остаются для продолжения проверки; production и Git push не выполнялись. Очистка собственного браузера на недоступной Vega остаётся неподтверждённой.


## Актуальное дополнение, 17 октября, 11:45

Runtime df1b7fe9, три штатные опции больших окон: пропуск доказанно пустых окон, отсутствие нулевой foreign-плоскости, detached key без лишней копии. Samsung: standalone матрица опций даёт ноль различий во всех стадиях; настоящая чистая комната A4 landscape — raw ROI/full и canonical/replay ноль различий, GL0. DOWN→idle9455мс, UP→idle6808,5мс: скорость по-прежнему блокер. Это уточняет более ранние замеры выше, а не означает контролируемое сравнение комнат с разной историей.

Полная engine регрессия при этом runtime:259файлов,2492теста PASS,412,99с. TypeScript предыдущего source-кандидата PASS. Phase owner и fingerprint неизменённых raw tiles пока внешние кандидаты, НЕ активный runtime.

Сравнение прежнего и нового Native расчёта на том же Samsung: sparse fixture1024² совпала полностью.1536² отличается: P1176каналов/max19, C3476/max19, coverage0, compositorRGBA6628/max77. Обе Native ветви, legacy sampler действительно исполнен; старые десять field-текстур освобождены между ветвями. Это не проверка двух GPU. Картинки и компактный proof: ../747-native-rca-20261017/native-old-current-golden.json. Сохранение прежнего вида на всех размерах не заявляется.


## Фазовая диагностика и повторная отмена, 17 октября, 12:00

85fdde93/d96a6f73: Samsung input224MiB без расчётного поля, solve120MiB; live input перестал выгружать буферы. Замеры независимых чистых fixtures: start109/103мс,4MOVE114/135мс суммарно,end173/158мс. UP→idle5,3/5,8с, worstframe0,8/0,9с — всё ещё блокер. RawROI/full и goal/replay нольdiff;GL0. Диагностический флаг по умолчанию OFF. Основные измеренные затраты в pool allocation/LRU/readback, не в отдельных обёрнутых field/front вызовах. Полное время загрузки пустого контекста31–33с пока не разделено на bootstrap/paper/replay, не приписывается одному акварельному расчёту.

Широкая регрессия после phase-owner нашла19 ошибок прежних тестов Plan: late finish/ops после dispose должны быть no-op, а wrapper выбрасывал Retired field job. Исправлено1b92a6f3: publiccallbacks идемпотентны, scope.run остаётся строгим; lease не освобождается повторно, поздние записи запрещены. Реальная рабочая копия: весьPlan93+core32+6новыхtests=131PASS. Первый full-прогон остановленSIGINT после обнаружения; новый fullengine после исправления запущен отдельно, PASS ещё не заявлен.

Lanpad штатно разбужен, SSH доступен, IntelUHD. Собственный интерактивный браузер готовится отдельно от Samsung; межустройственных pixel-доказательств новой версии пока нет. Samsung6format matrix начала с A4p; первый harness pre-DOWN отказался из-за выбора слоя,0новыхops, не runtime finding.

## 12:54 — responsive input memory enabled; R32 controlled candidate

Runtime aa12e9d8 enables previously measured224MiB input/120MiB solve policy by default. Full engine run PASS266files2588tests428.49s; discovery preceded new R32proof suite. Separate current proof+invalidation run PASS20tests2files6.61s, earlier planner/source run PASS15tests3files2.16s. Web typecheck exit0. Changed-source oxlint exit0, index retains10pre-existing warnings.

R32 remains defaultOFF behind explicit engine diagnostic. Existing1536field/core geometry unchanged. Both Intel and Samsung compactX:4groups→2kept2skipped, all10stage and finalP/C/coverage0diff vsNative. Intel fullstrip keptall4 and sameold dfe bytes; Intel transposedcompactY also4→2 and all0diff. Samsung actual sentinel100draws/fourcases staysR255, finalcoveragezero, GL0. These are numeric gates, not UI performance proof. RealA2Room with fresh owned layer is next.

IntegerContrast BG controlled experiment removed all76crossGPU BGchannel differences and matched exactintegerCPU all65536channels, but final crossGPU P/C remainedmax18/30. Explicit highp samplers did not close it. All integer/highp appchanges reverted and retained externally; crossGPU blocker remains OPEN.

### 13:24 — capture scheduling and stronger controls

Controlled A2 natural target vs independent full API history with baseline612: exact five-tile equality; optimized5 vs baseline29 actual Native preparations. Performance remains FAIL at8.8/9.3s and1.2–1.3s RAF stall. Forced identical true Contrast reference on Intel/Samsung still diverges in solved material: independent later cross-GPU cause remains open. Phase1 captured-read ownership on both GPUs: six actual source handles released exactly once, revisions stable, ten stages and finals equal own old baseline, GL0. Uncached gate does not measure managed memory savings. Root phase1 CPU30/3files PASS; applied revised cooperative phase2+deadline phase3 behind default-OFF QA flags, validation underway.

### 13:31 — combined numerical gate; real A2 performance pending

Runtime466745f1 adds default-OFF empty reference skip plus completed-goal input-budget transition. Root CPU112tests/6files PASS, full web typecheck0, scoped lint0. Combined capturedBacking/cooperative/8ms/R32/post/reference skip on Intel and Samsung compact X:10stage+finalP/C/coverage0diff vs Native and own historical baseline. Both actually reference2kept/2empty, post2kept/2skip, fixedwindow2kept/2skip. Samsung partialcapture cancel→reset separately PASS/noPublish/releaseexact. Uncached captures are NOT managed-memory savings. Intel observational timings locate indivisible Native step320.8ms/reset142.6ms even with deadline8; no responsiveness claim. Samsung actual managed A2 two-stroke/profile/oracle underway; full engine regression running PID120454, log external capture artifacts. All8kernel files unchanged.

### 13:36 — full engine PASS; actual A2 responsiveness FAIL

Full engine runtime466745f1:275files/2683tests PASS244.28s, process exited0/ledgerclosed. A2 managedseam UP9784ms, DOWN142/MOVEmax313.9/UPcallback146.7, RAFmax501.6/18frames>100ms, solver6031/max397.5ms, 20managed capturedhandles80MiB releasedexact. Completion71.5ms/input224 aftercomplete. Edge resume UP18329.8ms withTWO material admissions/10Nativeprepares, cannot attribute two solves to same target/epoch because oldtelemetry lackedidentity. Do NOT compare18.3 to previoussingle5window9.3 as algorithmAB. Naturalgoalfirst vs independentfullAPIall6OFFbaseline61229prepares: five-tiles exact0,GL0,history unchanged. Actual performance remainsFAIL.

CORRECTION to13:31 standalone timing:320.8ms Native.step included per-pass QA trace GPUreadbacks. With QA_TIMING_NO_PASS_READS1, pagedNative.step max5.1ms; GPUwait moves to required solved readPixelsRegion up to1413.8ms. These are observer-qualified timings, not standalone clean kernel/UI performance. RealRoom telemetry adds noGLread and still records long frames. Intel elapsedquery supported64bits/timestamp0, Samsung EXT_disjoint_timer_query absent. Query-only fix would not cover Samsung.

### 13:49 — bounded persistent ownership runtime509fb989

Root applied reviewed candidate30e55cc5 plus engine default-OFF persistCapturedBacking flag. CPU104/8files +buffers167/16files PASS; actualwebtsc0/scopedlint0. Intel and Samsung compact combo all10stage+final exact vsNative and ownoldcompact; actual source/window upload retain leases releasedexact1, but factoryunmanaged means0retainedbytes and no large-memory benefit claim. Separate actual2×2managed GPU probes:3repeat evict/hydrate cycles samearray/noextraGLreads; writer invalidation causes1normalread; uploadsamearray/cap/release0. Persistent logical cap source64MiB +currentwindow54MiB, excludes rawsnapshots/oneshot/backings/otherheap. Strictcontinuous A2 ownlayer seam+edge performance/replay with7earlyflags underway.

#748: chosenforced-reference firstsplit9planes plus firstoutwardseed exactcrossGPU; nextoutward1underinvestigation. No shader/math changes.

### 14:05 — actual clean and multiwet A2 remain PERF FAIL

Runtime509fb989 continuous multiwet A2:8.53/9.90s, IDs prove same target/scratch epochs1→2, exactlyone admissioneach; RAF618/602ms. Separate CLEANnewA2 fixture12, old11untouched:7.207/7.619s, RAF301/401ms, inputDOWN72/83ms, seamMOVEmax96.6/UP155.1ms, edgeMOVEmax6/UP25.2ms. Both naturalgoalFIRST fullAPIall7OFFbaseline61229prepares exact0/GL0/historyunchanged. CleanhistoryonlyLayerAdd+2strokes. Persistent logicalpeak105/109MiB, source≤64/window45, oneshot16/20MiB, uniqueleasedbacking121/129MiB; notprocessRAM/GPUheap. Actualreuse recorded, but performance stillFAIL.

#748 chosenforcedreference outward1 and13 exactcrossGPU; outward25 has18355costRdifferences/max8, GBAexact0. Localizing laststride8 boundary17 next. Firstsplit9planes/seed exact. PapernearestcontrolpreparedbutNOTexecuted becausefirstGexact doesnotprovepaperrootcause. Scissor64 onlyexternalQAprototype pending, basedseparateconditionalauxiliarybound plus roleclears; actualwindowrestorationZERO, notdefaultCLAMP.

### 14:15 — first cross-GPU divergence isolated; scissor QA guard failure

#748 forced-identical-reference seed/outward1/13/17 exact crossGPU; outward17 laststride8 hash427a8d811c15ec60c3e6d17f1c49e0e5c417089368567a8664b0250b38201b76. Firstnative stride1 outward18:2594Rchannels/max1,GBA0; all10stage NativePaged gates on eachGPU0/GL0/restored. Nativefront-only highp sampler QA control prepared, no appshaderchange. Fixturepaper flat2x2constant, so filteredpaperheight speculation is NOT established cause.

Scissor64 firstSamsung run stopped by failclosed ownership guard before numerical result: scoped draw lacks owned destination. Imported QA AccumulationBuffer prototype may differ from actual engine field constructor; actualprototype hooks being corrected. No numerical/performance PASS claimed. Fullfield/viewport/kernel unchanged; hypothetical optimization not enabled in app.

### 14:18 — scissor64 numerical gate PASS; Room performance still unmeasured

Fixed actualprototype QA ownership, not renderer. Samsung fullcompact fourwindow scissorPagedonly vs unclippedNative all10stage/final P/C/coverage0diff, GL0, exact2prototypesrestored. 800producerdraws eachsemanticfullclear; ROIarea48,807,200 /full1,887,436,800=2.59%. Separate NO_PASS_READS gate also0diff: actual3377.4ms fourwindows vs Native776.6ms onefield; NOT controlledspeedAB/NOT UIperformance. Optionalpassobserverreads0; mandatorystage/finalreadsremain. InstrumentedrequiredROIreadPixelsRegion12calls102.3ms/max22.2, nottotalallGLreads; native.step max92.1ms,resetmax164.1ms. Candidate not enabledinRoom/app; actualRoomdesignpending.

#748 external exactbyteCPUoracle on matchedoutward17 reproduces Intel18 allRGBA0diff. Samsung18 differs2594R/max1,allnegative1; GBA0. Fixtureflatpaperconstant/coveragebinary assumptions explicit, no universalshadercertificate. Intel nativeonly fivehighpsamplers control leavesprefix17/first18/final unchanged; programrestored/deletedexact. Samsungmatchedcontrolpending.

### 14:23 — native sampler precision control partial effect only

Intel nativefivehighpsampler control leavesoutward17/18/final exactownOFF. Samsungprefix17exact; first18highp fixes1163of2594Rdifferences, residual1431R/max1/allnegative1 vsIntel, GBA0. OwnNativePaged all10stage/final0/GL0,5samplerpatchedprogram/restored3props/deletedownedprogramexact. DeterminismNOTfixed; appshaderunchanged. NativeprogramONLYDITHERoff first17/18 matchedcontrols underway, prefixprograms/samplers unchanged. No globalDITHER experiment reused as proof.

ActualRoomscissor candidate design approved for externalreview: genericdefaultundefined inspect nativeScope perwindow, hooksONLYinside synchronousreset/stepfinallyrestore, nohooksacrossRAF; immutablecapturedsupport/noForeign andunknownfallback, family/cancel lifetime retained. Noappchangesappliedyet.

### 14:29 — A3 portrait actual Room PARTIAL correctness PASS / performance FAIL

Samsung A3p1754x2480 current509+7earlyflags: seamUP6159.3ms,edge6964.3; DOWN97.4/65.5,MOVEmax118.1/5,UPcallback134.6/73.3; RAF317.5/417.9,solvermax331/344. Strictcontinuous exactly1solveeach. NaturalgoalFIRST vs independentfullAPIall7OFFbaseline61216Nativeprepares: all5physicaltiles rawROI/full/outside0diff, final0diff,GL0,3ops/historyunchanged. UndoRedoDry NOTexecuted; onlytwo-stroke partialPASS, fixturepreservedforfollowup.

NativeDITHERonly first17/18 unchangedOFF on BOTHGPUs; matched140nativecalls disabled/restored140, prefix/other956draws untouched. Thus DITHERcontrol no effectfirst18; notgeneralUNORMroundproof. ROUND_R externalQAoneprogram originalsamplers control rootreviewed, matched17/18 GPUcases underway. Appsource509unchanged.

### 14:40 — actual scoped A2 correct but STILL PERF FAIL

Runtime dc49353d generic defaultundefined synchronousnativeScope; root37tests/4filesPASS +actualwebtypecheck0/scopedlint0(10existingindexwarnings),14externalCPUproof. 8mathkernelsunchanged509. Samsung previouscleanA2fixture nowhad3priorops/1wetlayer, newownlayer; NOTemptycleanAB. ScopedseamUP9010.9ms/edge10243ms, RAF501.5/635.3. NaturalgoalFIRST vs independentcompleteAPIall7OFF+factoryundefined baseline61229prepares exactall5physicaltiles/rawROI/full/outside,GL0/historyunchanged; baselinecontroller nativeScopeFactoryOfftrue/originalfactoryrestoredtrue. PerGESTUREexclude5bootstraps: seam4scopes800draw+fullclear/84runs=detaches, area42.69M/1887.44M=2.26%; edge5scopes1000draw+fullclear/105runs=detaches,area1074.26M/2359.30M=45.53%; allrestoreOwnershipExact/disposed. Outerstep5950/max332/249calls and6740/max375/239calls; fieldOp595/860ms inclusive, reads1662/2356ms/evict1295/2135/hydrate426/480 nested, cannotadd. Noexclusiveclear/getParameterattribution; innernative.step/resetNOTinstrumented Room.

#748 combined nativehighpsamplers+ROUND_R first18exactcrossGPU/CPU9fc03..., prefix17exact. Originalsamplers+ROUND_Rfixed2545of2594, residual49allnegative1; highponlyfixed1163/residual1431. BOTHGPUs DITHERonlynoeffect. FullcombinedfinalP/CstillcrossGPUdifferent,covexact. Intelcombinedoutward25/inward10 exacthistoricalownboundaries; Samsungmatched25/10underway.

PerfieldscissorROIexternaldelta reviewed4CPUcases/160propertiesPASS: clipindividualexpandedrawrects beforetakingbbox, noadditionaldraw. ExistingA2geometryforecastseam0%/edge95.41%lessarea; notperformanceproof. Pending actualCPUprofiler afterGPUboundarypair, noGPUqueries/trace.

### 14:56 — measured CPU bottlenecks and production data-transfer fixes

Perfieldscissor37e actualSamsung oldfixture3wetlayers: seamUP8304ms,edge9979ms (edgeCPUprofilequalifiedoverhead), exactnaturalgoalvsfactoryOFF29prepares/rawallphysical0/GL0. Peredge area2.09% vsoldbbox45.53%, no desiredspeedwin. CPUedge4481samples/~10s: getParameter3139.8ms(readstate1984.5/scissor1140),readPixels1913.5,writeRect1325.2,GC288,idle407.5. Sampling nativecallwait attribution, NOT GPUexclusive timing; raw565899B removedaftercompactproof07cbf5a5.

Root03c46d2a MaterialFieldPages exactnativeword uniformcompression/fill/read and fullpageoverwrite avoiding oldcopy: independentold/new3randomizedCPUtestsPASS; production24tests5filesPASS,webtsc/lint0. ActualIntel/Samsungprebandcases retainownhistoricfinalhashes exactly. Rootcd993f8e specialized residency state: copyonlybindings3queries vs7, readbackFBO+PACK2vs7, uploadbindings+UNPACK6vs7, genericconstructorunknownscope unchanged. Nestedhydrate/evict preserveownstate; deletedtextureguard/throws/pins tested. Root253tests21filesPASS/typecheck/lint0. Memoryenvelopeunchanged input224/solve120; solve224externaldiagnostic NOTexecuted. FreshblankownA2fixture13 performance/proof nowunderway, nooldwetlineage comparison.

#748 combinedfront bandoutputdiff R398/max6,G7943/max230,B325/max36,A913/max1. Preband a===d pressure exactcrossGPU; prebandbcoverage ALREADYdiffR398/max2,B/A398/max6,G0. ThusbandshadercauseNOTproven. Lastoutward25 iscapturedBEFORE identityhomecopy; actualprebanda read establishedcopyexacthere. Remainingc mask isnextread; mode11coverageproducer vsitscopytobeisolated.

### 15:11 — no-scope controlled qualification and constructor followup

Freshownedfixture13 scopedstatefixcd993:4.884s/unprofiledseam5.560/profilededge, RAF334/351; exactgoal/raw/fullAPI29prepares3ops/GL0. EdgegetParameter1390ms mostlyQAscissor1076,genericconstructor241; read838/writeRect171. Freshfixture14 NOSCOPEa872(factoryundefinedbeforecontroller):5.321s/6.602s(profileedge),RAF318/334; exactallgoal/raw/API29prepares3ops/GL0. Query1250ms mostly genericconstructor1030,readbackPACK173; read1411/writeRect170/idle1467. These are differentsyntheticinputs/CPUprofiles, NOTstrictspeedAB; bothPERFFAIL. RawCPUdeletedaftercompactproof923bd4/06db.

Roota872 yieldsbetween3requiredmaterialplanes (42tests4filesPASS/webtsc/lint0): deadlinecancheckbetweenreads; cancellationreleasesownersandnopartialgoal. Roote562 managedconstructor bindings-only3queriesinstead7, nulltexImageallocationdoesnotconsumeUNPACK; hostilepixelstore+zeroallocationnew9thstatetest,225tests19filesPASS/webtsc/lint0. Genericpreserverremainsavailableunchanged. Lastfulllatestattempta872PID175859 stoppedSIGTERMafterpausebecauseconstructorfollowupchangesSOURCE; NOcurrentfullPASSclaimed (lastfull4662683historical). Ownprocessledgerfinished−15/nochildresourcesintended; fullstablee562pendingrestartafterdeviceperf.

QAtrackedscissor4b42 nowreads4stateparameters+1enabledoncepernative.run, tracks7settersONLYsynchronously, noqueriesperdraw orhooksacrossyield;7CPU+actualPlan199drawPASS. Appmath8kernelsunchanged. GPUgate/perfpending.

#748 prebandc mask exactcrossGPU d098..., a/dpressureexact e3...; ONLYbcoveragealreadydiff R398/B398/A398, G0. Intelmode11OUTPUTbeforecopy hash==prebandb e0..., paramsk1/band.96/size.01; Samsungoutputnext. Specializedmode11QAprecisioncontrolpreparedbutNOTapplied/GPU.

### 15:21 — latest clean A2 still fails performance; mode11 precision isolated

App e562d496 + QA tracked scissor4b42aa79 CLEAN fixture15: seamUP4127ms unprofiled, edge4977ms CPUprofiled; DOWN56/56ms, MOVE52/7ms, UP100/23ms; outerstepmax293/264ms. Finalnaturalgoal vs independentfullAPI29Nativeprepares3ops allphysical/rawROI/full/outside0diff,GL0. 4/5scopes selected,0fallback,84/105runs=snapshots=detaches,exactrestore. No strictspeedABclaim acrossdifferentfixtures. Proofa9d4ade1. Memoryinput224/solve120 unchanged. Rootfullengine e562d496 one-worker run PID183840 started15:16:45, pending; appsourcefrozen.

#748 QA mode11 highp sampler ONLY fixes Samsung coverage completely: bothGPU e0c3e4d6168fc34d3bca93490b026d9a16eeb111023b18053923ad37f2f8e2ad. Samsung selected5/other581,6samplers,all10stage/finalown0,GL0,programrestore/deleteexact. Proof13f0bf4e. Notappshaderfix; fullcrossGPUfinalNOTconfirmed. NextBANDboundaryunderway.

### 15:26 — full engine regression and raw coverage reuse

Frozen app e562d496 fullengine279files/2725tests PASS396.96s, exit0; ownedprocessgroup183840 finished, ledgerupdated. Afterward app3ee37518 reuses immutable raw.coverage snapshot rather than reading Native published contour back from GPU and rewritingCPU pages. Source proof06e4cdf2 holdswithoutR32/noForeign assumption forsuccessfulcurrentPagedlifecycle. Root167tests14files/actualwebtypecheck/oxlintPASS; cancellationbetweenP/C planes and arbitrarycoverageRGBA/unknownsupport/foreignmetadata tested. Samsungdefaultall10NativePagedgate nowRUN; no speedclaim.

### 15:30 — raw coverage GPU gates PASS; mode6 precision partial

Samsung rawcoverage3ee37518 DEFAULT and7flagscompact NativePaged all10stage/final0diff, GL0, contextsclosed. Intelmode6highp experiment also keeps all10stage/final0 andownhistoricalhashes unchanged. No timingclaim fromcorrectnessprobes.

Updatedmode11highp preband-b crossGPU exacte0c3... andexactcorrectedmode11output, sohomecopy preservesit (proofb6f73452/f448fdb5). QA mode6highpsamplersONLY thenfixes all398R discrepancies, butremainingG7747/max230,B173/max36,A557/max1; fullband/finalNOTdeterministic. Notappshaderfix; laterround/noisecontrolsawaitreview.

Outside-role cache QAdefaultOFF approvedsourceaudit, actualPlan199drawunchanged, clears199to31;11CPU/29actualwriter-matrix checksPASS. NumericalNative/PagednewnativeScopewiring underpreparation; noGPU/performancePASSyet.

### 15:44 — clean A2 outside-cache still FAIL; allocation batch pending GPU

Fixture16 CLEAN A2l3508x2480, app3ee37518 +7flags+scopedoutsidecache, bothgesturesUNPROFILED: seamUP3952ms/edge4414ms. DOWN78.8/32.1,MOVEsum49.7/7.4,max23.2/7.3,UPcallback116.1/26ms;RAFmax284.1/384.6ms,outerstepmax284.6/281.3. Read94/127calls741/961ms;evict101/110calls207/214ms;hydrate58/56calls11.6/41.2ms. Scope4/5:113clear687skip /140clear860skip,84/105runs=snapshots=detaches. NaturalgoalFIRST independentfullAPIall7+factoryOFF rawall5physicalROI/full/outside0,GL0/historyunchanged. Proofb2794c84. StillPERF_FAIL, nostrictspeedABdifferentfixtures.

App3d9be901 allocation-only batch snapshot: PagedallocateMany6/8/3 captures3bindingsonce, eachmanagedctor restorescachebaselinebefore nextadmission. Native4outputconstructorblock andall8pinnedmodelkernelsunchanged. Root208tests17filesinclR32guardPASS, actualwebtypecheck0, oxlint0. DefaultSamsungall10 GPUgateRUN; no speedclaim. Memoryinput224/solve120 unchanged; noNativeoutputretention.

#748 mode6highp+ROUND fixesR/A, remainsG7803max229/B176max36. NEUTRALrim diagnostic then fullBANDcrossGPUexactc51e4f1d...; notproductcandidate/artisticremoval. Canonicalexisting251latticeQAvariantapproveddefaultOFF andIntelcaseRUN, needspairbeforecausality/promotion. ActualSamsungEXT_disjoint_timer_query absent/null(GL0), repeatedemptycapabilitycontextclosed; nobarrierimplemented.
