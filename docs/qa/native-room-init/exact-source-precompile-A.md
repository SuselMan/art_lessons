# Exact source preparation A — offline implementation

DEV query `wcNative=1&wcSourcePrecompile=1` prepares the exact shared production pipeline descriptors before READY. The flag defaults OFF and rejects detached full/raw dispatch warmup and TipA shader variants. No alternate WGSL is maintained.

The new set is **15 pipelines: 12 render + 3 compute**. Render: five stamp modes and five ribbon modes (coverage, pigmentOnly max/add, colorOnly max/add), live composite, raw canvas. Compute: source field ops, paired brush, single brush. Existing observed waterFront/diffuse (2) and hardware pressure (1) are separate; enabling both sets means 18, not 15 pipelines.

Async-created objects are cached by device, exact WGSL and descriptor identity, then consumed by the original factories. Pending or mismatched recipes fail closed. Compiler rejection prevents READY; retirement prevents late installation or subsequent preparation on the retired device. Shader SHA and descriptor SHA are recorded separately. Compiler wall time excludes SHA hashing and is not GPU execution time.

Offline tests prove preparation uses no texture, buffer, encoder or queue API; constructors reuse the prepared objects. Runtime tests hold READY until all 15 promises finish, exercise rejection cleanup and remaining handled promises, and reject incompatible warm variants before backend allocation. The canonical field recipe, formats, samplers, dispatches and numeric coefficients remain unchanged.

**Not yet hardware validated.** Compile-only preparation does not warm first-dispatch driver state, texture memory, canvas presentation or caches. It must not be presented as eliminating the 4.18 s full warmup or as a measured latency gain. Next gate: exact descriptor/SHA/HIT guards and same-material OFF/ON on an explicitly allocated device, with startup wall separated from drawing.
