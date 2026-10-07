# #728: WebGPU watercolor proof of concept

This is a private testing backend, not a production engine migration. Source
starts at `040a9c74`; no room operations, server, production route or log contract
are changed. `/dev/watercolor-webgpu` is registered only in Vite development.
A separate standalone trusted-HTTPS bundle mounts the same page without Room,
accounts, sockets or service workers.

## Build and run

```
npm install
npm run build --workspace=packages/shared
npx vite build --config apps/web/vite.webgpu-poc.config.ts apps/web
```

Output: `temp/webgpu-poc-dist/webgpu-poc.html`. Serve this directory on a trusted
HTTPS origin (localhost is also secure). No WebGL fallback masquerades as WebGPU.
Hardware support is queried at runtime; unsupported adapters get a clear message.
`@webgpu/types` is a development typing dependency only.

## Whole interactive path

Pen/mouse → project `Dab` records → production pressure width / ellipse pose,
travel depletion and pigment absorption → batched storage-buffer deposit →
8-neighbour compute transport A→B → evaporation/absorption and pigment settling
→ optical-depth display. The field contains independent water, mobile optical
RGB depth + mass, settled depth + mass, and contact-weighted brush flow.
Brush size up to400, round/chisel, pure water, pigment in previous water,
mixing, automatic drying, forced dry, fixed-tick replay, local undo/redo,
exported journal and optional current-WebGL1 same-dab comparison are usable.

Each invocation owns one output cell. Deposit reads no neighbours and modifies
its own cell; transport reads A and writes B. Four pigment channels always use
the same donor fractions and settling share. There are no atomics or in-place
neighbour races. A workgroup8×8 uses the ordinary device storage-buffer limit.
512×384 simulation over1024×768 world needs about24MiB buffers. Live scheduling
admits one solver tick at a time via an asynchronous queue fence, preventing an
unbounded GPU backlog on slow adapters. Simulation ticks, not wall-clock, are
recorded for replay; a slow device's physical model progresses more slowly.

Timestamp-query is optional. UI separates CPU submission aggregate from last
GPU solve sample. `timingSummary` exposes count/median/p95 of real query samples.
No timer fallback or CPU wall-time claim is labelled GPU duration. Rendering and
input do not perform readback; readback is explicit diagnostics only.

## Shared model versus changed model

**Reused:** shared Dab footprint/pressure/size/aspect/angle, production pressure
response, water/pigment travel load, logarithmic pigment absorption, and the
production `wetDiffuseStepMany` donor algebra (D=.09 B=.03). Water deposit occurs
before pigment, and no material tag remembers who supplied it. Paper and flow
are deterministic; opposite brush directions cancel rather than normalize.

**Approximate / different:** continuousFloat32 fields replace canonical RGBA8
pass boundaries; depth display is exp(-D) directly; additive optical deposition
uses a PoC normalization and paper retention; water max-record and neighbour
transport replace production cost/front/carry/remobilization/tide schedules;
contact flow is a bounded conservative drift, not the canonical integer brush
pass. Paper is a fixed CPU seed, not the baked photographed sheet. Ellipse dabs
are resampled densely; production ribbons, bristle masks and end treatment are
not ported. Layer/peer/snapshot/room undo contracts are not part of this PoC.
Dry-all is immediate in this PoC. Cross-device bitwise replay is not promised.

The WebGL comparison receives the same saved elliptical stroke inputs/preset
and current engine code; it is a flat-paper dry replay. Its wall time includes
export and is explicitly **not comparable** to one compute tick. Existing
production wet profiles/room histories are not imported automatically.

## Mathematical gates

For water gatesa,b∈[0,1], min(a,b)max(a-b,0)≤1/4. With paperh∈[.25,.75],
weighted contact flow≤.82, even the conservative bound for all8 outgoing donor
shares is8(.09+.03·.5+.018·.82)+8·.015·.25=.98808<1. Liquid outgoing
bound8(.036+.014·.5)=.344<1. Each face's incoming term is the identical
neighbour donor's outgoing term, so sums cancel before float rounding. Settling
moves the same depth/mass share to the fixed field. No clipping repair is used
for pigment. These bounds apply to this solver, not arbitrary user coefficients.

CPU tests verify input batching invariance, no pigment from pure water, chisel
pose, deterministic paper, positive donor budget and production diffusion
reference conservation across a dry cell. On-device `Check CPU oracle` compares
one WGSL mobile/depth step to `wetDiffuseStepMany` with the same water-pressure
term; tolerance2e-6/channel and relative mass drift1e-6. `Check replay bytes`
compares all cells after the exact recorded sequence, and `Check mass` checks
30 transport ticks at zero evaporation.

## Validation so far (2026-10-08)

Typecheck,5unit tests, oxlint and map gates pass. VPSsoftware Dawn/SwiftShader
compiled and executed WGSL with no browser/validation errors; nonempty GPU
render readback247k colored pixels; full same-device journal replay0different
floats. CPUoracle maxdifference1.52e-7, relativemassdrift7.40e-9,0negative
channels. This validates logic/API, **not hardware performance**. Software
headless Vulkan capture of the WebGPU canvas was white while texture COPY_SRC
readback showed the actual colored image; hardware composition must be checked.
Hardware tests on Surface/Samsung are coordinated by the root agent and remain
pending in this initial report. Do not infer GPU speed or improved final
watercolor quality from the software run.

API reference: [WebGPU specification](https://www.w3.org/TR/webgpu/) and
[GPUWeb timestamp-query example](https://webgpu.github.io/webgpu-samples/?sample=timestampQuery).

## Faithful canonical brush gate

`Check Q8 brush · WebGL1` separately ports the current
`WC_BRUSH_DRAG_BASELINE_FRAG` donor/capacity algorithm into WGSL. Read-only
pre-contact pigment/color, simultaneous two-field output, four directions in
fixed order, floor(channel*f), per-channel receiver capacity and RGBA8 clamp
remain at every pulse boundary. It does **not** replace the interactive float
solver. Scope is the full-resolution flow rectangle used by the existing
WebGL2 fixtures; compact bilinear flow rectangles are not yet ported.

Software Dawn versus the actual production WebGL1 shader: zero-flow16, capacity16
three-pulse, partial-scissor128 two-pulse and brush400/field512-step100 all have
**0 different pigment/color bytes**. Nonzero fixtures change input, and the
zero-flow fixture is identity. The shader uses f32 log/smoothstep; other hardware
must measure parity rather than assume transcendental results are identical.
The stress fixture gain=.84 is reused to match existing tests; positivity bounds
for arbitrary gains are not asserted. This is an algorithm-port gate, not a
whole-engine fidelity or throughput claim.
