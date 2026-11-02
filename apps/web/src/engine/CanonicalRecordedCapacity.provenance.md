# Recorded capacity scheduler callback boundary

RAM-only proposal based on 3765b089f08ffcae26147c788f95d1355034670f. No mixed activation, public read/Saved change, protocol/source grant, shader, GPU or browser execution.

The existing bounded waiter owns one notification, not another frame queue. A real preview-ready ticket publishes before notification. Idle/failed sets park intent before notification; a callback admission can wake the same job without an outer park overwriting it. Every callback boundary finishes with exact owner/job/coordinator/generation checks. Teardown notification remains valid for detached owners.

Same-owner notification failure follows existing fatal handling. An actual replacement never inherits a detached job's exception: attempt cleanup only the captured old owner and rethrow the original primary, including undefined. Secondary cleanup failures are diagnosed without replacing it. Without replacement, existing coordinator-poison exceptions retain historical handling; a local boolean distinguishes a notifier failure from an already-handled draw failure. Optional expectedOwner retirement changes neither default callers nor source authority.

Evidence: same-API baseline V2 RED 3 failed /2 passed /30 skipped (ready callback not notified, replacement identity/primary damaged). V2 focused GREEN5/5. Replacement is explicitly a STRUCTURAL pointer/CAS probe using another real engine restore; it is not a real-room synchronous replacement lifecycle or a cross-GL rendering test. Actual context-loss callback and same-owner thrown-undefined cleanup are exercised. Notification records are controlled scheduler fault fixtures, not proof of a nine-frame network burst.

V1 failures retained: first proposed implementation had a coordinator lexical TDZ; replacement append-after-retirement fixture was invalid because append requires an existing owner. Those failures are not semantic RED. V2 full suite had35 assertions PASS but4 unhandled historical poison exceptions, correctly a failed gate. V3 narrows the exception policy. Exact final V3 full existing canonicalLayerOwner suite35/35 PASS, unhandled0 (13.18s); strict actual app options/source alias2 roots281 inputs0 diagnostics; configured oxlint0 errors22 warnings, all22 present in baseline. No dependency/config widening. V3 executable source/test bytes are final; only this provenance added afterward.

The mixed index integration remains separate: OVER resource budgeting must precede all prepare paths; published owner plus hidden full/indexed transaction publication must be coherent. V13 mixed presentationReady remains false, so existing hidden rebuild predicates cannot simply enable the flag. Uniform WASH exact-close and later latest/current-close handoff are prerequisites for opening read/export/checkpoint/Saved. No assertion here proves mixed online usability, hardware pixels, performance or capacity latency.

All worker/type jobs ended. Temporary two-file lint inputs were removed in finally. No runtime, context, device, resource parent or dependency copy was created; retained RAM maps/configs/logs/patches are compact QA evidence in R52. Protected foreign shader and shared/dist were denied by runner/type loaders.


## ROOT actual acceptance (2026-11-02)

Independent V3 FINAL BLOCK0 exact3 applied on actual1a8332d85; the intervening WASH commit leaves index/test base bytes identical to frozen3765. Common actual-source regression:354 tests /12 suites PASS, unhandled0. Full strict web:1194 roots/1351 consumed inputs/zero diagnostics; every consumed SHA rechecked. Configured exact2-file lint:zero errors/22 preexisting qualified warnings, source bytes unchanged. Guarded architecture map/rules exit0,32 existing warnings. Detailed proof:`temp/device-runs/krita-stroke-20261024/fixes-v52/preview-capacity-actual-root1-proof.json`. No mixed activation/read/Saved/GPU claim. All own gates reaped; no new browser/build/runtime resources. Existing private QA retained.
