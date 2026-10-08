# #728: следующий controlled A/B для редких щелей

Actual stamp Surface5f доказал: baseline P.B exact actual; nib255, hair около78/255, opening242–244/255, tip13/12/11 ведёт P.B к Q8нулю. Counterfactual без tip убирает три interior нуля, но отключение всей щетины не предлагается. Исторический reference OFF/default сохраняется.

## Кандидаты, пока план, не включённые формулы

**A — меньше закрытых волосков при сильном прижиме.** В shared wcTipContact менять только загруженный/high-pressure threshold0.34→0.28, оставляя light-pressure endpoint0.39, release endpoint0.62 и финальный pressure fade. На actual hair≈0.306 новый plateau smoothstep(0.26,0.30,hair) полный контакт; более низкие hair всё ещё открывают редкие щели. Geometric nibDistance/cov/AA/depth/opacity не меняются. Одна и та же функция применяется coverage/own water/P/C/stamps/ribbons. Не только пигмент: форма воды и краски остаётся общей. Это новая модель дозы и повышает оставляемую воду/краску в восстановленных контактах; conservation существующего transport kernel не доказывает conservation deposition. Не обещаем общую массу прежней.

**B — сделать opening более редким на полном прижиме.** High-pressure opening ramp(0.55,0.72)→(0.65,0.82), плавно возвратить исходный ramp при ослаблении нажима. Hair threshold оставить. Release endpoint и финальный fade оставить. Исходные rare глубокие щели сохраняются только в высоких noise peaks. Требует GPU контроля: эта функция wp медленно меняется, полосы могут стать менее частыми, но более длинными. Не объявлять B улучшением до moving stamp/ribbon кадра.

**Почему не ставим blind floor:** постоянный contact floor лечит Q8ноль, но уничтожает реальные сухие щели и рваный отрыв. Если исследовать floor отдельно, включать его только на мокрой/high-pressure кисти и одинаково для воды/P/C; текущая wcTipContact не принимает water, поэтому такой вариант требует явного нового shared аргумента/контракта. Не тихое изменение только amount/P.B. Фильтрация contact также может размыть край/залить dry gaps; она пока не первый кандидат.

## Малый paired gate

1. Literal reference + A + B на exact actual first stamp/noise/geometry/coverage. Сохранить Q8 baseline/coverage/PB/contact96²; first baseline должен снова совпасть с actual. Зафиксировать суммарную deposited воду/PB и площадь contact, interior zero count, gap lengths/rows, nib edge outside/distance. Не сравнивать только итоговый цвет.
2. Один короткий moving stroke, round400 (5–8 retained commands), exact CPU recipe/seed/pressure points, baseline/A/B. Coverage+P/C joint factor через literal shared function patch, не per-chunk noise. Дополнить pressure0.7→0.15→0 и water1→0 endpoints: release/dry исходные формулы должны остаться, edge/cap геометрия неизменна. Author/packed recipe детерминированность и отсутствие rectangular seams отдельно.
3. Actual rendering/baseline screenshots, затем Илья оценивает. Никаких production/default изменений, ON лишь diagnostic source specialization. Три arms serial; исходные source/paper/tape SHA и program patch SHA обязательны. Не запускать полный1536settle ради проверки локальной mask и не называть isolated лучшей всей акварелью.

Архитектурный принцип: единый contact support для воды и пигмента; дозировка меняется до transport, существующая масса лежащей краски консервативно переносится отдельно. Не выводить naturalness из арифметического PASS. Active historical settled snapshot — независимый незавершённый контракт.

## Исполняемый isolated packet

`build-held-variants.mjs <newImmutableDirectory>` собирает callable `runHeldStampVariants`: literal/A/B ×pressure0.7/0.1/0.02/0,36draws с тремя выходами amount/coverage/contact. Actual геометрия фиксирована; не переделывается radius при слабом нажиме. Это проверка функции pressure, не полная геометрия подъёма. Literal shader неизменен; A/B меняют только функцию contact для всех source phases. Результаты36×36864=1,327,104decodedbytes; GPUtexture бюджет~8.3MiB, staging48KiB переиспользуется, нет1536solver.

