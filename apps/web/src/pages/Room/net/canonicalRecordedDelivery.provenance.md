# Paired V3 original recorded resource availability

Material3 image source contributes BOTH original tip and raw canvas-pattern CAS
metadata from its immutable snapshot. Material2 path remains unchanged. The same
original per-input delivery/read lifetime is checked before metadata collection,
before/after each finite availability call and after completion. Source/epoch,
capability labels and actual operation DTO remain the original ingress objects.
No new read owner, Outbox, replay queue or log append is created here.

The existing prepareCanonicalImageAssets helper is availability-only despite its
name: it verifies/fetches raw U8 CAS bytes under the captured room, never creates
NativeImageResource/pyramids, GPU source views or grants. Pattern is not passed
as an image-tip source; actual role validation/allocation belongs to bank/executor.
No URI or all-catalogue preset regeneration is used. Resource sharing deduplicates
CAS/side; conflicting sides fail. At most64 original capabilities and two roles
yield128 unique assets. V3 uses sequential bounded calls of<=64 through the SAME
helper and original assertCurrent; no global cache/budget increase. Ordinary2
continues its previous direct helper path/oversize rejection.

Tests use actual normalized original delivery input, show both roles, one shared
lifetime,64capability/128asset chunking and stale-between-chunks refusal; existing
image2/replay/recovery resource tests remain active. This availability proof is
not renderer pixels, source permission, native identity or online V3 activation.

A mixed batch also retains the old V2 unique-asset subledger limit64: adding a
V3 neighbor cannot turn an oversized historical pipe into a larger availability
grant. Test creates an actual strict CMAT2 ledger65 plus original V3 and verifies
refusal before any asset helper call. Both ledgers use real builder/normalizer;
changing snapshot CAS without rebuilding its binary ledger correctly rejects.


## Indexed cold page/evidence availability

Actual cold CMAT3 lacked imported tip/pattern pixels after metadata-only join.
The original indexed issuer now calls this SAME availability helper after strict
page/evidence parsing and minting its genuine original inputs, before handing any
page/witness to the engine. It does not spread/re-mint delivery authority or create
another cache, queue, NativeImage pattern, grant, scope or owner. Page afterSeq
advances only after success; resource failure does not create a cut. Published
older cuts/inputs keep their original parent and survive finite cancellation.

Optional assertFiniteCurrent only adds a refusal condition to the existing
original lifetime checks. It is composed into every existing loader assertCurrent,
including before/after each64asset batch; same-origin cancellation cannot start a
second batch. No image atoms returns null and adds no availability await. 64caps/
128assets/legacy64 subledger and existing metadata/cost limits remain unchanged.

One per-cursor preparing scalar covers nextPage/rootEvidence and whole select
RPC+resource handoff. It rejects reentrant page/evidence/finish/select/recovery/
FOLLOW instead of queuing. select uses the genuine completed cut plus captured
active/completed cursor identity, not assertCursor on a finished/cancelled reader:
completedA→recoveryB→cancelB may still selectA. Its resource-wait finally always
releases the same latch. Cancellation never expires the adopted original parent.

Tests use actual controlled socket ACK private origins and normalized CMAT3,
with a mocked ordinary asset-availability I/O boundary only: both CAS roles before
handoff, 64capability/128asset sequential batches, same-origin cancellation before
next batch, page/evidence reentry and cancellation, FOLLOW failure preserving cut
and recovery, cancelled-B/completed-A select, native helper-null. Engine-owned
112frame/64+48 cold test separately exercises actual bank/prepass/replay and END.
These are source/ownership proofs, not an already deployed/fixed Samsung claim.

The optional finite guard runs both before and after the original lifetime/input
checks: an original current callback can reenter finite cancellation without
expiring the parent. The added regression cancels from that actual callback
inside the loader's current check and proves execution cannot continue past it.

### Finite latch reentry correction

The first four-file freeze was rejected: an original `isCurrent` callback could
start an inner page/evidence/select before the outer invocation claimed
`preparing`; the outer failure then cleared the inner invocation's latch.
Three genuine callback-reentry regressions failed on that freeze. Each claim
now checks `preparing` again immediately after external current validation and
before its owned try/finally. Follow/reopen also recheck after cut validation;
two further regressions prove a reentrant select prevents either RPC. Existing
RPC ordering and original scope/cut ownership are unchanged. The held inner
asset preparation remains protected; a third call emits no request.
