# Optional standalone phase timings

`QA_TIMING_PHASES=1` installs QA-only measured factory/method wrappers. Default OFF keeps ordinary module imports. No shader changes, GL synchronization, extra pixel reads, or job operation wrappers are introduced. Existing harness reads remain measured workload.

The fetched Vite PagedPuddleTarget module is transformed only at three unique factory import aliases; original/patched SHA are retained. Factory objects use cached Proxy methods with the original receiver. Actual Plan.prepare and AccumulationBuffer prototype readPixelsRegion wrappers restore in engine finally. Native target step includes plan operations; there is no separate Plan.step API.

Timings overlap and include observer overhead. Largest synchronous next can exceed cooperative budget; these numbers are not pointer latency or isolated GPU timings. Room production flow is not transformed by this helper. Node syntax checks pass; this instrumentation still requires its first authorized native smoke test.
