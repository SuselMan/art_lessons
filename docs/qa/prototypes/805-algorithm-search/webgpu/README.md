# #805: изолированные WebGPU-кандидаты

Это исследование новой реализации, не перенос или эталон старого M70. Production-код, Room, Mini и шейдеры движка не меняются. WebGPU ещё должен скомпилировать WGSL и выполнить численную проверку на настоящем устройстве; CPU-тесты этого не заменяют.

`index.ts` экспортирует `definitions` (WebGPU, async create) и `glDefinitions` (GL1-компаратор). Вход использует `AlgorithmInput` из `../protocol.ts`: RGBA8 premultiplied, скалярные water/paper, верхняя строка первая. Seed принят, но эти детерминированные модели шум не используют (`seedUsed:false`). Новый результат всегда начинается с нового `upload`, перенос прошлого результата в следующий запуск запрещён.

```ts
const candidate = await definition.create(device, 1024, config) // compile + allocate
try {
  await candidate.upload(input) // CPU conversion + queue writes + completion: BEFORE timing
  const started = performance.now()
  const out = candidate.run() // command encoding + submit; no new buffers/pipelines
  await device.queue.onSubmittedWorkDone()
  const runToCompletionMs = performance.now() - started
  const rgba = await candidate.readback() // separate copy + map; AFTER timing
  // SHA256(rgba); compare repeat after another upload(input).
} finally { candidate.destroy() }
```

`out = {buffer,width,height,bytesPerRow}`: storage/COPY_SRC packed RGBA8 buffer, dense rows, little-endian RGBA bytes. Sizes 64..2048, multiple of64 keep rows 256-aligned; intended experiment1024. No output allocation inside run. No readbacks or waits inside compute. Queue completion is host-observed completion including command encoding/submission/queue latency, **not pure GPU time**. Queue is owned by this experiment; unrelated work would invalidate an isolated latency claim. Adapter/device must be real; unavailable WebGPU or unsupported limits mean SKIP, no backend spoofing/fallback. Operator must capture validation/out-of-memory error scopes and device.lost, finally destroy candidate/device. No optional features are required; no f16, subgroups, timestamp-query use.

## Models

1. `wgsl-integer-diffusion-direct`: fixed integer four-neighbour convex pigment mixing, nearest point samples. Static water/paper control symmetric edge weights. Every channel has integer accumulation and explicit byte rounding; zero pigment stays zero. This is a bounded API/kernel comparison, **not fluid simulation**. Default32steps/rate24; radius at most32pixels.
2. `wgsl-integer-diffusion-tiled4`: exactly the same mixing, four iterations per dispatch using16×16 workgroups,8×8 output cores and4pixel input halo. Four shared arrays total4096bytes; unconditional barriers, shrinking valid region, finite-edge neighbour clamps. CPU tests compare its actual halo schedule against four full-field steps, including nonmultiple8 mathematical grids. GPU direct/tiled exactness and speed must still be measured.
3. `wgsl-d2q9-bgk`: actual nine-population weakly-compressible lattice BGK collision and pull streaming, equilibrium weights4/9,1/9,1/36. Fluid density initialized as1+0.12water; porous paper/water drag damps velocity. Link bounce-back at page edges. Velocity advects separate premultiplied pigment and water tracers by semi-Lagrangian bilinear transport plus bounded convex local mixing; water evaporates. Default coarse256/512,48fixed steps, omega1. No global incompressibility/Poisson solve. Density pressure is not a physically calibrated paper-water model, tracer advection is not mass-conservative, no free-surface model, pigment granulation/absorption/old-front art absent. Coarse averaging loses fine input/paper detail. Different grid sizes change the physical realization, not just API cost. Full output is bilinear reconstructed to1024 and byte-quantized.

`gl-integer-diffusion-match` uses the same local model in GLSL1 on RGBA8, highp samplers/arithmetic, NEAREST/CLAMP, explicit rounding, DITHER/BLEND off. Own isolated GL context only: changes its bindings/state. GL `upload` is synchronous command submission, so operator must complete upload BEFORE timing (e.g. finish outside timed section). Complete actual run before ending timing; read full output afterwards. Logical input row0 is stored at GL texture-bottom and raw readPixels row0 is that same logical row: do **not add a Y flip to the comparison bytes**. Preview may flip separately. RGBA8 conversion/driver precision equality is a measured claim, not a universal theorem; compare the CPU integer oracle/full SHA before attributing API performance.

## Memory / repeats / limitations

Diffusion1024: two4MiB state buffers + two4MiB scalar-u32 planes +4MiB staging +16byte uniform (~20MiB GPU). D2Q9 metadata reports actual requested buffer bytes: three9-population float buffers, macro vec4, two pigment vec4, two wet scalars, paper, finalRGBA8/staging. At256 about18.5MiB,512 about50MiB (inspect metadata for exact value). These figures exclude browser/driver overhead and transient CPU input/downsample/readback arrays; not measured device memory peaks. No GPU buffers retained beyond candidate.destroy.

Determinism: no races/atomics/randomness intended; repeats use fresh upload and identical pipeline/config. Same-device SHA repeats are required. Integer model targets exact backend equality; floating D2Q9 cross-device byte identity is **not** guaranteed by WGSL and must not be promised.

CPU checks: `NODE_PATH=<existing compatible node_modules> node --test docs/qa/prototypes/805-algorithm-search/webgpu/cpu.test.cjs`. Requires existing TypeScript only, no installation. Typecheck uses TS6 DOM GPU interfaces and local numeric WebGPU flag constants; duplicate external @webgpu/types must not be added to TS6 DOM.

## Primary sources

- [W3C WebGPU: queue completion](https://www.w3.org/TR/webgpu/#dom-gpuqueue-onsubmittedworkdone): completion promise, buffer usages/limits, error scopes. Used for the timing/lifetime contract, not a claim that host completion is GPU timestamp time.
- [W3C WGSL: synchronization](https://www.w3.org/TR/WGSL/#sync-builtin-functions): workgroupBarrier scope and uniform control-flow requirements. Local tiles never synchronize across workgroups; every four-step dispatch commits only its core.
- [W3C WGSL: floating-point evaluation](https://www.w3.org/TR/WGSL/#floating-point-evaluation): no universal cross-device float-byte equivalence claim.
- [Qian, d’Humières, Lallemand (1992), Lattice BGK Models for Navier–Stokes Equation](https://doi.org/10.1209/0295-5075/17/6/001): BGK/equilibrium foundation. Our porous drag, stability clamps and color/water tracers are explicitly a research adaptation; this citation does not certify watercolor quality.
