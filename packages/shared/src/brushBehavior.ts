import { isBrushCurve, type BrushCurve } from './brushCurves.js'
/** Shared brush behavior schema; built-in defaults are normalized by the engine. */
import type { BrushDescriptor } from './brushes.js'

export type BrushBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colorBurn' | 'linearBurn' | 'colorDodge' | 'add' | 'subtract' | 'difference' | 'exclusion' | 'softLight' | 'hardLight' | 'divide' | 'linearLight' | 'vividLight' | 'pinLight' | 'hardMix' | 'darkerColor' | 'lighterColor' | 'hue' | 'saturation' | 'color' | 'luminosity'
export type BrushControl = 'off' | 'pressure' | 'tilt' | 'speed' | 'fade' | 'direction' | 'initialDirection' | 'tiltElevation' | 'tiltX' | 'tiltY' | 'azimuth'
export interface BrushDynamic {
  control: BrushControl
  jitter: number
  minimum: number
  /** Distance in brush diameters. */
  fade?: number
  /** Normalized sparse points or bounded uniform response samples. */
  curve?: BrushCurve
  /** Signed influence; absent retains historical v2 dynamics. */
  strength?: number
}
export type BrushDynamicTarget = 'size' | 'angle' | 'roundness' | 'scatter' | 'count' | 'flow' | 'opacity' | 'hue' | 'saturation' | 'brightness' | 'grainDepth'
export interface BrushBehavior {
  version: 2
  /** Krita auto spacing uses coefficient * sqrt(actual diameter), linear below 1px. */
  spacing?: { mode: 'kritaAuto'; coefficient: number }
  /** Independent shape-edge softening; never controls canvas colour pickup. */
  edgeBleed?: { pressure: number; tilt: number; pressureCurve?: BrushCurve }
  erase?: boolean
  falloff?: number
  rotation?: { follow: number; random: 'none' | 'stroke' | 'stamp'; flipX?: boolean; flipY?: boolean; azimuth?: boolean; projection?: boolean }
  scatter?: { countJitter: number; bothAxes: boolean; roundnessJitter?: number }
  dynamics?: Partial<Record<BrushDynamicTarget, BrushDynamic>>
  modulations?: Partial<Record<BrushDynamicTarget, BrushDynamic[]>>
  grain?: {
    mode: 'canvas' | 'moving'; movement: number; zoom: number; rotation: number
    offsetJitter: boolean; brightness: number; contrast: number
    depthMinimum: number; depthJitter: number; blendMode: BrushBlendMode
  }
  rendering?: {
    mode: 'lightGlaze' | 'uniformGlaze' | 'intenseGlaze' | 'heavyGlaze' | 'uniformBlend' | 'intenseBlend' | 'buildUp'
    blendMode: BrushBlendMode; wetEdges: number; burntEdges: number; burntEdgesMode: BrushBlendMode
    luminance?: boolean
    gammaCorrect?: boolean
  }
  wetMix?: { dilution: number; charge: number; attack: number; pull: number; grade: number; blur: number; blurJitter: number; wetnessJitter: number; dynamics?: Partial<Record<'dilution' | 'attack' | 'pull' | 'grade' | 'blur', BrushDynamic[]>> }
  taper?: { start: number; end: number; size: number; opacity: number; pressure: boolean }
  /** One secondary component; nested dual brushes are rejected. */
  dual?: { brush: BrushDescriptor; blendMode: BrushBlendMode; sampling?: 'independent' }
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

export const BRUSH_BLEND_MODES: readonly BrushBlendMode[] = ['normal','multiply','screen','overlay','darken','lighten','colorBurn','linearBurn','colorDodge','add','subtract','difference','exclusion','softLight','hardLight','divide','linearLight','vividLight','pinLight','hardMix','darkerColor','lighterColor','hue','saturation','color','luminosity']

/** Fail closed, including unknown keys, before a descriptor reaches the GPU. */
export function isBrushBehavior(value: unknown): value is BrushBehavior {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const n = (v: unknown, min = 0, max = 1): boolean => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  const keys = (v: Record<string, unknown>, allowed: string[]): boolean => Object.keys(v).every(k => allowed.includes(k))
  const blend = (v: unknown): boolean => BRUSH_BLEND_MODES.includes(v as BrushBlendMode)
  if (!obj(value) || value.version !== 2 || !keys(value,['version','spacing','edgeBleed','erase','falloff','rotation','scatter','dynamics','modulations','grain','rendering','wetMix','taper','dual'])) return false
  if (value.spacing !== undefined && (!obj(value.spacing) || !keys(value.spacing,['mode','coefficient']) || value.spacing.mode !== 'kritaAuto' || !n(value.spacing.coefficient,0.001,100))) return false
  if(value.erase !== undefined && typeof value.erase !== 'boolean') return false
  if(value.falloff !== undefined && !n(value.falloff)) return false
  const r=value.rotation
  if (r !== undefined && (!obj(r) || !keys(r,['follow','random','flipX','flipY','azimuth','projection']) || !n(r.follow,-1,1) || !['none','stroke','stamp'].includes(String(r.random)) || ['flipX','flipY','azimuth','projection'].some(k => r[k] !== undefined && typeof r[k] !== 'boolean'))) return false
  const s=value.scatter
  if (s !== undefined && (!obj(s) || !keys(s,['countJitter','bothAxes','roundnessJitter']) || !n(s.countJitter) || typeof s.bothAxes !== 'boolean' || (s.roundnessJitter !== undefined && !n(s.roundnessJitter)))) return false
  const edge=value.edgeBleed
  if (edge !== undefined && (!obj(edge) || !keys(edge,['pressure','tilt','pressureCurve']) || !n(edge.pressure,-1,1) || !n(edge.tilt,-1,1) || (edge.pressureCurve !== undefined && !isBrushBehavior({version:2,dynamics:{size:{control:'pressure',minimum:0,jitter:0,curve:edge.pressureCurve}}})))) return false
  const d=value.dynamics
  if (d !== undefined && (!obj(d) || !keys(d,['size','angle','roundness','scatter','count','flow','opacity','hue','saturation','brightness','grainDepth']) || !Object.values(d).every(v => obj(v) && keys(v,['control','jitter','minimum','fade','strength','curve']) && ['off','pressure','tilt','speed','fade','direction','initialDirection','tiltElevation','tiltX','tiltY','azimuth'].includes(String(v.control)) && n(v.jitter) && n(v.minimum) && (v.fade === undefined || n(v.fade,0.001,100000)) && (v.strength === undefined || n(v.strength,-1,1)) && (v.curve === undefined || isBrushCurve(v.curve,1,256,true))))) return false
  const mod=value.modulations
  if (mod !== undefined && (!obj(mod) || !keys(mod,['size','angle','roundness','scatter','count','flow','opacity','hue','saturation','brightness','grainDepth']) || !Object.values(mod).every(list => Array.isArray(list) && list.length <= 4 && list.every(v => isBrushBehavior({version:2,dynamics:{size:v}}))))) return false
  const g=value.grain
  if (g !== undefined && (!obj(g) || !keys(g,['mode','movement','zoom','rotation','offsetJitter','brightness','contrast','depthMinimum','depthJitter','blendMode']) || !['canvas','moving'].includes(String(g.mode)) || !n(g.movement) || !n(g.zoom) || !n(g.rotation,-1,1) || typeof g.offsetJitter !== 'boolean' || !n(g.brightness,-1,1) || !n(g.contrast,-1,1) || !n(g.depthMinimum) || !n(g.depthJitter) || !blend(g.blendMode))) return false
  const render=value.rendering
  if (render !== undefined && (!obj(render) || !keys(render,['mode','blendMode','wetEdges','burntEdges','burntEdgesMode','luminance','gammaCorrect']) || !['lightGlaze','uniformGlaze','intenseGlaze','heavyGlaze','uniformBlend','intenseBlend','buildUp'].includes(String(render.mode)) || !blend(render.blendMode) || !n(render.wetEdges) || !n(render.burntEdges) || !blend(render.burntEdgesMode) || (['luminance','gammaCorrect'].some(k => render[k] !== undefined && typeof render[k] !== 'boolean')))) return false
  const w=value.wetMix
  const wetKeys=['dilution','charge','attack','pull','grade','blur','blurJitter','wetnessJitter']
  if (w !== undefined && (!obj(w) || !keys(w,[...wetKeys,'dynamics']) || !wetKeys.every(k => n(w[k],k==='grade'?-1:0,1)))) return false
  if (obj(w) && w.dynamics !== undefined && (!obj(w.dynamics) || !keys(w.dynamics,['dilution','attack','pull','grade','blur']) || !Object.values(w.dynamics).every(list=>Array.isArray(list)&&list.length<=4&&list.every(v=>isBrushBehavior({version:2,dynamics:{size:v}}))))) return false
  const t=value.taper
  if (t !== undefined && (!obj(t) || !keys(t,['start','end','size','opacity','pressure']) || !n(t.start) || !n(t.end) || !n(t.size) || !n(t.opacity) || typeof t.pressure !== 'boolean')) return false
  if (value.dual !== undefined && (!obj(value.dual) || !keys(value.dual,['brush','blendMode','sampling']) || !obj(value.dual.brush) || !blend(value.dual.blendMode) || (value.dual.sampling !== undefined && value.dual.sampling !== 'independent'))) return false
  return true
}
