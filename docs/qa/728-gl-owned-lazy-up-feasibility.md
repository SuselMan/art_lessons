# Owned lazy contact preparation на UP: существующие hooks

Source-only feasibility после857/e45, без новых runtime changes/device. Цель — убрать cold contact CPU из release stack, сохранив физическую модель и уже видимый натуральный мазок. Это перераспределение работы, не уменьшениеtotal compute.

## Что реально существует

1. `_onEndUntimed` сначала делает endStroke/taper/pooling/lift и настоящую `_paintStrokeDabs` tail, затем `_finishRibbonStroke`, clears live preview references, display, packed log/callback и paperWet pending commit. Эти tail/bookkeeping действия нельзя произвольно отложить или потерять.
2. `RibbonStrokeScratch.captureCanonicalFinish` снимает CPU boundary: копии brushTravel/wetContacts/foreignSources/finish/color/profile/bounds/gesture и diffusePending; direction/composite/spacing. Это НЕ копия GPU scratch material. `_holdAsyncScratch` лишь защищает lifetime от destroy, не future mutation. Поэтому metadata+hold сами по себе не разрешают следующий direct source в ту же physical scratch.
3. `_finishRibbonStroke` existing async arm удерживает owner, enqueue в `WatercolorCanonicalFIFO`, вызывает прежний finish с captured metadata и ждёт `_settle?.scratch` completion прежде release. FIFO.blocked включает existing settle/contextloss; epoch/cancel/release/readiness/failed hooks существуют. Это reusable owned continuation contract.
4. `CanonicalWatercolorSettlePlan.lazyContacts` требует `presentationOwnerLocked`. Current owner14 передаётся true **только** `_wcAsyncFinish && owned && _wcAsyncOwners.has(scratch)` (Engine8983). Обычный mixedLease arm может captureowned metadata, но НЕ получает capability. Включение одного private plan flag на текущем обычном пути не активирует lazy contacts.
5. Plan synchronously делает descriptors/field allocations/foreign stencil и first op canonical stitch. Contact fields вычисляются непосредственно перед каждым upload/pulses, generator yield каждые256 cells/encoding checks; continuation выполняется до2ms между checkpoints, затем дети вставляются в тот же ordered op cursor. На pause/free/loss/throw generator и oneShot payload released, никакие Float32/Q8 или pulse ordering не меняются. Это мягкийbudget, не hard2ms bound дляallocation/GC/driver.
6. `_startSettle` executes canonical capture до будущих ticks; complete/reveal/copybacks/releaseFilm используют capturedgesture, live rectangle остаётся on-screen, reveal начинается после реального land. Existing metadata dryCtx fold и current target identity нельзя заменить только nulling scratch.

## Почему нельзя включить готовый async flag целиком

`_wcAsyncFinish` также переключает `_ribbonPainter.paint` в deferMaterial и `_showAsyncPresentation`: настоящий source может ждать canonical FIFO, а временный renderer рисует preview. Это та же категория ранее наблюдавшихся delayed/pencil/transparent мазков. Без отдельного quality/live gate такой flag не подходит обещанию «только faster UP». Он отключает обычный joined touch admission; различия UX нельзя приписать одному lazy contact producer.

В ordinary path следующий DOWN при settle вызывает `_completeSettle`; Queue.complete исчерпывает все lazy continuations синхронно. Поэтому один lazy prepare может снять UP pause и вернуть всю цену в nextDOWN. Existing lease ограниченно разрешает overlap, но capability не выдан: нельзя обходить это private argtrue без physical owner proof.

## Минимальный проверяемый candidate contract (пока не реализован)

- Настоящие source/tail/composite доUP сохраняются; on-screen material не заменяется pencil preview. Перед очисткой gesture bookkeeping захватить captured CPU metadata и owner/generation/layer.
- Capture-first canonical fields/scratch consumption должен завершиться до любых future mutations. После этого pending preparation task владеет полями/outputs/finish callbacks до land/cancel. Если capture ещё не выполнен, следующий source в тот же material **не допускается**.
- Новые requests, Undo/Redo/Dry/peer operations принимаются в existing ordered queue с exact identities; queued acceptance не объявляется публикацией. Нельзя silent drop input, wrong gesture target или ранний socketemit. UI остаётся отзывчивым, но задержку нового source отдельно измеряем; предсказание UI не заменяет настоящий pigment.
- Export/checkpoint/snapshot/readiness учитывает owner+pending publication, не stale logcount или только `_settle`. Existing async ready/null and queuedHistory repair gates reusable, но нынешний queuedHistory explicitly несовместим с asyncFinish: combining требует целевого contract/tests, не query trick.
- Contextloss/destroy/layer replacement отменяет только свой generation/task, освобождает buffers/payload once; acceptedjournal остаётся основой восстановления. Dry ticket соответствует capturedgesture, no late stale land into newlayer. Новыйsource может безопасно продолжиться только после capture/owner boundary, а не после arbitrary timeout.

