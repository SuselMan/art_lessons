# #728: локализация белых полос нового transport (offline)

ON wetmix screenshot содержит ровные светлые горизонтальные полосы в жёлтом/overlap пятне; reference OFF screenshot их не показывает. Это quality FAIL для приглашения на «улучшенную акварель». Три actual ON контакта supported/applied и GPU errors[] не доказывают визуальную корректность. Independent live arms имеют разные generated stroke/wash IDs/timestamps; источники шума/settle не были заморожены между ними.

## Сохранённый воспроизводимый источник

Фактическая ON tape экспортирована из локальной QA БД read-only: `temp/fast-watercolor-night/room-vector-wetmix-on-surface-20261008/original-tape.json`. Ровно3 original strokes, каждый packed58bytes, original wet/preset/IDs/color/time сохранены. Структурный layer fixture добавляется явно с original layerId; seq нормализуется только как log bookkeeping и записывается отдельно. Нет повторного smoothing/генерации дабов.

## Аудит адресации и ordering

PACK/UNPACK оба используют xy=(x+i%width,y+i/width), records=i*10. P=[R,G,B,A] indices0..3, C indices4..7; новый operator переносит indices2,4,5,6,7. Wet/contact8/9 и P.R/G/A не изменяются. ROI pack завершён до separate storage unpack; available/contact отдельны от material; interpass pingpong source/target distinct, outside ROI storage writes не выполняются. Global invalid завершён pack до pairpasses.

Pair X: v=x, neighbor=i+1 только приx+1<width. Pair Y:v=y, neighbor=i+width только приy+1<height. Обе parity branches копируют unmatched край; exhaustive offline ownership check10260 сочетаний(width1..513,height1/2/3/7/13,axis/parity) дал ровноодин writer/cell и no neighborwrap. Это проверка алгоритма индексов, не самостоятельное доказательство hardware buffer correctness. Tiny17×13 copy/inplace allRGBAoracle уже exact, но это не actual large sparse footprint.

Capacity limiter рассчитывает одну lambda по всем5каналам, source/receiver зависит от sign direction; суммы сохраняются. На held first contact prepareMomentSegment сбрасывает state при отсутствии previous, directionzero: между разными strokes teleport direction не наследуется. Поэтому этот wetmix должен активировать mixing, а не направленный advection. Recipe trace потребуется сохранить в same-tape arms, чтобы проверить фактическое направление. Ни clock/pressure/source fit, ни carrier clamp менять ради полос нельзя.

## Следующий ограниченный диагностический cohort

Controller `9b8f31e3` + `6c9a3130`, QA_SCENARIO=fixedwetmix, QA_TAPE=saved ON artifact, frozen sourceab1dd3db/5356. Последовательно fresh OFF, ON; при нужном isolated control ON+QA_MOMENT_ZERO=1: только rates0, та же source/rebase/publication seam. Negative control строго проверяет реально полученные source recipes rates0. Defaults/runtime не меняются.

Сравнить decoded whole export и final screenshot, canonical packed params/paper/wet/seed одинаковы. OFF/ON не обязаны exact; OFF/zero ожидается diagnostic equality для отделения pack/rebase от arithmetic, но нарушение означает локализацию, не automatic new-model reject. Для spatial attribution следующими точками нужны actual material до транспорта/после unpack/после rebase/после settle; не всё сразу и не полные1536field dumps. Ровные полосы в zero arm направят анализ на contact/source/rebase/publish; только в active arm — mixing/receiver/finalfit. Stage observations не заменяют proof.

Full viewport,512²ROI baseline/final readback и один whole export: около19.5MiB/arm; no all-owner-field capture. RAM1700 preflight/500 abort, owned pages only; hardware только после root allocation. Surface сейчас занят другим gate, Samsung запрещён. Никакого художественного улучшения или latency выигрыша пока не заявляется.

## Bounded Room stage probe (OFF diagnostic candidate)

