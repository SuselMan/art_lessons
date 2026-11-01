# CMAT3: staged primary texture parsing, not execution

This unit extends the SAME material builder, binary pack/unpack, FrameReader,
recipe dictionary and framing/cost preflight. No second codec, CMAT2 binary
rewrite, execution kernel, snapshot/grant, policy, adapter, shared index change or
runtime activation is introduced. Exported AnyCanonicalMaterialContext/Frame/
Recipe remain their historical V1/V2 unions. Explicit V3 types and overloads are
parse-only; successful parsing is neither a GPU-budget grant nor a source grant.
The existing shared/index.ts export-star DOES expose these new types, profile
constant and overloads through the public barrel without editing that file.
Staging means closed execution/authority, not an inaccessible public API.

Context3 is a closed own-data ordinary/null-prototype record with exactly two
distinct ordered asset roles, static primary image then primary texture. The
primary source has no frames list, auto program or maskSource. The pattern pin
uses canonicalPrimaryTexturePin against the exact second asset. Metadata beyond
the image/pattern roles cannot become a recipe. Generic bounded pin acceptance
does not mean a GPU implementation supports every size/phase; initial stock
descriptor admission remains a separate, currently absent implementation.

V3 captures plain own-data context/source/budget/assets, frame/build records,
recipes, draws, entry and fences before reading payload values. Accessors,
symbols, unknown fields, custom prototypes, sparse arrays and inherited version
fields are refused. Context version, when present, must now be OWN data even for
old contexts: inherited version or accessor-version exotic JavaScript inputs no
longer pass. This is an intentional boundary tightening; it does not claim every
old arbitrary-object behavior is unchanged. Ordinary V1/V2 data numeric rules,
binary encodings and existing source-material branches are retained. Proxy
reflection traps are not sandboxed and can execute during descriptor operations.

Wire3 is canonical `3|` base64. Header24 and fence16 are unchanged. Two asset40
ledger entries are ALWAYS present, including genuine empty/terminal frames.
Definitions reuse the tagged image96 layout only, index0 primary; pattern index1
is never a definition. DRAW40 retains old fields at offsets0..27 and reserved
u32 at28, adding grainDepth F64 at32. This scalar is finite[0,1] and preserves
signed zero. It is not opacity/flow, a geometry key or a texture-disabled flag.
No quantization/rendering occurs in the codec. Recipe signed-zero identity stays
unchanged and different grainDepth draws deduplicate the SAME image definition.

The actual existing entry/fence state machine is shared. In particular phase2
`mask` is legal AFTER primaryEnd even when masked=false: a primary-only chunk may
stop there and its structural suffix finishes segmentEnd. CMAT3 refuses actual
mask-role DRAW and masked=true, not these necessary empty mask-phase markers.
No extra operation, guessed reset or synthetic gesture fence is generated.

Length/count/base64/header/reserved checks precede decoded frame-array allocation;
the bounded binary buffer and individually validated metadata are not image
resources. Layout offsets derive from one version-dependent definition/draw size
selection. V1/V2 and V3 contexts cannot cross-decode, including empty frames.
This binary-unpack ordering is not a claim that local pack/build copies are
allocation-free: V3 captures at most800 draws/definitions and2404 fences into
own-data records before aggregate geometry-cost preflight. No pixel allocation,
dictionary growth beyond these bounds or execution resource follows from it.
Existing work/output/draw-pixel bounds still check primary image geometry only.
No texture-work estimate was invented: allocator/sampling/composite costs,
actual renderer support and total resource admission remain activation blockers.

Tests capture literal V1/V2 golden bytes from actual a3e57b03c BEFORE the change;
new-code build/parse/repack preserves them. V3 tests check direct offsets, fixed
role ledger, DRAW40, -0 scalar, geometry-dictionary reuse, phase2 empty suffix,
cross-version refusals, malformed tags/roles/reserved bytes/length/count/scalar,
geometry/pixel-budget limits and closed-context getter/prototype cases without
getter execution. Existing V2/soft/gaussian/density suites exercise the shared
preflight and binary implementation. This is CPU parsing proof only, not device,
cross-GPU pixel, negotiated-client or complete primary texture support proof.

A later shared-only metadata unit adds standalone SnapshotV3 and explicit-aware
parse entry. Before activation a coherent consumer unit must still adopt them in
actual result/attachment unions and original source/admission/recorded evidence
authority, actual authored grainDepth,
budgeted pattern resources, explicit material3 kernel dispatch on envelope2,
recovery/leases and old-client capability negotiation. All are currently closed;
unknown frame3 is not silently cast to V2 or rendered without texture.
# Historical guard and old-selected stroke admission remain closed

Unit5edd introduced an old-entry guard on `decodeCanonicalStrokeFrame`: without
an explicit top-level materialVersion3 awareness selector, it accepts only the
legacy material context without a version field or own data version2. That OLD
branch still rejects material3, including inherited/accessor version without
invoking the getter. The later metadata-only overload adds an explicit own-data
selector3 plus own-data context3 and genericSC/envelope2 parse path. It does not
open actual Snapshot/result/attachment1/server/renderer consumers. This also protects
JavaScript callers fabricating a trusted context rather than relying only on
the unchanged TypeScript snapshot unions. A valid empty CMAT3 frame in the
old generic-SC envelope reproduced acceptance before the guard; the regression
test continues requiring rejection in the OLD/top-less branch. The original
RED evidence remains valid for the historical guard. Standalone SnapshotV3
metadata parsing is now available; actual snapshot/result unions, grants,
attachment1, renderer and peer capabilities remain closed.

The explicit-aware metadata follow-up now independently freezes material3 via
canonicalPrimaryTextureMaterialContext before envelope callbacks and requires
`3|` packed text. Codec V3 capture delegates to that same public pure factory;
legacy contexts retain their existing validation. This closes in-place context
mutation/downgrade, without enabling source admission or rendering.
