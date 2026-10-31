# Canonical image resource preparation (B2a)

Resource availability is separate from source authority. The caller supplies the
asset ID/side from an original verified capability and a synchronous assertion
closing over the original room read and exact scope. The resource helper returns
no source/read/paint receipt. A merged catalog supplies availability metadata
only: no descriptor lookup, fallback, or personal source grant is performed.

The existing metadataWork/pending/scopedLibraries and verified CAS cache are
reused. Per-call selector capture/dedup is bounded by the existing64 capability
limit, with own data descriptors captured before callbacks/awaits. Installed
readiness checks the exact side. Current original read and active resource room
are checked before/after callbacks and every helper await, including final
readiness. An existing loader consumer can legitimately populate immutable CAS
while a stale consumer rejects; rejecting stale preparation does not promise
that no other consumer warms global resource availability.

The fixture uses actual Basic6 Details retained original A8 asset
asset:b2a50cb68465d5b23c85906c0aac588b8a7b734000993bf067e70c97f496864c,
256² bytes with the original150² crop and brushScale .05. Its bounded inflated
bytes are SHA-checked in the test; the closed V2 snapshot passes through the real
prepareCanonicalRoomState original read. The availability catalog contains no
brush descriptor. A control-only material packet tests resource ownership, not
native pixels, physical DB durability, image execution, or online activation.

Initial meaningful RED:15 tests fail because the resource-only API is absent
(R52/image-cas-b2a-red.log). No Room/engine/bank integration or startup policy is
activated by this leaf. Existing one-argument readiness and procedural paths
retain their behavior. Final checks are recorded after implementation below.

Final callback reentry witness: after CAS becomes ready, the final lifetime
callback prunes installed pixels. Captured RED1/20PASS then GREEN proves the
helper rechecks catalog and side-readiness after its LAST callback before return.
Final21 new +17 existing lazy API +2 imported-resource tests =40PASS, maxWorkers2;
oxlint0/diff-check clean. Source files are frozen. Typecheck44667 exposed one
own test-only envelope profile widening, fixed with the actual native constant
(no cast); subsequent87185 reports zero B2a errors and only sibling Window2
expected tests-first send-API errors. SW was not run by that failed && command.
Final joint app/SW gate remains pending the sibling unit freeze; no whole-tree
PASS is claimed for this checkpoint. Logs: R52/image-cas-b2a-{red,verified-tests,
final-callback-red,final-web-tsc}.log.
