import { sourceRgba8CompositeModeId, validateRgba8CompositeControl, type Rgba8CompositeControl } from '../presets/sourceColorRgba8';

/** Host-resolved bytes; no shader float quantization or implicit mask collapse. */
export interface SourceRgba8CompositeBytes {
  readonly mode: 0 | 1 | 2 | 3 | 4 | 5 | 6; // Existing0/1/2; generic SC Multiply/Lighten/Dodge/Overlay3..6
  readonly opacity: number;
  readonly mask: number;
  readonly hasMask: boolean;
  readonly flow: number;
  readonly average: number;
  readonly flowIsOne: boolean;
}

/** Same author CPU float32 byte law as sourceColorRgba8; not KoColor's double
 * alpha setter. The caller retains ink alpha and local/outer controls separately.
 */
export function canonicalizeSourceRgba8Control(control: Rgba8CompositeControl): SourceRgba8CompositeBytes {
  const flow = control.flow ?? 1, average = control.averageOpacity ?? control.opacity;
  if (![control.opacity, flow, average].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
    || control.mask !== undefined && (!Number.isInteger(control.mask) || control.mask < 0 || control.mask > 255)) {
    throw new RangeError('Invalid RGBA8 composite controls');
  }
  validateRgba8CompositeControl(control);
  if (control.mode === 'colorHsy') throw new RangeError('Color HSY source-only profile has no GPU mode');
  const mode = sourceRgba8CompositeModeId(control.mode);
  const byte = (v: number) => Math.trunc(Math.fround(Math.fround(Math.fround(v) * 255) + .5));
  return { mode, opacity: byte(control.opacity), mask: control.mask ?? 255,
    hasMask: control.mask !== undefined, flow: byte(flow), average: byte(average),
    flowIsOne: Math.fround(flow) === 1 };
}

/** GLSL ES3 library snippet, no #version/main/precision declarations.
 * Consumer declares highp int; straight byte source/destination and valid
 * canonical controls only. Integer target output first; storage is separate.
 * No production import. GPU execution remains an independent acceptance gate.
 */
