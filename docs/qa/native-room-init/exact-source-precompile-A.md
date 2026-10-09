# Exact source preparation A — offline implementation

DEV query `wcNative=1&wcSourcePrecompile=1` prepares the exact shared production pipeline descriptors before READY. The flag defaults OFF and rejects detached full/raw dispatch warmup and TipA shader variants. No alternate WGSL is maintained.

The new set is **15 pipelines: 12 render + 3 compute**. Render: five stamp modes and five ribbon modes (coverage, pigmentOnly max/add, colorOnly max/add), live composite, raw canvas. Compute: source field ops, paired brush, single brush. Existing observed waterFront/diffuse (2) and hardware pressure (1) are separate; enabling both sets means 18, not 15 pipelines.

Async-created objects are cached by device, exact WGSL and descriptor identity, then consumed by the original factories. Pending or mismatched recipes fail closed. Compiler rejection prevents READY; retirement prevents late installation or subsequent preparation on the retired device. Shader SHA and descriptor SHA are recorded separately. Compiler wall time excludes SHA hashing and is not GPU execution time.

Offline tests prove preparation uses no texture, buffer, encoder or queue API; constructors reuse the prepared objects. Runtime tests hold READY until all 15 promises finish, exercise rejection cleanup and remaining handled promises, and reject incompatible warm variants before backend allocation. The canonical field recipe, formats, samplers, dispatches and numeric coefficients remain unchanged.

**Not yet hardware validated.** Compile-only preparation does not warm first-dispatch driver state, texture memory, canvas presentation or caches. It must not be presented as eliminating the 4.18 s full warmup or as a measured latency gain. Next gate: exact descriptor/SHA/HIT guards and same-material OFF/ON on an explicitly allocated device, with startup wall separated from drawing.

## Follow-up: shader module construction on cache HIT

A separate offline change defers `createShaderModule` on exact prepared stamp/ribbon recipes and skips it on cached composite/raw/brush pipelines. Cache MISS keeps the original module code, descriptor and timing; the cache can be populated by the DEV opt-in preparation path only. A retired device is rejected before factory fallback. Tests use actual constructors with a throwing `createShaderModule` API on HIT and verify another device still creates its own unchanged descriptor/module.

The Surface proof on source `406d06d4` predates this follow-up and does **not** validate it. Same-packed A OFF/ON material parity remains open. Field allocation/clears, the initial GL tile readback and WebGPU upload, queue completion and publication remain outside compiler preparation.
