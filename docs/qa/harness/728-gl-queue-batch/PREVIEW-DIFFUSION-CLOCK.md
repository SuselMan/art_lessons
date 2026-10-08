# Preview: settling and clock mismatch, OFF research

Actual own-spacing Surface ONE, raw `temp/device-runs/owner-water-dab-own-spacing-surface.json`, summary `owner-water-dab-own-spacing-summary.json`. NEW tape SHA4ae267fa66864a612bee720c0f8e967e977b5a99616def86715881a6dee86b0c. Current preview spacing9.993758316 from actual single prepared45.426174 diameter×production.22; canonical recipe88 unchanged. Internal history exact370ee2c52f92b83017727d2a15923da8eb14e5323205823cb998f4c80afb7b08, gl0/lostfalse. Original SAME NEW tape not compared. Own tab closed; Surface released post2066MiB/min901MiB.

Same P/C actual64 ROI controls: plain exact0/max0 at steps1/2. Inherited88 vs current changes11890/12067 bytes,max139/130; settled0 vs current changes9412/8798 bytes,max12/11. This isolates reconstruction smoothing from transport. Both source fields unchanged between these diagnostic renders. Read430080B + separate2MiB Float moments; scheduling perturbed, not latency evidence.

Root/agent images agree: square plateau disappears, but late pigment is too faint. UP frames elapsed87.3/212.2/312.5/746.1/1226.5/2112ms follow0/1/3/16/33/79 completed preview transport steps. Current material delta changes strongly, not clock opacity fading. Total P.alpha5.02058835→5.02058859 (relative4.64e-8), while peak.333333→.076191(step16)→.022904(64)→.013115(115); peak falls25.42-fold and nonzero24→2760 cells. Colour alpha follows P.alpha. All mass keeps diffusing; there is no stationary pigment core.

Representative Beer–Lambert arithmetic from captured global C.G/P.A ratio gives tau≈1.8933. Late peak deposit≤2*.013115≈.02623; thickness≈deposit*.55/.54≈.02672 and representative density≈.0493 before granulation/cloud/wet material factors. This is an explanatory representative, NOT an actual last-center shader read or universal bound. Current55%-style alpha boost would conceal mobile dilution rather than fix its cause.

## Mathematical reference

For flat height, fully open water and an unbounded grid, one king exchange adds D*12*rWorld² to radial second moment; knight adds D*40*rWorld². Eight king offsets have squared lengths4*r²+4*2*r²; eight knights8*5*r². Actual production CPU donor oracle verifies these increments with an impulse, mass1 and D=.09. Paper bias, finite domain, quantization, carry and boundaries invalidate treating this flat reference as actual Room displacement.

Preview port executes radius8world/S8→1tex king, every RAF, on ALL P/C indefinitely until parent land. Delta=69.12worldpx² per step;115 steps gives7948.8worldpx² in the flat reference. The minimum radius clamp prevents representing small motion by merely passing radius<8.

Production `CanonicalWatercolorSettlePlan.ts:825–885` uses two fine core-smoothing steps, then six puddle steps plus five fine steps. Core.45 settles after initial smoothing; every puddle step settles.2 of remaining mobile material. The unchanged-field slice weights sum to1; after six puddle steps mobile fraction=.55*.8^6=.1441792. This is applied to both P/C. Late slices may also read fibre effects. Groupdry/front/carry create additional operations and gates; this subset is not the whole physical solver.

Flat fully wet subset radial variance (includes smoothing and weighted mobile increments): production scale1=1770.789678,scale2=1881.312390,scale8=2489.561137worldpx². Actual shader radius rounding/min1 is included.115 preview full exchanges exceed these by4.49/4.23/3.19 respectively. Thus '144 times too fast' is not supported; coarse spatial scale and repeated all-mobile schedule are distinct errors. Production provisional dry output and canonical pointer timing remain unchanged.

## Bounded OFF next design, not implemented

Keep paired fixed and moving moment fields, reconstruct `fixed + afloat*moving` BEFORE material ratios/Beer–Lambert. Start core from appropriately smoothed own source, then use existing production settling weights and a finite schedule, not all-mobile endless RAF diffusion. No contrast multiplier or RGB fade. Initial P/C is immutable; canonical endpoint still owns final output. Physical field ownership and epoch/cancel/fence contracts must cover the extra accumulators.

Two extra128 RGBA32F core/accumulator fields add524288B/owner, three prewarmed owners+1.5MiB above15.375MiB float preview (16.875MiB total preview, excluding156+32+8MiB other QA resources and driver memory). Both channels use identical weights; sum-fixed plus afloat remains mass-consistent up to float rounding. Mobile ping-pong and fixed accumulator must never alias a live source/output; implement explicit role rotations or separate scratch, not borrowed canonical buffers. Shader reconstruction may need additional texture units, to audit before claiming feasibility.

A fractional visual exchange `old + alpha*(T(old)-old)` with0≤alpha≤1 is a convex combination of identity and fixed-gate donor operator, preserving positivity/paired mass in exact arithmetic. Target fine3world king delta9.72 can be represented by alpha=.140625 of one8world king full exchange; a2world knight delta14.4 uses alpha=.0625 of8world knight. Same paper/gate/neighbor sampling still differs from the fine grid: fractional gain repairs time variance, not spatial fidelity. This would require a separate OFF visual shader/gain binder; production diffuse defaults and shader arithmetic stay untouched. No hardware evidence yet.

### Следующий OFF контракт: finite paired settling

`PreviewSettlingBudget.mjs` задаёт конечные 13 стадий с CORE=.45 после двух
smooth-стадий и STEP=.2 после каждой из шести puddle-стадий. Это только CPU
контракт: GL ещё не подключён, качество/время кадра аппаратно не проверены.
Длительность передаётся явно; тестовые 1300 ms не являются настройкой продукта.
Пауза пера и freeze не накапливают dt, за один tick допускается одна операция,
потеря контекста завершает контракт. Постоянная сумма fixed+mobile=1 и одинаковые
веса P/C проверены для положительных моментов; это не доказательство сохранения
массы пространственным GPU stencil.

Для накопления нужны **четыре** дополнительных RGBA32F128 поля: старые fixedP/C
читаются, новые fixedP/C записываются, затем пары меняются ролями. Это 1 MiB на
owner, 3 MiB на три owner; полный float preview ledger растёт с 15.375 до
18.375 MiB, отдельно от существующих source/reveal/прочих ресурсов. Предыдущее
предложение двух полей недостаточно для feedback-free накопления. Float ADD
blend не предполагается. Noise уже занимает texture unit7: fixed samplers
должны использовать свободные units5/6 собственного composite-program.
