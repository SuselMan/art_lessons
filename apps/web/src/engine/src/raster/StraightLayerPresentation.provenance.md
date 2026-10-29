# Bounded straight-layer presentation

`StraightLayerPresentation` derives a premultiplied tile synchronously and passes
it to the existing `LayerCompositor` before releasing it. The compositor's optional
owner-supplied service is the only opt-in; without it, raw straight display still
fails closed. The engine does not yet supply this service and straight-room
creation/opening remains closed. No canonical source pixels are rewritten.

Conversion uses the existing `BlitPasses.transform` per-tap premultiplication
shader, whose independent Samsung proof is recorded in
`blitPasses.encoding.provenance.md`. New replace mode disables blending, does not
change blend functions/equations, and covers the complete destination without a
clear. There is no new shader program or VBO. BlitPasses owns one optional cold
VAO, freed with its programs. The shared state capsule restores the caller's GL
state before the visible composite, including scissor and color mask. Without
OES VAO the capsule retains its documented WebGL1 NULL-pointer restoration limit.

A plan is at most 1,048,576 input pixels and 4096 on either side. Even dimensions
can reduce by repeated exact 2x2 bilinear box steps until presentation scale is
at least 0.5. Odd dimensions stop reduction. This is an explicit presentation
filter, not a claim of Krita's zoom filter identity. Each RGBA8 stage quantizes;
there are no hardware mip allocations. The source's hidden RGB is discarded only
in derived PM output. Source canonical bytes, brush compositing and checkpoints
are unchanged.

All derived buffers use the ONE existing RibbonScratchPool with its common
live/idle accounting and idle ceiling. Pool keys now include immutable allocation
filter as well as encoding and size, so linear presentation cannot borrow nearest
paint scratch. The owner must reserve the sum of all plan buffers against its
global live+idle budget before any GL allocation. At most two stages are borrowed
at once; earlier stages become counted idle entries. No retained mirror, second
quota, asynchronous queue or per-frame hardware mip cache is introduced.

Unit tests cover budget refusal before allocation, shared-pool reuse, sampler
separation, matrix plans, nested-borrow refusal, state restoration before visible
draw, and cleanup after first/later-stage or display failure. The mock does not
execute this GLSL's RGBA arithmetic. The bounded service/state gate below has now run on Samsung. This is not a
whole application display/zoom or straight-room activation proof.
Remaining activation gates include the engine budget owner, coarse cache and
seams/zoom, canonical journal/replay/undo/checkpoint recovery and concurrent wash
serialization/rebase. This is not full brush compatibility or a production change.


## Actual Samsung service gate (2026-10-30)

Tested production source is **ba1c504eb**, before the separate allocation-failure
cleanup change **1abd3bb02**. The frozen, browser-only IIFE was built once before
that change: SHA256
`9025954161d6cbd2dbdb93f8a76a91a8ca1e656aeba59ed3bd628762dd318862`.
Private reproducible recipes and receipts are in
`temp/device-runs/krita-stroke-20261024/fixes-v52/`:
`run-straight-presentation.mts`, `straight-presentation-body.js`,
`straight-presentation-prepared.json`, `straight-presentation-device-result.json`,
`straight-presentation-final-run.log`, `straight-presentation-device-cleanup.json`,
and `straight-presentation-resource-cleanup.json`. The last receipt records the
privileged strict-process-guard removal of the temporary frozen bundle.

There are 24 authored cases, each cold and warm (**48 pixel comparisons**):
three patterns (nonuniform RGB/alpha, binary RGB with alpha
0/1/127/128/254/255, and hidden RGB under zero alpha), identity, one/multiple
2x2 reductions, odd-dimension stop and anisotropic-scale stop. The CPU oracle
uses authored level dimensions rather than the production planner. Its first
stage premultiplies each straight tap before averaging and byte storage;
subsequent stages average stored PM bytes. The declared final-byte tolerance is
1; **actual nonzero differences = 0, maximum delta = 0**. This finite receipt
does not establish arbitrary zoom filter identity.

Samsung SM-T970 / Adreno 650 / Chrome 155 / WebGL1 fragment highp precision 23:
source bytes unchanged, every warm call made no texture/program allocation or
texture upload, hardware mipmap calls 0, GL errors []. Before the visible callback
and after return, the gate checks caller framebuffer, viewport/scissor, program,
buffers, enabled caps, color mask/clear color, blend functions/equations/color,
pack/unpack alignment, four texture bindings including active unit 3, VAO and
vertex attribute pointers/enables/divisors. Hostile scissor/cull/depth/stencil,
dither and partial color mask are enabled on entry. Blend functions/equations
remain unchanged under replacement rendering.

Injected second-stage draw failure and visible-callback failure both restore
state and release pool borrows/reservations. All owned texture, framebuffer,
buffer, shader, program and VAO handles end at zero. The owned context/child and
ADB forward were closed, the original three tabs and parent foreground restored;
no device resource remains. An early QA comparator mistakenly treated the plain
boolean COLOR_WRITEMASK array as a handle; correcting that comparator did not
change production code or the frozen bundle.
