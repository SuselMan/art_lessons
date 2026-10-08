# Q8 portability and safe performance audit — 2026-10-08

Read-only audit; no GPU execution or root-source changes. Root observations:
prediff sampler ON reduces carry amplification max38→3; coverage28bytes/max58
and band3288bytes/max197 remain. These are observations, not a proven cause.

## Sensitivity calculation

For ordered edges a<b, smoothstep H(t)=3t²−2t³, t=clamp((x−a)/(b−a),0,1).
H'(t)=6t(1−t), maximum1.5 at t=.5. Therefore
|ΔH| ≤ min(1,1.5 |Δx|/(b−a)), ignoring endpoint/float rounding changes.
For width2.44 Q8 levels, b−a=2.44/255; one input-byte error permits
|ΔH|≤1.5/2.44≈.61475, about157 OUTPUT byte levels. This upper bound does
not predict a particular pixel and does not by itself explain197: band includes
several thresholds/products plus ring sampling and source differences. It does
show why a tiny first input discrepancy cannot be judged from final band max.
Gate first differing source sample/cost before smoothstep and capture its edges.

## Standards distinction: reversed smoothstep

Mode6 in passes/fieldOps.ts computes convexW using smoothstep(.5,.25,ring/8).
The matching production GLSL also has reversed edges. GLSL ES1.00 §8.3 explicitly
leaves results undefined when edge0>=edge1; this is the actual WebGL1 language
constraint, not merely a desktop GL citation. [Khronos GLSL ES1.00 specification,
p72](https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf).
Current WGSL §17.5.57 instead defines decreasing interpolation when edge0>edge1,
using its clamp-polynomial rule; equality has separate errors/indeterminate
semantics. [W3C WGSL smoothstep](https://www.w3.org/TR/WGSL/#smoothstep-builtin).
Thus decreasing WGSL is defined but cannot guarantee reproduction of an
undefined GLSL driver result. Do not silently replace this model expression.
A diagnostic should separately record ring and convexW with identical captured
samples, and compare GLSL native builtin against explicit clamp-polynomial and
ordered-edge complement. This distinguishes sampler/Q8 from undefined-edge
compiler behavior. Any production normalization requires an explicit model gate.

## Operations requiring matching discrete semantics

* Every RGBA8 write is a Q8 boundary. Keep clamp, quantization, ping-pong order,
  and whether color/P read the same OLD donor. Fusing iterations without storing
  their intermediate Q8 results changes the discrete recurrence.
* NEAREST versus LINEAR is input-field metadata, not interchangeable mathematics.
  LINEAR donor mask/pressure/front samples use fractional coordinates. Hardware
  fixed-function interpolation and manual f32 bilinear weights need not round
  identically. Probe identical bytes at each half-texel/quarter-texel/clamped UV
  before applying any threshold; same semantic filtering is necessary but does
  not prove cross-API byte identity.
* Mode6 inside/tail/sharp/backrun/convexity and mode11 extension consume thresholded
  costs. Mode10 deep seed .78–.84 and carry wet-path eligibility change support,
  not merely appearance. Preserve source bytes, exact edge/scalar values and
  texel-centre axes. Packed carry-path masks must decode the exact integer byte.
* Resample must keep the same mean taps, base+up(new−old) expression, clamp and
  intermediate stores. Removing a copy is safe; replacing delta reconstruction
  with direct upsample is not the same Q8 model.
* Raster coverage has independent barycentric/subpixel precision and blending
  constraints. Slight P/C differences can be harmless visually while coverage
  error near a threshold changes domain support dramatically. Keep raster and
  captured-input compute proofs separate.
* Algebraically equal reassociation, FMA, reciprocal multiplication, pow/sin/cos
  replacements are not automatically byteexact near a half-byte rounding seam.
  A common explicitly defined numerical model could improve portability but is
  a model/numerics decision, not an exact performance optimization.

## New safe performance candidates (not scissor or specialization)

1. capillary() currently computes nine sampleD.g values then returns
   mix(1.0,1.0,1.0−smoothstep(...)). For finite Q8 samples this is identically1.
   Returning1 removes mathematically dead reads with no changed recurrence.
   Compiler may already eliminate them: inspect actual GPU timing before claiming
   a win. First software bytegate plus captured carry sampler/hardware gate.
2. Host-side bind/layout cache and a per-submission uniform arena with distinct,
   aligned immutable slots may reduce allocation/encoding overhead. Uniform data
   and GPU read chronology must remain identical; never overwrite a slot before
   GPU completion. No arithmetic/filter/Q8 change is needed.
3. Reuse immutable flow/path staging payloads only when dimensions, orientation,
   filter and byte hash match AND previous consumers retain the same texture.
   Avoid queue.writeTexture overwrite before submit: immutable staging copies or
   preserved ordered encoder copies retain chronology. Count bytes/copies first.

Prioritize portability capture before physical tuning. Current max197 band
comparison cannot establish that water transport needs a different equation.
