# Внутренний local straight-RGBA8 composite pass

Не подключён к старым painters/PM layers/wire. Поддерживаются два конечных семейства: local alphaDarken creamy/hard и explicit
Over32 scalar profiles. Используются уже доказанные SOURCE_ALPHA_DARKEN32_GLSL и
SOURCE_OVER32_SCALAR_GLSL без изменения numerical strings. Нет заявления о
vector/native Android factory или подключении к текущему frame pipeline.

Target требует brand canonical-straight-rgba8-v1: texture/FBO RGBA8 со straight
RGB, размеры и TOP-left world origin. GL row0 назначения — его логический низ.
FBO attachment identity проверяется до copy; source/target/scratch alias запрещён.
Source — уже разрешённый TransformedMaskView, cached key/handle проверяется.
Его GL row0 — logical TOP, coverage.r; valid UV bounds и post-raster mirror
применяются один раз. Tip matrix/nativeDomain не повторяются. Pigment — три
прямых U8 RGB канала; A8 берётся ТОЛЬКО из маски, заменяя исходную ink alpha.

Сначала целочисленный world clip. Для пересечения[x0,y0,x1,y1] target GL rect:
[x0-originX, H-(y1-originY), x1-x0, y1-y0]. Только этот rect копируется
copyTexSubImage2D в scratch[0,0,w,h]. Draw читает старое назначение из отдельного
scratch, а не одновременно читаемой/записываемой target texture. Source logical
pixel вычисляется по маленьким local coords: offset+(localX,clipH-localGLY),
затем mirror индексов и valid UV. Большие world origins не попадают в float uniforms.

Подготовка — фиксированные W/H<=4096, area<=1M, одна scratchRGBA8 texture,
VBO48bytes, одна программа на запрошенное семейство (максимум две)/optional VAO.
GPU charge=4WH+48, CPU reserve=48+8192*число семейств (8240bytes по умолчанию)
для staging/program/uniform/state metadata. Driver compiler/binary allocations
непрозрачны: texture budget не является гарантией hard vendor driver heap cap.
Ни полного tile copy, ни pixel CPU arrays/uploads/readback при draw нет.

prepare(limits,companionResources,companionCpuBytes,signal) проверяет source bank
и prepass workspace/slots по реальным cache charges. GPU суммы dedup по keys.
CPU учитывает max(текущие companion reservations, переданный companion estimate),
а не повторно складывает уже зарезервированные companions. Source bank plan должен
изначально включать этот pass в companion budget. Буфер назначения принадлежит
внешнему владельцу и учитывается им отдельно, это не скрытый cache allocation.

GL-state capsule BrushGlState извлечена из прежнего prepass без изменения логики;
оба pass используют её, touched texture units задаются явно(3/2). Optional OES VAO
изолирует attributes; fallback восстанавливает live pointers/enables/divisors с
прежним ограничением NULL pointers WebGL1. prepare/copy/draw error и finally
возвращают state, lease и reservations. reset(false) удаляет только свои ресурсы,
reset(true) forget-only; external target/source ownership не меняется.

Meaningful CPU/MockGL regressions проверяют clip/subrect copy/relative coords,
повторный feedback-copy перед overlap draw, отсутствие hot allocation/uploads,
неподходящий PM-brand/alias/attachment/controls до изменения pixels, shared quota,
отсутствие двойного companion CPU charge, copy failure/retry, VAO и disposal/loss.
Это не численный GPU oracle: combined prepass+pass и итоговый RGBA buffer должны
дополнительно сравниваться root на реальном устройстве.

## Расширенный API: проверка устройства ещё требуется

`drawSource` принимает maskRgb либо straightRgba8 view, операцию alphaDarken32
либо over32 и optional immutable readDestination. Последний имеет ту же геометрию,
что output; каждый preview копирует именно этот base, поэтому смена opacity не
накапливает повторный Over. RGBA source сохраняет собственные RGB/A8, без ink-alpha
множителя. Source==output запрещён; source==base при другом output допустим.
Старый draw остаётся синхронным совместимым адаптером.

RGBA view объявляет unscaled integer UV subrect, rowOrder и post-raster mirror.
Cache residency проверяется по key/handle/actual bytes; external residency требует
явного owner/lease. Output/base также держатся внешними leases до завершения draw.
Straight RGBA8 brand — обязательный контракт владельца: WebGL1 attachment identity
не доказывает internal format. Перед sampling сохраняются MIN/MAG/WRAP_S/WRAP_T,
временно выставляются NEAREST/CLAMP и восстанавливаются до GL bindings и освобождения
leases, включая draw failure; при context loss восстановления не выполняется.

12 CPU/MockGL тестов включают две bounded программы, repeated immutable-base
preview, alias/metadata rejection до lease/copy, source==base, byte controls,
ориентацию и восстановление четырёх sampler parameters после success/error.
Эти тесты не заменяют pending actual GPU gate расширенных веток.

## Joined device gate (исходный pass 1bc11f408)

