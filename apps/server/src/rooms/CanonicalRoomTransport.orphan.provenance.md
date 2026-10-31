# Recovering a persisted orphan prefix

Approved policy: a server may durably append a typed `commitPartial` close for a verified historical V2 open prefix ONLY under an original authorized pre-seat join and a proof that the board has no current author seats. This is not an END frame, an invented admitted Session, or authority derived from a durable RoomParticipant row. No new frontend/schema/default policy is introduced.

After disconnect commit `b35d157c3` explicitly released production ownership, this unit changes rooms.ts and CanonicalRoomTransport.ts plus its own test/provenance. socketHandlers.ts remains unchanged. The observable surface is the existing `prepareJoinReadDelivery(originalPreparedAuthorizedJoin, isCurrent)` before the existing join preparation commits its seat. No new public transport API is required by these tests.

The fixture persists an actual accepted source frame using existing storage/transport, hydrates a distinct resident record with verified loaded-write receipts and no live seat, and constructs a fresh transport with no admitted writer Session. The original indexed rows and source bytes remain the evidence. The test queries the existing full mixed-history reader and expects a durable close before seat commit.

Eight scenarios:

1. Original indexed open prefix receives exactly one typed partial close, with derived recordedNext/first/last IDs; original material bytes remain unchanged; the first read contains that close before join commit.
2. A normal durable END receives no redundant close.
3. A real private author seat prevents recovery even when public participant/socket mirrors are cleared.
4. A copied prepared join cannot confer orphan authority.
5. A new real board seat appearing across an indexed query invalidates the absent-seat proof before append.
6. A concurrent room-cut change invalidates the candidate.
7. Inconsistent indexed frame identity fails without appending a close.
8. A second pre-seat read reuses the durable indexed close without appending another one.

Final tests-first RED: 5 passed / 3 failed (1.69 s, maxWorkers=2, testTimeout=30000). The missing-close, repeated-read close and concurrent new-seat assertions fail against current production code. The existing END, private-seat-preservation, copied-authority, cut-change and tampered-index controls pass. Receipt: `temp/device-runs/krita-stroke-20261024/fixes-v52/canonical-orphan-first-red.log`.

Implementation uses a lexical `captureEmptyBoardSeats` proof over BOTH private seat maps, preserving exact room and lesson identity. Copying that proof fails. An active or superseded real socket prevents recovery even if public mirrors are cleared. If a live seat exists before preparation, the ordinary OPEN read is preserved; if it appears during recovery, the preparation fails before append.

Only an original authorized pre-seat join under existing mixed-v2 policy can enter recovery. The existing write queue drains before indexed reads; pending begin jobs for that board, changed cut, authority, storage, epoch, snapshots or failed unrelated writes fail closed. Full indexed history and shared material/metadata verification establish the actual open gestures. The internal orphan variant of the SAME close core uses the original record and indexed prefix, without creating or pretending to own an admitted Session. Native frame bytes remain untouched. The typed server UUID close derives recordedNext and first/last operation IDs from that exact prefix. It is durably acknowledged before the returned full read and seat commit. The current cut advances only for this own synchronous append and is rechecked at every await boundary.

Known resident failed close receipts are repaired first with the SAME ID. Repeated or concurrent reads do not append duplicate closes. Existing binding and batch-byte limits guard new close publication; there is no new quota, journal or registry. Existing disconnect cleanup remains limited to its own original live seat/session.

Final verification: 16 orphan tests and adjacent disconnect, soft transport and actual socket regressions total **169 tests in four suites PASS**, 10.51 s, maxWorkers=2/testTimeout=30000. Added tests cover record/storage/actual epoch/caller revocation, failed-close repair, concurrent recovery, lexical absence proof and durable write-queue draining. Final receipt: `temp/device-runs/krita-stroke-20261024/fixes-v52/canonical-orphan-regression.log`. Lint has zero errors; transport retains the pre-existing no-this-alias warning. Final server TypeScript check passed (exit 0; `canonical-orphan-server-tsc.log`).

No device access, service, runtime, forward or native library copy was created. Small test-owned brush stores are removed in afterEach, and room writes are flushed before fixture cleanup. No actual new server/browser orphan-recovery run is claimed by the host tests.
