/** Explicit optimized32 SCALAR F32/RNE numerical profile. Integer-valued straight
 * RGBA8 inputs, scalar controls in[0,1], optional external selection maskU8.
 * Flat controls=(opacity,averageOpacity,flow,mask), policy=(variant,hasMask).
 * Do not replace this carrier with a GLSL struct: tested Adreno lowering loses
 * fractional control precision even with explicit highp struct fields.
 * Source alpha already includes the brush mask: do NOT pass it twice.
 * averageOpacity is ParameterInfo's effective lastOpacity, updated outside this
 * pixel operation. Hard's flow multiplication is applied HERE, once.
 *
 * Host fragment MUST declare precision highp float and verify HIGH_FLOAT>=23.
 * Host controls are validated
 * by compositeSourceAlphaDarken32's CPU contract, not an independent shader API.
 * No hardware reciprocal estimate, SIMD packet dispatch or premultiplied byte
 * store is emulated. Named intermediates express the separate F32 operation
 * graph; GPU conformance must check compiler contraction at byte boundaries.
 * Existing renderer/shaders are not modified by importing this declaration.
 */
export const SOURCE_ALPHA_DARKEN32_GLSL = /* glsl */ `
float sourceAlphaDarken32RoundEven(float value) {
  float lower = floor(value);
  float fraction = value - lower;
  float parity = lower - floor(lower * 0.5) * 2.0;
  return fraction > 0.5 ? lower + 1.0 : fraction < 0.5 ? lower : lower + parity;
}
float sourceAlphaDarken32Lerp(float a, float b, float t) {
  float difference = b - a;
  float product = difference * t;
  return product + a;
}
vec4 sourceCompositeAlphaDarken32(vec4 source, vec4 destination, highp vec4 controlValues, highp vec2 controlSelection) {
  const float reciprocalByte = 0.003921568859368563;
  const float reciprocalByteSquared = 0.00001537870048196055;
  float flow = controlValues.z;
  float opacity = controlValues.x;
  float average = controlValues.y;
  bool hard = controlSelection.x == 1.0;
  if (hard) {
    opacity = flow * opacity;
    average = flow * average;
  }
  float destinationAlpha = destination.a == 0.0 ? 0.0 : destination.a * reciprocalByte;
  float masked;
  if ((controlSelection.y != 0.0)) {
    float maskNormalized = controlValues.w * reciprocalByteSquared;
    masked = maskNormalized * source.a;
  } else {
    masked = source.a * reciprocalByte;
  }
  float sourceAlpha = masked * opacity;
  vec3 color;
  if (destination.a == 0.0) {
    // Native scalar copies hidden source RGB even with zero resulting alpha.
    color = source.rgb;
  } else {
    color = vec3(sourceAlphaDarken32RoundEven(sourceAlphaDarken32Lerp(destination.r, source.r, sourceAlpha)),
      sourceAlphaDarken32RoundEven(sourceAlphaDarken32Lerp(destination.g, source.g, sourceAlpha)),
      sourceAlphaDarken32RoundEven(sourceAlphaDarken32Lerp(destination.b, source.b, sourceAlpha)));
  }
  float full;
  if (average > opacity) {
    if (average > destinationAlpha) {
      float fraction = destinationAlpha / average;
      full = sourceAlphaDarken32Lerp(sourceAlpha, average, fraction);
    } else full = destinationAlpha;
  } else {
    full = opacity > destinationAlpha ? sourceAlphaDarken32Lerp(destinationAlpha, opacity, masked) : destinationAlpha;
  }
  float alpha;
  if (flow == 1.0) {
    alpha = full * 255.0;
  } else {
    float zero = destinationAlpha;
    if (hard) {
      float sum = sourceAlpha + destinationAlpha;
      float product = sourceAlpha * destinationAlpha;
      zero = sum - product;
    }
    alpha = sourceAlphaDarken32Lerp(zero, full, flow) * 255.0;
  }
  return vec4(color, sourceAlphaDarken32RoundEven(alpha));
}
`;
