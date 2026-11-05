import type { BrushTip } from '@grafetto/shared'

/** Per-dab control scales source threshold strength, never mask alpha/softness.
 * No option means identity, preserving static and historical descriptors. */
export function brushAlphaThresholdValue(settings?: BrushTip['alphaThreshold'], scale = 1): number {
  return Math.max(0, Math.min(1, (settings?.value ?? 0) * scale))
}

/** Independently expressed U8 mask operation, before texture/flow/opacity.
 * Krita bd6e8d0 KisSharpnessOption::applyThreshold; normalized softness=percent/100.
 * Quantize the sampled mask to its native alpha byte before thresholding.
 */
export function brushAlphaThreshold(alpha: number, settings?: BrushTip['alphaThreshold']): number {
  if (!settings) return alpha
  const byte = Math.floor(Math.max(0, Math.min(1, alpha)) * 255 + .5)
  const tolerance = Math.floor(255 - settings.value * 255)
  if (byte > tolerance) return 1
  return byte <= (1 - settings.softness) * tolerance ? 0 : byte / 255
}

export const BRUSH_ALPHA_THRESHOLD_GLSL = `
float brushAlphaThreshold(float alpha, vec3 settings) {
  if(settings.z<0.5) return alpha;
  float value=floor(clamp(alpha,0.0,1.0)*255.0+0.5);
  float tolerance=floor(255.0-settings.x*255.0);
  if(value>tolerance) return 1.0;
  return value<=(1.0-settings.y)*tolerance ? 0.0 : value/255.0;
}
`
