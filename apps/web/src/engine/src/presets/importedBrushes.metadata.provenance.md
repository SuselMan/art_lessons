# Installed resource metadata: ownership and validation

This unit changes exactly importedBrushes.ts, its existing test, the public
engine/brushLibrary.ts export, two existing brush-library API tests and this
provenance. Image author/selection, engine index, API production loader, shared
source/dist, server policy and GPU resources are unchanged.

The SAME existing assets Map now owns `{metadata?, pixels?}`. Declared metadata
is a frozen `{id,size}` copied from a validated manifest, not inferred from pixel
length. The existing validated-input install contract remains; asset capture
requires own array elements and own data id/size fields, lowercase asset SHA id,
power-of-two side2..2048, and no duplicate ids. No additional whole-library
schema/default quota is imposed. Every brush clone/freeze, descriptor conflict,
asset conflict and existing-pixel side check completes before either resource
or brush publication. Same descriptor/metadata/pixel identities survive an
ordinary metadata refresh. A later clone failure cannot partially install an
earlier asset or brush.

installBrushPixels keeps its two-argument signature and historical square-byte
shape validation. Without a manifest, it installs pixel-only data and grants no
declared metadata. With declared metadata it checks the exact byte count before
replacement; different bytes under the same id remain forbidden. A later
manifest may add a compatible declaration to pixel-only data, while an
incompatible declaration fails before publication. Fetch still validates SHA;
this module does not claim compiler/source/permission attestation.

importedBrushAssetMetadata(preset) uses the same installed descriptor and
brushAssetIds order/dedup; its frozen result contains only declared fields.
Missing preset/required metadata yields undefined; a zero-asset descriptor
returns frozen []. It does not scan pixel records, infer side with sqrt, load
bytes, report GPU readiness or authorize BEGIN. The thin public brushLibrary
entrypoint exports this query.

clearImportedBrushPixels discards pixel data but retains declared metadata for
installed descriptors; pixel-only records disappear. Existing scoped retention
prunes the entire unreferenced record. Retiring engine room leases therefore
retain metadata and pixels together; release/prune removes both without a new
scope, registry or reference counter.

Tests first: six new metadata cases failed against the old module, while its
two historical tests passed (R52/image-metadata-red.log). Cases cover
metadata-before-bytes and bytes-before-metadata, immutable refresh, late
multi-asset conflict and descriptor conflict atomicity, accessors/inherited
fields/holes/duplicates/invalid sides, descriptor-order dedup, caller mutation,
clear/prune, and a later brush-copy exception. API tests additionally verify
retiring-room retention/removal, late abandoned downloads and stale A metadata
after B, and conflicting same-CAS sides across retained scopes. No API source
change was necessary: immutable side conflicts cannot publish at installation.
The old test that manufactured wrong-size bytes after a manifest now expects
that earlier installation failure, and the opposite arrival order is covered.

Runtime/lint and targeted app-option TypeScript receipts are retained as
R52/image-metadata-{regression,lint,targeted-tsc}.log. These host tests establish
ownership/data semantics, not device pixels, shader performance or live image
author permission. No temporary process/service/device resource is retained.
