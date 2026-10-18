# Coherent integer artistic advection (CPU READY)

New standalone `webgpu/macro14-coherent-advection.ts` exports
`coherentDefinitions`, id `wgsl-macro-coherent-advection`:
256phases gain3/eddy16/strength0 control; gain3/eddy16/strength128;
gain6/eddy24/strength128. Defaults256/gain3/eddy16/strength128.
No existing model or registry changed. Same single joint pair dispatch per
phase and same storage inventory as integer dynamic; aux.w stores vertexψ.
No new GPU textures/buffers. CPU preprocessing/upload excluded from run.

## Coherent field and exactness scope

CPU builds a signed integer streamfunction on129×129 VERTICES. Two smooth
noise scales (128/256px for eddy16) plus lowpassed paper height give a coherent
field, not white per-pixel grain. Hash uses Math.imul/shifts/4095bitmask only;
no GPU hash or large arbitrary modulo. Seed comes from input operation.
Integer cubic interpolation, separable paper9tap lowpass, potential gauge
centering and boundary taper happen before upload. All boundaryverticesψ0.
A SINGLE power-of-two normalization is applied to VERTICES, not individual
faces; resulting vertex differences<=256. Strength0 makesψidentically0.

Horizontal positive-x face: ψ(x+1,y+1)−ψ(x+1,y).
Vertical positive-y face: ψ(x,y+1)−ψ(x+1,y+1).
Four face differences telescope to EXACT zero divergence in every cell,
including after integer vertex quantization. Boundary normal face velocity0.
CPU tests all cells n16/32/128, strengths0/64/128, seed-repeat and bounds.
Metadata.field includes actual seed/scale/normalization/maxRate and SHA256 of
ALL vertex bytes, allowing cross-device preprocessing comparison.

## Water and pigment flux

Velocity fraction=faceDifference/512, maxabs.5 before gates. Curl donor-water
packet=round(W_upwind*abs(rate)/512), then multiplied by absolute wetness
min(meanW*gain,16384)/16384. Add SIGNED curl packet to old signed calibrated
Darcy packet. Select donor according to combined sign; cap net water transfer
by donor4/5W and receiver65535−W. Carry M using exactly the accepted water
packet and previous integer pigment capacity limiter. Old symmetric mixing,
absorption and adsorption remain. D remains stationary.

Important: underlying ψ face field is divergence-free; upwind W, saturation,
donor and receiver gates (and added pressure flow) mean ACTUAL water flux is
NOT generally divergence-free. No incompressible/Navier–Stokes claim. This is
exogenous artistic coherent motion with paper coupling, not momentum solved
from the water. Dynamic dry paper may become wet; there is no internal static
wall map. Initial literal dry pigment cannot resuspend.

Bounds: rate<=256. W*rate+256<=16777216. curl0<=32768;
curl0*wetGate+8192<=536879104<2^32. Signed pressure+curl<=98303<i32max;
final donor/receiver limits preserve range. Pigment products retain V8 bounds.
100000 random signed-rate pairs verify exact all4M+D and W+S, positive premul,
capacity. rate0 matches calibrated CPU result EXACTLY. Uniform water with no
pressure gradient has signed-direction pigment movement from coherent flow;
strength0 control distinguishes this from ordinary diffusion.

## Evidence and cautions

Four CPU tests PASS, strict/noUnused TypeScript0. Actual-host mock covers
fieldSHA/repeat upload, fixed dispatch ledger, no allocation growth, idempotent
disposal. Mock is NOT a WGSL compiler or GPU/artistic result. Synthetic flat-
paper seed805 interior field RMS rate≈58/512 (eddy16) before water gating;
this is a velocity-scale diagnostic, NOT measured pigment displacement.
Local integer bilinear PACK remains V10, with its stated non-exact global
interpolation mass and no-clamp capacity proof. Final RGBA8 quantization is
separate from exact coarse code ledgers. Possible failures: donor-cell blur,
8px structure, static eddies trapping pigment, over-spread or moving colours
apart. Actual images/functional scenes and Samsung–Intel fullRGBA required.

## Primary conceptual reference

Bridson, Hourihan, Nordenstam,
[Curl-Noise for Procedural Fluid Flow (2007)](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf)
uses curl fields for controllable procedural motion. This implementation is
an independently simplified integer2D streamfunction with conservative
material packets; it does not implement the paper's complete boundary or
3D turbulence procedures. In particular its actual gated water flux has the
qualification above. No scientific assertion of watercolor fidelity.

No GPU/device/browser/service/process/tempbuild created by author.
