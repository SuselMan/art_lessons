import { isBrushCurve, type BrushCurve } from './brushCurves.js'
/** Shared brush behavior schema; built-in defaults are normalized by the engine. */
import type { BrushDescriptor } from './brushes.js'

export type BrushBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colorBurn' | 'linearBurn' | 'colorDodge' | 'add' | 'subtract' | 'difference' | 'exclusion' | 'softLight' | 'hardLight' | 'divide' | 'linearLight' | 'vividLight' | 'pinLight' | 'hardMix' | 'darkerColor' | 'lighterColor' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'hardMixPhotoshop' | 'kritaHardMix'
export type BrushDualMaskMode=BrushBlendMode|'hardMixSofterPhotoshop'|'hardMixPhotoshopAlpha'
export type BrushControl = 'pressureIn' | 'perspective' | 'barrelRotation' | 'tangentialPressure' | 'off' | 'pressure' | 'tilt' | 'speed' | 'fade' | 'direction' | 'initialDirection' | 'tiltElevation' | 'tiltX' | 'tiltY' | 'azimuth' | 'tiltDirection' | 'random' | 'strokeRandom' | 'dabProgress' | 'time' | 'distance'
export interface BrushDynamic {
  /** Bounded one-level native size-like sensor expression. Leaves retain their own curves. */
  combine?: {mode:'product'|'sum'|'max'|'min'|'difference';scaling:BrushDynamic[];additive:BrushDynamic[];constant?:number;policy?:'native-scatter-v1';absolute?:{locked:boolean;angleOffset:number;curve:BrushCurve}}
  control: BrushControl
  /** Required option-keyed stream for a gesture-constant random sensor. */
  randomStream?: number
  /** Explicit native keyed sensor; mutually exclusive with legacy randomStream. */
  randomSource?: { kind: 'qt5Taus88'; key: string } | { kind: 'grafettoSourceTime-v1'; key: string }
  /** Period in logical emitted dabs for dabProgress, milliseconds for time, world pixels for distance. */
  period?: number
  periodic?: boolean
  jitter: number
  minimum: number
  /** Distance in brush diameters. */
  fade?: number
  /** Normalized sparse points or bounded uniform response samples. */
  curve?: BrushCurve
  /** Signed influence; absent retains historical v2 dynamics. */
  strength?: number
}
export type BrushDynamicTarget = 'size' | 'angle' | 'roundness' | 'scatter' | 'count' | 'flow' | 'opacity' | 'hue' | 'saturation' | 'brightness' | 'grainDepth' | 'sharpness' | 'softness' | 'lightnessStrength'
export interface BrushBehavior {
  version: 2
  /** Explicit per-logical-request XY source. Absence retains legacy coordinate hashing.
   * Recorded sourceSize/sourceScale describe allocation, independently of coverage. */
  sequentialRandom?: { version: 1; kind: 'qt5Taus88'; policy: 'scatterXY' }
  /** Child-only read of an already recorded primary clock; never a timer. */
  clockRead?: { version: 1; source: 'primary' }
  /** Author-side input law. Raw direction and inserted corner requests are logged
   * once; replay must not consult local cursor history or insert them again.
   * Absence preserves the legacy input pipeline. */
  strokeInput?: { version: 1; initialDirection: 'cursorHistory'; fanCorners?: { stepDegrees: number } }
  /** Author distance/time request scheduling. Rate is dabs/second.
   * Version1 admits deterministic pressure/off rate factors only. */
  timing?: { version: 1; rate: number; ignoreDistanceSpacing: boolean; rateDynamics?: BrushDynamic[] }
  /** View/widget coordinates per millisecond; EMA is Grafetto's approximation
   * of the source input estimator. Captured once before geometry, then logged. */
  speedInput?: { version: 1; space: 'view'; maximum: number; estimator: 'grafettoEMA30ms' }
  /** Normalized per-dab HSV adjustment; .5 is neutral, decoded signed [-1,1]. */
  colorAdjustment?: { hue?: BrushDynamic; saturation?: BrushDynamic; value?: BrushDynamic }
  /** Source step axes use actual diameter (or sqrt, linear below 1px).
   * Input responses scale the result before the per-axis .5px floor. */
  /** Axis scale affects source spacing only, independently of padded mask UVs.
   * Static tip rotation can already be baked into these characteristic bounds;
   * angleOffset then removes that rotation from the spacing ellipse. */
  spacing?: { mode: 'kritaAuto' | 'diameter'; coefficient: number; dynamics?: BrushDynamic[]; isotropic?: boolean; axisScale?: { x: number; y: number }; angleOffset?: number }
  /** Independent shape-edge softening; never controls canvas colour pickup. */
  edgeBleed?: { pressure: number; tilt: number; pressureCurve?: BrushCurve }
  erase?: boolean
  falloff?: number
  /** Native standard-mask fade response; absent keeps historical softness1. */
  softness?: number
  mirror?: {horizontal:boolean;vertical:boolean;value:number;dynamics?:BrushDynamic[]}
  rotation?: { follow: number; random: 'none' | 'stroke' | 'stamp'; flipX?: boolean; flipY?: boolean; azimuth?: boolean; projection?: boolean; composition?: { strength:number; additive:BrushDynamic[]; scaling?:BrushDynamic[]; scalingMode?:'product'|'sum'|'max'|'min'|'difference'; absolute?:{locked:boolean;angleOffset:number;curve:BrushCurve} } }
  scatter?: {
    countJitter: number; bothAxes: boolean; roundnessJitter?: number
    /** Uniform signed displacement over a full diameter-scaled radius.
     * Path/normal follow motion independently of tip rotation; xy is a square.
     * Absence retains historical disc/projection placement. */
    placement?: 'pathUniform' | 'normalUniform' | 'xyUniform'
  }
  dynamics?: Partial<Record<BrushDynamicTarget, BrushDynamic>>
  modulations?: Partial<Record<BrushDynamicTarget, BrushDynamic[]>>
  grain?: {
    mode: 'canvas' | 'moving'; movement: number; zoom: number; rotation: number
    offsetJitter: boolean; brightness: number; contrast: number
    depthMinimum: number; depthJitter: number; blendMode: BrushBlendMode
  }
  rendering?: {
    /** Shape attenuation is historical; uniform keeps mask coverage only once. */
    opacityCeiling?: 'shape' | 'uniform'
    /** Physical per-dab alpha, bypassing the historical final stroke ceiling. */
    accumulation?: 'over' | 'directOver' | 'alphaDarken' | 'maxAlpha'
    mode: 'lightGlaze' | 'uniformGlaze' | 'intenseGlaze' | 'heavyGlaze' | 'uniformBlend' | 'intenseBlend' | 'buildUp'
    blendMode: BrushBlendMode; wetEdges: number; burntEdges: number; burntEdgesMode: BrushBlendMode
    luminance?: boolean
    gammaCorrect?: boolean
  }
  wetMix?: { dilution: number; charge: number; attack: number; pull: number; grade: number; blur: number; blurJitter: number; wetnessJitter: number; dynamics?: Partial<Record<'dilution' | 'attack' | 'pull' | 'grade' | 'blur', BrushDynamic[]>> }
  taper?: { start: number; end: number; size: number; opacity: number; pressure: boolean }
  /** One secondary component; nested dual brushes are rejected. */
  dual?: { brush: BrushDescriptor; blendMode: BrushDualMaskMode; sampling?: 'independent'; sizePolicy?: {kind:'resource';diameter:number} }
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

export const BRUSH_BLEND_MODES: readonly BrushBlendMode[] = ['normal','multiply','screen','overlay','darken','lighten','colorBurn','linearBurn','colorDodge','add','subtract','difference','exclusion','softLight','hardLight','divide','linearLight','vividLight','pinLight','hardMix','darkerColor','lighterColor','hue','saturation','color','luminosity','hardMixPhotoshop','kritaHardMix']

/** Fail closed, including unknown keys, before a descriptor reaches the GPU. */
export function isBrushBehavior(value: unknown): value is BrushBehavior {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const n = (v: unknown, min = 0, max = 1): boolean => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  const keys = (v: Record<string, unknown>, allowed: string[]): boolean => Object.keys(v).every(k => allowed.includes(k))
  const blend = (v: unknown): boolean => BRUSH_BLEND_MODES.includes(v as BrushBlendMode)
  if (!obj(value) || value.version !== 2 || !keys(value,['version','clockRead','sequentialRandom','strokeInput','timing','speedInput','colorAdjustment','spacing','edgeBleed','erase','falloff','softness','mirror','rotation','scatter','dynamics','modulations','grain','rendering','wetMix','taper','dual'])) return false
  // Extended composition is not a grain, dual, wet-edge or wet-mix operator.
  if([value.grain,value.dual,value.wetMix].some(v=>obj(v)&&Object.values(v).some(mode=>mode==='hardMixPhotoshop'||mode==='kritaHardMix')) || obj(value.rendering)&&(value.rendering.burntEdgesMode==='hardMixPhotoshop'||value.rendering.burntEdgesMode==='kritaHardMix'))return false
  const clock=value.clockRead
  if(clock!==undefined&&(!obj(clock)||!keys(clock,['version','source'])||clock.version!==1||clock.source!=='primary'))return false
  const random=value.sequentialRandom
  if(random!==undefined && (!obj(random)||!keys(random,['version','kind','policy'])||random.version!==1||random.kind!=='qt5Taus88'||random.policy!=='scatterXY'))return false
  const input=value.strokeInput
  if(input!==undefined){
    if(!obj(input)||!keys(input,['version','initialDirection','fanCorners'])||input.version!==1||input.initialDirection!=='cursorHistory')return false
    const fan=input.fanCorners
    if(fan!==undefined&&(!obj(fan)||!keys(fan,['stepDegrees'])||!n(fan.stepDegrees,5,90)||!Number.isInteger(fan.stepDegrees)))return false
  }
  const timing=value.timing
  if(timing!==undefined){
    if(!obj(timing)||!keys(timing,['version','rate','ignoreDistanceSpacing','rateDynamics'])||timing.version!==1||!n(timing.rate,0,1000)||typeof timing.ignoreDistanceSpacing!=='boolean')return false
    const factors=timing.rateDynamics
    const rateLeaf=(d:unknown):boolean=>obj(d)&&d.jitter===0&&(['pressure','off'].includes(String(d.control))||d.control==='random'&&obj(d.randomSource)&&d.randomSource.kind==='grafettoSourceTime-v1')
    const rateControl=(d:unknown):boolean=>obj(d)&&isBrushBehavior({version:2,dynamics:{size:d}})&&(obj(d.combine)?d.combine.absolute===undefined&&Array.isArray(d.combine.scaling)&&Array.isArray(d.combine.additive)&&[...d.combine.scaling,...d.combine.additive].every(rateLeaf)&&[...d.combine.scaling,...d.combine.additive].some(v=>obj(v)&&v.control==='random'&&obj(v.randomSource)&&v.randomSource.kind==='grafettoSourceTime-v1'):rateLeaf(d))
    if(factors!==undefined&&(!Array.isArray(factors)||factors.length<1||factors.length>4||!factors.every(rateControl)))return false
  }
  const speed=value.speedInput
  if(speed!==undefined && (!obj(speed)||!keys(speed,['version','space','maximum','estimator'])||speed.version!==1||speed.space!=='view'||!n(speed.maximum,.001,1000)||speed.estimator!=='grafettoEMA30ms'))return false
  if (value.spacing !== undefined && (!obj(value.spacing) || !keys(value.spacing,['mode','coefficient','dynamics','isotropic','axisScale','angleOffset'])
    || !['kritaAuto','diameter'].includes(String(value.spacing.mode)) || !n(value.spacing.coefficient,value.spacing.mode==='diameter'?0:.001,100)
    || (value.spacing.isotropic !== undefined && typeof value.spacing.isotropic !== 'boolean')
    || (value.spacing.axisScale !== undefined && (!obj(value.spacing.axisScale) || !keys(value.spacing.axisScale,['x','y']) || !n(value.spacing.axisScale.x,Number.MIN_VALUE,2) || !n(value.spacing.axisScale.y,Number.MIN_VALUE,2)))
    || (value.spacing.angleOffset !== undefined && !n(value.spacing.angleOffset,-Math.PI,Math.PI))
    || (value.spacing.dynamics !== undefined && !isBrushBehavior({version:2,modulations:{flow:value.spacing.dynamics}})))) return false
  if(value.erase !== undefined && typeof value.erase !== 'boolean') return false
  if(value.falloff !== undefined && !n(value.falloff)) return false
  if(value.softness !== undefined && !n(value.softness)) return false
  const color=value.colorAdjustment
  if(color!==undefined && (!obj(color) || !keys(color,['hue','saturation','value']) || !Object.values(color).every(v=>isBrushBehavior({version:2,dynamics:{size:v}})))) return false
  const mirror=value.mirror
  if(mirror!==undefined&&(!obj(mirror)||!keys(mirror,['horizontal','vertical','value','dynamics'])||typeof mirror.horizontal!=='boolean'||typeof mirror.vertical!=='boolean'||!mirror.horizontal&&!mirror.vertical||!n(mirror.value)||(mirror.dynamics!==undefined&&(!Array.isArray(mirror.dynamics)||mirror.dynamics.length>4||!mirror.dynamics.every(d=>isBrushBehavior({version:2,dynamics:{size:d}}))))))return false
  const r=value.rotation
  if (r !== undefined && (!obj(r) || !keys(r,['follow','random','flipX','flipY','azimuth','projection','composition']) || !n(r.follow,-1,1) || !['none','stroke','stamp'].includes(String(r.random)) || ['flipX','flipY','azimuth','projection'].some(k => r[k] !== undefined && typeof r[k] !== 'boolean'))) return false
  if(obj(r) && r.composition!==undefined) {
    const c=r.composition
    if(!obj(c)||!keys(c,['strength','additive','scaling','scalingMode','absolute'])||!n(c.strength,-1,1)||!Array.isArray(c.additive))return false
    if(c.scaling!==undefined&&!Array.isArray(c.scaling))return false
    const scaling=Array.isArray(c.scaling)?c.scaling:[],children=[...c.additive,...scaling]
    if((children.length<1&&c.absolute===undefined)||children.length>16||(c.scalingMode!==undefined&&!['product','sum','max','min','difference'].includes(String(c.scalingMode)))||!children.every(d=>isBrushBehavior({version:2,dynamics:{angle:d}})))return false
    const absolute=c.absolute
    if(absolute!==undefined&&(value.strokeInput===undefined||!obj(absolute)||!keys(absolute,['locked','angleOffset','curve'])||typeof absolute.locked!=='boolean'||!n(absolute.angleOffset,-360,360)||!isBrushCurve(absolute.curve,1,256,true)))return false
  }
  const s=value.scatter
  if (s !== undefined && (!obj(s) || !keys(s,['countJitter','bothAxes','roundnessJitter','placement']) || !n(s.countJitter) || typeof s.bothAxes !== 'boolean' || (s.roundnessJitter !== undefined && !n(s.roundnessJitter))
    || (s.placement !== undefined && (!['pathUniform','normalUniform','xyUniform'].includes(String(s.placement)) || s.bothAxes !== (s.placement === 'xyUniform'))))) return false
  const edge=value.edgeBleed
  if (edge !== undefined && (!obj(edge) || !keys(edge,['pressure','tilt','pressureCurve']) || !n(edge.pressure,-1,1) || !n(edge.tilt,-1,1) || (edge.pressureCurve !== undefined && !isBrushBehavior({version:2,dynamics:{size:{control:'pressure',minimum:0,jitter:0,curve:edge.pressureCurve}}})))) return false
  const d=value.dynamics
  if (d !== undefined && (!obj(d) || !keys(d,['size','angle','roundness','scatter','count','flow','opacity','hue','saturation','brightness','grainDepth','sharpness','softness','lightnessStrength']) || !Object.values(d).every(v => isCombinedBrushDynamic(v) || obj(v) && keys(v,['control','randomStream','randomSource','period','periodic','jitter','minimum','fade','strength','curve']) && ['pressureIn','perspective','barrelRotation','tangentialPressure','off','pressure','tilt','speed','fade','direction','initialDirection','tiltElevation','tiltX','tiltY','azimuth','tiltDirection','random','strokeRandom','dabProgress','time','distance'].includes(String(v.control)) && (v.control==='strokeRandom' ? (v.randomSource===undefined ? n(v.randomStream,0,4294967295) && Number.isInteger(v.randomStream) : v.randomStream===undefined && obj(v.randomSource) && keys(v.randomSource,['kind','key']) && v.randomSource.kind==='qt5Taus88' && typeof v.randomSource.key==='string' && v.randomSource.key.length>=1 && v.randomSource.key.length<=128 && !v.randomSource.key.includes('\0')) : v.randomStream===undefined && (v.randomSource===undefined || v.control==='random' && obj(v.randomSource) && keys(v.randomSource,['kind','key']) && v.randomSource.kind==='grafettoSourceTime-v1' && typeof v.randomSource.key==='string' && v.randomSource.key.length>=1 && v.randomSource.key.length<=128 && !v.randomSource.key.includes('\0'))) && (v.control==='dabProgress'||v.control==='time'||v.control==='distance' ? n(v.period,1,v.control!=='dabProgress'?2147483647:1000000) && Number.isInteger(v.period) && typeof v.periodic==='boolean' : v.period===undefined && v.periodic===undefined) && n(v.jitter) && n(v.minimum) && (v.fade === undefined || n(v.fade,0.001,100000)) && (v.strength === undefined || n(v.strength,-1,1)) && (v.curve === undefined || isBrushCurve(v.curve,1,256,true))))) return false
  const mod=value.modulations
  if (mod !== undefined && (!obj(mod) || !keys(mod,['size','angle','roundness','scatter','count','flow','opacity','hue','saturation','brightness','grainDepth','sharpness','softness','lightnessStrength']) || !Object.values(mod).every(list => Array.isArray(list) && list.length <= 4 && list.every(v => isBrushBehavior({version:2,dynamics:{size:v}}))))) return false
  const g=value.grain
  if (g !== undefined && (!obj(g) || !keys(g,['mode','movement','zoom','rotation','offsetJitter','brightness','contrast','depthMinimum','depthJitter','blendMode']) || !['canvas','moving'].includes(String(g.mode)) || !n(g.movement) || !n(g.zoom) || !n(g.rotation,-1,1) || typeof g.offsetJitter !== 'boolean' || !n(g.brightness,-1,1) || !n(g.contrast,-1,1) || !n(g.depthMinimum) || !n(g.depthJitter) || !blend(g.blendMode))) return false
  const render=value.rendering
  if (render !== undefined && (!obj(render) || !keys(render,['accumulation','opacityCeiling','mode','blendMode','wetEdges','burntEdges','burntEdgesMode','luminance','gammaCorrect']) || !['lightGlaze','uniformGlaze','intenseGlaze','heavyGlaze','uniformBlend','intenseBlend','buildUp'].includes(String(render.mode)) || (render.accumulation!==undefined && (!['over','directOver','alphaDarken','maxAlpha'].includes(String(render.accumulation)) || render.mode!=='buildUp' || value.taper!==undefined)) || (render.opacityCeiling!==undefined && !['shape','uniform'].includes(String(render.opacityCeiling))) || !blend(render.blendMode) || !n(render.wetEdges) || !n(render.burntEdges) || !blend(render.burntEdgesMode) || (['luminance','gammaCorrect'].some(k => render[k] !== undefined && typeof render[k] !== 'boolean')))) return false
  const w=value.wetMix
  const wetKeys=['dilution','charge','attack','pull','grade','blur','blurJitter','wetnessJitter']
  if (w !== undefined && (!obj(w) || !keys(w,[...wetKeys,'dynamics']) || !wetKeys.every(k => n(w[k],k==='grade'?-1:0,1)))) return false
  if (obj(w) && w.dynamics !== undefined && (!obj(w.dynamics) || !keys(w.dynamics,['dilution','attack','pull','grade','blur']) || !Object.values(w.dynamics).every(list=>Array.isArray(list)&&list.length<=4&&list.every(v=>isBrushBehavior({version:2,dynamics:{size:v}}))))) return false
  const t=value.taper
  if (t !== undefined && (!obj(t) || !keys(t,['start','end','size','opacity','pressure']) || !n(t.start) || !n(t.end) || !n(t.size) || !n(t.opacity) || typeof t.pressure !== 'boolean')) return false
  if (value.dual !== undefined && (!obj(value.dual) || !keys(value.dual,['brush','blendMode','sampling','sizePolicy']) || !obj(value.dual.brush) || !(blend(value.dual.blendMode)||value.dual.blendMode==='hardMixSofterPhotoshop'||value.dual.blendMode==='hardMixPhotoshopAlpha') || (value.dual.sampling !== undefined && value.dual.sampling !== 'independent') || (value.dual.sizePolicy!==undefined&&(!obj(value.dual.sizePolicy)||!keys(value.dual.sizePolicy,['kind','diameter'])||value.dual.sizePolicy.kind!=='resource'||!n(value.dual.sizePolicy.diameter,.01,10000))))) return false
  return true
}

/** Nonrecursive expression contract; reject nested trees before validating leaves. */
function isCombinedBrushDynamic(value:unknown):boolean {
  const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
  const keys=(v:Record<string,unknown>,allowed:string[]):boolean=>Object.keys(v).every(k=>allowed.includes(k))
  if(!obj(value)||!keys(value,['control','minimum','jitter','combine'])||value.control!=='off'||value.minimum!==0||value.jitter!==0||!obj(value.combine))return false
  const c=value.combine
  if(!keys(c,['mode','scaling','additive','constant','absolute','policy'])||!['product','sum','max','min','difference'].includes(String(c.mode))||!Array.isArray(c.scaling)||!Array.isArray(c.additive))return false
  if(c.policy!==undefined&&c.policy!=='native-scatter-v1')return false
  if(c.constant!==undefined&&(typeof c.constant!=='number'||!Number.isFinite(c.constant)||c.constant<0||c.constant>(c.policy==='native-scatter-v1'?4:1)))return false
  const absolute=c.absolute
  if(absolute!==undefined&&(!obj(absolute)||!keys(absolute,['locked','angleOffset','curve'])||typeof absolute.locked!=='boolean'||typeof absolute.angleOffset!=='number'||!Number.isFinite(absolute.angleOffset)||Math.abs(absolute.angleOffset)>360||!isBrushCurve(absolute.curve,1,256,true)))return false
  const children=[...c.scaling,...c.additive]
  return (children.length>=1||absolute!==undefined)&&children.length<=16&&children.every(child=>obj(child)&&child.combine===undefined&&isBrushBehavior({version:2,dynamics:{size:child}}))
}

/** Closed checked native Rate shared by the special-family author clocks.
 * Generic Pixel timing retains its wider existing validator above. */
export function isNativePressureRateTiming(value:unknown,allowFactors=false):value is NonNullable<BrushBehavior['timing']>{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
 if(!obj(value)||Object.keys(value).some(k=>!['version','rate','ignoreDistanceSpacing','rateDynamics'].includes(k))||value.version!==1||typeof value.rate!=='number'||!Number.isFinite(value.rate)||value.rate<=0||value.rate>1000||value.ignoreDistanceSpacing!==false)return false
 if(!('rateDynamics'in value))return true
 const controls=value.rateDynamics
 return allowFactors&&Array.isArray(controls)&&controls.length>=1&&controls.length<=4&&controls.every(control=>obj(control)&&['pressure','off'].includes(String(control.control))&&control.jitter===0&&control.combine===undefined)&&isBrushBehavior({version:2,timing:value})
}
