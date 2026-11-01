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
