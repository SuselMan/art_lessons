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
execute this GLSL's RGBA arithmetic. This service's whole display/state path has
not yet been checked on a real device; only the underlying conversion shader has.
Remaining activation gates include the engine budget owner, coarse cache and
seams/zoom, canonical journal/replay/undo/checkpoint recovery and concurrent wash
serialization/rebase. This is not full brush compatibility or a production change.