`held-variant-controller.mjs`: тот же ONE60с Surface1700/500, HTTPmanifest/SHA, exactpressure/order/budget, собственная страница. `analyze-held-variants.py <savedGate>` сохраняет ROI PB/water/coverage/contact карты, dose sum/delta, interior zeros/rows/critical pixels. Суммы строгоROI, не whole-stamp масса. До actual gate художественный вывод отсутствует. Source/golden8tests, strictTS, decoder3tests PASS. Lowpressure endpoints0.1/0.02 используют исходные параметры обоих вариантов; pressure0 полного отрыва должен оставлять0 для всех source outputs.


## Actual Surface paired gate e61

Capture PASS,12arms/36fields, GPUerrors[], own page закрыта; pre2147.8MiB/post1943.9MiB. Raw `temp/fast-watercolor-night/held-stamp-variants-surface-20261008`. Literal pressure0.7 полный P exact предыдущему5f(actualPB exact). В ROI исходный PBsum504362. A добавляет4506PB/water units (+0.8934%),256изменённых пикселей/max49; B9580 (+1.8994%),465/max55. У обоих interior zeroPB3→0. Critical A8/7/6, B7/6/5 вместо0/0/0. Coverage sum reference1915613→A1941872/B1970134. Это изменение контакта/дозировки, не потеря массы transport.

При pressure0.1/0.02/0 PB exact literal для обоих вариантов. All36RGBA comparison low endpoints отдельно подтверждается hashes; pressure0 PB полностью0. A выбран для следующего диагностического moving proof как меньшее вмешательство/меньшая прибавка дозы, **не художественно лучший вариант**. Геометрический nib edge не менялся; отсутствует доказательство full-stroke naturalness/dry/replay.

## Source-only moving wrapper подготовлен

`movingContactRun.ts` callable `runMovingContactVariant('literal'|'A')` использует exact CPU prepareCanonicalStrokeChunk по8явным canonical dabs, actual CanonicalSourcePhaseExecutor/PlanAdapter mode1, separate film/base/coverage/P/C, **без settle и presentation**. Context-owned GPUDevice facade специализирует только stamp/ribbon `fn paint` shaders; глобальные WebGPU прототипы не меняются. Backend private constructor вызывается Reflect.construct только в QA для собственного device/facade; это не новый публичный backend API. Native source state и Q8pass границы сохраняются. Actual paper не участвует в этом source-only gate; flat1² нужен resource owner, noise literal251².

Результат — actual final source P/C/coverage ROI384×192(272,352),884736decodedbytes/arm, original CPU command SHA одинаков literal/A. `build-moving-contact.mjs` и `moving-contact-controller.mjs`: дваserial arms, между нимиRAM1700, abort500,60с each, собственнаястраница. Это не livePointer/Room/finishing/морфинг/производительность. Hand-authored canonical fixture явно не исходный user stroke, pressure0.1/0.02/0 и фиксированныйsize400 isolates factors; combined/segmentedCPU recipebytes PASS. Source-only GPU wrapper ещё не проверен аппаратно; ошибки bindings/driver остаются возможны. Оценка whole material массы не делается по ROI; фиксировать ROI дозу и gap рисунок, не обещать conservation reference deposition.

Hosted9a HTTP manifest/run.js/index.html SHA и bytes проверены, sourceHEAD9a6724ed. ONE software smoke завершён за bounded45s без full1024fields: literal/A stamp+ribbon modules и12render pipelines compiled, messages/errors[]. Это compile/layout smoke, **не source orchestration или hardware качество**. Изначальная версия9a source wrapper остаётся immutable; следующий wrapper cleanup гарантирует device.destroy также при constructor/setup throw, отдельно tagged source. `analyze-moving-contact.py` проверяет same-command SHA/ROI/payload SHA и пишет per-channel sums/deltas/differences/grayscale; same-model exact для A не ожидается. Controller уже READY, между arms проверяетRAM1700, nonemptyApatch required. До аппаратного gate выводов о moving картинке нет.

## Actual Surface source-only moving9a gate

Дваarms literal/A capture PASS, errors[], A specialization реально использована, командныйSHA `e0d52304f71ef3932be254f32641a9b9470ff0218c3ba0bf3dee199b10fb7d2f` одинаков. Восемь retained segments имеют4/8/8/8/8/8/8/8sourcecommands: stamps+ribbons, давление0.7→0.1→0.02→0. Frozen source9a6724ed; поздний cleanupc898 не был частью этого runtime. PreRAM2117.3MiB/min1754.5/post1827.4; собственнаястраница закрыта, Surface освобождён. Raw и научныеRGBA/PNG сохранены в `temp/fast-watercolor-night/moving-contact-surface-20261008`.

