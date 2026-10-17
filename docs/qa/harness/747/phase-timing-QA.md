# Optional standalone phase timings

`QA_TIMING_PHASES=1` installs QA-only measured factory/method wrappers. Default OFF keeps ordinary module imports. No shader changes, GL synchronization, extra pixel reads, or job operation wrappers are introduced. Existing harness reads remain measured workload.

The fetched Vite PagedPuddleTarget module is transformed only at three unique factory import aliases; original/patched SHA are retained. Factory objects use cached Proxy methods with the original receiver. Actual Plan.prepare and AccumulationBuffer prototype readPixelsRegion wrappers restore in engine finally. Native target step includes plan operations; there is no separate Plan.step API.

Timings overlap and include observer overhead. Largest synchronous next can exceed cooperative budget; these numbers are not pointer latency or isolated GPU timings. Room production flow is not transformed by this helper. Node syntax checks pass; this instrumentation still requires its first authorized native smoke test.

Per-pass extension records actual WatercolorPasses methods (including internal front dispatch, native front, fieldOp mode and front stride), plus a global invocation ordinal and longest 32 measured calls. Operations/functions stored in job.ops are never replaced; private WeakSet/WeakMap scheduling tags are neither copied nor modified. Prefix allocation/build occurs within waterFrontStepDraw/stride4 or8; closure-local prefix draw/ensure has no public method hook, so its individual GL kernels are not claimed separately. Method nesting remains overlapping.

The intrusive `QA_POST_REFERENCE_BOUNDARY=1` observer has been merged separately and refuses `QA_TIMING_PHASES=1`: its extra GPU reads are unsuitable for timing gates. It requires the forced reference payload and stores private arrays outside the compact report. Defaults OFF.

`QA_TIMING_NO_PASS_READS=1` requires TIMING and bypasses the entire pass trace/prefront sample observer (including point/filter experiment paths). `passObserver.observerGLreads=0` and empty traceCounts record this path. Mandatory ten-stage/window-reference/final numerical reads remain. These required observers can themselves synchronize inside Native.target.step (solved-stage callback) or Paged solved readPixelsRegion; those waits must not be labeled pure kernel cost.