`5924f8a8`/`fc08612e`/`2ceaf0ac`: operator snapshots actual pack and each of four combined mix+advection pair passes, then actual unpack P/C. Relative capture≤96² inside full actual contact ROI; model ROI is NOT cropped. Each snapshot is inserted after its operator command; arrays pingpong unchanged. Five record snapshots≤1.84MiB/contact, unpack P/C≤72KiB, source-publish GL presentation512²≤1MiB/contact. Three contacts +normal final/baseline ROI/whole export stay below32MiB explicit readbacks.

Room probe obtains stages through source seam, removes observation buffers from adapter transient retirement, awaits maps outside timed path and destroys them in finally. Existing material/lease ownership is unchanged; observer is never a default. Same original ON tape and zero-rate override are available. Actual GL presentation recorded after source publication is an observer render/readback, not physical latency. SHA plus bounded raw bytes saved once in moment-stages.json; main report retains metadata only.

Production candidate GPU kernel combines mix and advection in a single dispatch; GPU captures labelled pair-X/Y-parity include BOTH. Separate CPU mixing/advection substages use SAME exchange oracle twice (mix-only then adv-only), verified equivalent to direct exchange for source-fit170/180/200, near-capacity receiver, last Q8 units, zeroPB-positiveC. No claim that these separate CPU intermediates were hardware sampled.

Software staged preflight first exposed a diagnostic decoder failure (RGBA unpack treated as u32); stopped report retained. Corrected run `temp/fast-watercolor-night/moment-vector-stages-software-fixed-20261008.json`:8 actual SwiftShader arms PASS with every stage/final exact CPUoracle, outside0/sums preserved/errors[]. Owner/source/stage tests11 PASS, strict harness TS using actual app-config extension PASS. This is offline preflight, not actual Room stripe attribution. New immutable runtime required; existing ab1/5356 left unchanged. Hardware awaits root allocation.

## Actual staged Room attempt: RAM guard stopped observation transfer

ONE allocated frozen source2ceaf0ac staged same-ON-tape run executed3contacts and exported finalimage. Export SHA80fb38143001aad7f19f4901944b375dc0cf1b8fc174d52dd3c2628643e9e535 matches the original ON image. The stage observer did not visibly change this final output before failure. During stage retrieval RAM fell below500MiB (min405), owned target was closed immediately; no retry. Post-close RAM2030MiB. Raw `temp/fast-watercolor-night/room-vector-stage-sametape-surface-20261008/report.json` andfixedwetmix.png retained. Stage arrays were not durably transferred, so first divergence/stripe stage remains unknown. This is diagnostic resource failure, not operator quality improvement/failure proof.

The former observer used Array<number> snapshots retained3×512² presentation plus record arrays; serialized JS/CDP memory was not bounded by the GPU byte-count budget. Corrected OFF-only controller/probe atoms `4443bb9b`, `1cc507bf`, `18e2d2e7`, `f1a1ccfc`, `090afc18`: presentation reduced96², tightstage payload compact base64, window results contain metadata only; separate payload map max32MiB estimated UTF16 strings. Transfer sequential64KiB encoded chunks, binary SHA/length verification, fsync before explicit release ACK, one artifact/contact at a time. No numeric arrays in window/CDP payload. Owned closed targets receive no more page queries.

Expected actual observer bytes now5,861,376 across3contacts, plus baseline/final/wholeexport19,496,832 =25,358,208 (<32MiB). Base64 string retained representation≤15.7MiB, a CDP reply≤64KiB chars and decoded block≤48KiB; no full snapshots in main report. These are diagnostic data budgets, not total native process/GPU memory claims.

`published=false`/observerError are explicit and incomplete/failing publications rejected rather than labelled successful. Offline tests cover binary lengths/padding/Q8 byte decoding, bounds, durable SHA transfer/release ACK, and rejection of failed publication. Hardware corrected observer not rerun; Surface released for another task and Samsung prohibited.

## Compact actual same-tape stages: first observed stripe precedes this contact's transport

