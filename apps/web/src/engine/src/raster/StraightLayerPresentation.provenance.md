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
paint scratch. The same pool now prepares the complete bounded acquisition, claims
resident stages and reserves only missing bytes in ContextStorageOwner before
GL allocation. Each stage is taken from that exact ticket, with no parallel
numeric callback or second charge. This physical domain remains complete:false;
it does not represent a whole-GPU budget. At most two stages are borrowed
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

Cleanup hardening after the strict pool ownership guard: both pool release and
reservation release are attempted even if one throws; busy state always clears.
A primary stage/display error is preserved. Without a primary error, cleanup
failure propagates, and one cleanup error remains available through
`cleanupFailure` until the next call. During reduction the next stage becomes
owned before releasing its predecessor, so a release exception cannot strand
the newly allocated output. Fault-injection tests cover both cleanup failures,
subsequent reuse, and predecessor release failure. This changes error paths only;
the successful pixel path and frozen Samsung receipt above are unchanged.

## Same-owner admission handoff (2026-10-31)

The numeric reserveTransient constructor callback was removed. The service uses
RibbonScratchPool.prepareAcquisition, closes its plan in finally and preserves
primary/cleanup failure ordering. Unit tests12 PASS include exact finite cap336
(256 resident source+80 derived stages), warm zero-allocation reuse at that cap,
and cap335 denial before allocation. Existing hostile-state, stage/display fault,
cleanup, nesting and reuse cases still pass. Historical Samsung receipt above
predates this handoff and is not relabeled as testing the changed lifecycle.
Engine factory activation and a fresh physical-device handoff proof remain gates.
No runtime processes, service or disposable builds were created by this unit.

2026-10-31 fresh hardware lifecycle check after0a1dc30b1: current two-argument
service plus SAME RibbonScratchPool.prepareAcquisition ran48 cold/warm cases
on Samsung Adreno650/Chrome156. Independent CPU stored-PM box reference permits
1byte tolerance; actual differing bytes0/maxDelta0. Source unchanged, hostile
caller state restored, warm no-upload/no-new-program path, injected second-stage
and display-callback failures all PASS. No hardware mipmaps; remaining textures,
FBOs, buffers, shaders, programs and VAOs all0. Own child/forward closed and all3
original tabs preserved. The context used DEFAULT physical policy, so this is
not a finite whole-GPU budget proof or editor/native-brush fidelity claim.
Compact receipt: fixes-v52/straight-presentation-current-proof.json, bundle
499705c9a3167f3a21df3de5ef79ed22ff2dc152fdcf7e4aafbcd1bef95ca0e2;
source-module hashes are retained there. Bundle was RAM-only; no service started.
