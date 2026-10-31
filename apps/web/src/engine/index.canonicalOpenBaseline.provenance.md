# Open canonical full baseline

The actual cold UI observer failed with `Open canonical full baseline prefix unsupported` after its durable room history contained 18 frames (server sequence 1…18) without END or a typed close. Public engine operations expose local indices 0…17; that projection is not the authoritative server sequence. Root retains the actual observer/DB receipt under fixes-v52. This change addresses an original verified V2 full read containing an open gesture, including joining while another author is painting. It does not fabricate a terminal frame or close abandoned sessions on the server.

`index.canonicalOpenBaseline.test.ts` first failed in the real constructor at that exact open-prefix guard. The implementation keeps the existing atomic candidate transaction, original read/tail pointers, journal CAS, material/profile checks, 64-target union, capability count and CPU/GPU allowances. V1 still requires ended history. Closed V2 still requires checkpoint readiness.

An open V2 candidate may publish only after all visible original inputs have entered the existing coordinator, its queue and pending work drain, and its presentation is ready. Publication transfers the SAME coordinator, derived buffer and already charged transient account to the live layer owner. Phase-aware callbacks follow that owner after publication; existing release closures debit its account exactly once. Candidate-only metadata is released as before. No second queue, renderer, cache or end/seal operation is created. The coordinator reserves the existing global bounded gesture capacity so later gestures can join the same open cycle.

The open presentation is readable, but export/checkpoint remains unavailable until ordinary original END/typed close commits the wash. Late frames/close use the existing append path. Physical loss cancels the retained coordinator and releases its account; accepted original history can be restored through the same baseline transaction. Failure before publication rolls back candidate resources without publishing its journal; later execution failure poisons the live owner through the existing repair callback.

Verification (host WebGL service mock; no actual GPU pixel/latency claim):

- First RED: 1/1 failed with the exact constructor open-prefix error.
- Seven new tests: candidate/live coordinator and derived-buffer identity, charged account retention, later END and typed close, interleaved earlier-open/later-ended/new gestures, real mock context-loss/recovery with unchanged journal, stale-authority rollback, scheduled cancellation, late composite failure and complete owner cleanup.
- Final combined regression: 72 tests in four suites passed (10.80 s, maxWorkers=2, testTimeout=30000), including all seven new tests, existing empty/full/hidden-history/layer tests and actual source-author tests. Receipt: `temp/device-runs/krita-stroke-20261024/fixes-v52/canonical-open-baseline-regression.log`.
- Every teardown checks the existing brush CPU reservations and scratch live bytes return to zero. No heap reclamation claim follows from those accounting checks.
- Focused lint reports zero errors (index.ts retains pre-existing warnings). Final app-only TypeScript check passed (exit 0; `canonical-open-baseline-app-tsc.log`). SW sources were unchanged from the prior coordinated 40346 pass; SW was not repeated.

No own device access, browser child, forward, service, native library copy, or persistent runtime was created for this unit.
