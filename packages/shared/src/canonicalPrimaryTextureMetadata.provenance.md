# Explicit-aware material3 stroke/snapshot metadata only

This unit adds CanonicalStrokeFrameContextV3 to the SAME decodeCanonicalStrokeFrame
function and its common envelope checks/freezing path. The selector is an OWN DATA
top-level materialVersion:3, paired with own-data material.version:3. Envelope2
and genericSC raster profile are mandatory for this unit. The decoder never
infers V3 awareness from the material object or frame text alone. Missing top
selector and own selector2 preserve the old material1/2-only branch; unknown,
inherited or accessor selector/material-version fields fail without getter calls.
The existing fabricated/top-less trusted3 regression still rejects actual CMAT3.
The old-selected branch requires captured packed text to start1| or2| before
unpack; material and checked packed bytes are captured and reused, not reread
from mutable caller properties after envelope getter callbacks. This intentionally
tightens malformed/getter-input error priority without changing ordinary old
serialized1/2 behavior. No broader legacy getter/Proxy sandbox is claimed.

Old optional raster-profile defaults, original identity/RGB/composition matching,
material coverage checks and resulting envelope/frame deep-freeze logic are shared,
not copied into another decoder. V3 unpack dispatch uses its exact typed overload;
no V2 cast, scalar dropping or untextured fallback. Parsed grainDepth retains F64
bits including -0 and empty phase2 structural markers keep existing framing.

CanonicalStrokeSnapshotV3 is a STANDALONE interface and pure normalizer only.
CanonicalStrokeSnapshot, actual BEGIN result, recorded capability/attachment1,
Any material unions, policies, grants, adapters and engine remain unchanged.
prepareCanonicalRecordedAttachment still calls the V2 normalizer exclusively and
refuses snapshot3. SnapshotV2's normalization implementation is unchanged.
The existing shared barrel export-star makes new metadata APIs visible; visibility
is not negotiation, source authority or renderer/material3 capability.

The new snapshot normalizer captures closed own-data ordinary/null-prototype
records before value use, including source/pattern/budget/composition/asset records.
Arrays must be bounded dense own-data arrays. It validates exact outer/material
two-role metadata equality, static image pin against primary asset only and
canonicalPrimaryTexturePin against the distinct pattern asset. Pattern padding
is permitted but its rectangle/period/offset must satisfy the foundation law.
No stock CAS is built in; CAS contents/original descriptor provenance belong to
the caller. A raw descriptor/source data artifact is not rewritten or fabricated.
Proxy reflection traps are not a sandboxed capability boundary.

Only validated scalar fields are reconstructed. Returned outer assets and material
assets share one newly frozen array; records, image source, pattern, budget,
pigment and composition are independently captured/deep-frozen. No accessor or
arbitrary serialization/size walk is used to compare raw metadata. The actual
CMAT3 builder produces a genuine empty probe with its two-asset ledger; explicit
aware decoder3 validates it against the pinned identity/profile/composition and
geometry budget domain before returning the normalized snapshot.

Tests exercise nonempty aware3 grain and empty phase2, old top-less3 refusal,
wrong selector/material version/envelope/profile, own2 with historical material,
getter non-execution, exact roles/order/CAS/rectangle/padding, outer/inner mismatch,
budget/epoch/brush/SHA/extra/prototype/sparse metadata refusal and frozen independent
captures. Existing attachment1 tests and actual snapshot2 paths remain active.
This is pure shared CPU metadata proof, not texture rendering, GPU budget,
permission, peer negotiation, server admission or active device support. No
shared/dist rebuild, runtime/source policy activation or new rendering law occurs.

## Immutable aware3 capture correction

The earlier seven-path metadata freeze is superseded: a reference-only capture
was insufficient against in-place material3-to-material2 mutation from an envelope
composition getter. Aware3 now requires captured text to begin `3|` and invokes
`canonicalPrimaryTextureMaterialContext` BEFORE envelope callbacks. That pure
factory reuses the codec's existing closed own-data schema and common context
validator, independently captures and freezes assets/array, source, pattern,
budget and context. The codec's own V3 entry delegates to the same factory;
there is no second codec or schema. Later changes to the original asset/budget
cannot change admitted metadata. Historical material1/2 dispatch is unchanged.
The factory is public parser metadata, never an execution/grant capability.
Tests include genuine CMAT2 bytes paired with an actual in-place downgrade,
independent genuine CMAT3 decode despite original asset/budget mutation, and
factory deep-freeze/schema/accessor checks. New nine-path gates supersede the
old seven-path result; prior tests alone did not establish this correction.
