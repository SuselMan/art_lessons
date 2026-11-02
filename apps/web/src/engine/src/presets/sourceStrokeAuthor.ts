import {canonicalBrushDescriptorJSON} from '@grafetto/shared'
import {type CanonicalTexturedAutoProgramBinding} from '@grafetto/shared'
import {canonicalSoftNativeDefaultTexturedSourceMaterialContext,type CanonicalMaterialContextV6,type SourceTextureNativeDefaultProgramData, canonicalPressureTexturedSourceMaterialContext, type CanonicalMaterialContextV5, type SourceTexturePressureProgramData, canonicalTexturedSourceMaterialContext, type CanonicalMaterialContextV4, CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE } from '@grafetto/shared'
import { sourceStandardOption } from './sourceOption'
import { sourceRotationMixDegrees } from './sourceRotationMix'
import { SourceDistanceTiming, sourceTimingInterval, type SourceSpacing } from '../dabs/sourceDistanceTiming'
import { sourceDrawingDirection, sourceFanRequests, shortestSourceTurn } from '../input/kritaStrokeInput'
import { KritaRandomSource, KritaPerStrokeRandomSource, type KritaRandomSnapshot, type KritaPerStrokeRandomSnapshot } from './nativeRandom'
import { compileSourceOptionProgram, type SourceOptionProgram, type SourceOptionProgramInput } from './sourceOptionProgram'
import { sourceDabCharacteristicSize, sourceDabMaskExtent, sourceDabGeometryEqual, type SourceDabGeometry, type SourceDabBrushMetrics } from './sourceDabCache'
import type { SourceDabCacheRequest, SourceDabCacheState } from './sourceDabCache'
import { SourceStampQueryExecutor, type SourceStampOptionId, type SourceStampOptions, type SourceStampResult } from './sourceStampQuery'