## Proof до активации

CPU meaningful gates: unchanged ordered uploads/pulses/Q8 endpoints при complete и natural continuation; firstfield lazy no earlyflow sampler; stale metadata mutation не влияет; nextsource beforecapture rejected/queued безloss; owner release once after actualland; Undo/Redo/Dry/remote FIFO exacttargets; cancel/throw/contextrestore без endlessRAF/latecallback. Existing Plan tests уже покрывают ownerfalse fallback,256exp oracle,reentrant dispose/loss,upload failure/payload release; это не заменяет fullEngine/UI proof нового combination.

Hardware только после source review: exact sameimmutable packed/wet/seed/paper fields/materialwhole +history/rejoin, реальный natural DOWN→firstpigment-submit/composite и UP→nextinteractive отдельно. Нужен малый nexttouch и400-heavy, quick taps, water-only/puddle/differentcolors. Прозрачность, disappear-onzoom и pencil-first любой armFAIL. GPU/RAF timestamps неphysicalvisible latency. УскорениеUP с ухудшением nextDOWN/idle не объявлять globalgain.

Вывод: existing owned FIFO/generator hooks достаточны для узкого прототипа, но current switch не изолирован от source/presentation. Без separation и owner/FIFO gates blindenable повторит прежние регрессии; никакого простого setTimeout-деферирования.

## CPU-only adapter proof

`docs/qa/harness/728-gl-timing/OwnedLazyUpTransaction.ts` использует **существующий** `WatercolorCanonicalFIFO`, не копиюscheduler. Material transaction предоставляет retained generation/valid/capture/prepare/publish/release. Capture выполняется раньше подготовки, которая yield-ится в той же FIFO; следующий source и контрольные callbacks сохраняются как requests заtransaction, не применяются рано и не выбрасываются молча. Release выполняется once после publish либо cancel/failure; paused producer закрывается, reentrant cancellation внутри next не вызывает generator.return пока он running. Release failure блокирует successors через существующий FIFO failed/cancel путь; первичнаяmaterial ошибка не заменяется teardown ошибкой.

Meaningful CPU тест использует **реальный** `CanonicalWatercolorSettlePlan` с existing traceFixture (mixedP/C+film+foreign+travel): fullorderedoperation/upload-byte trace direct lazy execution равен тому же плану через FIFOtransaction. Metadata/task generation mismatch, cancel до/внутри work, loss pausedgenerator, preparethrow, publishthrow/releaseerror и отсутствие RAFloop проверены. Это9tests вместе с actualFIFOtests, appTS PASS. Сравнение не GL pixels и не eager→lazy speed; обе стороны используют тот же production lazy plan, меняется owning transaction/scheduling boundary.

Прототип не подключён к Engine и не реализует новые GPU snapshot copies/preview. Caller `capture/valid` обязан доказать физическуюimmutability/generation/layerownership: callback сам по себе такого доказательства не создаёт. Undo/Dry в этом тесте — FIFO ordering callbacks, не actualEngine/UI history proof. Capture allocation/stitch remains potentially synchronous внутри очереди; nextsource latency и totalfinish performance неизвестны. Это reviewable protocol kernel, **не готовый flag/стенд**. Перед runtime wiring нужны перечисленные выше fullEngine/lifecycle/quality gates; без них owner capability не выдаётся.

### Admission scheduling exception cleanup

Existing FIFO.enqueue сохраняет legacy поведение. Добавлен узкийunusedruntime API `cancelUnstarted(exactRequest)`: удаляет только этот ещёнеexecuting request и вызывает его cancel; не отменяет priorqueued/executing owners, не меняет epoch/чужие callbacks. Executinghead иunknownidentity отвергаются. Prototype ловит schedulethrow afterpush, использует API для release собственногоunstartedowner и повторноthrow исходнуюadmissionошибку. Если scheduler reentrantly уже выполнил запрос, ошибка записана отдельно `admissionError`, published/failed outcome не превращается в false «непринято», owner повторно не освобождается.

Три дополнительные actualFIFOtests доказывают сохранность executingpredecessor приthrownewadmission, отказ удаленияexecuting/unknownidentity и truepublishedresult приsynchronouscallbackthen schedulingthrow.12tests вместе сexistingFIFO PASS, appTS PASS. Runtime callers/flags/preview не меняются; новыеAPI используетсятолькоCPUprototype. PhysicalGPUowner/capture gates остаютсяHOLD.
