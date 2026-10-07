# Native WebGPU canonical field passes — first boundary

Base 0006c583. Ports are independent native WGSL compute; no GL processing or
CPU readback in the execution path. Backend-owned textures remain rgba8unorm,
including every intermediate pass. Caller preserves production order/ping-pong,
scissor, schedule and prepared uniforms. This is an incomplete integration,
not a production-ready backend.

Available: full WC_DIFFUSE_FRAG and WC_WATER_FRONT_FRAG, fieldOp0–20 including
original/gradient fibres, band, physical remobilization, carry pigment/colour,
packed paths and optional additive zero-face variant; resample0/1/2 and packed
costDomain. BasicFieldPass remains a small explicit subset; full FieldOps is the
complete implementation. End-to-end native production settle producer is pending.
Never substitute approximate equations.

Coordinates: logical field row0=world top. Each invocation forms production GL
pixel `(x+.5,h-y-.5)`; field samples map GL uv back into top-row texture storage.
Paper/noise preserve uploaded asset raw rows. Paper origin/texSize/scale are the
actual production caller uniforms, including bottom-of-window adjustment, not
an invented constant period. Paper bilerp repeats every tap; fields nearest and
clamp. Offline251x251 lattice / smooth noise / FBM coefficients are unchanged.

Dispatcher uses CanonicalGpuContext/PassResources from backend agent types.
Diffusion prepared radius is integer field texels. It defaults D=.09 B=.03 but
accepts caller values. WaterFront needs production lattice and front parameters.
Uniform allocation is unique per dispatch so encoded passes cannot observe the
last queue.writeBuffer into a reused buffer. Returned buffers belong to caller;
destroy only after submission completion. Output must not alias any sampled
input. No queue submit/wait inside these kernels, no GPU timestamps invented.

Proof so far: explicit donor order/gates/bounds match source; water-front min-plus
and RGBA output match source; CPU tests cover prepared uniform layout, separate
buffers, dispatch order and fail-closed unsupported/alias inputs. Software Dawn
compiled all three WGSL modules and created compute pipelines with zero errors.
This is API/compiler validation only, **not output parity or device performance**.

Next gates: same input fields/paper/noise vs real GL pass, all-channel hashes and
max/Q8 deviation including thresholds/edges/negative-world coordinates; radius
king/knight, front stride/sparse sources, foreign film, world-sized paper sampling.
Manual paper bilerp can differ from hardware GL interpolation rounding; small
floating difference may cross Q8/relaxation thresholds. Measure before accepting
any tolerance. Whole actual-engine tape/export/undo/replay remains required.

Software compile command: `node docs/qa/harness/728-webgpu-canonical-passes/compile-software.mjs`.
Report is retained at `temp/canonical-passes/compile.json`. Hardware root-only.

Second boundary: software production GL versus actual native WebGPU dispatched
fieldOps0–20 on one nonempty16×16 four-channel fixture gave **zero differing
bytes in every mode**, no GL errors or WebGPU validation errors. Dither explicitly
OFF. This includes world/comb mode1 and both carry record variants, but not yet
additional gradient-lattice/packed-path/additive/physical-remob/scissor fixtures.
Not hardware or whole-engine parity. Report temp/canonical-passes/field-oracle.json;
reproduce with field-oracle-software.mjs in the harness directory.

Foreign water source uses production LINEAR clamp, not nearest; front now ports
that separately. CPU raw foreign stencil bytes uploaded to GL without flip must
be vertically flipped when stored as native logical world-top fields. Paper/noise
retain raw upload ordering, separately from logical field orientation.

CanonicalSettleCommand discriminated tape exposes original primitive arguments.
CanonicalSettleCommands.encode encodes exactly one primitive/Q8 boundary; it does
not choose new iterations, reorder, fuse, submit, read back or wait. Caller owns
encoder, frame timing, buffers and returned uniform cleanup after completion.