/** Author-only, no persisted representation or renderer activation. */
export interface SourceAuthorPacket {
  readonly x: number; readonly y: number; readonly t: number
  readonly pressure: number; readonly tiltX: number; readonly tiltY: number
  readonly speed: number; readonly rotation: number; readonly tangentialPressure: number; readonly perspective: number
  readonly canvasRotation: number; readonly mirroredH: boolean; readonly mirroredV: boolean
  readonly tiltDirectionOffset: number; readonly hover: boolean
}
export interface SourceAuthorRoleProgram {
  readonly id: 'primary' | 'mask'
  readonly options: Readonly<Record<SourceStampOptionId, SourceOptionProgramInput>>
  readonly brush: SourceDabBrushMetrics
  readonly geometry?: SourceDabGeometry
  /** Ordered common-grid image frames, selected at the addDab boundary. */
  readonly imagePipe?: {readonly mode:'incremental'|'random';readonly frames:readonly string[]}
  readonly material: Omit<SourceDabCacheRequest, 'x' | 'y' | 'shape'>
  /** Current supported material law; active extra consumers must be rejected. */
  readonly materialCpuBytes?:number;readonly materialCpuBudgetBytes?:number
  readonly materialProgram?:SourceTexturePressureProgramData|SourceTextureNativeDefaultProgramData
  readonly textureProgram?:{readonly strength:'recorded-grain-v1';readonly binding:CanonicalTexturedAutoProgramBinding}|{readonly strength:'source-pressure-curve-v1';readonly context:CanonicalMaterialContextV5|CanonicalMaterialContextV6}|{readonly strength:'pressure-identity-v1'}|{readonly strength:'fixed-one-v1';readonly context:CanonicalMaterialContextV4}
  readonly materialPolicy: 'textured-auto-program-v1' | 'soft-auto-native-default-texture-v1' | 'default-auto-pressure-texture-v1' | 'default-auto-fixed-texture-v1' | 'png-pressure-texture-v1' | 'png-fixed1-rng-free' | 'default-auto-fixed1-rng-free' | 'default-auto-fixed1-seeded-density-v1' | 'gaussian-auto-fixed1-rng-free' | 'soft-auto-fixed1-rng-free'
  readonly lodScale: number
  readonly scatterX: boolean; readonly scatterY: boolean
  readonly mirrorX: boolean; readonly mirrorY: boolean; readonly indirectPainting: boolean
  readonly spacing: { readonly value: number; readonly automatic: boolean; readonly coefficient: number; readonly isotropic: boolean }
  readonly timing: { readonly enabled: boolean; readonly rate: number; readonly ignoreDistance: boolean }
  readonly fanStepDegrees?: number
  readonly spacingRefreshMs: number; readonly timingRefreshMs: number
}
export interface SourceStrokeAuthorProgram {
  /** Caller supplies immutable descriptor identity. Not a new wire hash. */
  readonly id: string
  /** Undefined preserves historical explicit paintAt input fixtures. */
  readonly inputProfile?: 'krita-freehand-no-smoothing-v1'
  readonly roles: readonly SourceAuthorRoleProgram[]
}
type DistanceState = Pick<SourceDistanceTiming, 'x' | 'y' | 'time' | 'spacingElapsed' | 'timingElapsed'>
interface Request extends SourceAuthorPacket { readonly drawingAngle: number; readonly angleOverride?: boolean }
export interface SourceAuthorRoleState {
  readonly distance: DistanceState
  readonly spacing: SourceSpacing
  readonly interval?: number
  readonly cache: SourceDabCacheState
  readonly sequence: number; readonly totalDistance: number; readonly maxPressure: number
  readonly lastPosition: { readonly x: number; readonly y: number }
  readonly lastAngle: number; readonly lockedAngle?: number
  readonly lastPaint?: Request
}
interface Cursor {
  readonly kind: 'start' | 'segment' | 'finish'
  readonly endpoint: SourceAuthorPacket
  readonly roleIndex: number
  readonly current: SourceAuthorPacket
  readonly phase: 'distance' | 'paint' | 'spacing' | 'timing' | 'nextRole'
  readonly requests: readonly Request[]
}
export interface SourceStrokeAuthorState {
  readonly version: 1; readonly programId: string
  readonly inputProfile?: 'krita-freehand-no-smoothing-v1'
  readonly ended?: boolean
  readonly random: KritaRandomSnapshot; readonly perStroke: KritaPerStrokeRandomSnapshot
  readonly roles: readonly SourceAuthorRoleState[]
  readonly initialAngle: number
  readonly lastInput?: SourceAuthorPacket
  readonly cursor?: Cursor
  readonly inputOrdinal: number; readonly eventOrdinal: number
}
export interface SourceStrokeAuthorStep {
  readonly kind: 'material' | 'query' | 'inputComplete'
  readonly role?: 'primary' | 'mask'
  readonly query?: 'paint' | 'spacing' | 'timing'
  readonly sourceAngle?: number; readonly sourceTime?: number; readonly logicalSequence?: number
  readonly packet?: SourceAuthorPacket
  readonly materialStrength?:number
  readonly result?: SourceStampResult
  readonly state: SourceStrokeAuthorState
}
const IDS: readonly SourceStampOptionId[] = ['Size','Rotation','Ratio','Scatter','Opacity','Flow','Mirror','Spacing','Rate']
const distanceState = (d: DistanceState): DistanceState => ({ x:d.x,y:d.y,time:d.time,spacingElapsed:d.spacingElapsed,timingElapsed:d.timingElapsed })
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}
function validatePacket(p: SourceAuthorPacket): void {
  if (!p || ![p.x,p.y,p.t,p.pressure,p.tiltX,p.tiltY,p.speed,p.rotation,p.tangentialPressure,p.perspective,p.canvasRotation,p.tiltDirectionOffset].every(Number.isFinite)
    || p.t<0 || p.t>Number.MAX_SAFE_INTEGER || p.pressure<0 || p.pressure>1
    || [p.hover,p.mirroredH,p.mirroredV].some(v=>typeof v!=='boolean')) throw new RangeError('Invalid native author packet')
}
function mix(a: SourceAuthorPacket,b: SourceAuthorPacket,t: number): SourceAuthorPacket {
  // Native mix preserves first packet canvas/hover settings. Circular pen
  // rotation follows KisPaintInformation::mixOtherImpl without normalization.
  const scalar=(x:number,y:number)=>(1-t)*x+t*y
  return {...a,rotation:sourceRotationMixDegrees(a.rotation,b.rotation,t),x:scalar(a.x,b.x),y:scalar(a.y,b.y),t:scalar(a.t,b.t),pressure:scalar(a.pressure,b.pressure),
    tiltX:scalar(a.tiltX,b.tiltX),tiltY:scalar(a.tiltY,b.tiltY),speed:scalar(a.speed,b.speed),
    tangentialPressure:scalar(a.tangentialPressure,b.tangentialPressure),perspective:scalar(a.perspective,b.perspective)}
}
function spacing(program: SourceAuthorRoleProgram,r: SourceStampResult): SourceSpacing {
  if (r.scale===undefined || r.rotation===undefined || r.spacing===undefined || !r.spacingMirror) {
    // Native canPaintFor false uses1; tiny uses default enabled spacing0.
    return {enabled:true,isotropic:true,x:r.scale===undefined?1:0,y:r.scale===undefined?1:0,angle:0}
  }
  const metric=sourceDabCharacteristicSize(program.brush,{scale:r.scale,ratio:1,rotation:0},program.geometry)
  const auto=(v:number)=>program.spacing.coefficient*(v<1?v:Math.sqrt(v))
  let x:number,y:number
  if(program.spacing.isotropic){
    const dimension=Math.max(...metric)
    x=y=program.spacing.automatic?auto(dimension):dimension*program.spacing.value
  }else{
    const axis=(v:number)=>program.spacing.automatic?program.lodScale*auto(v/program.lodScale):v*program.spacing.value
    x=axis(metric[0]);y=axis(metric[1])
  }
  x*=r.spacing;y*=r.spacing
  return {enabled:!(program.timing.enabled && program.timing.ignoreDistance),isotropic:x===y,x,y,
    angle:program.spacing.isotropic?0:r.rotation,
    flipped:program.spacing.isotropic?false:r.spacingMirror.horizontal!==r.spacingMirror.vertical}
}

/** One generic owner of compiled options, source query/cache and role scheduling.
 * Every yielded checkpoint is immutable and structured-cloneable, including a
 * partially consumed segment. Consumers may stop at any yield and resume/fork.
 * Query events are NOT render dabs. No RNG is evaluated by replay here.
 */

/** Conservative declared extra metadata, not literal JS heap/GPU work units.
 * Caller reserves through SAME existing CPU owner BEFORE author preparation. */
