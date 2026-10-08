# Diagnostic field-op specialization

Default remains the unchanged monolithic runtime mode pipeline. Opt in with
`new CanonicalFieldOps(device,{specializeModes:true})`. The diagnostic module
replaces only `let mode=u.scalars.y` with the override FIELD_MODE. Each integer
mode0..20 receives a lazily created cached pipeline. Other uniforms, donor
samples, branches within that mode, dispatch rectangle, stores and Q8 boundaries
are unchanged. Explicit bind-group layout keeps every sampled texture binding,
storage output and 128-byte uniform binding even when constant-mode elimination
removes their shader use. No hardware feature or workgroup-size change.

This may reduce per-pipeline register/code footprint. It may also increase total
pipeline compilation, memory and first-use delays. Neither benefit nor crash fix
is established. Previous GLSL low/high split motivates testing smaller compiled
branches but does not prove a WebGPU driver problem has the same cause.

```sh
FIELD_SPECIALIZE=1 node docs/qa/harness/728-webgpu-canonical-passes/field-oracle-software.mjs
node docs/qa/harness/728-field-specialization/build.mjs
node docs/qa/harness/728-field-specialization/check.mjs
```

Serve temp/field-specialization. API `window.runFieldSpecialization()` compares
monolithic and specialized actual native kernels over all21 modes plus gradient,
physical-remobilization, packed/additive path and LINEAR input cases. Same native
whole-output SHA256 must match for every case; GL/native differences are reported
separately and must not be used to reject hardware internal equality. Software
proof:30 positive cases byteexact GL/native, meaningful nearest negative control;
hosted native OFF/ON all31 hashes exact, validation/GLerrors0. App typecheck and
changed-source oxlint passed. Devices remain untested by this agent.

`encodeCpuMs` includes synchronous lazy pipeline creation and bind/uniform/pass
encoding; it is not shader GPU execution time and may not capture all asynchronous
compilation. Repeat `runFieldSpecialization({specializedFirst:true})` to inspect
order/cache effects. Every call uses a new device. No Room integration or Samsung
crash-fix claim. Root controls actual hardware ownership.
