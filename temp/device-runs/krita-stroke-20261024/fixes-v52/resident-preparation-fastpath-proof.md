# Resident preparation: same plans, owners and clock

Five production paths extend the existing layer/pool prepared plans and their
canonical wrapper, executor and coordinator. `takeResident` returns undefined
ONLY for a healthy missing allocation. It validates the same live ticket,
epoch and actual storage; stale/closed/invalid input throws. Layer targets stay
repeatable; scratch consumes the existing taken bit and wrapper owned Map once.
No readiness cache, new registry, queue, pool or physical reservation is added.

The executor accepts resident metadata under its existing 4ms turn clock.
The first genuinely missing slot uses the original full GL capsule, allocates
once, then yields. Original-copy/local-clear and every pixel draw retain their
GL state, lifetime and foreign handle checks. Coordinator resident preview and
stable commit use the same plans; cold target pairs still allocate in separate
advances. All cancellation/revision/failure storage-pin retirement is retained.
Logical reserveTransient remains separate from physical missing-only tickets.

Tests-first: 5 meaningful missing-API failures, 34 existing passes; API absence
is explicitly asserted in stale tests to avoid accidental TypeError passes.
After implementation 39 admission/binding tests and 123 executor/coordinator
tests PASS, including four new consumer witnesses: warm buildup paints in its
first guarded turn; warm original/local transfers lead to the same guarded
copy; resident metadata uses the same clock and yields without a GL capsule;
two resident preview targets complete in one guarded pixel turn. The existing
64-target witness still proves at most one cold allocation per advance. 95
regression tests across five files PASS; scoped lint and diff checks PASS.

Device paired harness passed: baseline five modules are read directly
from git 72dfe2eec into RAM, current uses the worktree. Both bundles contain115
modules, exactly five changed SHA entries, identical actual5 source inputs/body.
No disk bundle/runtime/dependency copy. Common app+SW42910 PASS for resident
sourcefreeze (not the later Color startup unit). Both hardware variants passed
80 surfaces each:160 surfaces0wrongRGBA, GL0, hostile state restored, no escaped
leases or storage, original3tabs preserved, ownchildren/contexts/forwards closed.
Advance-only getParameter2420→1640 (-32.2%), isEnabled720→330 (-54.2%);
turns864→809. Uploads196, copies50, draws30 remain identical; cold status5 and
attachment5 remain identical. Max advance11.3→10.4ms are standalone samples,
not a latency guarantee. Compact JSON contains all source/bundle/input hashes,
bounded result rows, owner accounting and both strict cleanup receipts.
Duplicate raw results/build/job/log outputs removed after compact proof. There is no UI/room activation, finite-total-GPU-cap or 4ms claim;
cold allocation and guarded state restoration can individually exceed4ms.
