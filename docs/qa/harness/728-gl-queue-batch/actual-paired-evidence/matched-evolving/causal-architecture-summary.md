# Итог причинных CPU проверок и следующий фундаментальный шаг

Минимальный положительный локальный вариант: `symmetric-w1`, commit2faba07b. SAME actual input; симметричный общий поток8 моментов, w=1, mass/hue/positivity/CFL/maximum principle. Мягкое круглое пятно без spikes; слишком мало движения. Это пригодный математический baseline, не выбранная акварель.

Исходный directed driver усиливает локальные пики: incoming rowSum>1 и 4tap-coarse density order reversals доказаны actual snapshot. Hop8 сохраняет64 residue classes; hop1 отдельно не помог. Homogeneous/radial causal controls устраняют spikes; radial не физическая модель. Split с +grad arrival-cost увеличивает движение, возвращает squaregrid; cubic B-spline derivative усиливает petals. Поэтому больше tuning градиента не рекомендуем: нужна другая измеряемая state/flow модель, а не новый фильтр sourceP.

## ONE foundational offline proof: что означает water readset

`PreviewWaterDomain.mjs` получает retained solvent RGBA и пишет только wet=clamp(r/a,0,1) в alpha. На полном128 листе pairs(r=.05,a=.1) и(r=.1,a=.2) дают совершенно одинаковую wet film, но суммы4r различаются ровно вдвое. Следовательно никакой алгоритм, читающий только wholefilm alpha, не может восстановить обе исходные суммы. Сохранение суммы wetness не является сохранением воды. Этот неинъективный counterexample проверен `solventQuantityReadset.test.mjs`; hardware не требуется.

Существующий более ранний quantity-like readset есть: `RibbonStrokeScratch.solventFilm` хранит diagnostic V/4; `canonicalStrokeChunk` пишет source delivery.water/4 при diagnosticSolventField, MAX внутриgesture, ADD/capped междуgesture. `CanonicalWatercolorSettlePlan` собирает own+foreign solventLoad черезfieldOp, toField downsample. Кодовый комментарий называет V physical source, но это **модель ограниченной контактной толщины**, не доказанный объём: MAX(1,1)=1 вместо2 для repeatedcontact, cap(3+3)=4 вместо6; saturatedstate не хранит discardedvolume. Без source/saturation ledger нельзя утверждать сохранение brush dose.

Даже unclipped 128 amount требует area-conservative reduction: текущий resample mode0 четырёх центральных taps может не увидеть V вне этих taps в8×8block. Counterexample: единичная клетка[0] -> fourtap0, exactcellmean1/64. Пока fullquantity field не снабжено доказанным area integral и геометрией ownership/wholepuddle/readset, нельзя ставить capacity=P/wetfilm.

## Рекомендация

Performance root имеет приоритет. Оставить localdiffusion только изолированным baseline. Следующий физический эксперимент должен сначала доказать whole-domain quantity ledger: source units, own/foreign безdoublecount, exact/area-conservative V sum, capped-loss channel либо явный finite-storageloss, dry/evaporation sink и closed-boundary accounting. Нужны solventLoad+foreignSolventLoad доratio/clip/downsample, dimensions/worldpitch/epoch/sourceidentity; wholefilm недостаточно. Затем velocity/flux из объёма и потенциала, а не нормализованной arrival-cost gradient. Transport common P/C and water flux, positive CFL; pressure/velocity должны иметь собственный temporal update. Это архитектурное направление, не разрешение менять canonical или заводить новый renderer сейчас.

Тест ONE offline readset доказательства PASS. Новых captures, services, GPU targets и gradient variants нет.
