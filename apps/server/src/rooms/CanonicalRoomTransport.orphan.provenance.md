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


## Indexed zero-seat JOIN: bounded OPEN candidate filter (base d06ea8036)

`prepareIndexedJoinOrphans` still completes actual whole-cut validation before
seating or using any candidate: dense global original sequence/body checks,
unreachable metadata validation, per-root actual original material fold and
metadata-order effects are unchanged. The callback records ONLY actually OPEN
roots (`!checkpoint.ended && !checkpoint.closeSeal`) as frozen scalar IDs:
original user, stroke, layer, first operation ID and sequence. Closed roots keep
no candidate reference. No folds, row bodies, source capabilities or grants are
retained by this filter. It is request-local DATA, not read/close authority.

At most64 candidates and4MiB serialized scalar-list accounting (brackets and
commas included) are kept. On overflow the list clears and the ORIGINAL bounded
all-root keyset walk runs. More than64 repairable OPEN roots therefore do not
receive a new capacity refusal; no unbounded all-roots cache is introduced.

After complete validation succeeds, fresh original join authorization runs.
Each selected first row is reloaded from actual storage at originalCut and
compared with every scalar identity field. Its entire prefix is freshly folded
through the evolving current cut using the same required first-frame anchor and
fresh per-query checks as the old second pass. Only then the SAME `closeBound`
performs its existing independent fresh prefix/fence/authorization and final
beforeAppend checks, durable write and own-cut advancement. Known failed-close
repair still precedes global validation. Original seat absence, record/binder/
storage/epoch/policy checks and appended-only own-cut changes remain unchanged.

Closed roots need no second orphan-detection fold because complete actual first
validation already established their terminal/close status and they cause no
write in this phase. This is no cached OPEN/read publication: post-seat
`openIndexedHistory` still captures its OWN current C and write drains and
independently validates ALL originals/material/effects before its actual ACK.
No second-pass result or scalar candidate can mint a grant or skip validation.

Nine new tests use genuine source author/encoder/write acceptance with existing
mock SQL paging and actual production validator/folds, not fabricated read/cut
proofs.72closed roots require72folds (not144); independent post-seat OPEN still
requires72folds.72closed+1OPEN requires73initial+1fresh candidate+1close-core fold
and one exact actual close.65OPEN roots take the original streaming fallback and
produce65durable closes, with66initial+66oldwalk+65close folds. Dense gaps and
unreachable metadata still fail before candidate use. Fresh access revocation,
missing first frame and changed first source between validation and selected
reload fail without close or seat publication. Existing healthy/new-seat/policy/
revocation orphan controls remain. This is HOST control/source validation, not
PostgreSQL timing or physical execution proof; no real PG command was needed.

Immutable baseline single-production overlay at d06ea803608b784a04d049989fc861e96f21da09
fails the SAME72closed test (144folds versus72), recorded in R52
`indexed-orphan-candidates-baseline-red.log` with original blob SHA. Final source
regression201tests/5suites PASS, maxWorkers1/shared source alias,50.86s. Receipts,
source manifest and final TS/lint status are in R52 indexed-orphan-candidates-*.
No runtime/device/server/frontend process, dependency or worktree was created.
Agent did not commit or stage other agents' changes.

Final targeted source TypeScript PASS with actual @fastify/cookie and
@fastify/rate-limit module augmentations included in the QA target config. The
first reused target omitted these declarations and reported5 unrelated Fastify
cookies/setCookie/rateLimit errors; no production types were weakened. oxlint
--fix exits0, zeroerrors/one existing no-this-alias warning outside this diff;
git diff --check PASS. Source frozen for ROOT review; no agent commit/staging.
