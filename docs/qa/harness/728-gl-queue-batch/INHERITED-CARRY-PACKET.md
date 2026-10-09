# OFF inherited carry: готовность и граница доказательства

База контроллера 7d66322f; кандидат dda7ecba. Аппаратный запуск не выполнен.
Единственное отличие будущего preview-cohort — INHERITED_CARRY=1 при CARRY_PREVIEW=1.
Остальные water400→pig70 / Float / Direct / Early / Finite / ownSourceSpacing
флаги сохраняются. Канонические параметры и shader не изменяются.

Immutable predecessor geometry захватывается из prepared source chunks того же
слоя/заливки до нового владельца. Используется max текущего и предыдущего
minor-tip radius; вода/wet/standing остаются текущими. Флаг не доказывает
связность: давление и V остаются водными gates; stride1 не перескакивает dry cell.

Паспорт контроллера вычисляется по текущим файлам session/pool/contract/options/
inherited helper/production constants, а не переписывается вручную. Actual flags
проверяются до input; отсутствие inherited/carry не считается ON измерением.
Новый actual tape и новый endpoint обязательны; старый ecd79 endpoint OPEN.

Read-only production formulas:
- RibbonStrokeScratch.noteFinish складывает radius max по finish batches.
- CanonicalWatercolorSettlePlan.prepare получает radius извне; budget =
  watercolorSpreadBudget(radius,water,runWet)/S, radiusC=radius/S.
- spread = clamp[2,160](radius*(.5+.4*w*(.15+.85*l)) +
  60*smoothstep(.75,1,l)); w/l clamp01.
- frontSteps=min(wet-dependent cap,ceil(1.4*budget+radiusC*(1-l))).
- Preview имеет S8; production S определяется bounds/radius и может быть1/2.

Следовательно, размеры UI400/70 и максимумы prepared minor geometry позволяют
вычислить кандидат, но НЕ фактический canonical radius: нужен реальный profile
multiplier/aspect, finish-merge scope, runWet и production S. При w=l=1 radius200
даёт world budget160, radius35 даёт91.5; это условные иллюстрации, не измерение
этой ленты. Нет основания подменить actual prepare probe этим расчётом.

Original SAME-tape prepare probe остаётся OPEN из-за подтверждённого reload.
Контроллер не принимает replacement loader, не перезапускает replay и сохраняет
ошибку отдельно от engine quality. Следующий hardware только по выдаче слота.


## ONE Surface результат

Raw owner-water-dab-inherited-surface.json; compact summary и новая tape лежат
в temp/device-runs. HEAD516bb4f8, fresh RAM2059/controller2070/post1986MiB;
own target закрыт, Surface RELEASE. valid=true, GL0/lostfalse.
Actual water400/pig70; DOWN allocate0/completeSettle0. Computed source passport
сохранён raw; canonical/paper без изменения. Captures/Float readback perturb
cadence, поэтому физическая задержка не заявляется.

Owner2 radius current22.713087→inherited180.262604; preview budget20/cost24,
effectiveWet1/standing0, requestedfront28 capped16. UP18834.9,
first carry18967.2 (+132.3ms); seed/front/pair interleaved без32-frame паузы.
Carry21total (owner1five+owner2sixteen), CPU submit total5.7/max1.5ms,
material3.5/max.4ms — НЕ GPU time. Finite11 stages до land.
Combined P/C alpha5.3715688003→5.3715686842 (−2.16e-8 relative), peak.1526738.
История DryUndoRedo exact beff7f1bc88e01f0f87157d625307dd6556df00d56ef431f1179b7337ede79a2;
undo empty. Original SAME NEWtape OPEN, не переносим старые endpoint claims.
TapeSHA2d048e127959cb92413c469cea7c818d3dc34a0399e9bb3c05939071e5704272.

UP frames88.7/133.5/304.7/748.2/1204.9/2105.6ms; handoff0/51.5/151.1ms.
PNG5 осмотрен: tiny violet core в большой серой воде, выразительного широкого
растекания нет. Увеличенный радиус сам по себе цель не достиг; НЕ artist-ready.
Source8 actualRoom SHA не снимался, readonly proof primitive отдельно.

Следующий offline анализ: production multiscale carry path/domain вместо
16 unit-stride hops; нельзя просто увеличить dir, поскольку это перескочит
раздельные лужи. Требуется costDomainStep поддержку пути для SAME pressure,
две собственные Q8 pingpong mask leases128 (доп.375MiB), positive gradient gate,
и bounded invocation/draw ledger до hardware. Это план, не implemented/proven
новый эффект, не дополнительный аппаратный запуск.

## Offline path prerequisite

PreviewCostPathOracle ports unpacked WC_COST_DOMAIN_FRAG seed and dyadic min
reduction literally. Exhaustive axis-gap fixtures (32 positions ×5 strides)
prove each mask equals conjunction of all stride+1 endpoint/interior cost cells;
fully dry cost above band blocks even a one-cell gap. Two Node tests PASS.
Partial-wet cost below band remains traversable. Crucially this mask reads
PRESSURE only, not V: if a dry topology cell incorrectly has low pressure, this
mask alone cannot protect it. Before GL wiring, source/V-gated seed must be an
explicit visual-only change or a proof that all dry cells have high pressure;
we do not infer that from synthetic uniform pressure. Plateau branch already
checks V at every interior sample for stride≤8 and rejects stride>8; positive
cost branch needs the explicit support predicate too. No hardware/pass claim.

## Separate OFF wet-path seed source

PreviewWetPathSeed.mjs declares a separate small GLSL program, not a modification
of production costDomain/fieldOp. Seed permits an axis face only if BOTH cost
endpoints≤band AND BOTH nearest V.A endpoints>0. Float V.A is support, never
interpreted as thickness. Subsequent existing unpacked min-doubling preserves
that predicate for every intervening cell. Low-pressure dry-cell negative,
positive partial-wet face, cost-boundary and source-unchanged CPU fixtures PASS3.
This tests source algebra, not GPU compilation/byte parity.

Prerequisite for wiring: explicit aligned nearest128 V support owned reduction;
reading high-res V with linear sampling can bridge subcell gaps and cannot be
called this proof. Domain128 already has support in alpha; binding that owned
read-only field preserves the128 model but does not prove sub8px topology.
Additional two Q8 mask targets128 =131072bytes/owner,393216bytes/three owners;
all distinct from pressure/P/C/fixed/source/pending. Total preview proposed
19.125MiB. Seed1+log2(stride) reductions+front1+paired2: stride16≤8draw/tick.
No DOWN allocations, no reused masks across pressure changes without rebuild.
Budget/compile/hardware not yet proven. Existing inherited evidence retained.
