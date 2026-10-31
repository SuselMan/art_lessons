# Generic SC U8 separable outer operators

Pinned source: KDE/krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`.
`source-law.native.json` records source/driver/generator hashes, compiler flags,
input/output hashes, four exhaustive channel-table hashes and260 pixel vectors.
The fixture is34KiB;262144 channel bytes are hashed rather than stored as arrays.

The oracle compiles unchanged `KoCompositeOpGeneric.h`, Base, Maths, IntegerMaths,
FunctorBase and ClampPolicy with the existing `sourceColorRgba8/shims` interface
scaffolding. Multiply, Lighten, HardLight/Overlay and ColorDodge native functor
bodies are extracted without arithmetic changes. Its trait has four byte channels,
alpha3, all channels enabled, alpha unlocked and identity additive blending.
Named RGB arithmetic is unchanged by the installed KoBgrU8Traits BGRA layout.
This is a compiled C++ pinned-source-law oracle, not original installed ARM code,
actual Krita GUI execution or a proof of external color-profile conversion.

The generic source law always uses `UINT8_MULT3(sourceAlpha,mask,opacityByte)`,
including absent mask255. It differs from the two-factor Over path:sourceA91,
opacityByte248 yields88 rather than89. Empty source preserves destination hidden
RGB; empty destination copies source RGB; full alpha branches use signed
UINT8_BLEND; partial alpha uses three separately rounded MULT3 terms, U8 narrowing
and integer DIVIDE. Overlay destination127 returns source exactly. ColorDodge
source255/destination0 returns0; positive destination returns255. Opacity first
casts to float, then F32*255 and half-up conversion; `.5-1e-12` therefore produces
byte128, unlike premature double quantization127. Existing Over/Add/AlphaDarken
ids0/1/2 and their fixture outputs are unchanged.

New mode IDs3Multiply,4Lighten,5ColorDodge,6Overlay require explicit profile
`krita-generic-sc-u8-bd6e8d0-v1`; host preflight rejects missing/wrong profile or
unknown modes. CPU and both GLSL dialects share each existing generic Add alpha
body with the selected channel result. Optimized F32 Over/AlphaDarken profiles
remain separate. This primitive does not authorize room/wire/tool execution.

WebGL1 uses existing integer-valued highp float helpers. Maximum MULT3 folded
intermediate16743774 is below2^24; signed blend uses floor/arithmetic shift, and
existing division residual correction remains. WebGL2 uses corresponding uint/
int helpers and identical channel/alpha branches. No lookup texture, new budget,
renderer or dependency is introduced. Actual GPU acceptance is a separate gate.

Reproduce from the worktree with retained pinned sources under the documented
R52 outer-composite-source and historical v29/v46 source folders:

```
python3 apps/web/src/engine/src/presets/fixtures/sourceRgba8Separable/generate.py <registered-disposable-build-dir>
npx vitest run apps/web/src/engine/src/presets/sourceRgba8Separable.test.ts apps/web/src/engine/src/presets/sourceColorRgba8.test.ts apps/web/src/engine/src/raster/sourceRgba8CompositeShader.test.ts --maxWorkers=2
```

The generator verifies primary manifests/old fixture source hashes before build;
its ClampPolicy file has an explicit expected hash. A tiny C++17 executable emits
exhaustive65536 source/destination pairs for each channel op and260 full generic
composites. Vectors cover source/destination alpha0/255, masks absent/0/1/127/255,
negative blend differences, neighboring half-byte F32 controls and explicit qreal
to float conversion.1232 tests pass including all1223 prior golden tests, and
local oxlint passes. Common web TSC is the coordinator's integration gate.

The registered160KiB oracle build was removed using the standard qa-cleanup
finish path after privileged process-reference verification (unprivileged audit
could not read same-user systemd/sshd). Registry ownership/mode were preserved;
no process was stopped. No device/browser/service/runtime resource remains.

Attribution retained in extracted/compiled sources:
- Silvio Heinrich2011, GenericSC/functions, LGPL-2.1-or-later.
- Cyrille Berger2006/2007/2010, Maths, LGPL-2.1-or-later.
- Adrian Page2005, IntegerMaths, LGPL-2.0-or-later.
- Dmitry Kazakov2024, FunctorBase/ClampPolicy, GPL-2.0-or-later.
