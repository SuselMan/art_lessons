/** WebGL1 scalar byte compositor. Straight RGBA8 values are integer-valued
 * highp floats, NOT premultiplied/normalized inputs. Host byte controls use
 * canonicalizeSourceRgba8Control from sourceRgba8CompositeShader.
 *
 * Require fragment HIGH_FLOAT precision >=23. All integer intermediates are
 * exact binary32: max multiply3 numerator including its fold is 16743774,
 * below 2^24. Powers of two use exact scaling/floor (including signed blend).
 * General division corrects the estimated quotient by its exact residual.
 * This is the generic scalar law, not optimized native packet/Over32 dispatch.
 * No blend state, destination storage or profile admission is implied here.
 */
export const SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL = /* glsl */ `
struct SourceRgba8CompositeControl {
  float mode;
  float opacity;
  float mask;
  bool hasMask;
  float flow;
  float average;
  bool flowIsOne;
};
float sourceRgba8Multiply(float a, float b) {
  float t = a * b + 128.0;
  return floor((floor(t * (1.0/256.0)) + t) * (1.0/256.0));
}
float sourceRgba8Multiply3(float a, float b, float c) {
  float t = a * b * c + 32603.0;
  return floor((floor(t * (1.0/128.0)) + t) * (1.0/65536.0));
}
float sourceRgba8Divide(float a, float b) {
  float numerator = a * 255.0 + floor(b * 0.5);
  float quotient = floor(numerator / b);
  float residual = numerator - quotient * b;
  return residual < 0.0 ? quotient - 1.0 : residual >= b ? quotient + 1.0 : quotient;
}
float sourceRgba8Blend(float source, float destination, float alpha) {
  float t = (source - destination) * alpha + 128.0;
  return floor((floor(t * (1.0/256.0)) + t) * (1.0/256.0)) + destination;
}
float sourceRgba8Wrap(float value) { return value - floor(value * (1.0/256.0)) * 256.0; }
float sourceRgba8AddChannel(float source, float destination, float sa, float da, float alpha) {
  float sum = min(255.0, source + destination);
  if (da == 0.0) return source;
  if (da == 255.0) return sourceRgba8Blend(sum, destination, sa);
  if (sa == 255.0) return sourceRgba8Blend(sum, source, da);
  float premultiplied = sourceRgba8Wrap(sourceRgba8Multiply3(255.0-sa, da, destination)
    + sourceRgba8Multiply3(255.0-da, sa, source)
    + sourceRgba8Multiply3(da, sa, sum));
  return sourceRgba8Wrap(sourceRgba8Divide(premultiplied, alpha));
}
vec4 sourceCompositeRgba8(vec4 source, vec4 destination, SourceRgba8CompositeControl control) {
  float da = destination.a;
  if (control.mode == 0.0) {
    float sa = control.hasMask ? sourceRgba8Multiply3(control.mask, source.a, control.opacity)
                              : sourceRgba8Multiply(source.a, control.opacity);
    if (sa == 0.0) return destination;
    float alpha = da + sourceRgba8Multiply(255.0-da, sa);
    float factor = da == 255.0 ? sa : da == 0.0 ? 255.0 : sourceRgba8Divide(sa, alpha);
    return vec4(sourceRgba8Blend(source.r,destination.r,factor),
      sourceRgba8Blend(source.g,destination.g,factor), sourceRgba8Blend(source.b,destination.b,factor), alpha);
  }
  if (control.mode == 2.0) {
    float masked = control.hasMask ? sourceRgba8Multiply(control.mask, source.a) : source.a;
    float sa = sourceRgba8Multiply(masked, control.opacity);
    float full;
    if (control.average > control.opacity) {
      full = control.average > da ? sourceRgba8Blend(control.average, sa, sourceRgba8Divide(da, control.average)) : da;
    } else {
      full = control.opacity > da ? sourceRgba8Blend(control.opacity, da, masked) : da;
    }
    float alpha = control.flowIsOne ? full : sourceRgba8Blend(full, da, control.flow);
    return vec4(da == 0.0 ? source.r : sourceRgba8Blend(source.r,destination.r,sa),
      da == 0.0 ? source.g : sourceRgba8Blend(source.g,destination.g,sa),
      da == 0.0 ? source.b : sourceRgba8Blend(source.b,destination.b,sa), alpha);
  }
  float sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0.0) return destination;
  float alpha = sa + da - sourceRgba8Multiply(sa, da);
  return vec4(sourceRgba8AddChannel(source.r,destination.r,sa,da,alpha),
    sourceRgba8AddChannel(source.g,destination.g,sa,da,alpha),
    sourceRgba8AddChannel(source.b,destination.b,sa,da,alpha), alpha);
}
`;