Actual Samsung SM-T970 / Adreno650 WebGL1 highp23:102 trials with306
submitted sequential draws, including empty clips.98 material/profile cases
and4 right-edge4096x8 targets;13 deduplicated prepared sources. CPU expected
uses separately verified mask bytes and common scalar AlphaDarken32, not a
duplicate GPU formula. All whole-target bytes exact; state restored, no hot
uploads, cache hits no work, GL errors empty. All own GPU/cache/CPU reservations
released in finally. Private reproduction: fixes-v52/run-canonical-composite.mts
and canonical-composite-body.js; receipt canonical-composite-device-result.json.

The first harness attempt rejected source upload before protection; the harness
was corrected to protect the finite source group before cache.put, with no
production code change. This proves this isolated prepass/composite path only,
not current app PM storage, wire/replay, native vector dispatch or whole brushes.

## Extended drawSource device gate

Frozen a70d8c2e0 pass /3047f6635 prepass source on actual Samsung SM-T970,
Adreno650 WebGL1 highp23:64 Over trials /192 draws, both explicit scalar
profiles and maskRgb/straightRgba8 sources, both row orders, four mirrors,
direct feedback and immutable-base repeated previews. All expected bytes exact,
GL errors empty. LINEAR/REPEAT NPOT source sampler parameters and caller GL
state restored; leases balanced; hot uploads0; cleanup GPU/CPU reservations0.
The first harness attempt omitted required empty companions and rejected before
GPU work; corrected harness passes[]. No production code change was needed.

The prior102 AlphaDarken trials were rerun against this extended shared source
template, again all432128 target pixels exact; state/cache/hot-upload checks pass.
Private receipts: composite-over-3047f6635-device-result.json and
canonical-composite-3047f6635-device-result.json. Native installed FMA/vector
identity and active app PM integration are still outside these scalar gates.

## Real stock-author canonical whole-stroke device gate

Actual Samsung SM-T970 / Adreno650 WebGL1 highp23, frozen3047f6635/a70d8c2e0
geometry/composition sources:17 retained real descriptors,680 author inputs,
203 decoded canonical chunks,3256 draws. Real original CAS bytes pass SHA/size
validation; finite source banks are prepared, canonical recipes bind original
crop and level. Sixteen wash strokes use local scalar AlphaDarken plus final
portable scalar Over against immutable base; one buildup stroke uses Over.

Every final512x256 RGBA target byte matches the independent host calculation;
all per-chunk local FNV checkpoints agree (additional diagnostic, not a
cryptographic equivalence claim). Hot uploads0, GL errors empty, GL state
restored and leases balanced. Maximum tracked brush GPU4648212B and CPU
reservations1267440B; external surfaces and driver allocations are separate.
Cleanup releases all owned contexts/textures/reservations and restores original
three Samsung tabs. Private scripts/receipts: fixes-v52/run-canonical-stock-
strokes.mts, canonical-stock-strokes-body.js, canonical-stock-strokes-device-
result.json, canonical-stock-device-cleanup.json.

This is explicit scalar-profile end-to-end conformance, not installed native
FMA/SIMD or active PM storage/wire/undo identity. It is also not a responsiveness
pass: heavily instrumented test took69.7s across17 strokes, maxrAF133.8ms,
maxworkturn138.1ms. Separate phase/guard A/B profiling is required before
attributing these timings to production engine work or claiming smoothness.

## Optional synchronous batch

Второй аргумент drawSource(request,frame) использует общий BrushGlBatch capsule,
predeclared owners/resources, once-per-source sampler journal и once-per-FBO
validation. Прежний drawSource(request)/draw не пропускает защитные проверки.
Численные shader strings и copy geometry прежние. Контракт и ограничения описаны
в BrushGlBatch.provenance.md; предыдущие receipts не являются proof нового batch.

Source15f484ede batch additionally passed the full17 canonical stroke gate on
Samsung SM-T970/Adreno650:680 inputs,3256 draws,203 chunk checkpoints, finalRGBA
and checkpoints exact, GL[], hotuploads0. The separate guarded receipt uses
caller-state sentinels/snapshots outside each scope and proves restoration;
all owned resources/leases/context/child tabs released. Receipts are private
R52/canonical-stock-full17-batch[-guards]-device-result.json and paired cleanup
receipts; summary canonical-stock-full17-batch-summary.md. Unguarded receipt's
stateRestored field alone is not evidence of caller-state restoration.

Guarded timings15.551s total include QA/browser/driver/readback overhead. Consecutive
rAF timestamps per brush/phase exclude the first callback; the earlier unguarded
receipt's negative first interval is a baseline artifact and remains preserved.
Hot frame stalls remain (for example brush84 maxrAF100.3ms/maxturn67.1ms); this
is not a responsiveness pass or proof for native fused arithmetic/active layer
storage/undo/replay. Future sampler-ownership changes require their own gate.

## Explicit fused scalar kernels (joined GPU gate pending)

Opt-in operation kinds alphaDarken32FusedScalar/over32FusedScalar require profile
installed-arm64-scalar-fused-fpcr0-v1. They reuse the identical geometry, source
views, clipping, copy, state, residency and sampler paths above; only numerical
program and validated flat-control upload differ. Old kinds/default preparation
remain unchanged. At most TWO selected kernels may be prepared, with the same
scratch/VBO and existing GPU/CPU accounting, never four programs/new quotas.

