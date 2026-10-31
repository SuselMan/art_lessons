# Staged image source and companion metadata publication

This resource-only unit adds no engine/source/read grant or Room activation.
The SAME ready prepass/composite can prepare candidate maps without changing
active maps. Candidate maps reserve bounded metadata before copying: 512 bytes
per prepass input (max4096), 192 bytes per old+new composite companion plus1024
(max4105 each). Estimates conservatively cover map/list slots, references and
closed scalar binding records; they are reachable-set accounting assumptions,
not measurements or a physical JS heap guarantee. No pixel arrays are copied.
Adopted map reservations persist until replacement/reset; superseded map charge
retires only in finalizeCleanup after publication. Cancel drops candidate refs.

Each original receiver owns one pending update, exact workspace/limits/old-map
identities and explicit state. Resource/owner/cache checks occur in assertCurrent.
Pure publish performs scalar CAS and assignments only: no cache.get, resource
queries, GL, user callbacks or newly allocated cleanup closure. Caller must hold
the actual complete coexistence union lease and perform final checks immediately
before a synchronous no-callback publication section. This does not promise
protection from unrelated unplanned oversized cache writers; the existing cache
can invalidate optional leases when an oversized protected group takes priority.
The later engine unit must bound the FULL old+new workspace/source/composite
unique-key union, not infer lease success from a release function.

Bank publication is split: assertCurrent remains owner/generation-only during
partial upload; assertPreparedPublication validates actual ready union,
publish adopts the plan while retaining the same bank-owned pending cleanup ref
and union lease, finalizeCleanup detaches and releases it. Existing commit remains
assertPreparedPublication -> publish -> cleanup. Reset owns pending cancellation and published
cleanup, then all committed resources/metadata. Post-publication cleanup failure
never rolls committed keys back. Publication checks are not source authority and
are not a substitute for final engine/lifetime checks after external progress.

Normal same-capacity prepare reuses staged validation/publication; geometry,
shader source, source sampling and pixel operations are unchanged. No capacity
resize transaction or selected-author invalidation is added here. Existing
workspace allocation/GL error handling remains in the original prepare path.

Evidence: R52/image-resource-publication-red.log captures missing Bank split API
failures; the initial workspace test harness also exposed a missing mock composite
attribute and was corrected (that setup failure is not API red evidence).
R52/image-resource-publication-final.log: 130 tests / 6 suites passed, including
old prepass/composite/bank and original data-input regressions. Nine workspace
cases cover query-forbidden whole Bank/maps publication, persistent adopted
charges, superseded cleanup errors, copied/cancelled/stale/reset updates,
validation reentry preserving newer updates and count refusal before getters.
Bank extension suite covers retained lease/reset and old commit wrapper behavior.
HOST recording GL only: no native-pixel or physical-device/database claim.
Coordinated app/SW gate24042 passed. map:check/map:rules56021 passed after
root repaired two unrelated documentation metadata entries (rules:0errors,24
existing warnings,11 known ignored). No additional runtime resources.
