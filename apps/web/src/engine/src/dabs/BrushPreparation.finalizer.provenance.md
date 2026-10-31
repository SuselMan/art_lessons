# Shared brush preparation work finalizer

`BrushPreparation.run` accepts an optional fifth creator-owned synchronous finalizer, using exported `BrushPreparationOutcome`/`BrushPreparationFinalizer`. Existing four-argument callers remain supported. Same-key callers only subscribe; their jobs and finalizer never replace the active work. A callback must return undefined synchronously; any other result is rejected without examining then/getters. Its outcome field snapshot is frozen.

Created work retires exactly once: mark finished, detach its frame/active identity, independently attempt RAF cancellation, invoke its creator finalizer, then settle every remaining subscriber. Incoming job/availability errors remain primary even when cleanup throws, including an actual undefined error. A finalizer failure rejects all still-owned subscribers rather than stranding them; it does not escape through AbortEvent/RAF cleanup. A caller already withdrawn cannot be settled again. Aborting while terminal finalization is already running does not replace its chosen outcome.

Local subscription withdrawal is separate from terminal settlement. One abort or progress observer failure is local while healthy subscribers remain. The last withdrawal terminates work through the finalizer before its promise settles. No early-aborted/unavailable/throwing-availability call creates a run or invokes a hook. Candidate resources therefore must be allocated lazily in the first job; a late join or an early return must allocate nothing. Created cancellation before job zero and empty-job readiness still invoke the work hook once with no candidate required.

Availability is revalidated after final progress and before ready publication. Callback reentry is followed by pure owner/finished checks. A newer run created during availability, cancellation or finalization cannot be overwritten by an older outer call; a matching new active run may only be joined after caller availability is rechecked. No generation counter, second scheduler/queue, global registry or cross-yield GL state is added.

The owning bank finalizer remains responsible for transactional publication/rollback and its commit marker: this generic scheduler cannot undo an arbitrary callback's already published resources. It simply preserves the original error and settles the shared work consistently. No bank/index/server/shared/network implementation changed in this unit.

Tests first: dedicated suite RED17/PASS1 against the old class. A further reentrant matching-key join witness was RED1/PASS21 before the final caller-availability recheck. Final38tests/2suites PASS (22 new finalizer tests and all16 existing scheduler/resource tests unchanged), maxWorkers2/testTimeout30000. Tests cover two subscribers/one abort/all abort, first-job allocation, early returns, zero jobs, ready-hook failure, original undefined error, cleanup failure, initial/cancel RAF faults, local/late progress failures, postprogress availability failure, reentrant new runs and abort during finalization, and unsupported hook return without then access. Scoped oxlint0errors/warnings and diffcheck PASS.

Root production review accepted the exact frozen three paths. Coordinated full app/SW TypeScript29268 TERMINAL PASS, both logs empty, includes this unit plus bank/known-blank scopes. Commit order is explicitly root-managed (bank, known-blank, finalizer). No device/browser/service/dependency resources were opened; all host test processes are terminal. No hardware latency or bank-integration claim is made.

## Read-only replacement safety hint

`canRunWithoutReplacing(key?)` derives only `!active || (key !== undefined && active.key === key)`. It neither starts/joins/cancels work nor reserves that answer; normal run/availability/owner checks remain necessary. Active unkeyed work is never considered shareable, including another undefined key. This permits remote preparation to yield instead of cancelling unrelated local preparation.

Tests-first RED1/prior22PASS, then39tests/2suites PASS (23finalizer/predicate +16existing), maxWorkers2/testTimeout30000. The witness checks idle/keyed/unkeyed/same/different keys, after cancel/ready, and unchanged job/finalizer/progress calls and scheduled frames while querying. Scoped oxlint0errors/warnings and diffcheck PASS. Coordinated TypeScript for this tiny follow-up is pending;29268 covered the preceding finalizer implementation. No new resources were opened.

Coordinated joint24042: full app and SW TypeScript checks pass. Architecture
map:check fails on sourceImagePipe README frontmatter and Room/index.tsx line
budget; fail-stop map:rules was not run. Logs: R52/density-predicate-bank-net-joint-*.log.
These metadata failures are outside this unit; no overall architecture gate PASS claimed.

Final gate receipt from ROOT: after separate architecture documentation repairs,
map:check and map:rules56021 pass (0 errors,24 warnings,11 known ignored).
Full app/SW24042 already passed; production sources unchanged, no repeated TSC.
Architecture documentation fixes are excluded from this unit commit.
