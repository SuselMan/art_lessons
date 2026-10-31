
2026-10-31 test authority correction: retained Gaussian native#2 has erase=true,
even though native blend is normal. Its source numerical data remains covered in
both profiles by explicit test-only dataOnly=true extractor+pin fixtures. This is
not a painting grant. Default author/executor fixtures remain strict six native
paint indices5/6/7/10/11/22; #2 default binding refusal is explicit. The30-input
whole/resume author regression now expects204 strict-paint draws, excluding16
historical #2 data-only draws (old220). No descriptor/erase/production binding law
was normalized or weakened. Raw primitive coverage remains all seven sources.

2026-11-01 G1 capacity-update prerequisite (HOST only, not engine/UI admission):
`prepareCapacityUpdate` stages a new capacity on the SAME prepass and shader.
Existing workspace, source bindings and draw targets remain usable until the
exact-receiver update publishes. Candidate resource records/limits are frozen;
keys are owner-local and distinct from all old keys. No new painter/cache/bank.

The caller supplies the complete external companion set and uncharged companion
CPU peak; old/new prepass + source + companion unique GPU bytes and CPU coexistence
are checked against existing budgets BEFORE pixel allocation. A union lease
protects ready/candidate resources; the engine must adopt its final layer lease
BEFORE finalizeCleanup releases staging protection. Source-map metadata uses a
conservative512-byte entry charge and resource metadata192-byte entry +1024;
these cover bounded identities/references, not a physical JS heap proof. Adopted
charges remain until reset. Shader uniforms, geometry, LUT generation and source
pixel law are unchanged; LUT/buffer bundle is replaced together (not aliased
across retirement). There is no numerical/performance/GPU pixel claim here.

assertCurrent is owner/quiescence only. assertPreparedPublication validates the
actual ready resources after all external work; publish then performs only
identity checks and reference/scalar assignments (no cache/GL/callback). Future
engine use must make final checks/publication in one synchronous turn, with no
coordinator epoch holders or active source groups. G2 is still separate; no index,
Room or UI activation is part of G1. Fitting preparation paths are unchanged.

The new capacityUpdate tests exercise old-target drawing during staging,
immutable candidate metadata, shader reuse, budget refusal before upload, receiver
copies, allocation/merge/adoption errors, reset reentry at upload/VAO/FBO creation,
lost reset without deleting dead names, pure publication, and attempt-all old/new
cleanup after publication. The VAO reentry test reproduced a real draft leak
(candidate workspace adopted AFTER cancellation); standalone ownership capture
and immediate current checks now prevent that adoption. Cleanup exceptions after
publication do not roll back the adopted epoch. Recording GL tests establish
ownership/state behavior only; original native image pixels remain ROOT GPU QA.

Final HOST gate:74 tests/3 suites PASS (17 new capacity-update witnesses +57
existing prepass/soft regressions), one worker. Targeted actual-app-options TSC
including the new suite PASS; scoped oxlint0 warnings/errors; owned diff check
PASS. No full-app/GPU claim, no devices/services/resources created by this unit.