ONE compact same-ON-tape run frozen090afc18 completed3contacts and24 binary artifacts with SHA/length/durable ACK. Readbacks25,358,208bytes; stages5,861,376bytes. RAM pre2071/min964/afterownclose1885MiB; GL0/errors[]. Final export exact original ON. Raw `temp/fast-watercolor-night/room-vector-stage-compact-surface-20261008` contains metadata/binary records, stage-analysis.json and generated scientific PB stage grids/source-presentation PNGs.

Offline exact Q8 replay of each actual pair input: all12 pair checks0 differences/max0 over94×94 interior, excluding one-cell crop border whose outside input was not captured. All6 unpack P/C checks on full96² are exact. This independently validates actual captured arithmetic/packing at the stripe location, not only synthetic textures. The analysis script is `docs/qa/harness/728-room-moment/analyze-stages.py`.

Horizontal light stripes already exist in PACK P.B for the FIRST purple contact before its four pairpasses. Its immediate GL source-presentation before settle contains corresponding lines. Contact2 PACK has zero-P.B horizontal run28pixels on capturedrow87 with nonzero neighboring rows; these gaps precede its operator. Four pairpasses smooth/fill some adjacent values and unpack preserves them exactly. All actual held recipes directionX/Y0, so advection is inactive.

Thus neither current contact transfer arithmetic nor GL final-only presentation is the first observed origin. This does NOT prove a final root cause: previous pure-water transport/rebase or upstream native source/brush noise may matter; independent original OFF had different generated IDs/seeds. Decisive next control is SAME saved canonical ON tape with operator OFF and vector zero-rate/rebase, comparing source before each operator. Do not modify source noise/fit/rounding or carrier exchange merely to hide lines. No quality improvement claim; no new hardware run beyond allocated compact cohort.

## Same-tape zero-rate source control

ONE Surface frozen090afc18 control completed with all three actual recipes `mixRate=0`, `advectionRate=0`; 24 compact artifacts durably transferred (5,861,376 bytes), errors[] and owner page closed. RAM pre2164/min1127/post-close2076 MiB. Raw: `temp/fast-watercolor-night/room-vector-stage-zero-surface-20261008`. All12 pair oracle checks and6 full unpack checks exact; every pack-to-pair SHA is unchanged as required by zero rate.

Compared with retained active same-tape cohort: pure-water contact0 pack, unpack P/C and immediate presentation are byte-exact. FIRST purple contact1 PACK is byte-exact across all ten u32 record fields, although active output differs (P2841 bytes/max7, C11697/max7). Therefore the visible input stripes precede active transfer, and previous pure-water transport/rebase does not explain this contact's difference. Contact2 PACK P.B remains exact, including zero-P.B run28 on row87; other packed fields differ downstream of the previous active contact. No inference from independent OFF seeds is needed for these comparisons.

This excludes current mixing arithmetic and the preceding zero-pigment operator as origins of the first captured stripes. Upstream source rasterization versus a no-operator source ownership path remains open. Prepare a separate OFF source observer around actual source landing/publication; it must not fabricate moment pack records or change arithmetic. ZERO is a diagnostic control, not a naturalness/performance verdict.

## OFF source observer: first pigment input is identical without moment

ONE allocated OFF same-original-tape run on frozen090afc18 completed, vector/moment flags both false. Three actual source-P/source-C/presentation captures96² transferred with durable SHA/ACK,331,776 bytes total; errors[], page closed. RAM pre2089/min1131/post-close1910 MiB. Raw: `temp/fast-watercolor-night/room-vector-source-off-surface-20261008`, including `off-zero-comparison.json`.

Crop metadata matches ZERO exactly. Contact0 and FIRST purple contact1 each have source P, source C and immediate publication framebuffer byte-exact to ZERO (all0/max0). The first visible source stripes therefore also exist in the native source without any moment operator/rebase. Current mixing, preceding pure-water mixing and final-only renderer presentation are excluded as first origins at these captured pixels.

