# Explicit primary-pattern source variant in actual composite draws

This unit implements a real drawSource branch, not a standalone unused shader.
It does not activate executor/engine/source author/protocol material3 support.
Only actual trusted future material3 owners may select it after shared total-work
admission and room capability are complete. A bank view proves storage ownership,
not descriptor/phase/strength execution authority. No foreign shader changed.

The additional source kind is texturedMaskRgb: SAME transformed mask view and
pigment plus genuine CanonicalPatternResource, closed primary texture pin and U8
strength. It rejects copied views, wrong owners/root generation/cache storage,
invalid pin/asset or integer strength. Strength0 is legitimate zero textured mask,
not bypass; negative zero is rejected at this U8 boundary. Pattern storage must
be square POT1..4096, explicitly checked before acquisition/paint. Periods are
positive integers up4096 validated by the shared pin (not hardcoded252).

The only initially prepared texture variant is alphaDarken32FusedScalar. The
existing executor's GenericSC localAlphaDarken mapping selects precisely this
installed-profile operation; this unit does not relabel a raster profile or claim
support for all GenericSC kernels. Outer straight-RGBA operations remain plain.
An optional texturedOperations manifest must be a whitelisted subset of prepared
operations. The variant has a distinct program key, explicit supports check,
prepare/reuse manifest identity and one extra8192-byte program metadata estimate.
The scratch/VBO/GPU byte manifest is unchanged. Failure/cancel deletes both old
and extra program objects and releases their existing owner reservations.

fragmentFor(kind) and all old shader outputs remain unchanged. The new guarded
wrapper adds a sampler and exact integer source-coverage law BEFORE construction
of source and invocation of the existing numerical composite kernel:
Mtex=max(0,M-T-(255-S)), M/T/S U8. It does not change opacity, averageOpacity,
flow, masks, fences, source pigment or outer composition. New uniforms are
queried only on the explicit additional shader. Missing/stale variant rejects
before target lease/copy/draw; no plain-mask fallback exists.

Host phase is shared canonicalPrimaryTextureCell(rect.x+clip.maskX,periodX,
offsetX) and corresponding Y, where actual clip computes top-left WORLD
intersection. Shader column=floor(local.x), top-row=floor(clip.height-local.y).
Tip mirror/row conversion applies only to source mask pixel, never to canvas
pattern coordinates. Reduced phase plus bounded local index is0..8190. Fixed
conditional subtracts at period multiples2048..1 perform exact binary reduction
without GLSL mod/division. Multiples are integers<=8,388,608; highp23 preserves
these integers. New variant requires fragment highp precision>=23, rangeMax>=24,
rangeMin>=14 before allocation. POT original square gives binary-exact texel
centers(cell+.5)/side. Raw LUMINANCE red is quantized floor(sample*255+.5), then
integer subtract/clamp. Existing fused numerical kernel intentionally retains its
own mod/division instructions; no native Krita float equality is asserted.

Source/destination remain units0/1, pattern uses2. Full batch/turn already saves
three units. Only textured standalone draws save3 instead of legacy2. The raw
pattern key/charge joins the actual protected/cache-leased resource group and
frame.assert; a batch that omitted it cannot paint. Genuine pattern view is
revalidated after external lifetime callbacks before any target binding/copy.
Feedback alias with source, target, base or scratch is refused.

Both samplers use existing native parameter query fallback; no new immutable
sampler certificate or managed GL liveness witness is minted from storage proof.
Standalone sampler helper now accepts its unit, restores each changed parameter
on that unit, and rolls partial setup back if a native setter throws. Finalizers
attempt BOTH sampler restores in reverse while owners are held, then GL state,
external leases and cache lease, preserving the first failure. Frame sampling
uses existing batch sampler restoration. No global GL state/binding cache.

Tests use genuine bank prepareRoot/publish/lease/view and actual drawSource,
cache, resource ownership and batch implementations. recordingGL tracks lifetime,
state, shader source and uniforms; it DOES NOT rasterize pixels. Coverage includes
separate program accounting and old shader text, S0/128/255 with no per-draw upload,
asymmetric3x2 pattern/side4, clipped positive and negative world origins with both
mask mirrors, both native sampler success/error restoration, full-batch resource
declaration and rejection of undeclared pattern, stale/copy/root callback failure,
invalid strength/NPOT, missing/stale manifest, shader compile failure/retry,
preparation cancellation, precision and CPU budget refusal. Existing composite,
HSY, batch and raw bank regressions are included. CPU phase reference uses
independent arithmetic, not shader output. Actual GPU pixel equality across devices
is a separate ROOT-owned gate; shader strings/MockGL do not prove it.

No total texture work budget was invented here: before activation the shared V3
encoder/decoder/admission must agree total geometry+texture work under the existing
cap, and executor/engine must propagate exact material3 root authority and retain
its lease through work. No protocol, executor, engine, source author, prepass,
cache/storage-owner algorithm, shared/dist or protected foreign shader was edited.

Source gates:98 tests/5 suites PASS (maxWorkers1), targeted actual app-options
TypeScript against shared source0, scoped lint0/0 and diff check PASS. One initial
test incorrectly banned existing kernel mod() along with the new reduction;
the assertion was corrected to the new patternCell block. Initial fixture bounds
and unit literal typing issues were fixed explicitly. No failed production pixel
check was hidden; no actual GPU run was performed by this unit. No runtime,
dependency copy, browser/device process or service was created; own processes0.
