/** Raw native author inputs. Presence is data retention, NEVER renderer admission.
 * Reader version is separate from the future exact native curve compiler. */
export const SOURCE_STAMP_OPTIONS = ['Size','Rotation','Ratio','Scatter','Opacity','Flow','Mirror','Spacing','Rate'] as const
export const SOURCE_STAMP_SENSORS = ['pressure','pressureIn','tangentialPressure','drawingAngle','xTilt','yTilt','tiltDirection','tiltElevation','rotation','fuzzyPerDab','fuzzyPerStroke','speed','fade','distance','time','perspective'] as const
export interface SourceStampCurveData {
  readonly text: string
  readonly points: readonly { readonly x: number; readonly y: number; readonly corner: boolean }[]
}
export interface SourceStampSensorData {
  readonly id: typeof SOURCE_STAMP_SENSORS[number]
  readonly sourceId: string
  readonly sourceSlot: number
  readonly curve: SourceStampCurveData
  readonly length?: number
  readonly periodic?: boolean
  readonly angleOffset?: number
  readonly lockedAngle?: boolean
  readonly fanCorners?: boolean
  readonly fanStep?: number
}
export interface SourceStampOptionData {
  readonly id: typeof SOURCE_STAMP_OPTIONS[number]
  readonly checkable: boolean
  readonly checked: boolean
  readonly useCurve: boolean
  readonly useSameCurve: boolean
  readonly commonCurve: SourceStampCurveData
  readonly curveMode: number
  readonly strength: number
  readonly min: number
  readonly max: number
  readonly sensors: readonly SourceStampSensorData[]
}
export const SOURCE_STAMP_COMPILER_PROFILE = 'eigen-3.4.0-sparselu-f64-no-fma-v1'
export const SOURCE_STAMP_MAPPED_COMPILER_PROFILE = 'eigen-5.0.1-mapped-arm64-f64-v3'
export interface SourceStampCompiledCurve {
  readonly source: SourceStampCurveData
  readonly coefficients: readonly (readonly [number,number,number,number])[]
}
export type SourceStampCompiledData = {
  readonly version: 1
  readonly reader: 'krita-bd6e8d0-v1'
  readonly profile: typeof SOURCE_STAMP_COMPILER_PROFILE
  readonly curves: readonly SourceStampCompiledCurve[]
} | {
  readonly version: 2
  readonly reader: 'krita-bd6e8d0-v1'
  readonly profile: typeof SOURCE_STAMP_MAPPED_COMPILER_PROFILE
  readonly buildId: string
  readonly curves: readonly SourceStampCompiledCurve[]
  readonly radialCurve?: SourceStampCompiledCurve
} | {
  readonly version:3
  readonly reader:'krita-bd6e8d0-v1'
  readonly profile:typeof SOURCE_STAMP_MAPPED_COMPILER_PROFILE
  readonly buildId:string
  readonly curves:readonly SourceStampCompiledCurve[]
  readonly textureStrength:SourceStampTextureStrengthSlot
}
/** New material option data, never raster/source authority or provider attestation. */
export interface SourceStampTextureStrengthSlot {
 readonly kind:'texture-pressure-curve-v1'
 readonly curve:SourceStampCompiledCurve
}
export interface SourceTexturePressureProgramData {
 readonly kind:'texture-pressure-curve-v1'
 readonly reader:'krita-bd6e8d0-v1'
 readonly profile:typeof SOURCE_STAMP_MAPPED_COMPILER_PROFILE
 readonly buildId:string
 readonly curve:SourceStampCompiledCurve
}
/** Existing native identity predicate, shared by required-data validation/compiler. */
export function sourceStampCurveIsIdentity(points: readonly {readonly x:number;readonly y:number}[]): boolean {
  if (!points.length || points[0].x !== 0 || points[0].y !== 0 || points[points.length-1].x !== 1 || points[points.length-1].y !== 1) return false
  return points.slice(1,-1).every(p=>Math.abs(p.x-p.y)*1e12<=Math.min(Math.abs(p.x),Math.abs(p.y)))
}
export function sourceStampRequiredCurves(options: readonly SourceStampOptionData[]): readonly SourceStampCurveData[] {
  const curves=new Map<string,SourceStampCurveData>()
  for(const option of options)if(option.checked && option.useCurve)for(const sensor of option.sensors) {
    if(!sourceStampCurveIsIdentity(sensor.curve.points) && !curves.has(sensor.curve.text))curves.set(sensor.curve.text,sensor.curve)
  }
  return [...curves.values()]
}
export interface SourceDefaultAutoData {
  readonly kind: 'defaultAuto'
  readonly generator: 'default'
  readonly shape: 'circle' | 'rect'
  readonly diameter: number; readonly ratio: number
  readonly horizontalFade: number; readonly verticalFade: number
  readonly antialias: boolean; readonly spikes: number
  readonly randomness: number; readonly density: number
}
/** Retained Gaussian inputs only. No renderer, material or wire grant. */
export interface SourceGaussianAutoData {
  readonly kind: 'gaussianAuto'
  readonly generator: 'gauss'
  readonly shape: 'circle'
  readonly diameter: number; readonly ratio: number
  readonly horizontalFade: number; readonly verticalFade: number
  readonly antialias: boolean; readonly spikes: number
  readonly randomness: number; readonly density: number
}
/** Raw radial curve retention only; no compiler or raster admission. */
export interface SourceSoftAutoData extends Omit<SourceGaussianAutoData, 'kind' | 'generator'> {
  readonly kind: 'softAuto'
  readonly generator: 'soft'
  readonly softnessCurve: SourceStampCurveData
}
interface SourceStampCommon {
  readonly compiled?: SourceStampCompiledData
  readonly reader: 'krita-bd6e8d0-v1'
  readonly role: 'primary' | 'mask'
  /** Lossless selected settings, including original sensor XML and numeric text.
   * This is neither executable code nor a second embedded KPP archive. */
  readonly settings: Readonly<Record<string, string>>
  readonly brush: { readonly width: number; readonly height: number; readonly scale: number; readonly angle: number }
  readonly spacing: { readonly value: number; readonly automatic: boolean; readonly coefficient: number; readonly isotropic: boolean }
  readonly timing: { readonly enabled: boolean; readonly rate: number; readonly ignoreDistance: boolean }
  readonly flags: { readonly scatterX: boolean; readonly scatterY: boolean; readonly mirrorX: boolean; readonly mirrorY: boolean; readonly indirectPainting: boolean; readonly materialFixed1: boolean; readonly textureEnabled: boolean }
  readonly precision: { readonly level: number; readonly automatic: boolean }
  readonly options: readonly SourceStampOptionData[]
  /** Missing material/compiler capabilities remain explicit; legacy behavior is retained. */
  readonly unsupported: readonly string[]
}
/** Missing tag is legacy IMAGE only. New payloads must carry an explicit tag. */
export type SourceStampData = SourceStampCommon & (
  { readonly version: 1; readonly source?: never } |
  { readonly version: 2; readonly source: { readonly kind: 'image' } | SourceDefaultAutoData | SourceGaussianAutoData | SourceSoftAutoData }
)
export function sourceStampSourceKind(data: SourceStampData): 'image' | 'defaultAuto' | 'gaussianAuto' | 'softAuto' {
  return data.version === 1 ? 'image' : data.source.kind
}
function sourceIdentity(v: Record<string, unknown>): boolean {
  if (v.version === 1) return v.source === undefined
  if (v.version !== 2 || !record(v.source)) return false
  const s = v.source
  if (s.kind === 'image') return keys(s, ['kind'])
  const generatorIdentity = s.kind === 'defaultAuto' ? s.generator === 'default' && ['circle','rect'].includes(String(s.shape))
    : s.kind === 'gaussianAuto' ? s.generator === 'gauss' && s.shape === 'circle'
    : s.kind === 'softAuto' && s.generator === 'soft' && s.shape === 'circle' && isSourceStampCurveData(s.softnessCurve)
  if (!generatorIdentity || !keys(s, ['kind','generator','shape','diameter','ratio','horizontalFade','verticalFade','antialias','spikes','randomness','density',...(s.kind==='softAuto'?['softnessCurve']:[])])
    || !bool(s.antialias)
    || ![s.diameter,s.ratio,s.horizontalFade,s.verticalFade,s.spikes,s.randomness,s.density].every(finite)
    || (s.diameter as number) <= 0 || (s.ratio as number) <= 0 || !Number.isInteger(s.spikes)
    || (s.spikes as number) < 1 || (s.spikes as number) > 2147483647
    || [s.horizontalFade,s.verticalFade,s.randomness,s.density].some(n => (n as number) < 0 || (n as number) > 1)
    || !record(v.brush)) return false
  const width = Math.trunc(Math.max(1, s.diameter as number)), height = Math.trunc(Math.max(1, (s.diameter as number) * (s.ratio as number)))
  return v.brush.scale === 1 && width === v.brush.width && height === v.brush.height
}
export const MAX_SOURCE_STAMP_BUDGET = 1048576
export const MAX_LIBRARY_SOURCE_STAMP_BUDGET = 16777216
/** Stable UTF-8 text +32 bytes/knot accounting, not JSON number formatting. */
function utf8Size(s: string): number {
  let bytes=0
  for(let i=0;i<s.length;i++) {
    const c=s.charCodeAt(i)
    if(c<128)bytes++
    else if(c<2048)bytes+=2
    else if(c>=0xd800 && c<=0xdbff) {
      const next=s.charCodeAt(++i)
      if(!(next>=0xdc00 && next<=0xdfff))return Infinity
      bytes+=4
    } else if(c>=0xdc00 && c<=0xdfff)return Infinity
    else bytes+=3
  }
  return bytes
}
export function sourceStampDataBudget(value: unknown): number {
  if(record(value)){
    const field=Object.getOwnPropertyDescriptor(value,'compiled')
    if(!field&&'compiled'in value||field&&!Object.hasOwn(field,'value'))return Infinity
    if(field&&Object.hasOwn(field,'value')&&record(field.value)){
      const version=Object.getOwnPropertyDescriptor(field.value,'version')
      if(!version||!Object.hasOwn(version,'value'))return Infinity
      if(version.value===3){try{value=textureCapture(value)}catch{return Infinity}}
    }
  }
  if(!record(value) || !record(value.settings) || Object.keys(value.settings).length>256 || !Array.isArray(value.options) || value.options.length>9 || !Array.isArray(value.unsupported) || value.unsupported.length>32)return Infinity
  let total=2048
  if(record(value.source) && value.source.kind==='softAuto') {
    const curve=value.source.softnessCurve
    if(!record(curve) || typeof curve.text!=='string' || curve.text.length>65536 || !Array.isArray(curve.points) || curve.points.length<1 || curve.points.length>256)return Infinity
    total+=utf8Size(curve.text)+32*curve.points.length
  }
  for(const [key,text] of Object.entries(value.settings)) {
    if(typeof text!=='string' || key.length>128 || text.length>65536)return Infinity
    total+=utf8Size(key)+utf8Size(text)
  }
  for(const reason of value.unsupported) { if(typeof reason!=='string')return Infinity;total+=utf8Size(reason) }
  for(const option of value.options) {
    if(!record(option) || !Array.isArray(option.sensors) || option.sensors.length>16)return Infinity
    total+=64
    for(const item of [option.commonCurve,...option.sensors.map(s=>record(s)?s.curve:undefined)]) {
      if(!record(item) || typeof item.text!=='string' || item.text.length>65536 || !Array.isArray(item.points) || item.points.length>256)return Infinity
      total+=utf8Size(item.text)+32*item.points.length
    }
    for(const sensor of option.sensors) {
      if(!record(sensor) || typeof sensor.sourceId!=='string')return Infinity
      total+=64+utf8Size(sensor.sourceId)
    }
  }
  if(value.compiled !== undefined) {
    if(!record(value.compiled) || !Array.isArray(value.compiled.curves) || value.compiled.curves.length>64)return Infinity
    const entries=[...value.compiled.curves,...(value.compiled.radialCurve===undefined?[]:[value.compiled.radialCurve]),...(value.compiled.version===3&&record(value.compiled.textureStrength)?[value.compiled.textureStrength.curve]:[])]
    if(entries.length>64)return Infinity
    for(const item of entries) {
      if(!record(item) || !record(item.source) || typeof item.source.text!=='string' || item.source.text.length>65536
        || !Array.isArray(item.source.points) || item.source.points.length>256 || !Array.isArray(item.coefficients) || item.coefficients.length>255)return Infinity
      total+=64+utf8Size(item.source.text)+32*item.source.points.length+32*item.coefficients.length
    }
  }
  return total
}
const decimal = (s: string) => /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(s.trim())
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => Object.keys(v).every(k => allowed.includes(k))
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const bool = (v: unknown) => typeof v === 'boolean'
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !v.includes('\0')
export function isSourceStampCurveData(v: unknown): v is SourceStampCurveData {
  if (!record(v) || !text(v.text,65536) || !Array.isArray(v.points)) return false
  const rows=v.text.split(';').filter(r=>r.trim()).map(r=>r.split(','))
  if (rows.length !== v.points.length || rows.some((r,i)=>r.length<2 || r.slice(2).some(f=>!['','is_corner'].includes(f.trim()))
    || !record((v.points as unknown[])[i]) || !decimal(r[0]) || !decimal(r[1]) || Number(r[0]) !== (v.points as {x:number}[])[i].x
    || Number(r[1]) !== (v.points as {y:number}[])[i].y || r.slice(2).some(f=>f.trim()==='is_corner') !== (v.points as {corner:boolean}[])[i].corner)) return false
  return record(v) && keys(v,['text','points']) && text(v.text,65536) && Array.isArray(v.points) && v.points.length >= 1 && v.points.length <= 256
    && v.points.every((p: unknown,i: number) => record(p) && keys(p,['x','y','corner']) && finite(p.x) && finite(p.y)
      && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && bool(p.corner) && (i === 0 || p.x > (v.points as {x:number}[])[i-1].x))
}
export function isSourceStampData(v: unknown): v is SourceStampData {
  // New compiled3 must be captured before budget/schema code can enumerate it.
  if(record(v)){
    const field=Object.getOwnPropertyDescriptor(v,'compiled')
    if(!field&&'compiled'in v||field&&!Object.hasOwn(field,'value'))return false
    if(field&&Object.hasOwn(field,'value')&&record(field.value)){
      const version=Object.getOwnPropertyDescriptor(field.value,'version')
      if(!version||!Object.hasOwn(version,'value'))return false
      if(version.value===3){try{v=textureCapture(v)}catch{return false}}
    }
  }
  if (sourceStampDataBudget(v)>MAX_SOURCE_STAMP_BUDGET || !record(v) || !keys(v,['version','reader','role','settings','brush','spacing','timing','flags','precision','options','unsupported','compiled','source']) || !sourceIdentity(v) || v.reader !== 'krita-bd6e8d0-v1'
    || !['primary','mask'].includes(String(v.role)) || !record(v.settings) || Object.keys(v.settings).length > 256
    || Object.entries(v.settings).some(([k,s]) => !text(k,128) || !text(s,65536))
    || Object.entries(v.settings).reduce((n,[k,s]) => n+k.length+(s as string).length,0) > 1048576
    || !record(v.brush) || !keys(v.brush,['width','height','scale','angle'])
    || ![v.brush.width,v.brush.height].every(n => finite(n) && Number.isInteger(n) && n >= 1 && n <= 32768)
    || !finite(v.brush.scale) || v.brush.scale <= 0 || !finite(v.brush.angle)
    || !Array.isArray(v.options) || ![0,9].includes(v.options.length)
    || !Array.isArray(v.unsupported) || v.options.length === 0 && v.unsupported.length === 0 || v.unsupported.length > 32 || !v.unsupported.every(s => text(s,256))) return false
  if (!record(v.spacing) || !keys(v.spacing,['value','automatic','coefficient','isotropic']) || !finite(v.spacing.value) || v.spacing.value < 0 || !finite(v.spacing.coefficient) || v.spacing.coefficient < 0 || !bool(v.spacing.automatic) || !bool(v.spacing.isotropic)
    || !record(v.timing) || !keys(v.timing,['enabled','rate','ignoreDistance']) || !bool(v.timing.enabled) || !bool(v.timing.ignoreDistance) || !finite(v.timing.rate) || v.timing.rate <= 0
    || !record(v.flags) || !keys(v.flags,['scatterX','scatterY','mirrorX','mirrorY','indirectPainting','materialFixed1','textureEnabled']) || Object.keys(v.flags).length !== 7 || !Object.values(v.flags).every(bool)
    || !record(v.precision) || !keys(v.precision,['level','automatic']) || !Number.isInteger(v.precision.level) || (v.precision.level as number) < 1 || (v.precision.level as number) > 5 || !bool(v.precision.automatic)) return false
  const validOptions=v.options.every((o: unknown,index: number) => {
    if (!record(o) || !keys(o,['id','checkable','checked','useCurve','useSameCurve','commonCurve','curveMode','strength','min','max','sensors'])
      || o.id !== SOURCE_STAMP_OPTIONS[index] || ![o.checkable,o.checked,o.useCurve,o.useSameCurve].every(bool)
      || (!o.checkable && !o.checked) || !isSourceStampCurveData(o.commonCurve) || !Number.isInteger(o.curveMode)
      || ![o.strength,o.min,o.max].every(finite) || (o.min as number) > (o.max as number) || !Array.isArray(o.sensors) || o.sensors.length < 1 || o.sensors.length > 16) return false
    if (o.useSameCurve && o.sensors.some((s: unknown) => !record(s) || !record(s.curve) || s.curve.text !== (o.commonCurve as unknown as SourceStampCurveData).text)) return false
    let previous = -1
    return o.sensors.every((s: unknown) => {
      if (!record(s) || !keys(s,['id','sourceId','sourceSlot','curve','length','periodic','angleOffset','lockedAngle','fanCorners','fanStep'])
        || !text(s.sourceId,64) || ['pressure','pressurein','tangentialpressure','drawingangle','xtilt','ytilt','ascension','declination','rotation','fuzzy','fuzzystroke','speed','fade','distance','time','perspective'][s.sourceSlot as number] !== s.sourceId || !Number.isInteger(s.sourceSlot) || (s.sourceSlot as number) <= previous
        || SOURCE_STAMP_SENSORS[s.sourceSlot as number] !== s.id || !isSourceStampCurveData(s.curve)) return false
      previous=s.sourceSlot as number
      if (['fade','time','distance'].includes(String(s.id))) {
        if (!Number.isInteger(s.length) || (s.length as number) < 1 || (s.length as number) > 2147483647 || !bool(s.periodic)) return false
      } else if (s.length !== undefined || s.periodic !== undefined) return false
      if (s.id === 'drawingAngle') return finite(s.angleOffset) && bool(s.lockedAngle) && bool(s.fanCorners) && Number.isInteger(s.fanStep) && (s.fanStep as number) >= 1 && (s.fanStep as number) <= 360
      return s.angleOffset === undefined && s.lockedAngle === undefined && s.fanCorners === undefined && s.fanStep === undefined
    })
  })
  if(!validOptions)return false
  if(v.compiled === undefined)return true
  const compiled=v.compiled
  if(!record(compiled) || compiled.reader!==v.reader || !Array.isArray(compiled.curves))return false
  const material=compiled.version===3
  const mapped=compiled.version===2||material
  let pressureProgram:SourceTexturePressureProgramData|undefined
  if(material){
    if(v.version!==2||!record(v.source)||v.source.kind!=='defaultAuto'||!record(v.flags)||v.flags.textureEnabled!==true)return false
    try{pressureProgram=texturePressureProgram(compiled,v.settings)}catch{return false}
  }
  const radial=v.version===2 && record(v.source) && v.source.kind==='softAuto' ? v.source.softnessCurve : undefined
  if(mapped) {
    if(!keys(compiled,material?['version','reader','profile','buildId','curves','textureStrength']:['version','reader','profile','buildId','curves','radialCurve'])
      || compiled.profile!==SOURCE_STAMP_MAPPED_COMPILER_PROFILE || typeof compiled.buildId!=='string' || !/^[0-9a-f]{64}$/.test(compiled.buildId)
      || (radial===undefined)!==(compiled.radialCurve===undefined))return false
  } else if(!keys(compiled,['version','reader','profile','curves']) || compiled.version!==1 || compiled.profile!==SOURCE_STAMP_COMPILER_PROFILE)return false
  const required=[...sourceStampRequiredCurves(v.options as unknown as readonly SourceStampOptionData[]),...(mapped && radial!==undefined?[radial]:[]),...(pressureProgram?[pressureProgram.curve.source]:[])]
  const entries=[...compiled.curves,...(mapped && compiled.radialCurve!==undefined?[compiled.radialCurve]:[]),...(pressureProgram?[pressureProgram.curve]:[])]
  if(entries.length>64)return false
  let knots=0
  return entries.length===required.length && entries.every((entry:unknown,i:number)=>{
    if(!record(entry) || !keys(entry,['source','coefficients']) || !isSourceStampCurveData(entry.source) || !isSourceStampCurveData(required[i]) || entry.source.text!==required[i].text
      || !Array.isArray(entry.coefficients) || entry.coefficients.length!==Math.max(1,entry.source.points.length-1)
      || entry.coefficients.some(c=>!Array.isArray(c) || c.length!==4 || !c.every(finite)))return false
    if(mapped && (entry.source.points.length<2 || entry.source.points.length>9 || entry.source.points[0].corner || entry.source.points[entry.source.points.length-1].corner))return false
    knots+=entry.source.points.length
    return knots<=4096
  })
}

