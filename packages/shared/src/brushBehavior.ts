/** Optional v2 semantics. Absence keeps every historical brush pixel-compatible. */
import type { BrushDescriptor } from './brushes.js'

export type BrushBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colorBurn' | 'linearBurn' | 'colorDodge' | 'add' | 'subtract' | 'difference' | 'exclusion'
export type BrushControl = 'off' | 'pressure' | 'tilt' | 'speed' | 'fade' | 'direction' | 'initialDirection'
export interface BrushDynamic {
  control: BrushControl
  jitter: number
  minimum: number
  /** Distance in brush diameters. */
  fade?: number
}
export type BrushDynamicTarget = 'size' | 'angle' | 'roundness' | 'scatter' | 'count' | 'flow' | 'opacity' | 'hue' | 'saturation' | 'brightness' | 'grainDepth'
export interface BrushBehavior {
  version: 2
  rotation?: { follow: number; random: 'none' | 'stroke' | 'stamp'; flipX?: boolean; flipY?: boolean }
  scatter?: { countJitter: number; bothAxes: boolean; roundnessJitter?: number }
  dynamics?: Partial<Record<BrushDynamicTarget, BrushDynamic>>
  grain?: {
    mode: 'canvas' | 'moving'; movement: number; zoom: number; rotation: number
    offsetJitter: boolean; brightness: number; contrast: number
    depthMinimum: number; depthJitter: number; blendMode: BrushBlendMode
  }
  rendering?: {
    mode: 'lightGlaze' | 'uniformGlaze' | 'intenseGlaze' | 'heavyGlaze' | 'uniformBlend' | 'intenseBlend' | 'buildUp'
    blendMode: BrushBlendMode; wetEdges: number; burntEdges: number; burntEdgesMode: BrushBlendMode
    luminance?: boolean
  }
  wetMix?: { dilution: number; charge: number; attack: number; pull: number; grade: number; blur: number; blurJitter: number; wetnessJitter: number }
  taper?: { start: number; end: number; size: number; opacity: number; pressure: boolean }
  /** One secondary component; nested dual brushes are rejected. */
  dual?: { brush: BrushDescriptor; blendMode: BrushBlendMode }
}
export interface BrushCompatibility {
  feature: string
  status: 'supported' | 'approximate' | 'unsupported'
  detail: string
}
export interface BrushImportJob {
  id: string
  status: 'queued' | 'running' | 'complete' | 'failed'
  library?: import('./brushes.js').BrushLibrary
  error?: string
}

export const BRUSH_BLEND_MODES: readonly BrushBlendMode[] = ['normal','multiply','screen','overlay','darken','lighten','colorBurn','linearBurn','colorDodge','add','subtract','difference','exclusion']

/** Fail closed, including unknown keys, before a descriptor reaches the GPU. */
export function isBrushBehavior(value: unknown): value is BrushBehavior {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const n = (v: unknown, min = 0, max = 1): boolean => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  const keys = (v: Record<string, unknown>, allowed: string[]): boolean => Object.keys(v).every(k => allowed.includes(k))
  const blend = (v: unknown): boolean => BRUSH_BLEND_MODES.includes(v as BrushBlendMode)
  if (!obj(value) || value.version !== 2 || !keys(value,['version','rotation','scatter','dynamics','grain','rendering','wetMix','taper','dual'])) return false
  const r=value.rotation
  if (r !== undefined && (!obj(r) || !keys(r,['follow','random','flipX','flipY']) || !n(r.follow,-1,1) || !['none','stroke','stamp'].includes(String(r.random)) || ['flipX','flipY'].some(k => r[k] !== undefined && typeof r[k] !== 'boolean'))) return false
  const s=value.scatter
  if (s !== undefined && (!obj(s) || !keys(s,['countJitter','bothAxes','roundnessJitter']) || !n(s.countJitter) || typeof s.bothAxes !== 'boolean' || (s.roundnessJitter !== undefined && !n(s.roundnessJitter)))) return false
  const d=value.dynamics
  if (d !== undefined && (!obj(d) || !keys(d,['size','angle','roundness','scatter','count','flow','opacity','hue','saturation','brightness','grainDepth']) || !Object.values(d).every(v => obj(v) && keys(v,['control','jitter','minimum','fade']) && ['off','pressure','tilt','speed','fade','direction','initialDirection'].includes(String(v.control)) && n(v.jitter) && n(v.minimum) && (v.fade === undefined || n(v.fade,0.001,100000))))) return false
  const g=value.grain
  if (g !== undefined && (!obj(g) || !keys(g,['mode','movement','zoom','rotation','offsetJitter','brightness','contrast','depthMinimum','depthJitter','blendMode']) || !['canvas','moving'].includes(String(g.mode)) || !n(g.movement) || !n(g.zoom) || !n(g.rotation,-1,1) || typeof g.offsetJitter !== 'boolean' || !n(g.brightness,-1,1) || !n(g.contrast,-1,1) || !n(g.depthMinimum) || !n(g.depthJitter) || !blend(g.blendMode))) return false
  const render=value.rendering
  if (render !== undefined && (!obj(render) || !keys(render,['mode','blendMode','wetEdges','burntEdges','burntEdgesMode','luminance']) || !['lightGlaze','uniformGlaze','intenseGlaze','heavyGlaze','uniformBlend','intenseBlend','buildUp'].includes(String(render.mode)) || !blend(render.blendMode) || !n(render.wetEdges) || !n(render.burntEdges) || !blend(render.burntEdgesMode) || (render.luminance !== undefined && typeof render.luminance !== 'boolean'))) return false
  const w=value.wetMix
  const wetKeys=['dilution','charge','attack','pull','grade','blur','blurJitter','wetnessJitter']
  if (w !== undefined && (!obj(w) || !keys(w,wetKeys) || !wetKeys.every(k => n(w[k])))) return false
  const t=value.taper
  if (t !== undefined && (!obj(t) || !keys(t,['start','end','size','opacity','pressure']) || !n(t.start) || !n(t.end) || !n(t.size) || !n(t.opacity) || typeof t.pressure !== 'boolean')) return false
  if (value.dual !== undefined && (!obj(value.dual) || !keys(value.dual,['brush','blendMode']) || !obj(value.dual.brush) || !blend(value.dual.blendMode))) return false
  return true
}