Alpha upload performs ParameterInfo aliasing before the single CPU hard fold,
then passes folded O/A plus opacity/flow components; shader does not fold again.
Over passes the F32 opacity and its exact finite components, preserving tiny
source-alpha classification. This is named scalar FPCR0 arithmetic, not installed
GUI/vector packet dispatch, native64 partition or full118 compatibility.

Primitive whole-pixel receipts801da9626/068961850 do NOT prove this joined pass.
29 focused composite/batch lifecycle tests and webTSC/lint pass after integration;
fresh joined Samsung pixel/state/cleanup gates are required before activation.

## Authoritative page write bounds

Optional request.writeBounds is an integer half-open world rectangle, validated
before drawSource acquires source/target leases or performs GL work (an outer
batch may already own its capsule and declared leases). The copy/draw rectangle is the intersection
of source, full target storage and these bounds. SourceGeometry offsets remain
relative to the ORIGINAL source rectangle and mirror remains a post-raster
operation; neither target dimensions nor source UV geometry are shrunk. Empty
intersections do not copy or draw. Existing calls without bounds use the previous
source/target intersection. These host tests establish clip/offset/state control
flow; the previous device receipts do not certify this added optional path.

CanonicalTargetPlan provides matching pre-allocation geometry: authoritative page
intersection precedes tile fanout computation and enumeration. It returns full
storage rectangles and per-tile paint bounds separately. It rejects fanout above
64 and unsafe outward tile extents before allocating a grid list. null explicitly
means an infinite page; viewport rectangles are never substituted for page bounds.
The executor/room integration must use the same plan for admission and execution,
handle empty draws, and pass the paint bound into drawSource. A standalone planner
and optional compositor field do not establish complete page/room integration.

### Samsung write-bound device gate (source 5e7573f6f)

Actual SM-T970 / Adreno 650 / Chrome155 WebGL1: 64 combinations, 192 calls,
zero differing bytes (maxDelta0). Independent host pixel intersection applies
page bounds before original source/mirror indexing. Both Over32 profiles,
maskRgb/straightRGBA, both source row orders, four mirrors, feedback/immutable
preview, negative and ±2^40 origins are covered. Bounds cycle through inset,
wholly outside and omitted. Pixels outside bounds retain their previous bytes.
No hot uploads/VBO writes, sampler/state restoration and leases balanced; GL
errors0, teardown GPUcache/CPU reservations0. Own child closed, original three
tabs preserved, parent3631 restored, ADB forward removed.

Receipts: fixes-v52/page-bound-composite-{prepared,device-result,device-cleanup,summary}.json;
runner run-page-bound-composite.mts and page-bound-composite-body.js.
Full result SHA256: f77c42dbb7f72d7420b807ea45a833cc28fed7f52d9e304fc0e288a656c0e143.
This certifies the optional compositor clipping path, not whole-stroke room
clipping, active renderer integration, native brush identity or responsiveness.

When readDestination defaults to the exact target object, validate/bind that
object once. Standalone draws save one framebuffer completeness and one
attachment query; the existing batch already deduplicates those queries, so its
change saves only a redundant framebuffer bind. Distinct destination objects
still validate both attachments. Every new standalone call/batch rechecks
foreign attachment changes; no cross-turn authority or GL state cache is added.
Target identity/query-count/state-restore tests cover these boundaries. This
small reduction is not evidence of a general warm executor latency improvement.


### Explicit GenericSC U8 operation (2026-10-31)

Commit 2fc7b39f7 adds `genericSCU8` to this same pass and its existing
program/cache/budget ownership. Multiply, Lighten, ColorDodge and Overlay require
`krita-generic-sc-u8-bd6e8d0-v1`; old mode IDs and profiles are unchanged. Host
controls and numerical GLSL are imported from the existing byte compositor,
including the distinct no-mask MULT3 law. Invalid profile/mode combinations
reject before destination queries or resource leases. No room/stroke profile,
outerBlend admission, renderer or cache is introduced.

Host verification: 84 pass/executor tests passed, including exact uniform bytes,
mask presence/zero, state restoration and invalid profile rejection; scoped
oxlint and common app+service-worker TypeScript checks passed. Source-header
C++ oracle provenance lives in presets/fixtures/sourceRgba8Separable. This unit
alone is not actual GPU, original ARM, full brush or active editor evidence.


The subsequent actual Samsung gate is committed as 197a6cce1:
fixes-v52/generic-sc-u8-samsung-proof.md and result/cleanup receipts. This same
WebGL1 pass produced 528 exact results (260 source-header vectors plus four
MULT3 witnesses through both straightRGBA and maskRgb source lanes); the
existing WebGL2 integer helper separately produced 264 exact results. No GL
errors/state drift, hot uploads or outstanding charges/leases; own browser child
and ADB forward removed, original tabs preserved. This upgrades the GPU gate,
not installed ARM identity or canonical room admission.
