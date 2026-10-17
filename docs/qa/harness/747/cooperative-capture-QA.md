# Cooperative capture / deadline / empty-reference QA controls

All are QA-only inspector options; preparation does not enable application defaults.

- QA_CAPTURED_BACKING=1: actual source-buffer prototype captureReadPixels observation, handle release/revision/retainedBytes proof; no extra GL readbacks for instrumentation. Standalone buffers are uncached, so retainedAtCapture=0 is expected and proves no managed-memory saving.
- QA_COOPERATIVE_CAPTURE=1: inspector cooperativeCapture, actual captureStep phase/plane/tileIndex/bytes/rows/elapsedMs records. Requires observed read AND write phases. Reports max capture quantum and actual solver.step call count/max/sum.
- QA_STEP_BUDGET_MS=8: positive finite deadline option. Observed timings are upper bounds including indivisible GPU work; no assertion promises every read/solver primitive <=8ms. Runtime source SHA must confirm the deadline implementation, not merely the requested option value.
- QA_CANCEL_CAPTURE_AFTER=N (optional): separate preflight cancels after N actual capture events, verifies no published material, every captured handle released exactly once/retainedAfter0, then restarts same immutable input with epoch2. Requires both capturedBacking and cooperativeCapture. Normal runs leave this OFF and make no native cancellation claim.
- QA_SKIP_EMPTY_REFERENCE=1: empty-reference candidate inspector flag and referenceEmpty CPU-zero assembly. No GPU buffers/readback are manufactured for empty rects; empty+kept must account for all finite512 rectangles. Compact fixture must actually skip >=1. This is a separate gate; initial cooperative/deadline runs keep it OFF.

All existing10 Native/Paged stage and final exact assertions remain. Raw input hashes checked before/after; normal DITHER and non-overridden shaders. DefaultX controls should set R32/post/reference flags OFF to isolate capture. Report source label and actual runtime file SHA; no UI/FPS/120MiB memory claim from this synchronous hidden Intel standalone harness.

Node --check passed for standalone and Android transport. Actual GPU results are recorded separately; this document does not declare a prepared flag or cancellation probe passed.
