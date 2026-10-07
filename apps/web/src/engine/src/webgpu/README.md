---
layer: engine-internals
summary: акварель WebGPU PoC
issues: [728]
tags: [акварель, WebGPU, PoC]
---
# WebGPU watercolor PoC

Independent compute backend reached only through `engine/webgpuPoc.ts`. Mobile
optical depth plus mass, settled optical depth plus mass, liquid and brush flow
occupy 64-byte cells in two storage buffers. Elliptical deposition touches one
cell per invocation (no neighbour reads); transport reads A and writes B, then
swaps. The eight-neighbour donor diffusion follows `wetDiffusion.ts` algebra,
with bounded extra pressure/contact transport. Paper-fixed CPU seed avoids GPU
float hashes. Display uses the project's logarithmic absorption model.

This is an experimental continuous float model, not a byte-identical port of
the current canonical WebGL watercolor pipeline. See the QA report for explicit
model differences and hardware validation status. No room/log/shared contract
changes and no WebGL fallback pretending to be WebGPU.

## Interactive transport revision
The experimental solver cycles one king/knight stencil per tick at radii
1,2,4,8,12,16,8,4,2. It is not the production diffusion schedule. Every
edge uses a symmetric supercover minimum wetness, including both orthogonal
cells at diagonal corners; it cannot jump across a dry gap. Local water
transport stays nearest-8. Contact exchanges up to 60% settled pigment back
into mobile pigment without changing any of the four conserved channels.
This contact exchange currently depends on dab sampling density.

The CPU oracle explicitly runs only the legacy radius-1 endpoint gate. It
does not certify the new physical model. Fixed simulation ticks are the
comparison clock; wall-clock FPS changes effective simulation speed.
