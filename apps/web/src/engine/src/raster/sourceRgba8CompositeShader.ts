import type { Rgba8CompositeControl } from '../presets/sourceColorRgba8';

/** Host-resolved bytes; no shader float quantization or implicit mask collapse. */
export interface SourceRgba8CompositeBytes {
  readonly mode: 0 | 1 | 2; // Over, Add, creamy AlphaDarken
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
  const mode = control.mode === 'over' ? 0 : control.mode === 'add' ? 1 : control.mode === 'alphaDarken' ? 2 : undefined;
  if (mode === undefined) throw new RangeError('Unknown RGBA8 composite mode');
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
uint sourceRgba8AddChannel(uint source, uint destination, uint sa, uint da, uint alpha) {
  uint sum = min(255u, source + destination);
  if (da == 0u) return source;
  if (da == 255u) return sourceRgba8Blend(sum, destination, sa);
  if (sa == 255u) return sourceRgba8Blend(sum, source, da);
  uint premultiplied = (sourceRgba8Multiply3(255u-sa, da, destination)
    + sourceRgba8Multiply3(255u-da, sa, source)
    + sourceRgba8Multiply3(da, sa, sum)) & 255u;
  return sourceRgba8Divide(premultiplied, alpha) & 255u;
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
  // Valid host-preflight mode1 only. No undefined-mode fallback contract.
  uint sa = sourceRgba8Multiply3(source.a, control.mask, control.opacity);
  if (sa == 0u) return destination;
  uint alpha = sa + da - sourceRgba8Multiply(sa, da);
  return uvec4(sourceRgba8AddChannel(source.r,destination.r,sa,da,alpha),
    sourceRgba8AddChannel(source.g,destination.g,sa,da,alpha),
    sourceRgba8AddChannel(source.b,destination.b,sa,da,alpha), alpha);
}
`;
