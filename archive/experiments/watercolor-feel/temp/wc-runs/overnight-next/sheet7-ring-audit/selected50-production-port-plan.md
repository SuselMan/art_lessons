# Порт выбранной исследовательской модели

Истина сравнения — frozen spec `actual-optical-gain55.json`, SHA1fc9379ac2c6a8022cccf02c7c4943d178949db57d167c12ce6ab28bd65896e4, engine7ca4cf5d. Это 50 последовательных runtime замен; в production нужен итоговый код, без промежуточных экспериментальных состояний. Root владеет merge/push.

## Итоговые изменения

- `raster/shaders.ts`: согласовать physical/colour ribbon source с tip/hair amount; optical mass следует physical pigment, без ink². Единицы headroom2: source encode.5 и согласованные decode/threshold/epsilon во front/carry/remob/diffuse/composite. Mode18 colour читает тот же physical coefficient, physical update идёт после colour. General integer brush использует общую долю/capacity восьми каналов по одному prestate, snapped texels, обычный floor без systematic phase. Итог advection заменён симметричным face exchange (`abs` среднего endpoint velocity, coefficient1/(2sqrt2), min endpoint log exposure); concentration mixing сохраняется. Не переносить промежуточный donor-clock — patch47 его отменяет. Film/pool helper — крупный mesoscale source variation, gainfilm0, poolgain.85. Beer display .55 и soft shoulder: linear to1, cap asymptote1.6; правильный premult, без старой extra alpha.
- `dabs/RibbonStrokePainter.ts`: source encode.5 во всех четырёх dose sites; curvature10 supplies pigment через carried surplus, water masks не объявлять invariant. Diagnostic `__wcAngularPigmentEvents` не продуктовая необходимость.
- `watercolor/brushDrag.ts`: contact segmentation.5R; flow support pad4. Geometry/recorded dabs контракт сохраняются.
- `raster/WatercolorSettlePlan.ts`: colour-first common18 with physical reference; brush contact clock .2R, derived hops/Gain; mixing coefficient.02 PER SUBSTEP (not totalmix calibration); common pre P/C обеим операциям, затем обе copybacks. Scissor/copyback halo1 при actual one-cell stencil. Buffer ownership/pingpong проверить по execution order, а не plan-time alias. Current source-first wholedeposit before brush остаётся архитектурным ограничением.
- `raster/WatercolorPasses.ts`: brush uniforms `u_color`, `u_texel`, `u_contactGain`; fifth sampler binds actual precolour обеим paired calls. Mode18 fifth sampler binds physical source. Type signatures/getUniforms/release paths согласовать.

## Что нельзя переносить буквально

Диагностические throws hop64/sum8192 не продуктовые ограничения: большие жесты нельзя обрывать или усекать. Использовать существующую GPU scheduler continuation и полное выполнение operations; защищать реальные тяжёлые единицы безопасной нарезкой. Не добавлять `QA_*`, runtime patch routing, probe globals, salted source comments, first8 readbacks в продукт. CPU H fixture не является реализованным live/GPU solver; не сливать её как физический алгоритм без отдельной реализации и QA.

## Приёмка после порта

1. Fresh exact selected-runtime baseline на исходном7ca, release source безruntimepatch на отдельномstand; same fixtures/ops/inputSHA/camera/viewport. Полные primary6/9, independent6/5, straight1, return8, mixed7, wet3/4, depleted10. Exact raw units, PNG/crop difference, GL/context proof, actual source commit/hash. Не подменять старые отчёты новым base.
2. Actual pointer live против записанного replay, undo/redo/reopen: mixed7 и wet4 плюс длинный/chunked stroke. History-sensitive firstop changes объяснять, parity проверять fresh same sequence.
3. Все8 brush code sums/positivity и исходный alpha residual честно; residual7 не принудительно обнулять. Mode18 paired physical paths неизменны при correctness fix.
4. После laptop safety — реальные salted shader compile и короткий drawing на Samsung. Adreno compiler threshold может измениться от большого integer shader; VPS SwiftShader не заменяет реальную проверку. Surface не будить/нагружать без актуального scope.
5. Технические FPS/memory/live GPU unit costs — отдельная проверка, probe timings с full readbacks не использовать как FPS. Нагрузка large nib/chunk/history обязана завершаться без diagnostic truncation.

Correction: selected50 has NO u_phase/systematic CDF/tick. Those belong to other research and must not be ported.

No production/source changes performed by this agent.