/** Bounded OWN DATA capture before any new material-option validation. Existing
 * V1/V2 descriptor validation semantics are not globally changed. */
function textureCapture(value:unknown):unknown {
 let nodes=0,bytes=0
 const ancestors=new Set<object>()
 const visit=(v:unknown,depth:number):unknown=>{
  if(++nodes>8192||depth>24)throw TypeError('Texture program capture budget')
  if(v===null||typeof v==='boolean')return v
  if(typeof v==='number'){if(!Number.isFinite(v))throw TypeError('Nonfinite texture data');return v}
  if(typeof v==='string'){bytes+=v.length*2;if(v.length>65536||bytes>MAX_SOURCE_STAMP_BUDGET)throw TypeError('Texture text budget');return v}
  if(!v||typeof v!=='object'||ancestors.has(v))throw TypeError('Invalid texture data')
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v)
  if(!array&&proto!==Object.prototype&&proto!==null)throw TypeError('Texture data prototype')
  const names=Reflect.ownKeys(v)
  if(names.length>(array?257:256)||names.some(k=>typeof k!=='string'))throw TypeError('Texture data keys')
  let length=0
  if(array){const d=Object.getOwnPropertyDescriptor(v,'length');if(!d||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>256)throw TypeError('Texture data array');length=d.value;if(names.length!==length+1)throw TypeError('Texture array holes/extra')}
  ancestors.add(v)
  const result:unknown[]|Record<string,unknown>=array?[]:Object.create(null)
  try{for(const key of names){if(array&&key==='length')continue;if(typeof key!=='string'||key.length>128)throw TypeError('Texture data key');const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value'))throw TypeError('Texture accessor');if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=length))throw TypeError('Texture array key');Object.defineProperty(result,key,{value:visit(d.value,depth+1),enumerable:true,writable:false,configurable:false})}}finally{ancestors.delete(v)}
  return Object.freeze(result)
 }
 return visit(value,0)
}
function textureOwn(value:unknown,required:readonly string[]):Record<string,unknown>{
 if(!record(value)||Reflect.ownKeys(value).length!==required.length)throw TypeError('Texture program fields')
 const out:Record<string,unknown>=Object.create(null)
 for(const key of required){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw TypeError('Texture program accessor');out[key]=d.value}
 return out
}
function texturePressureProgram(compiledValue:unknown,settingsValue:unknown):SourceTexturePressureProgramData {
 const compiled=textureOwn(textureCapture(compiledValue),['version','reader','profile','buildId','curves','textureStrength'])
 if(compiled.version!==3||compiled.reader!=='krita-bd6e8d0-v1'||compiled.profile!==SOURCE_STAMP_MAPPED_COMPILER_PROFILE||typeof compiled.buildId!=='string'||!/^[a-f0-9]{64}$/.test(compiled.buildId))throw TypeError('Mapped material option unavailable')
 const settings=textureCapture(settingsValue)
 if(!record(settings))throw TypeError('Texture settings unavailable')
 const expected:Readonly<Record<string,string>>={'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true','Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0'}
 for(const key of Reflect.ownKeys(settings)){
  if(typeof key!=='string'||typeof settings[key]!=='string')throw TypeError('Texture settings data')
  if((key.startsWith('Texture/Strength/')&&!Object.hasOwn(expected,key)&&key!=='Texture/Strength/Sensor')||(key.startsWith('PressureTexture/Strength/')&&key!=='PressureTexture/Strength/')||key.startsWith('CustomTexture/Strength/')||key.startsWith('CurveTexture/Strength/'))throw TypeError('Unsupported texture strength field')
 }
 if(!Object.entries(expected).every(([k,v])=>settings[k]===v))throw TypeError('Unsupported pressure option')
 const xml=settings['Texture/Strength/Sensor']
 if(typeof xml!=='string'||xml.length>65536)throw TypeError('Pressure XML budget')
 // One whole-input grammar. No entity expansion, DTD subsets, namespaces,
 // extra attributes, child sensors or fallback/default curves.
 const match=/^[ \t\r\n]*(?:<!DOCTYPE params>[ \t\r\n]*)?<params[ \t\r\n]+id[ \t\r\n]*=[ \t\r\n]*(?:"pressure"|'pressure')[ \t\r\n]*>[ \t\r\n]*<curve>([^<&]*)<\/curve>[ \t\r\n]*<\/params>[ \t\r\n]*$/.exec(xml)
 if(!match)throw TypeError('Unsupported pressure XML')
 const slot=textureOwn(compiled.textureStrength,['kind','curve'])
 if(slot.kind!=='texture-pressure-curve-v1')throw TypeError('Unknown material option')
 const curve=textureOwn(slot.curve,['source','coefficients'])
 if(!isSourceStampCurveData(curve.source)||curve.source.text!==match[1].trim()||curve.source.points.length<2||curve.source.points.length>9||curve.source.points[0].corner||curve.source.points[curve.source.points.length-1].corner||!Array.isArray(curve.coefficients)||curve.coefficients.length!==curve.source.points.length-1||curve.coefficients.some(row=>!Array.isArray(row)||row.length!==4||!row.every(finite)))throw TypeError('Pressure curve/compiled correspondence')
 // Coefficients are structurally checked DATA. This is NOT native-provider or
 // raster attestation. Actual importer/resolver binding remains a later unit.
 return Object.freeze({kind:'texture-pressure-curve-v1',reader:'krita-bd6e8d0-v1',profile:SOURCE_STAMP_MAPPED_COMPILER_PROFILE,buildId:compiled.buildId,curve:Object.freeze({source:curve.source,coefficients:curve.coefficients})})
}
/** Pure immutable material-option DATA, never binding/author/raster authority. */
export function captureSourceTexturePressureProgram(value:unknown):Readonly<{data:SourceStampData;program:SourceTexturePressureProgramData}> {
 const captured=textureCapture(value)
 if(!isSourceStampData(captured))throw TypeError('Invalid original source data')
 const source=textureOwn(captured,Reflect.ownKeys(captured as object).map(String))
 const program=texturePressureProgram(source.compiled,source.settings)
 return Object.freeze({data:captured,program})
}
