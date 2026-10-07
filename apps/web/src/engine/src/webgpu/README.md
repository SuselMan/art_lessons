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