Contact2 is NOT equivalent: OFF/ZERO P36521 differing bytes/max61, C35818/max61, framebuffer22147/max125. Preserve this separate continuation/source-state question; do not advertise ZERO as globally identical to OFF. The source observer captures before publication; ZERO captures after operator, so some chronological metadata differs even though crops match. This result is not native-versus-WebGL quality evidence.

Upstream candidate: held stamp transverse `across` feeds `wcHairField`/`wcTipContact`, which can form approximately horizontal contacts when brush axis is vertical. The actual source shader also multiplies cloud/settling/film blot. None has yet been causally identified: isolate actual prepared stamp parameters and mask channels before changing noise/pressure/fit, and retain same-tape source proof. The operator and default source arithmetic remain unchanged.

## Zero-state contract candidate (offline)

Actual Room GPU-audit publication previously rebased `inkLoad→inkBase`, `inkColor→colorBase`, cleared current film even at both rates0. Planner capture selects those bases when `filmGesture===gesture` and splits mobile from `(laid−settled)`. Scalar counterexample: load120/base20 gives mobile100; rebasing preserves displayed120 but gives mobile0. Thus zero-rate texture equality alone is insufficient for future settle/state equality.

A narrow candidate skips ONLY this continuation rebase when both recipe rates are exactly0. Transport shader/defaults unchanged; nonzero candidate behavior unchanged. Actual owner regression retains full P/C/base/film/coverage state, mobile partition and resource release/publication,11 tests PASS. Hardware full-state/stage comparison still required, frozen5358 unchanged. This is a contract repair candidate, not proof that all active-operator naturalness issues are fixed.

## Prepared-uniform census and offline mask candidates

QA source observer now records exact existing prepared stamps/uniforms, live composite scalars and before/after film epochs/role presence (maximum32commands). It reads metadata, not additional GPU fields. No device run has collected this new census yet; actual profile anchoring must be established before mask attribution.

Offline helpers: bundle `prepare-held-source.ts` with esbuild `--platform=node --bundle --alias:@grafetto/shared=./packages/shared/src/index.ts`; run with saved original tape and output JSON. It uses unchanged production packed-dab codec/preparer/seed and explicitly emits two candidate profile anchors (`wash-first`, `operation-first`). Strict harness TS PASS. `decompose-held-mask.py <OFF raw directory>` evaluates noise/hair/contact/cloud/blot against actual observed source P.B; CPU double arithmetic is not GPU interpolation/compiler precision parity.

Current candidate radius119.433/combs50/across[0,1] has approximate transverse cell spacing2.389pixels. TipContact reaches0, cloud remains positive0.84–1.15, held pigment blot candidate is1. This makes brush contact a specific candidate for horizontal modulation, but full-image correlations include nib geometry, clipping, prior paint and settle. Contact1 correlation0.23 and contact2 correlation0.73 with tipContact are observations, not proof. Do not remove/brute-force-round noise based on them; compare actual census first and use a bounded shader diagnostic channel gate later.

## First zero-state census attempt: instrument rejected cloned recipe

ONE frozenfd61b67d attempt stopped with FIFO `canonical task cancelled` before meaningful stages; preserved raw `temp/fast-watercolor-night/room-vector-zero-state-surface-20261008`. Own page closed; pre2120/min1766/post-close1874 MiB; GL0/lostfalse/errors[]. No automatic retry and no zero-state solver verdict.

Offline reproduction identified an observer integration defect: existing QA controller passes a CLONED chunk with rates0 into original emitPrepared; outer observer then inspected the caller's original nonzero recipe and rejected it. The diagnostic now checks the actual owner's pending recipe and records it in an independent CPU census. Regression explicitly reproduces64/32 caller→0/0 delivered copy and passes.

Separate hardening: film resource absence is valid when source segment has no film. Census records `absent:true`, zero bytes, without allocating a fake zero texture. Pre/post absence must agree; rollback/map/retirement accepts no-buffer records. Tests cover actual missing base/film roles and unchanged full-state observation. Frozen runtime/apps unchanged; these are QA observer/controller fixes only.
