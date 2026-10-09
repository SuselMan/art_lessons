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

## Isolated multiscale fixture READY for review, NOT allocated

Entry preview-multiscale-entry.html → previewMultiscaleGpu.mjs is independent
from earlier unit fixture. Same synthetic source8 / paper / options, paired
Q8/F32 arms; whole10-stride dyadic cycle, never cut on a coarse stride. Explicit
zero-pressure dry-V gap seed negative and connected seed positive. F32 gate
requires movement, expanded nonzero support, donor paired alpha/mass drift<.01
Q8-equivalent total units, zero mass in disconnected pond/outside support,
source8SHA unchanged. Q8 is reported separately; no assumption it stays still.
Each carry tick awaits a fresh RAF then≤7draw; a Room interleaved front adds1.
RAF await has1000ms cancel-on-timeout so frozen pages cannot hang this fixture.
24 front preparation ticks are isolated oracle setup, NOT proposed UX pause.
Readback checkpoints perturb scheduling, NOT performance or physical latency.

Source identity: literal production16/15 programs untouched; separate seed
literal source and production costDomain reduction. P/C read SAMEOLDP/fixed/
pressure/path per tick; both destinations distinct. Two masks128 outside all
source/pressure/mobile/fixed textures, rebuilt for every pressure/carry tick.
Fixture compiles a new small program only after opt-in invocation; cleanup
known-idle finish occurs only fixture finally, never DOWN. F32 allocator is
existing actual capability/rollback gate. Own buffers/program destroyed before
engine; controller owns/ closes page, no foreign pages. Hardware not run.
GPU link/FBO/source-alpha precision and partlywet subcell topology remain
unproven; aligned128 domains do not promise preserving gaps below8world pixels.

## ONE isolated Surface multiscale result

HEAD521de0b4; raw preview-multiscale-surface.json/compact summary in device-runs.
HTTP fixture200/Fine asset200; actual paperSHA4c631b8c5da1813977aeb34405fa223ebf74b59a0b5df951e23d71f986a26968,
README pre-runSHA95dfcd4e0224aba7d8dec9f5ca734dedcf81c6f46e929ac73cb603cf28431918.
Fresh2105/controller2085/min1859/post2033MiB. Own context closed, RELEASE.
Actual small-program compile/F32 allocation/FBO succeeded. GL0/lostfalse.
Zero-pressure dry-V gap seed negative true; connected seed positive true.
Source8 actual SHA unchanged. No mass in disconnected pond or outside support.
F32 OLD P/C paired alpha equal:4880.000172704→4880.000189230 Q8-equivalent,
drift+.000016526 (+3.39e-9 relative); nonzero61→89/177/191 at steps1/4/10.
Q8 also moves61→178, sum4880→4856 (−24/4880=−.492% rounding drift), so Q8
is explicitly NOT exact mass conservation. All10 dyadic strides, at most7draw/
RAF, separate front setup24 bounded ticks. No GPU duration/Room-quality claim.
This positive prerequisite allows review of isolated path coupling; it does not
establish visible Room spreading or SAMEtape canonical endpoint. Unit/inherited
negative evidence stays intact. Next runtime wiring only after source review.

## OFF Room multiscale executable packet (CPU ready)

Session3b372bfe/runtime614ebde6/tests1c452a4d. Standalone flag
MULTISCALE_CARRY=1 → diagMultiscaleCarry; requires current CARRY_PREVIEW=1.
Inherited remains separately selectable. Factory prewarms six mask targets and
small seed program before input, explicit20054016bytes total19.125MiB. Factory
throw destroys masks/program after setup fence. Owner takes pair at seal without
allocation; cancellation detaches, retains physical leases until known-idle,
then releases path+pressure exactly once; loss no DOWN fence/ reuse.

Ticket.coverage provenance: TypedPreviewPool creates128NEAREST coverage;
TypedPreviewTransport.step exposes that field; SealedPreviewGlPort.initialize
resamples ownV→water then PreviewWaterDomain.draw overwrites preview coverage
alpha with R/A support. It is NOT production material coverage (which remains
fullreadonly1024). It is NOT pressure. Source/canonical fields unchanged.

Actual session uses production watercolorCarryStrides from source-derived budget,
whole cycles≤24, maxstride16; pressure/front interleaved with each carry. First
stride1:seed10+front+pathseed+pair=5draw; laterstride16≤8draw includingfront.
No scalar rate/dose changes. Existing finiteclock pauses during carry and
advances timestamp. CPU session complete10 sequence/OLDP-C/sharedpressure/count
and runtime staleepochdetach/noearlyrelease/doublecleanup tests11PASS.
EntryHTTP200, computed controllerpassport includes seed/pool/port/session and
strict effective flag gate before input. Prepared-source generator unchanged.
Room hardware NOT run yet; primitive positive does not imply Room quality or
canonical endpoint comparison. Root review/allocation required before device.

## ONE actual Room multiscale result

HEADa237d9bb; paperHTTP200/SHA4c631b8c…; actual runtimeSHA3ec1197b…
Raw owner-water-dab-multiscale-surface.json/compact summary/new tape in device-runs.
Fresh1963/controller2025/min859/post2038MiB; own target closed/RELEASE.
GL0/lostfalse, history target/redo exact02109b4dc054a9157ab7bea289618d85cef96508e436fa0a91489941db7b3a32;
undo empty. Original SAME NEWtape endpoint remains OPEN, no comparison claim.
Owner2 requestedfront28/cap16 but actual10: complete10stride cycle finishes
before reaching front cap. This is explicit visual schedule limitation, not
canonical same schedule. First carry~108.7ms afterUP; filmstrip samples
77.7/109.5/315.3/712.9/1212.1/2112ms, handoff0/66.2/191.7ms.
Combined P/C alpha5.248039381→5.248039429(+9.14e-9 relative), peak.110383.
Carry14total; CPU submission40.1/max34.6ms, material3.2/max.3ms, not GPU duration.
CostDomain lazy compile is a hypothesis for cold stall, not demonstrated cause.
ActualmoviePNG5 viewed: tiny violet core with slight lateral halo, broad visible
movement still weak. NOT artist-ready, no whole smoothness/performance claim.
ActualRoom source8 SHA not captured; primitive separately proved source readonly.
No shader/material/dose changes to strengthen appearance. Next offline attribution
must separate incomplete pressure support from already diffused peak and physical
carry schedule; arbitrary coefficient increase is not justified.
