# Read-only composition and grid256 audit

After commit40e11562. No model/runtime/hook implementation, no GPU run.
Reviewed actual macro14 custom factory plus macro11/16/17 fine factories.

## Coherent + smooth-fine cannot be a pair-source-only override

macro11 creates macro9 base via observePacking and borrows its state,
stationary/output handles. macro17 passes only mobilitySource(gain) through
basePairSourceOverride. This works for macro13 because it needs no extra
input channel. macro14 additionally fills EVERY aux.w with CPU-prepared
vertexψ before first dispatch. The ordinary base's aux.w is zero, decoded as
ψ−32768 at interior vertices while explicit boundaryψ0: using coherentSource
alone would create a false boundary field, not the intended coherent model.
It is not a harmless absence of curl. Face differences can become32768 instead
of the proved<=256, invalidating the curl multiplication bounds. A future
composition must validate field initialization as a capability, not silently
accept a pair shader alone.

Safe future choices, not implemented:

1. Add a narrow base initialization hook for ONLY aux.w (fresh N-word owned
   field, validated length), called before GPU writes. Coherent wrapper
   builds field from input.seed/paper; fine wrapper forwards this alongside
   pair source. Existing observePacking still supplies shared handles. Keep
   capability/state-hash/metadata lifetimes and throwing-upload behavior
   explicit; don't let generic hooks silently alter capacity channels0..2.
2. Add observePacking to macro14 and a coherent-capable base factory option
   in fine wrapper. Borrow state/output exactly once; base remains their sole
   owner. This needs adapting stateHash etc, not pretending macro14 already
   has the full macro9 fourth-options contract.

A seed-only shader override is insufficient because actual field is prepared
from BOTH seed and paper, including global power-of-two normalization. Field
SHA must remain visible in combined metadata. Pack-seed uniform cannot be
used as pair seed: it is separate and pair phase must remain0..3.

Ownership order: fine owns ONLY fine allocations; base owns states/aux/raw/
output. observe callback borrows, never releases those handles. Throw while
creating bindings must destroy both owners once. No wrapper state/GL changes
remain across RAF: these are submitted WebGPU jobs, not global GL hooks.

## Inventory and work, not timing predictions

Current macro14 GPU allocations at128: two48-byte Cell planes1.5MiB,
aux0.25MiB, stationary/output/pixel-staging12MiB, state-staging0.75MiB,
phase uniforms64bytes:14.5MiB+64bytes. Vertex ψ CPU129²×4=66564bytes;
paper preprocessing3×128²×4=0.1875MiB transient. Initial state+aux+stationary
CPU about5MiB, separate from retained caller input6MiB. No field arrays are
kept in metadata; only stats/SHA. Upload hash and preparation outside run.

macro16 fine extra:68MiB plus small uniforms/guards; macro17 adds16MiB fine
D, total84MiB extra. Thus current base+smooth-fine approximately98.5MiB,
not a tiny reconstruction optimization. Both fine arrays are16MiB each,
fine aux16MiB, paper4MiB, fine ledger staging16MiB, smooth D16MiB. Readback
copies/maps that16MiB ledger AFTER compute timing; it still affects end-to-end
latency. Redundant base full1024 PACK runs before fine overwrite.

At256phases: coarse128 has4,194,304 invocations. Fine12 alone adds12,582,912
pair invocations plus full1024 init/pack. These counts do not predict GPU
milliseconds: integer divisions, storage caching and branch divergence vary.
No claim that fine stage or coherent field is faster/slower before profiling.

macro17 separately floors bilinear M and D, so initialization totals change
before fine pairs. Fine pairs conserve their NEW M totals; compare identical
init fine0/fine12. Wet gate remains nearest coarse W+S even though M/D are
smooth; smooth material can extend halfcell beyond that nearest wet support
and stay immobile there. This is a declared new reconstruction/regularization,
not exact old support semantics or a continuous-water solve.

## What grid256 would actually change

Coarse GPU inventory22MiB+64bytes: state6MiB, aux1MiB, state-staging3MiB,
stationary/output/pixel-staging12MiB. Delta7.5MiB. Pair invocations4× at SAME
phase count. CPU vertex array257²×4=264196bytes, paper temporaries0.75MiB.
Fine1024 allocations/work stay unchanged. These are byte/count calculations,
not a performance claim.

Hardcoded blockers must ALL be changed together:

* initialIntegerDynamic loops128 and8×8; need256 and4×4, mean denominator16
  instead64. Capacity/frozen-wet policy changes because smaller cells mix
  fewer dry/opaque pixels: not numerically equivalent source preparation.
* Coarse dispatch currently16×16 workgroups;256 requires32×32. Merely changing
  uniform n would leave three quarters of the state uncomputed.
* Smooth PACK numerator2x+1−r: r4 means−3, denominator8, floor8 for negative
  coordinates, weights sum64, final byte divisor64*257=16448 and half8224.
  Existing macro9/10 hardcoded−7/floor16/weights256 would sample wrong geometry.
* macro17 M/D interpolation has those same constants, plus hardcoded n128
  uniform upload. Nearest mappings p.n are generic, but they do not fix those
  smooth paths. Fine1024 dispatch128 remains correct.
* World eddy wavelength: eddy16 currently128px; at256 it becomes64px. Need
  eddy32 for128px (and48 for192px), plus explicit potential amplitude/time
  calibration. Global power-of-two normalization can change discontinuously;
  no claim of preserving world velocity simply by doubling the grid.

Dynamics also need an intentional NEW calibration: at unchanged cell-fraction
rates and phases, halving cell size halves pure advection distance and halves
diffusion RMS. Matching diffusion RMS needs4× phases, matching advection
2×; they cannot both be preserved by one blind steps multiplier. Pressure
q~deltaW is diffusion-like; changing physical spacing alters its coefficient.
Increasing dt fourfold inside existing product would exceed its provedu32
numerator bound; staged arithmetic needs a new stated model/rounding proof.

Existing u16 ranges, Cell48-byte stride, donor/cap bounds and aux.w encoding
can remain; n256 indexing stays safelyu32, but field/source/timing gates and
new initial quantization must be recertified. Don't label grid256 a pure
quality-preserving geometry optimization.

No temporary services/processes/browser contexts/resources created.
