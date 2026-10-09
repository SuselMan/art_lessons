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
