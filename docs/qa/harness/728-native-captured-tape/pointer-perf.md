# Real-pointer400 timeline

Same captured bundle, independent fixture. `await preparePointerPerf400()` mounts actual native scene, returns CLIENT coordinates waterStart/waterEnd/pigmentCentre/secondColor. Production baked paper and existing factory options are unchanged. Root exclusively drives Surface CDP pen events. No events/dabs are synthesized by this module.

Suggested controller sequence:

1. Prepare, draw400 pigmented line along returned start/end while initial field is dry; pen-up then `drainPointerPerf()`.
2. `clearPointerPerf()`, `setPointerPerfSettings(0)`, real pen waterline, drain.
3. `setPointerPerfSettings(100,[.4,.2,.6])`, real pen tap centre, drain.
4. `setPointerPerfSettings(100,[.1,.6,.2])`, real pen tap secondColor, drain. This tests a wet domain and two actual colors.
5. Attempt a real second pointer-down during a pending previous settle as a separate admission case; record rejection/status. Do not treat rejected input as accepted latency.
6. `replayPointerPerf()` replays recorded original operations after clear; `takePointerPerf()` returns events and tape, retires owner/restores instrumentation. Save locally.

Events include capture-phase DOM pointer arrival/eventClock/pressure, synchronous runner begin/move/end CPU spans, command encoder label attributed queue submissions and submission CPU cost, EXISTING completion promise wait wall time, actual factory status/operation callbacks, rAF opportunity and idle state. Preparation time covers actual paper/device creation. Queue completion is dependency/driver wall latency, NOT isolated GPU execution; no new fences or GPU readback are inserted. rAF/paper submission completion is a display opportunity proxy, NOT proven first visible pigment. Physical first-visible latency needs a separate screen/camera observation; do not advertise that value from this trace.

Current scene is a bounded1024 native QA tile, not Room/concurrency. CPU timing includes instrumentation overhead. Clear preserves recorded tape, so replay repeats prior diagnostic strokes exactly as recorded. Keep runs bounded; event arrays intentionally retain the timeline on disk via controller JSON. No model/source/paper rewrites or new runtime flags.
