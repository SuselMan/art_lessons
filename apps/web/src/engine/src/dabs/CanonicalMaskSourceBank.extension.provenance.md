# SAME image bank additive preparation

The existing bank now owns one pending resource extension. No second bank,
renderer, resource cache, source grant, read owner or engine activation is added.
Create the extension lazily inside the first actual BrushPreparation job; ignored
late-join jobs and early cancellation must allocate nothing. The creator-owned
finalizer commits or cancels once before surviving subscribers settle.

Constructor and extension share the same input/native-level planner and upload
primitive. Committed readers/keys are never replaced. Different original crops
of one asset ID remain supported; conflicting side or same-key metadata refuses.
Candidate preparedResources exposes the full ready union for later workspace
preparation, not an execution grant. Until commit, normal bank APIs retain the
original committed plan and generation. A no-new-key commit preserves generation.

Before reserving metadata/uploading, the union is checked against the existing
4096-job/256-input plan limits and CPU/GPU budgets, including caller-supplied
peak companion resources. The extension reserves only added metadata and leases
the union. New adopted GPU keys also belong to the same bank's reset/loss owner.
Cancellation deletes only newly adopted keys and attempts all cleanup. Shared CPU
LRU derivatives may remain within their unchanged budget; this is not an exact
heap or physical-driver-memory guarantee. The engine remains responsible for
honestly supplying peak workspace costs and original source provenance.

Commit constructs metadata and checks readiness before synchronous plan/generation
publication. A lease-release failure afterward cannot turn committed resources
back into a pending rollback: cancel is then a no-op. Existing committed plus
added metadata reservations retire on reset. Context reset invalidates pending
upload, including reset reentry from the source reader. This unit does not solve
atomic workspace/prepass/composite publication; that engine boundary stays OFF.

Evidence: R52/image-bank-extension-red.log records the missing API tests-first
failure. image-bank-extension-final.log: 89 tests / 5 suites passed, including
legacy bank/data input, original-image coordinator and recorded coordinator.
image-bank-extension-last.log repeats the 14 extension tests after final source
cleanup. Actual BrushPreparation tests cover two subscribers/one abort, lazy
candidate allocation and final-progress cancellation. Recording GL tests cover
partial upload rollback, source callback reset, context loss, copied receivers,
getter refusal, preserved pre-existing unowned cache key, aggregate budget, deletion faults and post-publication cleanup
failure. No native pixel/device or physical database claim. Coordinated full app/SW typecheck 29268 passed on the frozen graph.