В ROI384×192 P.B сумма14,203,081→14,225,668: +22,587 (+0.1590%); такой же прирост P.R/P.G/P.A и C.A. C.R/G/B меняются на+9118/+22111/+2877. Coverage alpha/body sum+5611 (+0.02985%); pool channel sum−34096, поэтому увеличение contact нельзя описывать как простое умножение всех finalcoveragechannels. Это actual accumulated/fitted source records, не новая conservation гарантия. Изменения P1471pixel/5884bytes/max212; сильные локальные изменения в редких дырах не скрываются малой средней прибавкой.

Literal имеет14нулевых P.Bпикселей и11нулевых coverage в ROI; A ни одного. `zeroPBWithCoverage255` уже0 в обоих — в движущемся случае дырки также меняют support воды. На actual grayscale P.Bкартах literal видны маленькие чёрные пропуски, в A они исчезают; остальные неоднородности остаются. Это описание source-маски, **не утверждение художественного улучшения всей акварели**. В ROI нет конца всей большой кисти, поэтому рваный endpoint по этой карте не оценён; отдельный isolated lowpressure/zero gate e61 был exact.

Следующая граница: короткий actual source+settle controlled tape с literal/A, показать цветную картинку/кончик и deposited water след, затем пользовательская оценка. До этого вариантA не включён в Room/defaults/production. Active transport snapshot и contact naturalness — разные направления; source-only gate ничего не доказывает о его осадке/мобильной массе.

## Source+settle paired packet подготовлен

`movingSettleRun.ts` использует реальный bounded replay→production field1536→CanonicalSingleTileFinish, одна фиксированная8daboperation/1024tile/pressure taper. Literal/A специализация только shared source stamp/ribbon contact. Настоящая baked Fine LA→RGBA загружается через production loader; её full SHA, tape SHA и source patch census записываются. Новая QA strokeId задаёт production seed, поэтому этот packet **не** identical-material oracle предыдущего source-only fixture с другим явно заданным seed. Оба новых arms между собой имеют один tape/paper и hash.

`build-moving-settle.mjs <newImmutableDirectory>` принимает PAPER_DIR для symlink reuse семи immutable baked assets; paper-manifest SHA проверяется controller до device. Controller serial literal/A,1700pre/500abort,60сeach, wholeRGBA4MiB/arm/SHA/nonempty; закрывает свои страницы. Decoded total8MiB,base64 transient5.59MB/arm (~11.2MB JSstring),numericarray отсутствует. Resource setup/destroy guard присутствует; defaults не меняются. Full1536 workload не запускался в VPSsoftware; только source shader12pipeline smoke ранееPASS. Hardware READY не означает осадок/driver PASS, actual gate ещё не выполнялся.

## Partial full-settle gate: literal сохранён, A не запускался

ONE paired Surface6ea: literal completed/error[]/materialnonempty225329pixels/SHA `34e67a3dde9df1ff5a13d45d8789f91d8b50e37e158b3d0be9d2f5b0a076b833`, bounds98..740×198..641. Baked Fine2048 SHA и immutable tape сохранены. Pre2082.9MiB, наблюдённыйmin1501.9, **между arms admission<1700**, после закрытия1671.8. Controller остановил cohort без повторов; A не запускался. Это RAMguard ограничения, не A/modelFAIL. Raw `temp/fast-watercolor-night/moving-settle-surface-20261008`, partial PNG экспортирован через `--allow-partial`, paired=false. На literal изображении видны исходные щели около краёв; сравнительного художественного вывода нет.

Fresh-A controller поддерживает QA_RESUME_LITERAL=<savedDirectory>: original literal не рисуется повторно, проверяются one-literal/error[]/frozenJS/paperpassport/saved4MiBSHA, новыйA сравнивается с этим exact saved owner результатом. Только после нового root allocation/RAM1700; никаких автоматических retries/пониженияguard. Source wrapper retire освобождает planner/scratch/fieldowner/pool и backend/device до return. Оставшаяся нехватка памяти может включать deferred driver/Chrome retention, причина не доказана. Отдельнаяfreshстраница уменьшает sharedowner residency, но успех не обещается.

