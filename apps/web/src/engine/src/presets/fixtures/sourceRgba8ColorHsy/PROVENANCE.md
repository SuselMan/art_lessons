# Color = HSY: source-based separate-F32 numerical profile

Pinned KDE/krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f` registers
COMPOSITE_COLOR as `KoCompositeOpGenericHSLFunctor<Traits,CFColor<HSYType,U8>>`.
COMPOSITE_COLOR_HSL is a different registration. The imported descriptor59's
`color` name therefore cannot be implemented with a guessed HSL conversion.

This oracle compiles unchanged pinned GenericHSLFunctor/Base, Maths.h/.cpp,
IntegerMaths and FunctorBase with the existing sourceColorRgba8 interface shims.
Original CFColor and its negative-value helper bodies are extracted unchanged.
All source/driver/generator/input/output hashes and compiler flags are recorded
in source-law.native.json.258 cases store full RGBA output and three raw F32 bit
patterns after CFColor, including RGB corners, random colors and alpha branches.
The fixture is40KiB. LUT storage uses the unchanged native byte/255 F32 functor.

The explicit profile `krita-generic-hsy-u8-separate-f32-bd6e8d0-v1` follows
source operations with contraction disabled (`-ffp-contract=off`). It does NOT
claim original installed ARM FMA, FPCR, vtable dispatch, GUI or room readiness.
The shader host canonicalizer explicitly rejects this CPU-only colorHsy mode;
no mode7, GPU Color implementation or rendering authorization is introduced.
Existing generic SC mode IDs and their outputs remain unchanged.

CFColor keeps destination lightness using F32 weights.299/.587/.114, replaces
RGB with source RGB, then setLightness→addLightness→ToneMapping. Luminance/min/max
are computed once before ToneMapping's negative pass; the original maximum is
retained for the later high pass. Luminance<=1e-5 and stretch<FLT_EPSILON preserve
native fallback branches. Integer-channel possiblyFixNegative... is a no-op.
No HSL/HSV roundtrip or generic clamp replacing source order is used.

For valid normalized U8 source colors, adding a constant preserves a range<=1,
so both negative-min and original-max>1 branches cannot hold mathematically at
once. A general stale-max counterexample would be outside this brush input
domain. We preserve the source order without inventing a public test-only HDR
helper or claiming an unreachable case as native brush evidence.

GenericHSLFunctor is not GenericSC. After MULT3 source/mask/opacity and union
alpha, it always performs three separately rounded byte terms then DIVIDE when
union alpha is nonzero: there are no empty-source, empty-destination, full-source
or full-destination SC shortcuts. Real oracle witnesses:
- source alpha0, destination[3,7,19,1], opacity0 →[0,0,0,1].
- source[3,7,19,1], destination alpha0, opacity1 →[0,0,0,1].
Returning unchanged destination or copying source RGB would be incorrect here.
A zero union alpha preserves destination hidden RGB.

CPU test compares all774 F32 bit patterns and1032 composite bytes plus the
combined output SHA256 against the independently compiled original C++ graph.
1235 focused tests pass, including all earlier golden cases; local oxlint passes.
Common web TSC result is recorded by the owning agent/coordinator separately.

Reproduce from the worktree:

```
python3 apps/web/src/engine/src/presets/fixtures/sourceRgba8ColorHsy/generate.py <registered-disposable-build-dir>
npx vitest run apps/web/src/engine/src/presets/sourceRgba8ColorHsy.test.ts --maxWorkers=2
```

The tiny registered oracle build was removed through the standard qa-cleanup
finish path under privileged complete process-reference verification. Registry
UID/mode preserved; no process was stopped. No device/browser/service/dependency
or temporary build remains.

Source attribution: Silvio Heinrich2011, Generic/functions LGPL-2.1-or-later;
Cyrille Berger2006/2007/2010, Maths LGPL-2.1-or-later; Adrian Page2005,
IntegerMaths LGPL-2.0-or-later; Dmitry Kazakov2024, FunctorBase/ClampPolicy
GPL-2.0-or-later. Native extracted source retains its original SPDX notices.

Installed ARM64 profile (separate explicit CPU profile)
-----------------------------------------------------

`krita-installed-arm64-generic-hsy-u8-fused-fpcr0-v1` preserves the earlier
source-based separate-F32 profile. The installed BgrU8 Color/HSY RTTI is
`30KoCompositeOpGenericHSLFunctorI13KoBgrU8Traits7CFColorI7HSYTypehEE`;
vtable slot2 enters RVA0x2a7ea4, unlocked kernel RVA0x2a9074. Original ELF
instructions execute in Unicorn2.1.4 with FPCR0 (not a physical ARM/GUI test).
Pigment SHA256230ccf905226f4324ffdf8c7239e8be90f0506cfadda25393d1ba014ab0bb783,
3694016bytes; QtCore SHA25678fc3da8d316ce7de1d957e3b20d7462b20245d4d797860f1946f797f7946ef9,
5518824bytes. Both ELFs are fetched into RAM from the serial-verified installed
APK, mapped with original relocations, and discarded; no library copy persists.

The original Maths `.init_array` constructor RVA0x10be94 executes107072
instructions and allocates263200bytes including its U16 LUT. Its332code
bytes hash192ea58b33f899c9b6edd9ec78e224243703109dc97702afb64253669d99156d.
All256 actual U8 LUT values match F32(i/255); their1024bytes hash
010413efe9fc4438fee48de66c4d09f377b28af6a9fe2522201e8c1dbb831fc8.
Only bounded libc malloc/new/free/memset hooks are supplied. Original Qt
QBitArray executes; no Qt or arithmetic hooks and no host-injected LUT values.
Initializer-only writes are allowed to audited half-trait/KoLuts globals
RVA0x38dbd0..0x38dc00; afterward only owned stack/heap and four destination
bytes are writable. Source and destination canaries remain unchanged.

Installed luminance executes G*.587 rounded, then R*.299 FMADD into that
term, then B*.114 FMADD. Each tone-map difference/product rounds before its
reciprocal FMADD into luminance. All12 FMADD boundaries use the existing exact
`sourceFmaF32`; no unrounded JS multiply-add substitutes them. Original l/n/x
and all GenericHSL byte-stage laws/zero-alpha witnesses remain unchanged.

`installed-arm64.native.json` records266 original full-vtable results and
captured RGB F32 bits (readonly hook at RVA0x2a922c). The first258 have identical
RGBA to the source-separated oracle but96 differ in CF bits. A deterministic
xorshift32 seed0x12345678 search found8 byte-boundary candidates in63242 host
inputs; all8 then execute through the original full vtable and exactly match
the installed profile, differing from the separate profile in final RGBA.
Example src[130,191,28,255], dst[60,145,216,255], opacity1, absentmask:
installed[104,165,1,255], separate[104,165,2,255]. These are native invocation
witnesses, not guessed source contraction or active-brush/GUI fidelity claims.
The full composite path invokes the original outer Base loop, not just CF.

Reproduction/audit harnesses and receipts are in fixes-v52:
`run-installed-color-hsy.py`, `search-color-hsy-boundaries.ts`,
`installed-color-hsy-execution.json`, `installed-color-hsy-boundary-execution.json`.
The fixture pins runner/shared-loader hashes and original inputs/results.
GPU admission remains closed for both Color profiles. No browser, device
forward, process, service, native build directory or temporary library remains.

Opt-in installed HSY GPU numerical gate
--------------------------------------

The same existing WebGL1/2 numerical modules now export opt-in installed-HSY
libraries and `canonicalizeSourceInstalledHsyControl`. Generic0..6 shader bodies
remain byte-for-byte unchanged; the generic upload adapter rejects both Color
profiles. The separate-F32 profile remains CPU-only. Installed upload controls
carry local `stageLimit:12`, which the consumer must upload to the diagnostic
`sourceHsyStageLimit` uniform; it is neither persistent nor wire metadata.

The fixed12-stage HSY graph has one active static base4096 software-FMA
callsite. Stages retain original source/destination/ToneMapping luminance order,
then negative-min and original-max correction passes. Original branch fallback
and stale l/n/x semantics remain explicit. Ordinary MUL/ADD results pass through
existing normal-or-zero F32 decomposition, integer-significand floor, and exact
power-of-two reconstruction barriers. No compiler contraction assumption or
hardware FMA builtin is used. A byte/255 integer long division supplies the
native LUT values. Positive-normal reciprocal uses bounded47-step integer
long division and RNE; no GPU division estimate is assumed. Signed remainder
operations stay below2^24. The current admitted variant uses the existing full
F32 composition helper, not the experimental short reconstruction variant.

WebGL1 uses a constant12 loop with uniform break; WebGL2 specializes only this
bound to the trusted runtime uniform, avoiding limb-kernel cloning. Both opt-in
libraries use the SAME float-byte integer stage, with intermediates below2^24.
No generic SC shortcuts are applied to GenericHSL. No cache, renderer, production
operation-kind admission, room capability or brush-level grant is added here.

`samsung.native.json` pins the exact two numerical-module source SHA256 values,
fresh memory-bundle/body/266-input hashes, device renderer, timings and outputs.
Samsung SM-T970/R52RB0JXVSY, Chrome156, Adreno650/ANGLE, fragment highp23:
both WebGL1 and WebGL2 match all266 RGBA outputs (1064bytes each), all238 captured
native CF RGB bit triples (714 F32 patterns each;28 zero-union cases had no
native CF invocation), and every one of the256 independently initialized native
U8 LUT entries. The LUT draw has266 samples including10 repeated clamped255.
Eight final-byte witnesses remain included. Wrong RGBA/CF/LUT counts and GL
errors are zero in both contexts. All owned GL handles are deleted before
context loss; child closed, own forward removed, three original tabs preserved.

Measured single-context compile+link: WebGL1 6517.6ms (fragment4722.9ms),
WebGL2 8715.0ms (fragment6797.0ms). The266-pixel RGBA draw+finish took0.2/0.5ms;
these microprobe timings do not establish large-mask throughput, UI latency,
prewarm responsiveness, full composite-pass ownership or native brush fidelity.
No lazy compilation inside pointer processing is authorized by this proof.

Failed straight-line variants are retained compactly in fixes-v52 diagnostics:
all-software-FMA compile failures17.6/45.2s; ordinary-rounding-barrier attempts
included WebGL1 numerical success but42.3s compile+link, WebGL2 compile failure;
short reconstruction had WebGL2 compile failure and WebGL1 link failure, with
no numerical admission. The known WebGL1-passing predecessor source is retained
with SHA2562e3828f3b1fb554274c1c88ced8394f081d5ac060daeaaeb07ad4bda7a7c000c.
The admitted fixed-stage source and failed variants are not interchangeable.
Final receipt SHA2562a6fe39d707d4201e5b99a38d743729e6120fe683f65f5cdeb39e6949b935310.
The approved existing-device lifecycle used one child/forward at a time,
write:false memory builds, five-minute owner receipts and strict finally cleanup.
No temporary process, browser child, forward, build directory or service remains.

Thin opt-in export and current device limitation
-----------------------------------------------

The opt-in HSY export now shares only the existing byte-control struct and
MULT/MULT3/DIVIDE/WRAP helpers. Unused generic Over/Add/AlphaDarken/separable
functions are excluded. Generic WebGL1 output remains4692bytes with SHA256
8909b212340044edd584a4c251fc1c6e662760f64f2ccf3980fdf91b95da7a36;
generic WebGL2 remains4132bytes with SHA256
4552bb5a0f41f366a1a2ad07b93d22d2dda126757a5d479d10aec30648bbb424.
Both default shader strings are byte-for-byte identical before/after factoring.
HSY drops15964→12067bytes (-3897/-24.4%), without numerical graph changes.

`samsung-thin.native.json` records the fresh working-source/bundle/body hashes
and separate phase outcomes. Both WebGL versions again match266 native RGBA
results,238 native CF triples and all256 LUT entries. The existing full pass
again matches266 cases through both source kinds:532 draws/2128RGBA bytes,
all state/sampler/lease/hot-upload/error checks pass. These are numerical and
point-pass proofs, not complete large-batch fidelity or room/UI admission.

No compile-speed improvement is established: numerical compile+link was
WebGL1 6579.7ms and WebGL2 9909.8ms, versus6517.6/8715.0ms in the earlier
fixed-stage probe. Full-pass preparation3312.5ms likewise does not improve
3297.4ms materially. The source-size reduction is the measured result.

The subsequent existing runBrushGlTurn/runBrushGlBatch workload passed both
64-crop feedback snapshots and the final256 snapshot. The600 final snapshot
failed with zero RGBA (1397017 wrong bytes), despite state/sampler/lease/error
checks and cleanup passing. The receipt is explicitly FAILED, not an admitted
large-batch proof. A sibling's next fresh about:blank WebGL context allocation
returned null before any shader call. Cause remains undetermined: driver/context
unavailability is not established as a production batch/math defect. This
synchronous diagnostic did not await a later animation frame for delayed context-
loss delivery. No successful600 batch result or reliable GPU latency is claimed.

Sibling metadata SHA256
35fc6f93bee695b7a811a0204e7fb0a53c917eebc78744baa4c7403fe2fb6560
records KHR_parallel_shader_compile listed=false/available=false in actual
Samsung WebGL1. The proposed asynchronous owner API therefore was not implemented
as a purported Samsung fix; no synchronous fallback was introduced. Existing
async-seam audit is retained in fixes-v52 for future reviewed device support.

All owned GL objects/contexts/children/forward were closed, original tabs
preserved, and device scope handed to the sibling before further diagnostics.
No resource, process, build or service remains owned by this phase. The1265
focused host tests and lint pass; shared web TSC remains a coordinated gate.
