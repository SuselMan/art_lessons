/** Explicit scalar straightRGBA8 point profiles, no native vector/dispatch claim.
 * Flat values=(opacity,selectionMaskByte), selection=(profile,hasMask), where
 * profile0=portable-f32-division-rne-v1,1=optimized32-neon64-scalar-frecpe-rne-v1.
 * Inputs/controls must pass compositeSourceOver32Scalar validation before upload.
 * Host MUST declare precision highp float and require HIGH_FLOAT precision>=23.
 * Do not carry fractional opacity in structs (observed Adreno precision loss).
 * The FRECPE helper's PRIVATE domain is positive normal divisors in[1,256),
 * guaranteed by the scalar Over branch; it is not a general ARM instruction API.
 * Explicit named intermediates describe separate F32 operations; byte-exact GPU
 * admission still requires device conformance (compiler contraction/division).
 * Integer-valued straightRGBA8 output; host controls its final /255 byte store.
 */
export const SOURCE_OVER32_SCALAR_GLSL = /* glsl */ `
float sourceOver32RoundEven(float value) {
  float lower = floor(value);
  float fraction = value - lower;
  float parity = lower - floor(lower * 0.5) * 2.0;
  return fraction > 0.5 ? lower + 1.0 : fraction < 0.5 ? lower : lower + parity;
}
// Closed Over domain ONLY: no log/exp, lookup, Newton step or HW reciprocal.
float sourceOver32ReciprocalEstimate(float divisor) {
  float normalized = divisor;
  float scale = 1.0;
  for (int i = 0; i < 7; ++i) {
    if (normalized >= 2.0) {
      normalized = normalized * 0.5;
      scale = scale * 0.5;
    }
  }
  float bin = floor(normalized * 256.0);
  float denominator = bin * 2.0 + 1.0;
  float quotient = floor(524288.0 / denominator);
  float estimate = floor((quotient + 1.0) * 0.5);
  float exponentScale = scale * 0.001953125;
  return estimate * exponentScale;
}
float sourceOver32Lerp(float destination, float source, float blend) {
  float difference = source - destination;
  float product = difference * blend;
  return sourceOver32RoundEven(product + destination);
}
vec4 sourceCompositeOver32Scalar(vec4 source, vec4 destination, highp vec2 controlValues, highp vec2 controlSelection) {
  const float reciprocalByte = 0.003921568859368563;
  float sourceAlpha = source.a * controlValues.x;
  if (controlSelection.y != 0.0) {
    float maskNormalized = controlValues.y * reciprocalByte;
    sourceAlpha = sourceAlpha * maskNormalized;
  }
  if (sourceAlpha == 0.0) return destination;
  float alpha = destination.a;
  float blend;
  if (alpha == 255.0) {
    blend = sourceAlpha * reciprocalByte;
  } else if (alpha == 0.0) {
    alpha = sourceAlpha;
    blend = 1.0;
  } else {
    float missing = 255.0 - alpha;
    float added = missing * sourceAlpha;
    added = added * reciprocalByte;
    alpha = alpha + added;
    if (controlSelection.x == 1.0) {
      float reciprocalEstimate = sourceOver32ReciprocalEstimate(alpha);
      blend = reciprocalEstimate * sourceAlpha;
    } else {
      blend = sourceAlpha / alpha;
    }
  }
  vec3 color;
  if (blend == 1.0) color = source.rgb;
  else if (blend == 0.0) color = destination.rgb;
  else color = vec3(sourceOver32Lerp(destination.r, source.r, blend),
    sourceOver32Lerp(destination.g, source.g, blend),
    sourceOver32Lerp(destination.b, source.b, blend));
  return vec4(color, sourceOver32RoundEven(alpha));
}
`;