## Fresh A full-settle завершён; сохранённый literal не повторялся

ONE fresh-A immutable6ea + guarded savedliteral PASS, error[], A patch реально использована; paper/tape/frozenJS exact. Raw `temp/fast-watercolor-night/moving-settle-A-resume-surface-20261008`, literal RGBA symlink на исходные данные, оба color PNG и анализ рядом. Own page закрыта/Surface освобождён, post1698.8MiB.

Сравнение full1024² material:71808разныхRGBAбайт/max97/mean0.02677, **не same-model exact**. Alpha support225329→225544 (+215), bounds обоих98..740×198..641 — не обнаружено expansion bounds в этом tape. Alpha сумма20,444,448→20,467,727 (+0.1139%). Color channel sums R−10762/B−6879/G0; deposited source прирост не равен finalRGB opticaldelta, это ожидаемо отдельный optical/settle/composite этап, не physicalmass claim.

Row gaps286→210, blankpixels between first/lastrowsupport858→692, maxrun32unchanged,4-neighbor boundary2343→2079. Это измерение support, не aesthetic score/closedholecount. При прямом просмотре PNG A уменьшает верхнелевые щели; несколько нижнеправых щелей остаются. Общая форма/размер и цветовая структура близки; полного удаления щетины нет. Значимое локальное улучшение конкретной contact проблемы, **не оценка общей натуральности**. Следующий этап — отдельный nativeRoom DEV вариантA для рисования/пользовательской оценки, с pressure/dry/undo/replay контролями. Публичные/production/default формулы не менялись.

## Изолированный обычный Room DEV opt-in

`wcNative=1&wcTipA=1` / constructor diagnosticTipContactA выбирает A лишь в DEV. OFF/production оставляет тот же originaldevice и sourcebytes. DEV installer после backendcreate с roomOwnedResources и до lazy sourcecompile присваивает этому backend scopedGPUDevice facade; только source stamp/ribbon `fn paint` programs заменяют один literalthreshold endpoint0.34→0.28. Backend/stamp/deposit files/defaultconstants не меняются. Unsupported/eager source owner отклоняется до изменения. Runtime `tipContactQa` хранит реально скомпилированные family и baseline/patched SHA для actual gate. New context disposal сохраняет backend lifecycle; init installerthrow уничтожает backend.

12installer/parsertests PASS, full apps/web tsconfig.app+sw PASS, targeted oxlint0errors. Room actual pointer/pressuretaper/undo/redo ещё не проверены; пользовательский готовый link не объявляется. Новый5360 immutable runtime будет иметь отдельный sourcepassport; старые5354–5359 не меняются. Kernel/formula source change новая модель дозировки только этого QA варианта, не производительность/same-model parity.

### Actual Room opt-in integration gate (5360)

Frozen source `4ddf800bd511f18866c9a49dae18b0fc73e263d3`, controller `7269995d`.
The initial command failed its local full-SHA passport check before device access.
The corrected allocated run passed source/paper verification and RAM preflight
(2120 MiB), but stopped during the moving stroke: `GPUCanvasContext.configure`
rejected the Proxy used as `GPUDevice` by the DEV installer. `source.ownerFor`
reported the original WebIDL conversion error; the controller stopped pointer
input and closed its own page. No completed stroke/UndoRedo/quality gate exists.
Evidence: ignored `temp/fast-watercolor-night/room-tipA-fullsha-surface-20261008`.

The follow-up installer fix preserves the original native device identity and
shadows only that owner device's `createShaderModule` method. No global prototype,
backend formula or default changes. A unit regression verifies device identity,
compiler receiver and stamp/ribbon specialization. Frozen 5360 remains unchanged;
the repaired candidate requires a new frozen runtime and allocated hardware gate.

Actual software WebGPU follow-up: owner device is extensible, own compiler shadow
installed, native canvas `configure` accepted the original device, a real trivial
compute pipeline compiled without validation errors, and owner destruction
restored the original compiler method. This is an identity/lifetime smoke only;
it does not establish actual Room drawing or A image quality. Repro:
`node docs/qa/harness/728-tip-device-identity/check.mjs` (45s bounded).
