# Room-encoding storage preparation

The engine's existing private layer factory now takes its encoding from the
immutable room raster version. Straight fine tiles use the existing nearest
sampling and have no legacy PM coarse downsampler. Legacy real-layer pyramids,
PM filtering, temporary-layer behavior and rebuild callbacks are unchanged.

This is preparation only: straight constructor/reader admission remains closed.
No QA production API, presentation/reservation adapter, canonical writer,
renderer, queue or active-room behavior was added.

Tests invoke the real factory via an inherited private receiver seam from the
existing engine harness. The real admitted engine remains legacy and its log is
unchanged. Baseline exposed two expected wrong-encoding failures; final tests
check actual created tiles/filtering, absence of straight coarse levels and
preservation of the PM downsample callback. Combined raster-version/canonical
admission coverage:12/12PASS; common web TypeScript, scoped lint and diff-check
PASS. Diagnostics in existing R52 engine-straight-storage logs. No browser/device
pixel or active editor claim.
