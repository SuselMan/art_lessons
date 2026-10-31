# Original single-image V2 whole-baseline execution

This bounded stage connects the existing engine constructor/restore job to the
SAME original-image bank. It does not enable image incremental append, image
local author/BEGIN, Room callbacks, server policy, startup or UI selection.
Image baselines are READ ONLY in this stage: selecting Basic2 afterward may be
listed as available by UI metadata, but actual prepareBrush refuses before
compilation/reservation/workspace mutation. The next paired bank-aware transaction
must remove that explicit frontier; it is not a permanent mixed-writer solution.
Open image prefixes and animated source.frames (even repeated single-ID frames)
refuse before canvas/resource access. Existing procedural open baselines stay as
before. No descriptor lookup/fabricated BrushTip/procedural fallback is added.

Authority is the actual original prepareCanonicalRoomState read, exact ORIGINAL
tail and per-input delivery proof. Shared snapshot/material/prefix validation,
room geometry, composition/profile and journal CAS remain in force. Plan data
contains closed original asset ID/side/crop. Installed CAS supplies availability
only. Each image recipe still uses exact shared native geometry and static pin
matching; the conservative capacity square changes storage, never recipe size,
coordinates, materialPacked, controls or pixels. No universal numeric-domain
availability/native pixel equality claim follows from finite metadata tests.

The SAME CanonicalEmptyJob lazily owns one bank in its existing cache. One bank
prepareJob runs per existing scheduled turn before prepass/composite preparation;
all actual source levels and workspace resources form the admitted group. Before
source pixels, CPU admission includes current restore reservations, bank metadata,
maximum crop/resize/expansion transient, future workspace CPU and actual original
asset.size^2 bytes for one concurrent borrowed L8 read. GPU admission includes
bank+prepass+composite within the unchanged16MiB cache. Existing global CAS byte
storage is caller-owned; this is not a total browser heap/physical-driver bound.

Success transfers bank into the SAME published layer owner. Bank pixel callbacks
follow candidate -> published owner and never consult a finished transaction.
The host test evicts/reuploads one bank level after publication to exercise that
exact lifetime. Failure/poison/destroy/loss retires bank metadata and owned GPU
keys along with existing prepass/composite/cache, attempting all cleanup. Accepted
context recovery recreates the bank through the SAME original read/tail and
journal, preserving entry/input/serverSeq pointers and revision. No new replay
queue, resource registry, rendering implementation or journal is added.

Fixture: src/presets/fixtures/sourcePngWholePath/guiStroke.native.json, actual
Basic6 Details original crop53,53,150,150 in side256, static scale .05, angle+0.
The existing normal author/adapter/encoder reproduces unchanged122 packet bits,
163 envelopes and40 source draws. Actual CAS65536-byte SHA is verified before
installing it. Descriptor SHA uses canonicalBrushDescriptorJSON, not the fixture's
Python JSON hash. The native RGBA hash in that immutable fixture remains an
independent future GPU gate; this host mock test does not prove native pixels.

Tests-first: R52/image-baseline-engine-red.log:6 failures at the actual old
constructor image frontier. Final seven engine tests cover full original restore,
precanvas open/missing-CAS refusal, stale/upload-job rollback, source reupload
after publication, context events + accepted recovery and Basic2 preparation
refusal preserving image bank/workspace/ready pixels. Recording GL supplements
the existing real constructor harness with bufferSubData observation and state
queries needed by the already-existing image prepass; no source/painter factory
or raster-version mutation. R52/image-baseline-engine-final-scope.log:7PASS.
R52/image-baseline-final-focused.log is the final coordinated focused batch with
existing native author/empty-baseline tests and capacity thresholds. Lint permits
only existing index warnings. Coordinated joint31013 passed app/SW/server-source/map:check/map:rules after
shared GIH source/build freeze. Image frames still refuse before canvas.
No device/services/DB/runtime resources were created by this unit.
