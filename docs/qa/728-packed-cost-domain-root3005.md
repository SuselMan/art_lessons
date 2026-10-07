# #728: diagnostic packed reachability on root3005

Principle: immutable inclusive transport-domain reachability is stored separately
from the physical coefficient. D(i)=cost(i)<=band inside the half-open fieldRect;
outside cells are false. This is the already-reviewed #687/#728 domain contract,
not a V threshold or a fix for the remaining pale rim.

This net candidate is based exactly on3005a83c18c5469f300b98baeef8060bcc20d27f and
contains only mask39, draw scheduling580, route independence52 and packed cb188
runtime changes. No onset/private presentation helpers, model constants, workers,
frontend defaults or persisted operation formats are copied from another branch.
Both `diagnosticCostDomainPaths` and `diagnosticPackedCostPaths` remain false.

Single-paint carry borrows existing NEAREST ca/cc while numerical colour is null.
Mixed and zero-paint records skip. Physical eligibility is independent of live
ownership, so historical and owned routes use the same operator. Existing owner14
requirements for presentation/split continuations are untouched. Numerical colour
is reconstructed only after all carries. Cost, pigment and solvent are inputs;
no new textures. Disposed/context-forgotten jobs cannot execute subsequent mask or
material writes.

Each RGBA channel stores D1..D64 in bits0..6 (codes0..127). Seed D1 plus six dyadic
passes construct all levels once, before the fourteen existing carry operations.
Each dyadic stage preserves old bits and adds Ds(i)&Ds(i+s) at the new bit. Inclusive
endpoints and exterior zero are enforced before texture sampling. Carry rounds the
UNORM code to an integer and selects its bit with the existing power-of-two stride.
Positive-cost weight and normalizer use the same guard; physical coefficient is
unchanged. Zero-cost plateau logic is untouched. Mask draws disable DITHER only
for packed mode and restore the prior state. Final ca is read-only until colour
reconstruction. Packed OFF retains56 separate mask operations; all flags OFF
retains the original grouped schedule.

CPU validation on this root-compatible worktree:62 actual Plan tests PASS, scoped
web TypeScript PASS, literal722400-path/128-code oracle PASS, diffcheck PASS. Tests
cover seven-mask/fourteen-carry order, one immutable final path identity, fixed C
reconstruction, ownerfalse/true equality, mixed/purewater skipping, defaultOFF and
abort/context loss with no late writes. These tests do not claim GLSL pixels.

The equivalent runtime net (frozen e8+39+580+52+cb188,906 tracked hashes) was tested
separately. Vega:722400 fullrect+722400 offsetsubrect literal paths exact,128 codes
under both DITHER entry states exact, NEAREST MIN/MAG9728, fourteen OLD e8/OFF
P/C synthetic carry outputs exact (phase0), fourteen binary/packed outputs exact.
Inputs unchanged, GL0, own Chrome closed. No full-sheet3 packed endpoint or phase1
OLD/OFF proof yet.

Samsung Adreno650:15 complete LOW/HIGH/P/C/MASK salted links PASS; sizes
39511/39533/39556/39580/1659.1536² seven-draw sequence measured separately with one
1×1 sync:median15.9ms; max separately synced unit4.3ms. These are primitive timings,
not whole solver throughput or a paired improvement. Three diagnostic buffers
28,311,552B; no production allocation. GL0/contextalive, target1402 closed finally.

Evidence remains in the source worktree `728-live-onset-current/temp/onset/`:
`packed-vega-report.json`, `packed-adreno-first/report.json`, and on HOME
`680-puddle-outline/temp/packed-cost-domain-cb188/temp/onset/packed-warm-retry3/`.
Invalid bootstrap/HMR attempts are retained and excluded. No integration, defaults
or publication is implied by these scoped gates.

## Полный Vega gate, 7 октября 2026, 06:09–06:24 UTC

Замороженный runtime `054446e86de51a2128d1234694dc94f07ae6db0d` проверен
по 915 tracked web/shared SHA. Три последовательных engine в одном собственном
Chrome воспроизвели весь immutable curated journal из 42 операций
(SHA `ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9`):
41 rendering operation, исходный image_import явно исключён; никаких иных
сокращений истории. После полного suffix применён одинаковый terminal Dry.
Target seq61, single paint, phase1, ownerfalse; phase/baked/sourceRebase включены
одинаково. LEGACY / BINARY / PACKED реально выполнили 0 / 56 / 7 mask draws,
по 14 carry и 14 phase calls. Mask включён только для target61.

Все семь полных входных полей 1536² совпали SHA между тремя руками:
mobile P, total C, fixed P/C, V, coverage, cost. Это actual total/fixed C,
не заявление о paired mobile C в single-paint пути. Первые carry source identities
совпали с checkpoint. Все пять полных target dry fields BINARY/PACKED совпали:

| Поле | SHA256 |
| --- | --- |
| dryP | f24d66aeb89abd5a4d9fffb0d8e1617bdebc82616c29345fe7ec6df1b2d07f11 |
| dryC | efd3439789febb17e2878aa90a8d736009bf0d88043b1289622cd511d26e0f4d |
| V | b7f980ba435a8e140dd0e15b097ffce8dd8483e25d074d933567a33b3d64feb3 |
| coverage | be52f33a6d6e9c5806b734e70f239e9aaf4f98b2dc8312962ae3aa93b7660509 |
| cost | 196f71129deb533a4adfb6a6a6aa45eee8e03c03fb111216f067fbc1f9921cd8 |

P/C nonzero 46467 pixels. Два actual stride64 mask census по 376656 каналов
каждый совпали с literal domain oracle: difference0, nonzero48214.
Все 14 настоящих phase1 LEGACY carry draws сравнили OLD e8 programme и
current diagnostic OFF на одинаковых входах: полные 9437184 bytes exact
на каждом шаге. Это доказывает данный single-paint P path, не отдельный mode16 C.

Whole decoded RGBA 3508×2480 BINARY/PACKED: **0 differing pixels, max0**,
nonempty. Обе PNG SHA:
`19837b73c6944e5e9a3079954bef39c22c7d4daa303da04409e480598f808d7b`.
LEGACY/BINARY: 3525 pixels, max53, как в предыдущем cost-domain guard gate;
packed optimization эту физическую разницу не меняет.

Target wall BINARY 6.728s, PACKED 5.982s; prefix 151.418/151.250s,
suffix 139.541/139.814s. Здесь присутствуют диагностические readback/hash/stream,
поэтому это не чистый GPU throughput и не native responsiveness benchmark.
GL0, context alive, errors/network empty; последний MemAvailable1293MiB,
ниже preflight1700 после запуска, но выше running guard500. Session7714 exit0,
owned Chrome finally closed. Никаких новых GPU запусков после release.

Компактный VPS report:
`728-live-onset-current/temp/onset/full-phase1-final-report.json`.
Полные raw/PNG на HOME:
`680-puddle-outline/temp/packed-cost-domain-root054/temp/onset/full-phase1-config-retry1/`.
Первый `full-phase1-first` сохранён INVALID: отсутствующие referenced Vite
config files остановили bootstrap до engine. Retry добавил точные config files,
исходные 915 runtime source hashes не изменились. Default OFF сохраняется;
gate не является решением каёмки, mixed-paint guard или разрешением публикации.
