import { BRUSH_BLEND_MODES, isBrushBehavior, type BrushBlendMode } from './brushBehavior.js'

export type FilterComposite192 = 'copy' | 'erase' | BrushBlendMode
export interface FilterMask192Policy {
  maskPolicy: 'native-dab-v1'
  sourcePolicy: 'canonical-begin-v1'
  smudgeMode: boolean
  composite: FilterComposite192
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).every(k => names.includes(k))
const number = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const flat = (v: unknown) => Array.isArray(v) && v.length >= 2 && v.every(p => Array.isArray(p) && p.length === 2 && number(p[0], 0, 1) && p[1] === 1)
export function isFilterComposite192(v: unknown): v is FilterComposite192 {
  return v === 'copy' || v === 'erase' || (BRUSH_BLEND_MODES as readonly unknown[]).includes(v)
}
/** One filter payload for the existing five kernels. COPY/OVER source updates
 * and destination compositing are independent; neither changes the kernel. */
export function isFilterMask192Payload(v: unknown): boolean {
  if (!obj(v) || v.maskPolicy !== 'native-dab-v1' || v.sourcePolicy !== 'canonical-begin-v1' || typeof v.smudgeMode !== 'boolean' || !isFilterComposite192(v.composite)) return false
  const common = ['version', 'kind', 'maskPolicy', 'sourcePolicy', 'smudgeMode', 'composite']
  if (v.kind === 'invert') return v.version === 2 && keys(v, common)
  if (v.kind === 'desaturate') return v.version === 2 && keys(v, [...common, 'type']) && Number.isInteger(v.type) && number(v.type, 0, 5)
  if (v.kind === 'posterize') return v.version === 2 && keys(v, [...common, 'steps']) && Number.isInteger(v.steps) && number(v.steps, 2, 128)
  if (v.version !== 1 || !keys(v, [...common, 'radiusX', 'radiusY', 'amount', 'threshold', 'lightnessOnly', 'spatialPolicy']) || !number(v.radiusX, 0, 16) || !number(v.radiusY, 0, 16)) return false
  if (v.kind === 'gaussian') return v.spatialPolicy === 'gaussian-halo-v1' && v.amount === .5 && v.threshold === 0 && v.lightnessOnly === true
  return v.kind === 'unsharp' && v.spatialPolicy === 'unsharp-lab-halo-v1' && v.radiusY === v.radiusX && number(v.amount, 0, 5) && Number.isInteger(v.threshold) && number(v.threshold, 0, 255) && typeof v.lightnessOnly === 'boolean'
}
/** Native FilterOp exposes Size/Rotation/Mirror and static painter opacity.
 * Its alpha8 dab is baked by the importer: IMAGE uses GrayA * alpha, never RGB
 * paint. Pixel-only Flow/Dual/Scatter/Softness/Sharpness are not inherited.
 * Full library validation still owns every asset/profile/GIH numeric field. */
export function hasFilterMask192Scope(v: unknown): boolean {
  if (!obj(v) || v.version !== 192 || v.model !== 'mixer' || v.category !== 'wet' || v.paperInteraction !== 0 || !isFilterMask192Payload(v.filter) || !obj(v.tip) || !obj(v.behavior) || !obj(v.mixer)) return false
  if (['wet', 'scatter', 'spray', 'sketch', 'bristle', 'curveTrace', 'hatching', 'grid', 'particle', 'experiment', 'deform', 'clone', 'mypaint', 'tangentNormal'].some(k => v[k] !== undefined)) return false
  const t = v.tip, b = v.behavior, m = v.mixer
  if (!['round', 'procedural', 'bitmap'].includes(String(t.kind)) || !keys(t, ['kind', 'mask', 'maskBounds', 'hardness', 'aspect', 'rotation', 'angle', 'profile', 'animation', 'imageSampling', 'autoNoise', 'autoShape', 'alphaThreshold'])) return false
  if (!isBrushBehavior(b) || !keys(b, ['version', 'rendering', 'spacing', 'rotation', 'strokeInput', 'speedInput', 'sequentialRandom', 'clockRead', 'dynamics', 'modulations', 'mirror'])) return false
  for (const field of ['dynamics', 'modulations']) if (b[field] !== undefined && (!obj(b[field]) || !keys(b[field], ['size', 'angle', 'grainDepth']))) return false
  const r = b.rendering
  if (!obj(r) || !keys(r, ['mode', 'accumulation', 'blendMode', 'wetEdges', 'burntEdges', 'burntEdgesMode', 'opacityCeiling']) || r.mode !== 'buildUp' || r.accumulation !== 'directOver' || r.blendMode !== 'normal' || r.wetEdges !== 0 || r.burntEdges !== 0 || r.burntEdgesMode !== 'multiply') return false
  if (!keys(m, ['load', 'pickup', 'strength', 'initialLoad', 'source']) || m.load !== 0 || m.initialLoad !== 0 || m.pickup !== 1 || m.strength !== 1 || m.source !== 'previousCanvas') return false
  if (v.flow !== 1 || v.flowPer !== 'stamp' || !flat(v.flowByPressure) || !flat(v.opacityByPressure)) return false
  if (v.texture !== undefined) {
    const x = v.texture
    if (!obj(x) || x.material !== undefined || x.eraseId !== undefined || !obj(x.application) || !keys(x.application, ['mode', 'soft']) || typeof x.application.soft !== 'boolean' || !['multiply', 'subtract', 'darken', 'overlay', 'linearDodge', 'linearBurn', 'colorDodge', 'colorBurn', 'hardMixPhotoshop', 'hardMixSofterPhotoshop', 'height', 'linearHeight', 'heightPhotoshop', 'linearHeightPhotoshop'].includes(String(x.application.mode))) return false
  }
  return true
}
