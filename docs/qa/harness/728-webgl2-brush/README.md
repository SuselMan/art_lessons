# #728: isolated WebGL2 brushPass prototype

Base f7dc9c3d. No engine/default/context migration, Room, server or device changes.
Architecture boundary: Operation Log/cross-device-determinism unchanged; this
owned browser primitive asks whether exactly the same UNORM8 material operator
can use WebGL2/MRT. It does not propose a new physics or snapshot format.

Three sequential paths consume exact same typed P/C/flow/water fixtures:

1. Production WebGL1 DISPLAY_VERT + emitted WC_BRUSH_DRAG_FRAG, C then P.
2. GLSL300 syntax-only adaptation, still C then P and unchanged pre-contact P/C.
3. GLSL300 MRT, one draw with location0 P + location1 C. Shares outgoing and
   incoming integerFraction values but preserves each channel's subtraction,
   addition, floor and final /255 order. Two RGBA8 attachments; no FP16/FP32.

Production fragment highp retained; hardware highp availability and ranges are
recorded. Texture sampling is unchanged: material/water NEAREST, flow LINEAR,
CLAMP_TO_EDGE. RGBA8/UNSIGNED_BYTE input and output, unchanged Q8 rounding;
no blending/MSAA/depth/stencil. Default GL dithering is retained in both APIs.
MRT does not read its own output; output bank is distinct from both P/C inputs.
Colour first in the two-pass controls, no copy-back between C/P. Repeated pulse
ping-pong switches both records only after the pair. Partial scissor leaves
original seeded bytes outside untouched in all paths.

Prepare (CPU only):

```
WC_PREPARED_FILE=temp/webgl2/prepared.json node docs/qa/harness/728-webgl2-brush/prepare.mjs
node docs/qa/harness/728-webgl2-brush/shaders.test.mjs
```

Prepared JSON contains actual emitted production shader variants/SHA, owned
probe function and four fixtures: zero identity16, wet/capacity16×3, partial
scissor128×2, brush400 step100 field512. It does not launch anything. After
independent device grant, evaluate the prepared probe with prepared input in
an owned page/context (Surface/Samsung CDP). No user tab/stand modifications.
The probe creates its own WebGL1 and WebGL2 canvas/context, compiles actual
programs, checks FBO completeness, readbacks all output bytes, compares both
P/C outputs separately and records nonzero/hash/changed/max. Nonzero fixtures
must actually change bytes; zero flow must retain original exact bytes. Every
path must end GL0/lostfalse. Unsupported WebGL2/highp/MRT is a failed capability
gate, never fallback that silently pretends MRT ran. All owned GPU resources
and canvases are released in finally.

CPU source gates PASS: WebGL2 two-pass converted back to literal emitted WebGL1
source is byte-identical; physical helper definitions in single/MRT identical;
MRT floor/order/output/channel definitions and probe JS compile verified.
This is not GLSL driver compilation or GPU pixel parity. No hardware was run.
No performance evidence: draw count2→1 alone is not a latency claim. MRT may
increase shader/register pressure; WebGL2 compilers can change rounding. First
require WebGL1→WebGL2 two-pass byte equality, then WebGL2 two-pass→MRT equality,
including saturation/edge/water/partial/repeated cases on both actual devices.
Only later measure bounded warmed operator GPU cost and lifecycle/context-loss.
