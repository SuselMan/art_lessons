# Stable stroke-data identity for seeded coverage

The seeded coverage profile consumes an explicit captured `{strokeId}` from the
validated original snapshot/frame. Coordinator authority remains the unchanged
`[roomId, boardEpoch, userId, strokeId]` tuple and original lexical read lifetime.
No authority is inferred from a noise seed, and no missing identity falls back to
an authority key (including for an empty frame).

This distinction preserves recorded ink after a fresh read epoch and the current
server board-copy operation, which remaps room/user/operation IDs but retains the
original frame.strokeId. The seed's existing domain/descriptorSHA/primary role /
cumulative physical draw ordinal and Qt hash/Taus88 implementation are unchanged.
The helper validates a copied own data property: 1..256 UTF16 units, no NUL, no
accessors or unknown fields. Standalone callers must provide explicit diagnostic
stroke data; this does not grant original-stream authority.

## Real material witness

`../presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json`
contains the unmodified actual normal importer68 DTO, verified mapped provider
receipt, original KPP hash, and nine pressure/tilt packets. Canonical descriptor
SHA is `7fd13ac324a458b265a19fb696fe4c91820fa5a9512a29ae24a66c064799d5b5`.
The test uses normal SourceAuthor → Adapter → Encoder, every-yield checkpoint
resume, and the same executor/prepass under recordingGL. It derives all 17 actual
material masks, aggregate hash
`f353aa60d3c829ccd6bb17e4b6f27a4a029d70fafedae068f9cc156565250099`.
Epoch change, copied namespace, and local-to-recorded promotion retain that hash;
a distinct original strokeId produces a different witness. Retired originals
remain rejected before allocation. This is a host material/ownership proof, not
an additional GPU or native GUI run. Prior six GPU68 receipts retain their original
bundle provenance; no claim they executed this prerequisite.

## Ownership

The existing BrushMipCache CPU owner reserves an additional conservative 1024
bytes for each queued copied identity and 1024 bytes for a resident gesture
identity (512 UTF16 bytes plus bounded object metadata). The resident token joins
the existing admissionReleases, including raw-wash transfer. Ordinary completion
retires the active identity before cleanup callbacks; cancel/error detaches the
gesture before independent releases. Prepass's existing retained-slot identity
charge remains unchanged. Estimates bound accounting, not JavaScript heap
reclamation. Tests cover missing/accessor/changed identity on no-draw inputs,
reservation rollback, throwing release after actual release, and terminal CPU0.

No wire, shared schema, server policy, Room, provider, or descriptor changes.
Old coverage profiles and seed golden values remain unchanged. Public server
seeded policy remains closed pending its separate reviewed unit.

## Checks

Helper test first failed because capture was absent. Focused seed/executor /
coordinator suites including old executor regressions: 176 tests / 5 suites passed
with one worker (R52/density-stroke-identity-focused.log). Targeted app-config
typecheck passed; scoped lint and diff check passed; no full-app/common gate is
claimed by this leaf. No temporary process/device/provider resource retained.
