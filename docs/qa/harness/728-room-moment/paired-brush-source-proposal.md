# Exact paired brush: source proposal, без GPU реализации

Call map: `CanonicalWatercolorSettlePlan.contactOps/exchange` → adapter `brushPair`
(alwaysfalse, `diagnosticBrushMrt=false`) → два `brushPass` → `encodeSingle` сначала
C→field.band, затем P→field.pressure. Оба читают прежние dep.out/col.out/coverage/flow.
Лишь после обоих dispatch выполняются два copyRegionInto и present. Каждый следующий
pulse читает уже новое P/C. Пример420 single calls означает210 pulses.

`CanonicalBrushContact.encode` уже содержит paired WGSL. `encodeSingle` буквально
получен из него заменой output-binding/uniform/finalstore: та же snap/sample/flow/water,
raw fraction, общая8-channel capacity, workgroup8×8, dispatch/scissor и floor order.
Два результата отличаются только выбранным source vector. Структурно paired:

`R_V(x)=V(x)-Σfloor(V(x)f(x→y))+Σfloor(V(y)f(y→x)), V∈{P,C}`.

`f` вычисляется из одного immutable pre-pulse P/C: общий limit берёт minimum по всем
четырём каналам обоих carriers. Q8 decode `floor(sample*255+.5)`, face amountfloor,
вычитания/сложения внутри каждой output остаются в прежнем порядке. Нельзя менять
sampling/flow orientation, algebraically reassociate или copyP до вычисленияC.
Нельзя сливать pulses: floor и меняющийся capacity нелинейны.

Узкий candidate: adapter diagnostic paired opt-in возвращаетtrue после одного
существующего `brush.encode`, оставляя copies/present и210 chronological pulses.
Это убирает210 begin/endComputePass/dispatch/uniformbuffers/bindgroups и duplicate
face-fraction evaluation. Сохраняет2 output texture stores. Source single shader
считает обеP/C accumulators перед select; фактический driver DCE неизвестен.
Count savings не означают 2× общей скорости: upload/copies/present/otherpasses остаются.

Перед GPU включением: encodePair должен failclosed проверять размеры обоихoutputs,
P/C/coverage alignment и matchingfilter/rect/gain; все четыре inputtextures отличны от
обоих outputs, outP!=outC. Existing pair encode уже проверяет aliasing, но не равенство
output/inputdimensions (single проверяетчасть). Не менять quantization/storageformat.
Pair use requires texture_storage write для обеихrgba8unorm attachments, согласованную
publication/lifetime и тот же encoder/order. Producer uniforms должны совпадать поf32.
FP/GPU byte equality теоремой CPU не доказана: отдельный same-input firstpulse/allpulses
oracle all8carrierbytes+whole обязателен, плюс validation/error/lost/lifetime guards.

CPU oracle3/3 PASS: independently coded fused vs two-single exchange на64 fixedseed
полях×5pulses; все8channel mass и bytebounds; saturatedchannel каждогоcarrier блокирует
face. Sequential mutateP→computeC даёт доказанные counterexamples. Supplied rawfaces
bounded, поэтому это integer-exchange/protocol proof; sampling/log/transcendental/f32
и actual native shader execution здесь не моделируются и GPU parity не заявляется.

## Patch plan для native owner (пока proposal only)

1. `pages/Room/diagnostics/watercolorQaOptions.ts` + test: strict DEV
   `wcNativeBrushPair=1` → NEW `diagnosticNativeBrushPair`, requireswcNative1;
   PRODignored/defaultOFF/duplicate malformed failclosed. Existing `wcMrt` означает
   WebGL2-only, его не переиспользовать. Native pair first arm исключает GL2/MRT/
   frontBatch/deferred/joinedMixed/mixedLease/queuedHistory/moment physics flags.
2. `engine/index.ts`: новый booleanoption/privateDEV flag, assert native enabled
   и несовместимые options до GPUinit; прокинуть при `RoomNativeRuntime.create`.
   Existing GL `diagnosticBrushMrt` validation/OFF constructor не менять.
3. `webgpuCanonical/roomNativeRuntime.ts`: contextoption defaultfalse, передать
   в каждый заново создаваемый `CanonicalRoomWatercolorExecutor` generation.
4. `webgpuCanonical/roomWatercolorExecutor.ts`: option defaultfalse; после обычного
   `new CanonicalPlanAdapter(backend)` выставить adapter `diagnosticBrushMrt` лишь
   explicitDEVnativepair. Не обходить текущие ownercommands/quantum/carry flags.
5. `webgpuCanonical/settlePlanAdapter.ts`: diagnosticBrushMrt mutablefalse;
   brushPair OFF returnsfalse ДО inspecting fields/encoding/allocating. ON guards,
   затем один `this.brush.encode(this.ctx(), originalinputs, originalstep/gain/rect/
   scissor)`, retaintransients, returntrue ТОЛЬКО после encoding. Step ровно
   `max(1,round(radius*.25/scale))/field.w,h`, как existing brushPass.
6. `webgpuCanonical/backend.ts` tiny read-only `ownsField(field)` по ownedFields,
   чтобы проверять liveflow/coverage/P/C/output, без mutations/pipelines.
   `webgpuCanonical/brush.ts` pair dimension/format admission guard если sharedhelper
   применяется низкоуровнево; WGSL/compilation order оставить неизменными.

ON admission: P/C/coverage/outP/outC owners===adapterbackend, notdestroyed,
ownedFields membership; canonical positiveinteger identicaldimensions andrgba8unorm;
wrapperfilter===fieldfilter (P/C могут иметь разные исходные filters — не менять).
Flow slot notdestroyed/uploaded, belongs samebackend, positivedimensions/rgba8unorm;
flow может быть иной resolution — не требовать canonicalwidth/height. Four input
texture identities distinct от BOTH output; outputs distincteachother. Finitepositive
radius/scale, finite nonnegative gain. FlowRect finitexy/positivewh; negative normalized
origin допустим (contact partially outsidefield). Scissor integernonnegative/inbounds,
zeroextent valid no-op. No extra flip/rotation: current GL-bottomup rect/scissor и WGSL
row-top transform без изменений; use EXACT suppliedrect. Same activeencoder/ownerquantum.

Pair uniform80bytes == первые80bytes single96 (single дополнительные16 outputselector):
step/texel/flowRect/gain/P,C,water filterbits/scissor/dispatch identicalf32/u32. Same
8×8 workgroups andceil(scissor/8). ON copiesfield.pressure→dep/out +field.band→col/out
andpresent remain existing planner AFTER commoncompute; no new quantum/substeps.

`NativeBrushPairContract` proposal-only CPU3/3PASS checks DEVselection, OFFresource
inertness, dimensions/format/filter/ownership/alias/rect/scalarnegativecases and flow
resolution allowance. Product does not import harness, runtime/backend untouched.


Actual encoder CPU probe1/1PASS (`node --import tsx --test NativeBrushPairEncoding.test.mjs`):
реальный `CanonicalBrushContact` с recording fakeGPUdevice делает twoSingles+paired.
Первые80 uniformbytes совпадают буквально, включая f32gain/step/filterbits иu32dispatch;
sourcebinding identities1..5 теже, workgroupdispatch5×3 identical при clippedscissor.
Pair outputsbinding6/7 exactdestinations. Actual shader module strings differonly
uniformselector/outputbinding/store substitution. Это source/encoding witness, неGPU
execution/precision/parity. Surface/Shadercompiler/realdevice в этом тесте отсутствуют.
