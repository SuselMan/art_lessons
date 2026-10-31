# Canonical authoritative snapshot frontier

Actual Samsung e2 hot-peer z7 completed182 original operations with a healthy
checkpoint/export; the QA driver failed on a snapshot POST403. The pixel bake
was already closed: engine.bakeNetworkSnapshot returns null for canonical rooms.
But onSeqObserved intentionally uploaded layerState even with an empty layers
Map, because legacy structural edits still need snapshots. That path sent a
legacy structural-coverage claim at seq100 from a canonical engine.

The server refusal is correct. snapshotRoutes calls mayReadBoardContent with
its default frames-v1 domain; the stored straight raster is rejected before
owner/membership checks. The403 alone is not evidence of a QA identity mismatch.
No server/auth/policy/snapshot-storage guard is relaxed by this unit.

Exactly snapshotSync.ts, its existing test and this provenance change. Both
bootstrap authoritative capture and boundary authoritative publication require
actual engine.rasterVersion===LEGACY_ROOM_RASTER_VERSION. An unknown runtime
value is closed; undefined is not a legacy fallback. The existing test fixture
now explicitly declares its actual legacy raster instead of omitting the field.
No engine/index ownership or API type was changed.

Canonical thumbnails remain a separate non-authoritative path: the existing
uploadThumbnail function still consults engine.bakePreview readiness. Boundary
cadence uses the SAME attempted set, including jumped boundaries, so repeated
observations do not create repeated uploads. Room-exit thumbnail calls remain
unchanged. Unknown raster values do not acquire boundary thumbnail eligibility.
Legacy empty-layers structural POSTs remain intact; this is not a blanket
layers.size guard.

Tests first exposed canonical/unknown authoritative bake activity. The first
RED run also exposed asynchronous fixture work crossing a test boundary; the
new guard tests use null bakes and settle the existing asynchronous task before
asserting transport effects. Final complete snapshot suite:42PASS, including
canonical bootstrap/boundary0authoritative calls, duplicate/jumped thumbnail
boundaries, unknown runtime refusal, legacy empty-layers structural publication
and existing bootstrap/watermark/refusal/compression behavior. Scoped lint and
targeted actual-app-option TypeScript receipts are R52/snapshot-frontier-*.log.
No shared/dist build, runtime/service/device action or disposable resource was
created. Root owns the fresh actual QA verification after review.