export const SOURCE_RGBA8_COMPOSITE_GLSL = /* glsl */ `
struct SourceRgba8CompositeControl {
  uint mode;
  uint opacity;
  uint mask;
  bool hasMask;
  uint flow;
  uint average;
  bool flowIsOne;
};
uint sourceRgba8Multiply(uint a, uint b) {
  uint t = a * b + 128u;
  return ((t >> 8u) + t) >> 8u;
}
uint sourceRgba8Multiply3(uint a, uint b, uint c) {
  uint t = a * b * c + 32603u;
  return ((t >> 7u) + t) >> 16u;
}
uint sourceRgba8Divide(uint a, uint b) {
  return (a * 255u + b / 2u) / b;
}
uint sourceRgba8Blend(uint source, uint destination, uint alpha) {
  int t = (int(source) - int(destination)) * int(alpha) + 128;
  return uint((((t >> 8) + t) >> 8) + int(destination));
}
uint sourceRgba8SeparableChannel(uint mode, uint source, uint destination) {
  if (mode == 3u) return sourceRgba8Multiply(source, destination);
  if (mode == 4u) return max(source, destination);
  if (mode == 5u) return source == 255u ? (destination == 0u ? 0u : 255u)
    : min(255u, sourceRgba8Divide(destination, 255u-source));
  if (destination == 127u) return source;
  if (destination < 127u) return sourceRgba8Multiply(2u*destination, source);
  uint doubled = 2u*destination-255u;
  return doubled+source-sourceRgba8Multiply(doubled, source);
}
uint sourceRgba8GenericScChannel(uint source, uint destination, uint sa, uint da, uint alpha, uint cf) {
  if (da == 0u) return source;
  if (da == 255u) return sourceRgba8Blend(cf, destination, sa);
  if (sa == 255u) return sourceRgba8Blend(cf, source, da);
  uint premultiplied = (sourceRgba8Multiply3(255u-sa, da, destination)
    + sourceRgba8Multiply3(255u-da, sa, source)
    + sourceRgba8Multiply3(da, sa, cf)) & 255u;
  return sourceRgba8Divide(premultiplied, alpha) & 255u;
}
uint sourceRgba8AddChannel(uint source, uint destination, uint sa, uint da, uint alpha) {
  return sourceRgba8GenericScChannel(source, destination, sa, da, alpha, min(255u, source+destination));
}
uint sourceRgba8GenericScModeChannel(uint mode, uint source, uint destination, uint sa, uint da, uint alpha) {
  uint cf = mode == 1u ? min(255u, source+destination) : sourceRgba8SeparableChannel(mode, source, destination);
  return sourceRgba8GenericScChannel(source, destination, sa, da, alpha, cf);
}
uvec4 sourceCompositeRgba8(uvec4 source, uvec4 destination, SourceRgba8CompositeControl control) {
  uint da = destination.a;
  if (control.mode == 0u) {
    uint sa = control.hasMask ? sourceRgba8Multiply3(control.mask, source.a, control.opacity)
      : sourceRgba8Multiply(source.a, control.opacity);
    if (sa == 0u) return destination;
    uint alpha = da + sourceRgba8Multiply(255u-da, sa);
    uint factor = da == 255u ? sa : da == 0u ? 255u : sourceRgba8Divide(sa, alpha);
    return uvec4(sourceRgba8Blend(source.r,destination.r,factor),
      sourceRgba8Blend(source.g,destination.g,factor), sourceRgba8Blend(source.b,destination.b,factor), alpha);
  }
  if (control.mode == 2u) {
    uint masked = control.hasMask ? sourceRgba8Multiply(control.mask, source.a) : source.a;
    uint sa = sourceRgba8Multiply(masked, control.opacity);
    uint full;
    if (control.average > control.opacity) {
      full = control.average > da ? sourceRgba8Blend(control.average, sa, sourceRgba8Divide(da, control.average)) : da;
    } else {
      full = control.opacity > da ? sourceRgba8Blend(control.opacity, da, masked) : da;
    }
    uint alpha = control.flowIsOne ? full : sourceRgba8Blend(full, da, control.flow);
    return uvec4(da == 0u ? source.r : sourceRgba8Blend(source.r,destination.r,sa),
      da == 0u ? source.g : sourceRgba8Blend(source.g,destination.g,sa),
      da == 0u ? source.b : sourceRgba8Blend(source.b,destination.b,sa), alpha);
  }
  // Valid host-preflight generic SC modes1/3/4/5/6 only.
  uint sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0u) return destination;
  uint alpha = sa + da - sourceRgba8Multiply(sa, da);
  return uvec4(sourceRgba8GenericScModeChannel(control.mode,source.r,destination.r,sa,da,alpha),
    sourceRgba8GenericScModeChannel(control.mode,source.g,destination.g,sa,da,alpha),
    sourceRgba8GenericScModeChannel(control.mode,source.b,destination.b,sa,da,alpha), alpha);
}
`;

/** Isolated portable float32 point operator. It does not implement hardware
 * reciprocal estimates or packet-wide SIMD shortcuts of Krita's factory.
 * Source/destination are straight bytes; opacity stays float32 at this stage.
 * Caller declares highp float/int; output belongs in an integer byte target.
 */
export const SOURCE_RGBA8_PORTABLE_OVER_GLSL = /* glsl */ `
uvec4 sourcePortableF32Over(uvec4 source, uvec4 destination, float opacity, uint mask, bool hasMask) {
  float reciprocalByte = uintBitsToFloat(0x3b808081u);
  float sourceAlpha = float(source.a) * opacity;
  if (hasMask) {
    float maskFactor = float(mask) * reciprocalByte;
    sourceAlpha = sourceAlpha * maskFactor;
  }
  if (sourceAlpha == 0.0) return destination;
  float alpha = float(destination.a);
  float factor;
  if (destination.a == 255u) factor = sourceAlpha * reciprocalByte;
  else if (destination.a == 0u) { alpha = sourceAlpha; factor = 1.0; }
  else {
    float remaining = 255.0 - alpha;
    float dose = remaining * sourceAlpha;
    float normalized = dose * reciprocalByte;
    alpha = alpha + normalized;
    factor = sourceAlpha / alpha;
  }
  uvec3 rgb;
  if (factor == 1.0) rgb = source.rgb;
  else if (factor == 0.0) rgb = destination.rgb;
  else {
    vec3 difference = vec3(source.rgb) - vec3(destination.rgb);
    vec3 product = difference * factor;
    vec3 value = product + vec3(destination.rgb);
    rgb = uvec3(roundEven(value));
  }
  return uvec4(rgb, uint(roundEven(alpha)));
}
`;
