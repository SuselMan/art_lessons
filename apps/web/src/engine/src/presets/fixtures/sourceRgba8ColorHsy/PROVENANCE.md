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
