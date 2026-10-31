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
