# Original ended empty-room baseline in the real engine

The explicit `canonicalEmptyRoom: { read, tail }` constructor option admits only
straight RGBA8 storage after the original read verifies its original full tail.
The normal room constructor path remains closed. The actual captured bounded
room geometry must match explicit page dimensions before canvas access. The
first domain is the implicit layer structure, one source-only wash profile,
no assets/masks, and genuinely ended gesture prefixes; unsupported histories
fail before GPU allocation. This is neither default editor activation nor
permission to replay arbitrary canonical operations through legacy writers.

The existing RebuildJob scheduler advances the existing source prepass,
composite pass and wash coordinator. Recipe/tile dimensions determine their
capacities; the existing 16 MiB GPU cache and 4 MiB CPU cache admit companion
resources. A separate finite logical transient fence bounds U*B + 2*sum(Tg)*B
and obeys the engine GPU allowance. It is not a second physical storage ticket
or a claim that every hardware allocation has a complete global cap. Existing
pool/layer preparation performs physical ownership admission.

Every original authority callback precedes final pure engine/context/map/job/
geometry checks. The actual journal's guarded empty CAS invokes the synchronous
validator after preparing all entries, then publishes the journal immediately
before one `_layers` map assignment. No callback/GL operation intervenes.
Precommit failures retire candidates and preserve old layers/journal. After
commit, retirement is all-attempt and diagnostics return alongside
`committed: true`, so cleanup failure cannot masquerade as a retryable restore.

Stable straight tiles use the actual engine-owned straight-to-PM display seam.
Public legacy pixel writers remain independently closed for this storage;
pointer methods stay inert and unlocking cannot grant writing. Context restore
is explicitly recovery-required in this first slice: it retains the accepted
journal, stays lost/read-only, and never substitutes the legacy replay path or
claims a successfully restored blank image. Full nonempty-journal recovery is a
separate required follow-up before ordinary activation.

Validation (2026-10-31): 11 actual-engine tests pass: genuine empty cut; copied
owner refusal with zero canvas access; real source frame through real job and
services, original global sequence/input retained, actual PM display route and
no legacy gl.finish; open/geometry refusal; prepare failure; cancellation;
original-authority CAS map reentry; committed cleanup diagnostics; loss/physical
restore refusal and stale-name-safe destruction; partial GPU draw failure; and
second implicit candidate creation rollback. Postcommit retirement walks the captured
old owner list, so even a throwing destroy callback that deletes another old map
entry cannot hide that second owner from cleanup. The GPU fault executes the real
composite draw before throwing and checks old publication plus pool/CPU cleanup.
Local supplements cover missing legacy MockGL state observation only; these
are lifecycle/dispatch checks, not hardware RGBA or native whole-stroke proof.

The independent read-only frontier suite has 8 passing tests, the existing
display suite has 8, and 181 regressions across 10 suites pass (context restore,
initialization rollback, lifecycle, raster admission, tile-rebuild lifetime,
display batching, restored base layers, canonical admission, executor and
coordinator). Focused lint reports no errors; index retains historical warnings.
Joint app/SW typecheck 78913 passed after the final captured-owner retirement
follow-up (1826 also passed before it). Architecture map check passed for 1494
files; boundary rules report zero errors and 24 existing warnings.
No device, runtime, background service, forward or browser child was created by
this unit. No push or ordinary room/socket/controller activation.
