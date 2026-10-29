# Generic straight RGBA8 composition on WebGL1

This is the same generic scalar byte contract as `sourceColorRgba8` and the
existing ES3 `SOURCE_RGBA8_COMPOSITE_GLSL`, expressed using integer-valued highp
floats for the application's existing WebGL1 context. No native source text is
copied into this additional shader. Source-informed provenance caveats of the
existing native investigation remain; this is not license clearance.

Inputs/outputs are straight byte RGBA, including hidden RGB at alpha zero. Host
controls come from the existing `canonicalizeSourceRgba8Control`, retaining the
separate absent-mask path and float32 flow-is-one predicate. The caller must
validate inputs and require fragment HIGH_FLOAT precision >=23. Blend/dither
must be disabled when writing normalized RGBA8 output. No implicit framebuffer
format migration, layer admission, native optimized packet law or painter hook
is activated by this snippet.

The largest three-factor product is 255^3 =16581375. Adding32603 gives16613978;
adding floor(t/128) gives16743774, below2^24. All of these integers and all other
multiply/add intermediates are exactly representable in binary32. Signed shift
is floor after exact power-of-two scaling. Unsigned byte wrap is exact subtraction
of floor(value/256)*256. General quotient estimates are corrected using the exact
integer residual, avoiding a wrong floor at an integer division boundary.

Actual Samsung SM-T970/Adreno650 WebGL1 proof, fragment highp23:

- All384 existing unchanged pinned Krita generic scalar native cases match every
  channel, including alpha-zero hidden color.
-65536 additional whole pixel compositions vary all256 source/destination alpha
  pairs, all three modes and deterministic random RGB/mask/opacity/flow/average;
  outputs match the existing CPU contract exactly.
-65536 complete numerator-byte/divisor-byte combinations test the quotient
  primitive (zero divisor is explicitly bypassed by the probe).
-6*65536 multiply3 cases at third factors0,1,127,128,254,255, plus6*65536 signed
  blend cases at the same factors, match integer arithmetic exactly.
- No GL errors; no tolerances or changed native fixtures.

GLSL SHA256:8393b61a504a45acad9d85ca6c73833cd5f9e111ed67747032d5b69f72014aec.
Worktree proof: `temp/device-runs/krita-stroke-20261024/fixes-v52/`
`webgl1-composite-device-result.json`, reproducible `run-webgl1-composite.mts`
and `webgl1-composite-body.js`. All input/expected/fixture hashes are recorded.
Own context, child tab and ADB forward were removed; original3tabs preserved.

This closes the WebGL1 execution gap for the generic scalar kernel only. Default
Krita optimized Over32/packet/reciprocal behavior, complete stroke composition,
persistent straight-byte storage, iPad parity and responsiveness remain separate
requirements. The earlier known optimized-SSE residual is not hidden by using
this generic profile as an identity claim.
