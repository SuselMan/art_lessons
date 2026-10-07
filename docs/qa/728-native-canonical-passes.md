# Native WebGPU canonical field passes — first boundary

Base 0006c583. Ports are independent native WGSL compute; no GL processing or
CPU readback in the execution path. Backend-owned textures remain rgba8unorm,
including every intermediate pass. Caller preserves production order/ping-pong,
scissor, schedule and prepared uniforms. This is an incomplete integration,
not a production-ready backend.

Available: full WC_DIFFUSE_FRAG and WC_WATER_FRONT_FRAG; basic fieldOp modes
0/1(world=0)/2/3/4/5/20. Unsupported mode1 fibre/comb world>0 explicitly throws.
Pending: complex mode1, band6, take/land7/8/9 and high modes10–19, carry path,
resample and end-to-end settle. Never substitute approximate equations.

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
