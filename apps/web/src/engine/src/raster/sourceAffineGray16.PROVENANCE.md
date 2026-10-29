# WebGL1 gray16 interpolation profile

The isolated GLSL implements the existing `affineImageSpan16` source-decode and
16-bit interpolation law. It returns packed gray16/alpha16 bytes, **not** final
straight RGBA8 or A8. It is not imported by active renderers.

Actual Samsung WebGL1 receipt:212 cases,1654 pixels, zero differing bytes/words,
fragment highp precision23, GL0. Inputs use existing actual Qt span/full-image
fixtures, including transparent borders and partial alpha; expected PM16 comes
from the existing CPU sampler. Thus this is exact GPU-versus-CPU PM16 evidence,
not a direct native PM16 readback. Private report R50/affine16-device-result.json.
GLSL SHA256 c5cad30440e2e6dea96ba63b48a6d02051eafccae7125f1432ea26ffce606089.

The producer supplies complete native row starts/steps split into integer and
16-bit fraction. NEAREST texel reads, source-decode groups/tails and separate or
summed products are explicit. Current wide8/narrow4 decode names refer to the
existing SSE source model; summed interpolation alone does NOT select a NEON
source profile. ARM source decode and final integer64 straight store are
separate stages. A division-based unpremultiply can change a final A8 even for
opaque-gray originals and must not be inferred here.

Byte-limb arithmetic avoids float32 32-bit products. It uses bounded18-bit
intermediates; admission conservatively requires fragment highp precision>=23,
span length<=2048 and signed fixed-point range. This receipt proves the tested
profile on Samsung; it does not establish universal WebGL1 implementation
identity, iPad behavior, readiness/memory ownership or renderer integration.
Legacy shader strings and imported descriptors are unchanged.

Primary precision reference: GLSL ES1.00§4.5,
https://registry.khronos.org/OpenGL/specs/es/2.0/GLSL_ES_Specification_1.00.pdf .
This shader is authored arithmetic based on the common CPU model, not copied
upstream GPL/LGPL implementation text. Native source/fixture provenance remains
with `affineImageSpan16` and `presets/sourceImageTransform.README.md`.