export function sourcePressureMaterialProgramCpuBytes(program:SourceTexturePressureProgramData):number {return materialProgramCpuBytes(program,'texture-pressure-curve-v1')}
export function sourceNativeDefaultMaterialProgramCpuBytes(program:SourceTextureNativeDefaultProgramData):number {return materialProgramCpuBytes(program,'texture-pressure-native-default-v1')}
export function sourceTexturedAutoProgramCpuBytes(program:SourceTexturePressureProgramData|SourceTextureNativeDefaultProgramData):number {
 const d=Object.getOwnPropertyDescriptor(program,'kind');if(!d||!Object.hasOwn(d,'value')||d.value!=='texture-pressure-curve-v1'&&d.value!=='texture-pressure-native-default-v1')throw new RangeError('Unknown textured Auto program');return materialProgramCpuBytes(program,d.value)
}
/** Closed typed wrappers choose the kind; callers cannot supply permission. */
function materialProgramCpuBytes(program:unknown,kind:'texture-pressure-curve-v1'|'texture-pressure-native-default-v1'):number {
  const own=(value:unknown,names:readonly string[]):Record<string,unknown>=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new RangeError('Invalid pressure material DATA')
    const keys=Reflect.ownKeys(value)
    if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k)))throw new RangeError('Invalid pressure material fields')
    const out:Record<string,unknown>=Object.create(null)
    for(const key of names){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw new RangeError('Pressure material accessor');out[key]=d.value}
    return out
  }
  const dense=(value:unknown,min:number,max:number):unknown[]=>{
    if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw new RangeError('Pressure material array')
    const field=Object.getOwnPropertyDescriptor(value,'length'),length:unknown=field&&Object.hasOwn(field,'value')?field.value:undefined
    if(typeof length!=='number'||!Number.isSafeInteger(length)||length<min||length>max||Reflect.ownKeys(value).length!==length+1)throw new RangeError('Pressure material array')
    const result:unknown[]=[]
    for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))throw new RangeError('Pressure material accessor');result.push(d.value)}
    return result
  }
  const p=own(program,['kind','reader','profile','buildId','curve']),c=own(p.curve,['source','coefficients']),source=own(c.source,['text','points'])
  if(p.kind!==kind||p.reader!=='krita-bd6e8d0-v1'||p.profile!=='eigen-5.0.1-mapped-arm64-f64-v3'||typeof p.buildId!=='string'||!/^[a-f0-9]{64}$/.test(p.buildId)||typeof source.text!=='string'||source.text.length>65536)throw new RangeError('Invalid pressure material program')
  const points=dense(source.points,2,9),coefficients=dense(c.coefficients,1,8)
  if(coefficients.length!==points.length-1)throw new RangeError('Invalid pressure material coefficients')
  let last=-1
  for(let i=0;i<points.length;i++){const point=own(points[i],['x','y','corner']);if(typeof point.x!=='number'||typeof point.y!=='number'||!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1||point.x<=last||typeof point.corner!=='boolean'||(i===0||i===points.length-1)&&point.corner)throw new RangeError('Invalid pressure material curve');last=point.x}
  for(let i=0;i<coefficients.length;i++){const row=dense(coefficients[i],4,4);for(let j=0;j<4;j++)if(typeof row[j]!=='number'||!Number.isFinite(row[j]))throw new RangeError('Invalid pressure material coefficients')}
  // Two bounded owned program copies + transient source transfer preparation,
  // ONE retained256-entry table and object/array overhead. No global cache.
  return 32768+source.text.length*4+points.length*256+coefficients.length*256
}
export class SourceStrokeAuthor {
  private readonly program: SourceStrokeAuthorProgram
  private readonly options: readonly Readonly<Record<SourceStampOptionId, SourceOptionProgram>>[]
  private readonly materialOptions:readonly (SourceOptionProgram|undefined)[]
  constructor(program: SourceStrokeAuthorProgram) {
    if(!program.id || program.roles.length<1 || program.roles.length>2 || program.roles[0].id!=='primary'
      || program.roles.length===2 && program.roles[1].id!=='mask') throw new RangeError('Invalid author source roles')
    if(program.inputProfile!==undefined && (program.inputProfile!=='krita-freehand-no-smoothing-v1' || program.roles.length!==1)) {
      throw new RangeError('Unsupported native freehand input profile/roles')
    }
    for(const role of program.roles){if(role.materialPolicy==='textured-auto-program-v1'||role.materialPolicy==='default-auto-pressure-texture-v1'||role.materialPolicy==='soft-auto-native-default-texture-v1'){const field=Object.getOwnPropertyDescriptor(role,'materialProgram'),declared=Object.getOwnPropertyDescriptor(role,'materialCpuBytes'),allowance=Object.getOwnPropertyDescriptor(role,'materialCpuBudgetBytes');if(!field||!Object.hasOwn(field,'value')||!declared||!Object.hasOwn(declared,'value')||!allowance||!Object.hasOwn(allowance,'value'))throw new RangeError('pressure-material-cpu-budget');const bytes=role.materialPolicy==='textured-auto-program-v1'?sourceTexturedAutoProgramCpuBytes(field.value):role.materialPolicy==='soft-auto-native-default-texture-v1'?sourceNativeDefaultMaterialProgramCpuBytes(field.value):sourcePressureMaterialProgramCpuBytes(field.value);if(declared.value!==bytes||!Number.isSafeInteger(allowance.value)||allowance.value<bytes)throw new RangeError('pressure-material-cpu-budget')}else if(role.materialProgram!==undefined||role.materialCpuBytes!==undefined||role.materialCpuBudgetBytes!==undefined)throw new RangeError('Unexpected material program')}
    this.program=freeze(structuredClone(program))
    this.options=this.program.roles.map(role=>{
      if(role.material.imagePipe!==undefined)throw new RangeError('Pipe selection must belong to the author role')
      if(role.imagePipe&&(!['incremental','random'].includes(role.imagePipe.mode)||role.imagePipe.frames.length<2||role.imagePipe.frames.length>256
        ||role.imagePipe.frames[0]!==role.material.brushIdentity||role.imagePipe.frames.some(v=>!/^asset:[a-f0-9]{64}$/.test(v))
        ||role.materialPolicy!=='png-fixed1-rng-free'||role.geometry&&role.geometry.kind!=='image'))throw new RangeError('Invalid incremental image pipe')
      const genericTexture=role.materialPolicy==='textured-auto-program-v1'
      const nativeTexture=role.materialPolicy==='soft-auto-native-default-texture-v1',pressureTexture=role.materialPolicy==='default-auto-pressure-texture-v1'
      const fixedTexture=role.materialPolicy==='default-auto-fixed-texture-v1',texture=role.materialPolicy==='png-pressure-texture-v1'
      if(genericTexture){
        if(role.id!=='primary'||this.program.roles.length!==1||role.imagePipe||!role.geometry||role.geometry.kind==='image'||!role.material.textureEnabled||!role.textureProgram||role.textureProgram.strength!=='recorded-grain-v1'||Object.keys(role.textureProgram).length!==2||!role.materialProgram)throw new RangeError('Invalid textured Auto program')
        const b=role.textureProgram.binding
        if(b.kind!=='textured-auto-program-v1'||b.source.kind!==role.geometry.kind||canonicalBrushDescriptorJSON(b.source.source)!==canonicalBrushDescriptorJSON(role.geometry.source)||b.source.coverageProfile!==role.geometry.coverageProfile||canonicalBrushDescriptorJSON(b.strengthProgram)!==canonicalBrushDescriptorJSON(role.materialProgram)||(role.geometry.kind==='softAuto')!==(role.materialProgram.kind==='texture-pressure-native-default-v1'))throw new RangeError('Textured Auto source/program differs')
      }else if(nativeTexture){
        if(role.id!=='primary'||this.program.roles.length!==1||role.imagePipe||role.geometry?.kind!=='softAuto'||!role.material.textureEnabled||!role.textureProgram||role.textureProgram.strength!=='source-pressure-curve-v1'||Object.keys(role.textureProgram).length!==2||!role.materialProgram||role.materialProgram.kind!=='texture-pressure-native-default-v1'||role.textureProgram.context.version!==6)throw new RangeError('Unsupported native-default soft texture program')
        canonicalSoftNativeDefaultTexturedSourceMaterialContext(role.textureProgram.context)
      }else if(pressureTexture){
        if(role.id!=='primary'||this.program.roles.length!==1||role.imagePipe||role.geometry?.kind!=='defaultAuto'||role.geometry.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||role.geometry.source.density!==1||role.geometry.source.randomness!==0||role.geometry.source.spikes!==2||!role.material.textureEnabled||!role.textureProgram||role.textureProgram.strength!=='source-pressure-curve-v1'||Object.keys(role.textureProgram).length!==2||!role.materialProgram||role.materialProgram.kind!=='texture-pressure-curve-v1')throw new RangeError('Unsupported pressure source texture program')
        if(role.textureProgram.context.version!==5)throw new RangeError('Pressure context version mismatch');canonicalPressureTexturedSourceMaterialContext(role.textureProgram.context)
      }else if(fixedTexture){
        if(role.id!=='primary'||this.program.roles.length!==1||role.imagePipe||role.geometry?.kind!=='defaultAuto'
          ||role.geometry.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||role.geometry.source.density!==1||role.geometry.source.randomness!==0||role.geometry.source.spikes!==2
          ||!role.material.textureEnabled||!role.textureProgram||Object.keys(role.textureProgram).length!==2||role.textureProgram.strength!=='fixed-one-v1')throw new RangeError('Unsupported fixed source texture program')
        canonicalTexturedSourceMaterialContext(role.textureProgram.context)
      }else if(texture?(role.id!=='primary'||this.program.roles.length!==1||role.imagePipe!==undefined||role.geometry&&role.geometry.kind!=='image'||!role.material.textureEnabled||!role.textureProgram||Object.keys(role.textureProgram).length!==1||role.textureProgram.strength!=='pressure-identity-v1'):role.textureProgram!==undefined)throw new RangeError('Unsupported source texture program')
      if(!genericTexture&&!pressureTexture&&!nativeTexture&&role.materialProgram!==undefined)throw new RangeError('Unexpected material program')
      const seededDensity=role.materialPolicy==='default-auto-fixed1-seeded-density-v1'
      if(seededDensity&&(role.id!=='primary'||this.program.roles.length!==1||role.geometry?.kind!=='defaultAuto'||role.geometry.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||role.geometry.source.density!==1&&role.material.supportsCaching))throw new RangeError('Unsupported density material program')
      if(role.geometry?.kind==='defaultAuto'&&(role.geometry.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)!==seededDensity)throw new RangeError('Density profile/policy mismatch')
      if(!['textured-auto-program-v1','soft-auto-native-default-texture-v1','default-auto-pressure-texture-v1','default-auto-fixed-texture-v1','png-pressure-texture-v1','png-fixed1-rng-free','default-auto-fixed1-rng-free','default-auto-fixed1-seeded-density-v1','gaussian-auto-fixed1-rng-free','soft-auto-fixed1-rng-free'].includes(role.materialPolicy)
        || (role.geometry?.kind==='defaultAuto')!==(role.materialPolicy==='default-auto-fixed1-rng-free'||seededDensity||fixedTexture||pressureTexture||genericTexture&&role.geometry?.kind==='defaultAuto')
        || (role.geometry?.kind==='gaussianAuto')!==(role.materialPolicy==='gaussian-auto-fixed1-rng-free'||genericTexture&&role.geometry?.kind==='gaussianAuto') || (role.geometry?.kind==='softAuto')!==(role.materialPolicy==='soft-auto-fixed1-rng-free'||nativeTexture||genericTexture&&role.geometry?.kind==='softAuto') || role.material.softness!==1 || role.material.lightness!==1
        || role.material.sharpnessChecked || !Number.isFinite(role.lodScale) || role.lodScale<=0
        || ![role.spacing.value,role.spacing.coefficient,role.spacingRefreshMs,role.timingRefreshMs].every(v=>Number.isFinite(v)&&v>=0)
        || !Number.isFinite(role.timing.rate) || role.timing.rate<=0
        || Object.keys(role.options).length!==IDS.length
        || !role.material.brushIdentity || !Number.isInteger(role.material.precisionLevel) || role.material.precisionLevel<1 || role.material.precisionLevel>5
        || [role.scatterX,role.scatterY,role.mirrorX,role.mirrorY,role.indirectPainting,role.spacing.automatic,role.spacing.isotropic,
          role.timing.enabled,role.timing.ignoreDistance,role.material.autoPrecision,role.material.imprecisePosition,role.material.disableSubpixel,
          role.material.supportsCaching,role.material.solidColor,role.material.textureEnabled].some(v=>typeof v!=='boolean')
        || role.fanStepDegrees!==undefined && (!Number.isInteger(role.fanStepDegrees)||role.fanStepDegrees<5||role.fanStepDegrees>90)) throw new RangeError('Unsupported source material/scheduling program')
      sourceDabCharacteristicSize(role.brush,{scale:1,ratio:1,rotation:0},role.geometry)
      return Object.fromEntries(IDS.map(id=>{
        const option=role.options[id]
        if(!option || option.id!==id)throw new RangeError('Missing source option program')
        return [id,compileSourceOptionProgram(option)]
      })) as unknown as Readonly<Record<SourceStampOptionId, SourceOptionProgram>>
    })
    this.materialOptions=this.program.roles.map(role=>{
      const material=role.materialProgram
      if(!material)return undefined
      const curve=material.curve
      if(material.kind!==(role.materialPolicy==='textured-auto-program-v1'?material.kind:role.materialPolicy==='soft-auto-native-default-texture-v1'?'texture-pressure-native-default-v1':'texture-pressure-curve-v1')||material.profile!=='eigen-5.0.1-mapped-arm64-f64-v3'||material.reader!=='krita-bd6e8d0-v1'||!/^[a-f0-9]{64}$/.test(material.buildId))throw new RangeError('Invalid pressure material program')
      return compileSourceOptionProgram({id:'TextureStrength',checked:true,useCurve:true,curveMode:0,strength:1,min:0,max:1,
        sensors:[{id:'pressure',curve:{points:curve.source.points,coefficients:curve.coefficients,arithmetic:'installed-arm64-fused-v1'}}]})
    })
  }
  createState(sequentialSeed:number,perStrokeSeed:number,initialAngle:number):SourceStrokeAuthorState {
    if(!Number.isFinite(initialAngle))throw new RangeError('Invalid source initial angle')
    return freeze({version:1,programId:this.program.id,...(this.program.inputProfile?{inputProfile:this.program.inputProfile,ended:false}:{}),random:new KritaRandomSource(sequentialSeed).snapshot(),
      perStroke:new KritaPerStrokeRandomSource(perStrokeSeed).snapshot(),roles:[],initialAngle,inputOrdinal:0,eventOrdinal:0})
  }
  /** Validation precedes any restored RNG draw or mutation; input state is never modified. */
  *plan(state:SourceStrokeAuthorState,packet:SourceAuthorPacket):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    this.validateState(state);validatePacket(packet)
    if(state.ended)throw new RangeError('Source author already ended')
    if(state.cursor)throw new RangeError('Pending source input must be resumed first')
    if(state.inputOrdinal===Number.MAX_SAFE_INTEGER)throw new RangeError('Source author input counter exhausted')
    if(state.lastInput && (packet.t<state.lastInput.t || (!this.program.inputProfile && packet.rotation!==state.lastInput.rotation)
      || packet.hover!==state.lastInput.hover))throw new RangeError('Unsupported source packet clock/rotation/hover transition')
    const owned=structuredClone(state)
    const start=!owned.lastInput
    const roles=start?this.program.roles.map(()=>({distance:distanceState(new SourceDistanceTiming()),
      spacing:{enabled:true,isotropic:true,x:0,y:0,angle:0},cache:{nextSequence:0},sequence:0,totalDistance:0,maxPressure:0,
      lastPosition:{x:packet.x,y:packet.y},lastAngle:owned.initialAngle})):owned.roles
    // Native initPaint only paints immediately for airbrushing. Otherwise its
    // default zero spacing is consumed by DistanceTiming's source .5 clamp on
    // the first nonzero MOVE. A tap is handled separately by endPaint below.
    const eager=start && (!this.program.inputProfile || this.program.roles[0].timing.enabled)
    const cursor:Cursor={kind:start?'start':'segment',endpoint:structuredClone(packet),roleIndex:0,
      current:owned.lastInput??structuredClone(packet),phase:start?(eager?'paint':'nextRole'):'distance',requests:eager?[{...packet,drawingAngle:owned.initialAngle}]:[]}
    return yield* this.run(freeze({...owned,roles,cursor}))
  }
  /** Caller wraps this ending event with adapter.beginInput, drains all yields,
   * then calls adapter.finish. UP is not also planned as a pressure-zero point.
   * Native helper paintLine marks painting dispatched even if the distance
   * iterator emits no dab. Thus only DOWN with no following MOVE can fall back.
   */
  *finish(state:SourceStrokeAuthorState):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    this.validateState(state)
    if(!this.program.inputProfile || state.ended || !state.lastInput || state.cursor)throw new RangeError('Invalid source author finish')
    if(state.inputOrdinal===Number.MAX_SAFE_INTEGER)throw new RangeError('Source author input counter exhausted')
    const owned=structuredClone(state),endpoint=owned.lastInput!,role=owned.roles[0],paint=owned.inputOrdinal===1 && role.lastPaint===undefined
    const cursor:Cursor={kind:'finish',endpoint,current:endpoint,roleIndex:0,phase:paint?'paint':'nextRole',
      requests:paint?[{...endpoint,drawingAngle:role.lastAngle}]:[]}
    return yield* this.run(freeze({...owned,cursor}))
  }
  *resume(state:SourceStrokeAuthorState):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    this.validateState(state)
    if(!state.cursor)throw new RangeError('No pending source input')
    return yield* this.run(freeze(structuredClone(state)))
  }
  private validateState(state:SourceStrokeAuthorState):void {
    const bad=():never=>{throw new RangeError('Invalid source author checkpoint')}
    const nonnegative=(v:number)=>Number.isFinite(v)&&v>=0
    const count=(v:number)=>Number.isSafeInteger(v)&&v>=0
    if(!state || state.version!==1 || state.programId!==this.program.id || !Array.isArray(state.roles)
      || !count(state.inputOrdinal) || !count(state.eventOrdinal) || !Number.isFinite(state.initialAngle))bad()
    if(state.inputProfile!==this.program.inputProfile || (this.program.inputProfile?typeof state.ended!=='boolean':state.ended!==undefined)
      || state.ended && (!state.lastInput || state.cursor))bad()
    const started=state.lastInput!==undefined||state.cursor!==undefined
    if(state.roles.length!==(started?this.program.roles.length:0))bad()
    if(state.lastInput!==undefined)validatePacket(state.lastInput)
    for(const [index,role] of state.roles.entries()){
      if(!role || !role.distance || !role.spacing || !role.cache || !role.lastPosition)bad()
      if(![role.distance.x,role.distance.y,role.distance.time,role.distance.spacingElapsed,role.distance.timingElapsed,
        role.spacing.x,role.spacing.y,role.totalDistance].every(nonnegative)
        || !Number.isFinite(role.spacing.angle) || ![role.spacing.enabled,role.spacing.isotropic].every(v=>typeof v==='boolean')
        || role.spacing.flipped!==undefined && typeof role.spacing.flipped!=='boolean'
        || !count(role.sequence) || role.sequence>0x7fffffff || !Number.isFinite(role.maxPressure) || role.maxPressure<0 || role.maxPressure>1
        || ![role.lastPosition.x,role.lastPosition.y,role.lastAngle].every(Number.isFinite)
        || role.lockedAngle!==undefined && !Number.isFinite(role.lockedAngle)
        || !count(role.cache.nextSequence) || role.cache.nextSequence>role.sequence)bad()
      // Native effectiveTiming may store positive Infinity; DistanceTiming clamps
      // it to LONG_TIME when consumed. NaN/negative intervals are never valid.
      if(role.interval!==undefined && (typeof role.interval!=='number'||Number.isNaN(role.interval)||role.interval<0))bad()
      if(role.lastPaint!==undefined){
        validatePacket(role.lastPaint)
        if(!Number.isFinite(role.lastPaint.drawingAngle) || role.lastPaint.angleOverride!==undefined && typeof role.lastPaint.angleOverride!=='boolean')bad()
      }
      if(role.cache.saved!==undefined){
        if(!role.cache.saved)bad()
        const saved=role.cache.saved,key=saved.key
        if(!saved.shape || !key || !saved.position || !saved.brush || !saved.mirror
          || !count(saved.sequence) || saved.sequence>=role.cache.nextSequence
          || (this.program.roles[index].imagePipe?(saved.key.index>=this.program.roles[index].imagePipe!.frames.length||this.program.roles[index].imagePipe!.mode==='incremental'&&saved.key.index!==saved.sequence%this.program.roles[index].imagePipe!.frames.length||saved.brushIdentity!==this.program.roles[index].imagePipe!.frames[saved.key.index]):saved.brushIdentity!==this.program.roles[index].material.brushIdentity)
          || ![saved.width,saved.height,key.width,key.height].every(v=>Number.isSafeInteger(v)&&v>=1)
          || ![saved.shape.scale,saved.shape.ratio,key.subPixelX,key.subPixelY].every(nonnegative)
          || ![saved.shape.rotation,saved.position.x,saved.position.y,key.angle,key.softness,key.lightness,key.ratio].every(Number.isFinite)
          || !count(key.index) || typeof key.color!=='string'
          || ![saved.mirror.horizontal,saved.mirror.vertical,saved.mirror.coordinateSystemFlipped,key.mirrorH,key.mirrorV].every(v=>typeof v==='boolean'))bad()
        if(!sourceDabGeometryEqual(saved.geometry,this.program.roles[index].geometry))bad()
        sourceDabCharacteristicSize(saved.brush,saved.shape,saved.geometry)
        if(saved.geometry?.kind==='defaultAuto'||saved.geometry?.kind==='gaussianAuto'||saved.geometry?.kind==='softAuto'){
          const expected=this.program.roles[index],extent=sourceDabMaskExtent(saved.brush,saved.shape,key.subPixelX,key.subPixelY,saved.geometry)
          if(!['width','height','scale','angle'].every(k=>Object.is(saved.brush[k as keyof SourceDabBrushMetrics],expected.brush[k as keyof SourceDabBrushMetrics]))
            || saved.width!==extent[0] || saved.height!==extent[1] || key.width!==saved.width || key.height!==saved.height
            || !Object.is(key.angle,saved.shape.rotation) || !Object.is(key.ratio,saved.shape.ratio) || key.index!==0
            || key.color!==expected.material.color || key.softness!==1 || key.lightness!==1
            || key.mirrorH!==saved.mirror.horizontal || key.mirrorV!==saved.mirror.vertical)bad()
        }
      }else if(role.cache.nextSequence!==0)bad()
    }
    if(state.cursor!==undefined){
      if(!state.cursor)bad()
      const c=state.cursor
      if(!['start','segment','finish'].includes(c.kind) || !['distance','paint','spacing','timing','nextRole'].includes(c.phase)
        || !Number.isInteger(c.roleIndex) || c.roleIndex<0 || c.roleIndex>=state.roles.length
        || !Array.isArray(c.requests) || c.requests.length>65 || (c.phase==='paint'?c.requests.length===0:c.requests.length!==0)
        || (c.kind!=='start')!==!!state.lastInput
        || c.kind==='finish' && (!this.program.inputProfile || !['paint','nextRole'].includes(c.phase)))bad()
      validatePacket(c.endpoint);validatePacket(c.current)
      if(state.lastInput && (c.endpoint.t<state.lastInput.t || (!this.program.inputProfile && c.endpoint.rotation!==state.lastInput.rotation) || c.endpoint.hover!==state.lastInput.hover))bad()
      for(const request of c.requests){
        validatePacket(request)
        if(!Number.isFinite(request.drawingAngle) || request.angleOverride!==undefined && typeof request.angleOverride!=='boolean')bad()
      }
    }
    // These restores validate bounded snapshots; no authoritative sequential
    // draw is made. Keyed cache verification recomputes its deterministic values.
    if(!state.perStroke || !Array.isArray(state.perStroke.cache) || state.perStroke.cache.length>IDS.length)bad()
    for(const entry of state.perStroke.cache){
      if(!Array.isArray(entry) || entry.length!==2 || !IDS.some(id=>entry[0]===id+'FuzzyStroke'))bad()
    }
    KritaRandomSource.restore(state.random)
    KritaPerStrokeRandomSource.restore(state.perStroke)
  }
  private *run(initial:SourceStrokeAuthorState):Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState> {
    let state=initial
    while(state.cursor){
      const cursor=state.cursor,index=cursor.roleIndex,program=this.program.roles[index],role=state.roles[index]
      if(cursor.phase==='nextRole'){
        if(index+1===this.program.roles.length){
          state=freeze({...state,cursor:undefined,lastInput:cursor.endpoint,inputOrdinal:state.inputOrdinal+1,
            ...(cursor.kind==='finish'?{ended:true}:{})})
          yield freeze({kind:'inputComplete',state});break
        }
        const next=state.roles[index+1]
        state=freeze({...state,cursor:{...cursor,roleIndex:index+1,current:state.lastInput??cursor.endpoint,
          phase:cursor.kind==='start'?'paint':'distance',requests:cursor.kind==='start'?[{...cursor.endpoint,drawingAngle:next.lastAngle}]:[]}})
        continue
      }
      const distance=Object.assign(new SourceDistanceTiming(),distanceState(role.distance))
      if(cursor.phase==='distance'){
        const factor=distance.next(cursor.current,cursor.endpoint,role.spacing,role.interval)
        const roles=[...state.roles];roles[index]={...role,distance:distanceState(distance)}
        if(factor<0){state=freeze({...state,roles,cursor:{...cursor,phase:'spacing'}});continue}
        const current=mix(cursor.current,cursor.endpoint,factor)
        const request={...current,drawingAngle:sourceDrawingDirection(role.lastPosition,current,role.lastAngle)}
        const requests:Request[]=[]
        if(role.lastPaint && program.fanStepDegrees!==undefined){
          const prior=role.lastPaint
          const old={...prior,angle:prior.drawingAngle,normalizedSpeed:prior.speed}
          const target={...request,angle:request.drawingAngle,normalizedSpeed:request.speed}
          const turn=shortestSourceTurn(old.angle,target.angle)
          sourceFanRequests(old,target,program.fanStepDegrees).forEach((fan,i)=>{
            const fraction=(program.fanStepDegrees!*Math.PI/180)*i/turn
            requests.push({...mix(prior,request,fraction),x:fan.x,y:fan.y,drawingAngle:fan.angle,angleOverride:true})
          })
        }
        requests.push(request)
        state=freeze({...state,roles,cursor:{...cursor,current,phase:'paint',requests}});continue
      }
      if(cursor.phase==='spacing' && distance.spacingElapsed<program.spacingRefreshMs){
        state=freeze({...state,cursor:{...cursor,phase:'timing'}});continue
      }
      if(cursor.phase==='timing' && distance.timingElapsed<program.timingRefreshMs){
        state=freeze({...state,cursor:{...cursor,phase:'nextRole'}});continue
      }
      const kind=cursor.phase==='paint'?'paint':cursor.phase==='spacing'?'spacing':'timing'
      const packet=kind==='paint'?cursor.requests[0]:cursor.endpoint
      const drawingAngle=kind==='paint' && cursor.requests[0].angleOverride
        ?cursor.requests[0].drawingAngle:sourceDrawingDirection(role.lastPosition,packet,role.lastAngle)
      const sensor={pressure:packet.pressure,maxPressure:Math.max(role.maxPressure,packet.pressure),tangentialPressure:packet.tangentialPressure,
        speed:packet.speed,drawingAngle,lockedDrawingAngle:role.lockedAngle??drawingAngle,rotation:packet.rotation,xTilt:packet.tiltX,yTilt:packet.tiltY,
        tiltDirectionOffset:packet.tiltDirectionOffset,perspective:packet.perspective,time:packet.t,dabSequence:role.sequence,distance:role.totalDistance,hover:packet.hover}
      if(state.eventOrdinal===Number.MAX_SAFE_INTEGER || kind==='paint' && role.sequence===0x7fffffff)throw new RangeError('Source author counter exhausted')
      const context={random:KritaRandomSource.restore(state.random),perStroke:KritaPerStrokeRandomSource.restore(state.perStroke),hover:packet.hover}
      const bound=Object.fromEntries(IDS.map(id=>[id,this.options[index][id].bind(sensor)])) as unknown as SourceStampOptions
      const result=new SourceStampQueryExecutor(bound,context).execute(kind,{x:packet.x,y:packet.y,drawingAngle,canvasRotation:packet.canvasRotation,
        mirroredH:packet.mirroredH,mirroredV:packet.mirroredV},{canPaint:true,lodScale:program.lodScale,scatterX:program.scatterX,scatterY:program.scatterY,
        mirrorX:program.mirrorX,mirrorY:program.mirrorY,indirectPainting:program.indirectPainting,
        sourceCache:{brush:program.brush,...(program.geometry?{geometry:program.geometry}:{}),state:role.cache,request:program.imagePipe?{...program.material,imagePipe:program.imagePipe}:program.material}})
      let nextRole:SourceAuthorRoleState={...role}
      let nextCursor:Cursor
      if(kind==='paint'){
        const dx=packet.x-role.lastPosition.x,dy=packet.y-role.lastPosition.y
        nextRole={...role,spacing:spacing(program,result),interval:program.timing.enabled?sourceTimingInterval(program.timing.rate,result.rate):undefined,
          cache:result.material?.state??role.cache,sequence:role.sequence+1,totalDistance:role.totalDistance+Math.sqrt(dx*dx+dy*dy)/program.lodScale,
          maxPressure:Math.max(role.maxPressure,packet.pressure),lastPosition:{x:packet.x,y:packet.y},lastAngle:drawingAngle,
          lockedAngle:packet.hover?role.lockedAngle:role.lockedAngle??drawingAngle,lastPaint:{...packet,drawingAngle}}
        const requests=cursor.requests.slice(1)
        nextCursor={...cursor,requests,phase:requests.length?'paint':cursor.kind==='segment'?'distance':'nextRole'}
      }else if(kind==='spacing'){
        distance.updateSpacing();nextRole={...role,spacing:spacing(program,result),distance:distanceState(distance)}
        nextCursor={...cursor,phase:'timing'}
      }else{
        distance.updateTiming();nextRole={...role,interval:program.timing.enabled?sourceTimingInterval(program.timing.rate,result.rate):undefined,distance:distanceState(distance)}
        nextCursor={...cursor,phase:'nextRole'}
      }
      const roles=[...state.roles];roles[index]=nextRole
      state=freeze({...state,roles,cursor:nextCursor,random:context.random.snapshot(),perStroke:context.perStroke.snapshot(),eventOrdinal:state.eventOrdinal+1})
      const materialOption=this.materialOptions[index]
      const materialStrength=result.painted&&materialOption?sourceStandardOption(materialOption.bind(sensor),context):undefined
      if(materialStrength!==undefined&&(!Number.isFinite(materialStrength)||materialStrength<0||materialStrength>1))throw new RangeError('Invalid pressure material strength')
      yield freeze({...materialStrength!==undefined?{materialStrength}:{},kind:result.painted?'material':'query',role:program.id,query:kind,packet:{...packet},sourceAngle:drawingAngle,sourceTime:packet.t,logicalSequence:role.sequence,result,state})
    }
    return state
  }
}
