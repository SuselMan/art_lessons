# Profile-aware source composition selection

canonicalSourceComposition reads the already verified descriptor's native blend
and retained PaintOpAction/indirect flag. Old/default profile remains Over-only.
The explicit GenericSC V2 whole-pipeline profile additionally selects native
multiply/lighten/colorDodge/overlay for wash only; color/other blend and non-Over
buildup remain closed. erase=true and nonzero wetEdges/burntEdges always refuse.
The existing hasCanonicalOverComposition wrapper retains exactly its old law.
This pure selection is not source-data readiness, descriptor authentication,
compiler attestation or whole-brush/room execution permission. Existing material
extractors and server's other rendering/effect gates remain authoritative.

Default/Gaussian bindings add an optional final rasterProfile argument4, default
old; soft adds argument5 after unchanged sourceSlot argument4. New execution law
requires an explicit new profile. They reuse the selector and existing source
extractors; immutable source-pin shapes, coverage profiles and material tag0..4
bytes are unchanged. Source readiness remains separate from composition domain.
Old direct default/Gaussian binding now refuses unsupported native composition,
matching the already strict server resolver and soft binder.

Actual Gaussian source2 is an eraser with native blend normal. All seven Gaussian
source datasets/primitive references remain intact; source-only codec tests use
explicit data pins and still roundtrip7. Direct paint-binding and executor tests
now admit only6 normal sources (5/6/7/10/11/22), and explicitly refuse2 under old
and new profiles. No erase flag is removed or changed into normal painting.

Actual six NEW mapped soft descriptors are checked by the optional R52 script
prove-generic-sc4-source-bindings.mts against exact retained-input SHA721d0c7c...
(209659 bytes), using the existing library/source validator and material decoder.
The artifact is not a unit-test/clean-checkout dependency or copied fixture.
Source data readiness6; old binding accepts index3 only; new accepts3/60/61/62/63;
59 Color remains refused. Captured KPP/provider/descriptor hashes and scope are in
generic-sc4-source-binding-proof.json. Legacy fallback LUT metadata is derived
only to validate descriptor structure; its CAS bytes are neither verified nor
used, and canonical procedural material assets remain empty. This is structural
binding/transport evidence, not fresh compiler/native raster/GUI/room authority.
