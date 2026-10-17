# Macro transport experiments — 18 October

Only NEW macro modules; original gallery/source registry remains unchanged. Integration entry `alternatives/macro-index.ts` exports definitions with two ids/two configs each. No device run by author; numerical/genuine-travel CPU tests do not imply good-looking watercolor.

## 1. macro-multiscale-exchange

Finite-volume fresh mobile average + paired coarse-to-fine exchange, but physical strides up to64/128px instead of8–16px. Ordered schedule [16,8,4,2,1]×2 or [32,16,8,4,2,1]×2 on256grid. Every crossed coarse cell participates in path-min conductivity; each coarse conductivity is minimum of all16raw water bytes. A single dry raw pixel blocks that coarse cell; no dry stripe jumping. Receiver factors exact-cell normalized, packed16 coarse pigment, original fixed detail retained. Low adsorption. Optional final single fullres paired smoothing. 74/88draws for presets (including fullres adsorption each step),29.25MiB targets +aux4MiB. This is accelerated broad wet-conductivity diffusion, NOT pressure/velocity advection. Wide dyadic jumps may look like repeated displaced brush copies; images must reject such artifacts.

Ideal fully wet impulse CPU: RMS90.47/181px and75.5%/92.8% mobile mass ≥50px from source; total mass1. This includes only mobile ideal transport: fixed fraction stays original, low adsorption can shorten actual travel, GPU rounding/saturation and nonuniform wet conductivity can reduce/change results. Not just a slider changing a blur radius: ordered conservative physical jumps traverse every wet cell along their path, but artistically it still is a diffusion family. Whole quantized pipeline conservation is observed, not guaranteed (same caveats as finite-volumev15).

## 2. macro-wet-geodesic-exchange

Deterministic CPU wet-component DFS WALK records endpoints separated by62–96 or124–192 wet-path steps. It pairs endpoints involutively: pair(pair(i))=i, unmatched/dry pixels self-map. Three different traversal orientations produce three map textures. Each map is a byte-packed absolute1024coordinate; GPU reads matched donor and exchanges a fixed fraction of mobile pigment. Multiple map cycles mix initially separated colors. It can go around a dry obstacle only along an existing wet path; disconnected wet components never pair. This is NONLOCAL accelerated graph mixing, NOT a parcel physically traversing every intermediate pixel per draw or CFD. Pair topology can impose scan-order stripes; images/rotated scenes must expose this rather than call it natural flow.

Exchange uses sign(delta)*floor(abs(delta)*share+.5) on decoded integer pigment bytes. Because transfer is antisymmetric, paired output byte sums equal input exactly in CPU arithmetic, while preserving positivity. Uniform fixed/mobile split keeps detail. All GPU texture-sampling/precision/premul/device repeat controls still apply.9/12draws and36MiB targets +aux4MiB. CPU preprocessing builds3pairmaps before run; nontrivial O(wetPixels) work and typed temporary arrays are NOT hidden GPU work. Upload/end-to-end latency must be reported separately; run timing alone cannot establish interactive speed.

## Validation

`node alternatives/macro-cpu.cjs` (from repository with full path): ideal impulse distance/mass, two initially separated pigment patches mixing,196608involution/dry-wall checks across4grid phases, around-obstacle/empty controls,196608integer pair checks (allbyte pairs ×3shares). Actual modules FakeGL lifecycle/drawcounts/configs, repeated run/no allocations, teardown/double-destroy pass; strict standalone TS passes. No real GLSL compile/GPU/image validation. Existing zero-water final returns original byte, mapping never accesses foreign wet components, all outputs reset on each run.

Required GPU gates: dry exact/no pigment generation, isolated pools, straight/diagonal1px dry barriers, old mass/premul/deterministic checks; canonical wet pool impulse travel and separated two-color mixing; captured wash/prewet images; timing upload vsrun vsreadback. Do not confuse optical-density channel mix with physical spectral watercolor. No new processes/dependencies/browser/services or raw GPU resources created here.
