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

The faithful compute fixture now packs each RGBA field into oneuint32 word:
P/C cell8bytes, flow/water4bytes each, instead of expanding every byte into
uint32. Shift/mask unpacking retains the exact byte values. The same4software
fixtures remain byte-identical. Optional timestamp queries surround the warmed
compute pulses, with input restore/upload before the query and readback after.
A single warmed sample per fixture is labelled as such; no FPS or comparative
speed claim follows from it. The same-dab comparison preset now uses the
production `watercolorPresetString` serializer, preserving water/pigment order
and the fifth-field nib. Sixunit tests include this contract gate.

## Interactive physics follow-up (2026-10-08)

The original live model was too slow at brush scale, and diagnostics could
leave it paused. Commit 10850786 fixes pause lifecycle; parent verified real
Surface pointer input, running/paused restoration and sample auto-resume.

The next experimental model uses one multiscale wet-path stencil per tick
and local conservative contact remobilization. This is a physical model
change, not a faithful production port. A mathematical review bounds outgoing
pigment fractions below .98808 and liquid fractions below .344. Symmetric
path gates and paired reverse directions preserve each pigment channel.

Software fixed-input comparison, 30 ticks (0.5 simulation seconds):

| Gate | Previous | Experimental |
|---|---:|---:|
| Blue pigment in water, mass beyond radius20 | 0.031% | 85.90% |
| Two colors, blue crosses left threshold | 0.059% | 10.44% |
| Two colors, yellow crosses right threshold | 0.024% | 9.82% |

At 120 ticks, outer mass is 90.79%, color cross shares 16.32%/15.60%.
Mass drift remains below 1e-8 in these fixtures. Actual GPU canvas readback
PNGs and JSON are under temp/webgpu-poc/behaviour-before and behaviour-after.
This proves visible motion/mutual mixing for those inputs, not final quality
or real-device speed. Large brush behavior needs a separate hardware gate.

The separate canonical Q8 comparison was exact on software, but FAILED on
real Surface: capacity max byte difference3, partial5, brush4004; therefore
no hardware byte-exact claim is made. This discrepancy is independent of
the interactive Float32 model and remains unresolved.

Dry-gap fixture: two radius12 puddles at x225/287, pigment only left;
right-side pigment mass stays exactly zero after30/120 ticks despite maxhop32.
Fixture drift at120 ticks is1.62e-8. Reusable harness:
`WC_WEBGPU_BUNDLE=temp/webgpu-poc-physical-dist node docs/qa/harness/728-webgpu/behaviour.mjs`.
Full software replay, dry, Undo/Redo and explicitly legacy CPU oracle PASS.

## Exact wet-path early rejection

The follow-up optimization supplies the already loaded endpoint minimum to
wetPath and rejects a face whose endpoint is below the existing .0001 path
threshold before inspecting interior cells. The legacy oracle branches
explicitly and no longer eagerly evaluates wetPath through WGSL select.
No stencil, phase, transport fraction or contact exchange changed.
Full-state SHA256 hashes before/after are identical for puddle-dab and
two-colors at0/30 ticks (all16floats/cell), and software replay/dry/Undo/Redo
and legacy oracle PASS. Outputs: temp/webgpu-poc/optimization-{before,after}.
Real GPU cost reduction remains unmeasured; software timing is unsuitable.

Parent measured previous physical model on Surface: median GPU5.70ms,
p9513.63ms over500 valid samples, replay/dry/Undo/Redo PASS. By10seconds the
large mixed puddle becomes aggressively pale; quality tuning remains open.

Contact remobilization still uses per-dab base fraction .15: n identical
contacts dissolve1−(1−.15wet*contact)^n of the initial settled pigment,
so denser sampling changes the result. A separate prospective experiment
should replace it with1−exp(−lambda*contactExposure), where exposure comes
from recorded travel/dwell; that is a model change and is excluded from this
performance commit. Reducing radius cadence alone would change the physical
result and is likewise excluded from the exact optimization.
