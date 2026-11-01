# First-pen diagnostics outside synchronous input dispatch

Issue #589; measured during #807 HOST/device QA. Baseline commit
`7843e3d8260923381ccb483e7868fb5116de417b` (production behavior shared with579b).

The existing window capture listener previously wrote localStorage and evaluated
collectEnvironment synchronously before calling the API. Collection created a
separate diagnostic WebGL context/read its existing scalar hardware fields/lost
it. A canvas capture observer therefore ran only after that work. Saved A4/A6
synthetic DOWN dispatch spent21.8/50.9ms before canvas capture versus7.9/9.3ms after;
engine PointerInput is a bubble listener. This identifies a real synchronous
telemetry hazard, not an isolated measurement of GPU probe duration or physical
pen latency. The full readonly audit is retained in ignored R52.

The initial report retains existing collection/send behavior. GPU diagnostic
result (including failure) is cached only for this module/page lifetime; it holds
scalar diagnostic fields, not a GL context/resource/engine object. Other fields
remain fresh per report, including viewport and deviceType. The first qualifying
pen synchronously removes the listener and records a sticky in-memory fact; a
setTimeout0 macrotask then writes the same storage key and sends the same request.
The timer callback is created outside the event handler and retains no event or
canvas. There is no microtask, new privacy field, isTrusted restriction or engine
lifecycle/cache modification. Private storage failure does not erase a pen seen
in this page. Collection/request setup and asynchronous API failures remain
nonfatal diagnostics. Page teardown owns the bounded one-shot task; no new
long-lived service/queue/retry was introduced.

Tests-first on the exact existing module: 3 FAIL/1 PASS. Final4 tests PASS: no
storage reads/writes, environment collection or network in capture; one deferred
report for repeated first pen; mouse/zero-pressure ignored; initial+pen only one
actual diagnostic context/probe; current deviceType/viewport collected after
scheduling; storage-write failure still reports penSeen true; synchronous
collection/request and rejected network errors contained; persisted pen skips
listener/task. Targeted actual app-options TypeScript PASS, scoped oxlint zero
errors/warnings, diff check PASS. No device/runtime/build/dependencies/shared-dist
mutation or commit was performed by this unit; ROOT owns subsequent actual QA.
