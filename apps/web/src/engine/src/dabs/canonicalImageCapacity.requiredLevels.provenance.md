# Original image source suffix for the current engine domain

Pure helper prerequisite; no engine/index/Room consumer activates it yet.
canonicalImageRequiredSourceLevels captures the same original source/crop through
canonicalImageMaterialPin and returns a deeply frozen requirement per unique
pinned asset. It uses the existing sourcePngPyramid and sourcePngSelectLevel,
retaining every original index from selection at pin.brushScale through the end.
No descriptor rewrite, reader, pixels, GL call, cache, queue or authority grant.
Original capacity computation and assertCanonicalImageRecipeCapacity are unchanged.

## Why the bound covers current execution

Engine image recipe guard requires 0<recipe.scale<=1 and exact brushScale,
brushAngle/asset; ratio1 and no mirrors. It is used before cold-baseline admission,
hot recorded append and actual local encoded-frame publication. Requested source
LOD is correctly rounded recipe.scale*brushScale, which cannot exceed the positive
representable brushScale. Underflow can only select the final level (or fail later
geometry validation). Rotation, ratio and subpixels are not LOD inputs. The actual
selector, including its1e-6 equality branch, is monotone toward larger index for
smaller requested scale. The helper uses that selector rather than log2 rounding.

This is the current engine domain, NOT the wider shared codec's material domain.
Shared recipes with scale>1 may choose additional larger levels; the existing
engine still rejects them. Low-level full-bank standalone APIs keep their original
behavior. Expanding engine replay semantics requires a separate reviewed resource
preparation contract, not silently reusing this suffix.

## Metadata accounting boundary

The leaf returns bounded immutable planning data and retains no state by itself.
It has <=256 requirements and the native finite index count (bank subsequently
checks <=4096 total selected jobs). The paired consumer MUST charge retained
requirements/merge results in the SAME existing CPU owner before publication;
existing job512B charge alone must not be claimed to cover a second retained plan.
Conservative exact-count estimate proposed for that consumer:
`128 + requirements.length*512 + sum(indexes.length)*16` bytes, including copied
asset record/identity references, arrays and bounded map/object metadata. This is
an accounting estimate, not a JavaScript heap cap. A simultaneous merge must charge
its extra live map/array separately or retain only per-full-asset minimum first
index in the existing plan before constructing the final array. No new ledger.
No consumer reservation or runtime saving is claimed in this helper commit.

## Witnesses and checks

Native source metadata (test IDs/pixels synthetic; no new native/GPU proof):
- Basic6 original150², brushScale.05 →indices5..9,816RGBAbytes.
- Graphite128², brushScale.125,7frames →5..10,13832bytes.
- Mountains256², brushScale1.40625,4frames →0..10,5658656bytes; genuine512px source
  remains, including tiny replay recipes below the local pressure transfer's min.
Thus all-current-engine suffix source union5673304bytes; this is only a proposed
warm set, not an observed allocation after engine integration.

Tests-first3new tests failed because the helper was absent (existing6passed).
Final capacity+selected-bank suites14tests/2passed with one worker. Exact original
suffix bytes, deep immutability/input stability, non-square source, selector epsilon
boundaries, Number.MIN_VALUE/large brush scales and accepted pressure-scale range
are covered. Existing >1 recipe rejection and capacity tests remain unchanged.
Targeted app-config noEmit typecheck, scoped lint0 and diff check passed.
Logs R52/image-required-suffix-helper-{red,green,targeted}.log. No full-app gate,
GPU/browser/device run or active memory reduction is claimed. No temporary process
or runtime resources remain.
