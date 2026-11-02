import {canonicalPrimaryTexturePin,canonicalFixedPrimaryTexturePin,type CanonicalPrimaryTexturePin,type CanonicalFixedPrimaryTexturePin} from './canonicalPrimaryTexture.js'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalStrokeRasterContract,type CanonicalStrokeRasterProfile,type CanonicalStrokeComposition} from './canonicalStrokeFrame.js'
import type { BrushDescriptor } from './brushes.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import { captureSourceTextureNativeDefaultProgram, captureSourceTexturePressureProgram, captureSourceGaussianTexturePressureProgram, isSourceStampData, sourceStampSourceKind, sourceStampRequiredCurves, type SourceStampData, type SourceTexturePressureProgramData } from './sourceStampData.js'

/** Only the native outer law representable by canonical over32 today.
 * This checks composition of an already verified descriptor, not source-data
 * readiness, descriptor schema, alphaDarken mode or other execution policy. */
function nativeOuterBlend(descriptor:BrushDescriptor):CanonicalStrokeComposition['outerBlend']|undefined {
  const behavior=descriptor.behavior,rendering=behavior?.rendering
  if(behavior?.erase===true||(rendering?.wetEdges??0)!==0||(rendering?.burntEdges??0)!==0)return
  switch(rendering?.blendMode??'normal'){
    case 'normal':return 'over'
    case 'multiply':return 'multiply'
    case 'lighten':return 'lighten'
    case 'colorDodge':return 'colorDodge'
    case 'overlay':return 'overlay'
  }
}
export function hasCanonicalOverComposition(descriptor:BrushDescriptor):boolean {
  return nativeOuterBlend(descriptor)==='over'
}
/** Pure source-composition selection from an already verified descriptor.
 * This is neither source-data readiness nor room/server execution permission.
 * Other material/effect gates remain with source extractors and the resolver. */
export function canonicalSourceComposition(descriptor:BrushDescriptor,rasterProfile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE):Readonly<{mode:'wash'|'buildup';outerBlend:CanonicalStrokeComposition['outerBlend']}>|undefined {
  let contract:ReturnType<typeof canonicalStrokeRasterContract>
  try{contract=canonicalStrokeRasterContract(rasterProfile)}catch{return}
  const outerBlend=nativeOuterBlend(descriptor)
  if(!outerBlend)return
  const data=descriptor.sourceStamp
  if(!isSourceStampData(data))return
  const mode=sourceStampPaintingMode(data)
  if(!mode||outerBlend!=='over'&&(!contract.genericSC||mode!=='wash'))return
  return Object.freeze({mode,outerBlend})
}

/** Saved reader law shared by image/auto capability binding. Undefined action
 * means incremental; conflicting or malformed retained flags fail closed. */
export function sourceStampPaintingMode(data: SourceStampData): 'wash'|'buildup'|undefined {
  const action=data.settings.PaintOpAction
  const indirect=action!==undefined && Number(action)!==1
  if(action!==undefined && (!/^[+-]?\d+$/.test(action)||!Number.isSafeInteger(Number(action)))
    ||indirect!==data.flags.indirectPainting)return undefined
  return indirect?'wash':'buildup'
}

/** A semantic material class, not permission, CAS verification, a compiler, or
 * an assertion that retained settings originated in an installed native app. */
export interface CanonicalSinglePngCapability {
  readonly kind: 'single-inverse-gray-png-v1'
  readonly brushId: string
  readonly brushVersion: number
  readonly asset: CanonicalMaterialAsset
  readonly mode: 'wash' | 'buildup'
  readonly brushScale: number
  readonly brushAngle: number
}
export type CanonicalSinglePngResult = { readonly supported: true; readonly capability: CanonicalSinglePngCapability }
  | { readonly supported: false; readonly reasons: readonly string[] }

/** Shared structural boundary used BEFORE local option compilation and server
 * capability binding. Inputs must have passed the BrushLibrary schema. This
 * does not evaluate sensors/curves/RNG or trust a caller's raster profile. */
export function extractCanonicalSinglePngCapability(
  descriptor: BrushDescriptor, asset: { readonly id: string; readonly size: number },
): CanonicalSinglePngResult {
  return extractImageFrameCapability(descriptor,asset)
}

function extractImageFrameCapability(
  descriptor:BrushDescriptor,asset:{readonly id:string;readonly size:number},
  policy?:Readonly<{animation?:NonNullable<BrushDescriptor['tip']['animation']>;material?:'verified-primary-texture'}>,
):CanonicalSinglePngResult {
  const animation=policy?.animation
  const reject = (reason: string): CanonicalSinglePngResult => ({ supported: false, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (data === undefined) return reject('legacy-descriptor-no-source-data')
  if (!isSourceStampData(data)) return reject('invalid-source-data')
  if (sourceStampSourceKind(data) !== 'image') return reject('source-material-is-not-image')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'bitmap' || descriptor.tip.animation !== animation || descriptor.tip.material) return reject('unsupported-source-material')
  const sampling = descriptor.tip.imageSampling
  if (!sampling || sampling.kind !== 'integer-pyramid' || sampling.signal !== 'inverse-gray' || descriptor.tip.mask !== (animation?.frames[0] ?? asset.id)
    || !/^asset:[a-f0-9]{64}$/.test(asset.id) || !Number.isInteger(asset.size) || asset.size < 2 || asset.size > 2048
    || !Object.values(sampling.sourceRect).every(v => Number.isInteger(v) && v >= 0)
    || sampling.sourceRect.width !== data.brush.width || sampling.sourceRect.height !== data.brush.height
    || sampling.sourceRect.x + data.brush.width > asset.size || sampling.sourceRect.y + data.brush.height > asset.size) return reject('native-cas-source-grid-unavailable')
  if (!data.flags.materialFixed1 || (policy?.material==='verified-primary-texture'?!data.flags.textureEnabled:data.flags.textureEnabled) || descriptor.behavior?.colorAdjustment) return reject('unsupported-material-consumer')
  if (data.options.length !== 9) return reject('native-option-program-unavailable')
  const rotation = data.options.find(o => o.id === 'Rotation')!
  const fan = rotation.checked && rotation.useCurve ? rotation.sensors.find(s => s.id === 'drawingAngle' && s.fanCorners) : undefined
  if (fan && (fan.fanStep! < 5 || fan.fanStep! > 90)) return reject('unsupported-source-fan-step')
  // This is the retained source reader's mode, not descriptor rendering or the
  // opacity option. Missing PaintOpAction is incremental in brush settings.
  const mode=sourceStampPaintingMode(data)
  if(!mode)return reject('inconsistent-source-painting-mode')
  const rect = sampling.sourceRect
  return { supported: true, capability: Object.freeze({ kind: 'single-inverse-gray-png-v1', brushId: descriptor.id,
    brushVersion: descriptor.version, brushScale: data.brush.scale, brushAngle: data.brush.angle, asset: Object.freeze({ id: asset.id, size: asset.size, ...rect }), mode }) }
}

/** Semantic data only: neither verified CAS provenance nor a room execution grant.
 * Caller still requires canonicalSourceEffectReject for its actual raster profile. */
export interface CanonicalPrimaryTextureCapability extends Omit<CanonicalSinglePngCapability,'kind'> {
  readonly kind:'primary-image-pressure-texture-v1'
  readonly patternAsset:CanonicalMaterialAsset
  readonly primaryTexture:CanonicalPrimaryTexturePin
  readonly strengthProgram:'pressure-identity-v1'
}
export type CanonicalPrimaryTextureCapabilityResult=
  {readonly supported:true;readonly capability:CanonicalPrimaryTextureCapability}|
  {readonly supported:false;readonly reasons:readonly string[]}
function textureData(value:unknown,required:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('Invalid texture data')
  const keys=Reflect.ownKeys(value)
  if(keys.length!==required.length||keys.some(k=>typeof k!=='string'||!required.includes(k)))throw new TypeError('Invalid texture fields')
  const result:Record<string,unknown>=Object.create(null)
  for(const key of required){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Invalid texture accessor');result[key]=d.value}
  return result
}
/** Only the exact two-endpoint native pressure grammar. No XML entity parser. */
function texturePressureIdentity(text:string):boolean {
  if(text.length>2048)return false
  let at=0
  const ws=()=>{while(at<text.length&&' \t\r\n'.includes(text[at]))at++}
  const take=(token:string)=>{if(!text.startsWith(token,at))return false;at+=token.length;return true}
  ws();if(text.startsWith('<!DOCTYPE',at)){if(!take('<!DOCTYPE params>'))return false;ws()}
  if(!take('<params'))return false
  const before=at;ws();if(at===before||!take('id'))return false
  ws();if(!take('='))return false;ws()
  const quote=text[at];if(quote!=='"'&&quote!=="'")return false;at++
  if(!take('pressure')||!take(quote))return false
  ws();if(!take('>'))return false;ws();if(!take('<curve>'))return false
  for(const token of ['0',',','0',';','1',',','1',';']){ws();if(!take(token))return false}
  ws();if(!take('</curve>'))return false;ws();if(!take('</params>'))return false;ws()
  return at===text.length
}
function textureStrengthSettings(value:unknown):boolean {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false
  const keys=Reflect.ownKeys(value)
  if(keys.length>256)return false
  const expected:Readonly<Record<string,string>>={
    'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true',
    'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true',
    'Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0',
  }
  const captured:Record<string,string>=Object.create(null)
  for(const key of keys){
    if(typeof key!=='string'||key.length>128)return false
    const d=Object.getOwnPropertyDescriptor(value,key)
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length>65536)return false
    if((key.startsWith('Texture/Strength/')&&!Object.hasOwn(expected,key)&&key!=='Texture/Strength/Sensor')
      ||key.startsWith('PressureTexture/Strength/')&&key!=='PressureTexture/Strength/'
      ||key.startsWith('CustomTexture/Strength/')||key.startsWith('CurveTexture/Strength/'))return false
    captured[key]=d.value
  }
  return Object.entries(expected).every(([key,v])=>captured[key]===v)
    &&typeof captured['Texture/Strength/Sensor']==='string'&&texturePressureIdentity(captured['Texture/Strength/Sensor'])
}
export function extractCanonicalPrimaryTextureCapability(
  descriptor:BrushDescriptor,assets:Readonly<{primary:Readonly<{id:string;size:number}>;pattern:Readonly<{id:string;size:number}>}>,
):CanonicalPrimaryTextureCapabilityResult {
  const reject=(reason:string):CanonicalPrimaryTextureCapabilityResult=>({supported:false,reasons:[reason]})
  try{
    // Capture new raw boundary before schema validation can enumerate settings.
    const source=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
    if(!source||!Object.hasOwn(source,'value')||!source.value||typeof source.value!=='object')return reject('texture-source-data-unavailable')
    const settings=Object.getOwnPropertyDescriptor(source.value,'settings')
    if(!settings||!Object.hasOwn(settings,'value')||!textureStrengthSettings(settings.value))return reject('texture-pressure-program-unavailable')
    const available=textureData(assets,['primary','pattern']),primary=textureData(available.primary,['id','size']),pattern=textureData(available.pattern,['id','size'])
    if(typeof primary.id!=='string'||typeof primary.size!=='number'||typeof pattern.id!=='string'||typeof pattern.size!=='number'
      ||primary.id===pattern.id||!/^asset:[a-f0-9]{64}$/.test(pattern.id)||!Number.isInteger(pattern.size)||pattern.size<2||pattern.size>2048||(pattern.size&(pattern.size-1))!==0)return reject('texture-asset-unavailable')
    const behavior=descriptor.behavior
    if(descriptor.mixer||descriptor.wet||descriptor.screentonePx||behavior?.wetMix||behavior?.edgeBleed||behavior?.grain||behavior?.taper)return reject('unsupported-texture-effect')
    const field=Object.getOwnPropertyDescriptor(descriptor,'texture')
    if(!field||!Object.hasOwn(field,'value'))return reject('texture-descriptor-unavailable')
    const t=textureData(field.value,['id','periodPx','strength','application','patternSize','offset'])
    const application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
    if(t.id!==pattern.id||t.strength!==1||application.mode!=='subtract'||application.soft!==false
      ||offset.randomX!==false||offset.randomY!==false||typeof size.width!=='number'||typeof size.height!=='number'
      ||size.width!==size.height||t.periodPx!==size.width)return reject('unsupported-primary-texture')
    const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height})
    const primaryTexture=canonicalPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:size.width,height:size.height,
      periodX:t.periodPx,periodY:t.periodPx,offsetX:offset.x,offsetY:offset.y,strength:'pressure-identity-v1'},patternAsset)
    const image=extractImageFrameCapability(descriptor,{id:primary.id,size:primary.size},{material:'verified-primary-texture'})
    if(!image.supported)return image
    return {supported:true,capability:Object.freeze({...image.capability,kind:'primary-image-pressure-texture-v1',patternAsset,primaryTexture,strengthProgram:'pressure-identity-v1'})}
  }catch{return reject('invalid-primary-texture-data')}
}

/** Data-only semantic class. No DefaultAuto source binding/coverage grant,
 * codec, author, room permission or CAS-content attestation is minted here. */
export interface CanonicalDefaultAutoFixedTextureCapability {
  readonly kind:'primary-default-auto-fixed-texture-v1'
  readonly brushId:string
  readonly brushVersion:number
  readonly mode:'wash'|'buildup'
  readonly patternAsset:CanonicalMaterialAsset
  readonly primaryTexture:CanonicalFixedPrimaryTexturePin
  readonly strengthProgram:'fixed-one-v1'
}
export type CanonicalDefaultAutoFixedTextureCapabilityResult =
  {readonly supported:true;readonly status:'source-data-only';readonly rasterReady:false;
    readonly data:Extract<ReturnType<typeof extractDefaultAutoSourceDataCapability>,{supported:true}>['data'];
    readonly capability:CanonicalDefaultAutoFixedTextureCapability} |
  {readonly supported:false;readonly reasons:readonly string[]}

/** Inactive Sensor is retained, bounded metadata. NEVER interpret it as pressure
 * identity or compile it while UseCurve=false and PressureTexture=false. */
function textureFixedOneSettings(value:unknown):boolean {
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false
  const keys=Reflect.ownKeys(value)
  if(keys.length>256)return false
  const expected:Readonly<Record<string,string>>={
    'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'false',
    'Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'false',
    'Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0',
  }
  const captured:Record<string,string>=Object.create(null)
  for(const key of keys){
    if(typeof key!=='string'||key.length>128)return false
    const d=Object.getOwnPropertyDescriptor(value,key)
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||d.value.length>65536)return false
    if((key.startsWith('Texture/Strength/')&&!Object.hasOwn(expected,key)&&key!=='Texture/Strength/Sensor')
      ||key.startsWith('PressureTexture/Strength/')&&key!=='PressureTexture/Strength/'
      ||key.startsWith('CustomTexture/Strength/')||key.startsWith('CurveTexture/Strength/'))return false
    captured[key]=d.value
  }
  return Object.entries(expected).every(([key,v])=>captured[key]===v)
    &&typeof captured['Texture/Strength/Sensor']==='string'
}

export function extractCanonicalDefaultAutoFixedTextureCapability(
  descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>,
):CanonicalDefaultAutoFixedTextureCapabilityResult {
  const reject=(reason:string):CanonicalDefaultAutoFixedTextureCapabilityResult=>({supported:false,reasons:[reason]})
  try{
    // Capture new raw settings boundary BEFORE schema/family validation reads it.
    const source=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
    if(!source||!Object.hasOwn(source,'value')||!source.value||typeof source.value!=='object')return reject('texture-source-data-unavailable')
    const settings=Object.getOwnPropertyDescriptor(source.value,'settings')
    if(!settings||!Object.hasOwn(settings,'value')||!textureFixedOneSettings(settings.value))return reject('texture-fixed-one-program-unavailable')
    const available=textureData(assets,['pattern']),pattern=textureData(available.pattern,['id','size'])
    if(typeof pattern.id!=='string'||!/^asset:[a-f0-9]{64}$/.test(pattern.id)||typeof pattern.size!=='number'
      ||!Number.isInteger(pattern.size)||pattern.size<2||pattern.size>2048||(pattern.size&(pattern.size-1))!==0)return reject('texture-asset-unavailable')
    const behavior=descriptor.behavior
    if(descriptor.mixer||descriptor.wet||descriptor.screentonePx||behavior?.wetMix||behavior?.edgeBleed||behavior?.grain||behavior?.taper)return reject('unsupported-texture-effect')
    const field=Object.getOwnPropertyDescriptor(descriptor,'texture')
    if(!field||!Object.hasOwn(field,'value'))return reject('texture-descriptor-unavailable')
    const t=textureData(field.value,['id','periodPx','strength','application','patternSize','offset'])
    const application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
    if(t.id!==pattern.id||t.strength!==1||application.mode!=='subtract'||application.soft!==false
      ||offset.randomX!==false||offset.randomY!==false||typeof size.width!=='number'||typeof size.height!=='number'
      ||size.width!==size.height||t.periodPx!==size.width)return reject('unsupported-primary-texture')
    const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height})
    const primaryTexture=canonicalFixedPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:size.width,height:size.height,
      periodX:t.periodPx,periodY:t.periodPx,offsetX:offset.x,offsetY:offset.y,strength:'fixed-one-v1'},patternAsset)
    // Same actual geometry/options/unsupported/source checks; only this PRIVATE
    // call requests the separately verified material. Public old auto caps stay plain.
    const auto=extractDefaultAutoData(descriptor,false,'fixed-one-texture')
    if(!auto.supported)return auto
    const mode=sourceStampPaintingMode(auto.data)
    if(!mode)return reject('inconsistent-source-painting-mode')
    return {supported:true,status:'source-data-only',rasterReady:false,data:auto.data,
      capability:Object.freeze({kind:'primary-default-auto-fixed-texture-v1',brushId:descriptor.id,brushVersion:descriptor.version,
        mode,patternAsset,primaryTexture,strengthProgram:'fixed-one-v1'})}
  }catch{return reject('invalid-fixed-primary-texture-data')}
}

/** Ordered image frames share the existing image recipe and asset bank.
 * Selection belongs to the author; recorded replay never selects a frame.
 * Structural material support only, not room execution permission. */
export interface CanonicalIncrementalImagePipeCapability {
  readonly kind:'incremental-inverse-gray-pipe-v1'
  readonly brushId:string
  readonly brushVersion:number
  readonly assets:readonly CanonicalMaterialAsset[]
  readonly mode:'wash'|'buildup'
  readonly brushScale:number
  readonly brushAngle:number
}
export type CanonicalIncrementalImagePipeResult=
  {readonly supported:true;readonly capability:CanonicalIncrementalImagePipeCapability}|
  {readonly supported:false;readonly reasons:readonly string[]}
export type CanonicalRandomImagePipeCapability=Omit<CanonicalIncrementalImagePipeCapability,'kind'>&{
  readonly kind:'random-inverse-gray-pipe-v1'
}
export type CanonicalRandomImagePipeResult=
  {readonly supported:true;readonly capability:CanonicalRandomImagePipeCapability}|
  {readonly supported:false;readonly reasons:readonly string[]}
export function extractCanonicalRandomImagePipeCapability(
  descriptor:BrushDescriptor,available:readonly {readonly id:string;readonly size:number}[],
):CanonicalRandomImagePipeResult {
  const result=extractImagePipeCapability(descriptor,available,'random')
  return result.supported?{supported:true,capability:Object.freeze({...result.capability,kind:'random-inverse-gray-pipe-v1'})}:result
}
export function extractCanonicalIncrementalImagePipeCapability(
  descriptor:BrushDescriptor,available:readonly {readonly id:string;readonly size:number}[],
):CanonicalIncrementalImagePipeResult {
  return extractImagePipeCapability(descriptor,available,'incremental')
}
function extractImagePipeCapability(
  descriptor:BrushDescriptor,available:readonly {readonly id:string;readonly size:number}[],mode:'incremental'|'random',
):CanonicalIncrementalImagePipeResult {
  const reject=(reason:string):CanonicalIncrementalImagePipeResult=>({supported:false,reasons:[reason]})
  const animation=descriptor.tip.animation
  if(descriptor.tip.kind!=='bitmap'||!animation||animation.mode!==mode
    ||animation.frames.length<2||animation.frames.length>256)return reject('unsupported-image-pipe-selection')
  const metadata=new Map<string,{readonly id:string;readonly size:number}>()
  for(const asset of available){if(metadata.has(asset.id))return reject('ambiguous-image-pipe-asset');metadata.set(asset.id,asset)}
  const frames:CanonicalMaterialAsset[]=[]
  let first:CanonicalSinglePngCapability|undefined
  for(const id of animation.frames){
    const asset=metadata.get(id)
    if(!asset)return reject('image-pipe-frame-unavailable')
    const frame=extractImageFrameCapability(descriptor,asset,{animation})
    if(!frame.supported)return frame
    if(first&&first.asset.size!==asset.size)return reject('image-pipe-frame-grid-mismatch')
    first??=frame.capability;frames.push(frame.capability.asset)
  }
  return {supported:true,capability:Object.freeze({kind:'incremental-inverse-gray-pipe-v1',brushId:descriptor.id,
    brushVersion:descriptor.version,assets:Object.freeze(frames),mode:first!.mode,
    brushScale:first!.brushScale,brushAngle:first!.brushAngle})}
}

/** Local callers may supply a curve compiler. A server binding cannot, and
 * therefore admits only identity curves or the already schema-checked retained
 * coefficient dictionary. No second option compiler is implemented here. */
export function hasCanonicalSourceCurvePrograms(data: SourceStampData): boolean {
  // Material-option compiled3/4 DATA cannot grant ordinary curve execution.
  if(data.compiled?.version===3||data.compiled?.version===4)return false
  return sourceStampRequiredCurves(data.options).length === 0 || data.compiled !== undefined
}

/** Source DATA/compiler capability only. No auto author, material codec or
 * executor is admitted by this result, even when every curve is compiled. */
export function extractDefaultAutoSourceDataCapability(descriptor: BrushDescriptor) {
  return extractDefaultAutoData(descriptor, false)
}
/** Explicit data-only density capability; no execution or room grant. */
export function extractSeededDensityDefaultAutoSourceDataCapability(descriptor: BrushDescriptor) {
  return extractDefaultAutoData(descriptor, true)
}
function extractDefaultAutoData(descriptor: BrushDescriptor, seededDensity: boolean, material: 'plain'|'fixed-one-texture'|'pressure-curve-data' = 'plain',capturedData?:SourceStampData):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceDefaultAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = capturedData??descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'defaultAuto') return reject('source-material-is-not-default-auto')
  if (!seededDensity && data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'procedural' || descriptor.tip.profile?.kind !== 'standard'
    || descriptor.tip.mask || descriptor.tip.animation || descriptor.tip.imageSampling || descriptor.tip.material) return reject('inconsistent-default-auto-descriptor')
  const source = data.source
  if (source.spikes !== 2 || source.randomness !== 0 || (!seededDensity && source.density !== 1) || !data.flags.materialFixed1
    || (material !== 'plain' ? !data.flags.textureEnabled : data.flags.textureEnabled)
    || descriptor.behavior?.colorAdjustment) return reject('unsupported-default-auto-material-consumer')
  const p = descriptor.tip.profile
  if (p.shape !== (source.shape === 'circle' ? 'ellipse' : 'rectangle') || p.horizontalFade !== source.horizontalFade
    || p.verticalFade !== source.verticalFade || p.antialias !== source.antialias) return reject('inconsistent-default-auto-profile')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !(material==='pressure-curve-data'&&capturedData?.compiled?.version===3 ? true : hasCanonicalSourceCurvePrograms(data))) return reject('native-option-program-unavailable')
  // The historical tag conflates spikes, randomness and density. Only the
  // density-only frontier is retired, AFTER every source/material/program check.
  // Retain the original tag/data; never normalize unrelated unsupported reasons.
  if (data.unsupported.length && !(seededDensity && source.density < 1
    && data.unsupported.length === 1 && data.unsupported[0] === 'default-auto-mask-parameters-unavailable')) {
    return { supported: false, reasons: [...data.unsupported] }
  }
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceDefaultAutoData } }
}

/** Gaussian raw-source retention/compiler capability. Existing round/bitmap
 * tips are legacy approximations; this result grants neither their execution
 * nor a Gaussian author/material/wire path. */
export function extractGaussianAutoSourceDataCapability(descriptor: BrushDescriptor):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceGaussianAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'gaussianAuto') return reject('source-material-is-not-gaussian-auto')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp') return reject('inconsistent-gaussian-auto-descriptor')
  const source = data.source
  if (source.shape !== 'circle' || source.ratio > 1 || source.spikes !== 2 || source.randomness !== 0 || source.density !== 1
    || !data.flags.materialFixed1 || data.flags.textureEnabled || descriptor.behavior?.colorAdjustment) return reject('unsupported-gaussian-auto-material-consumer')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceGaussianAutoData } }
}

/** Soft data readiness only. Schema validation binds the mapped radial entry
 * to the retained raw curve; it does not attest the compiler or admit pixels. */
export function extractSoftAutoSourceDataCapability(descriptor: BrushDescriptor):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceSoftAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'softAuto') return reject('source-material-is-not-soft-auto')
  if (data.unsupported.length) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== 'primary' || descriptor.behavior?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp') return reject('inconsistent-soft-auto-descriptor')
  const source = data.source
  if (source.ratio > 1 || source.spikes !== 2 || source.antialias || source.randomness !== 0 || source.density !== 1
    || !data.flags.materialFixed1 || data.flags.textureEnabled || descriptor.behavior?.colorAdjustment) return reject('unsupported-soft-auto-material-consumer')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  if (data.compiled?.version !== 2 || !data.compiled.radialCurve) return reject('native-radial-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceSoftAutoData } }
}

/** Composition belongs to the explicit trusted raster profile. Retaining a
 * source mask or author program cannot grant unsupported destination/effect law. */
export function canonicalSourceEffectReject(descriptor: BrushDescriptor,profile:CanonicalStrokeRasterProfile): string | undefined {
  const behavior = descriptor.behavior, rendering = behavior?.rendering
  if (!canonicalSourceComposition(descriptor,profile)) return 'outer-composition'
  if (rendering && (rendering.mode !== 'buildUp' || rendering.opacityCeiling === 'shape' || rendering.accumulation === 'maxAlpha')) return 'stroke-rendering-mode'
  if (rendering?.gammaCorrect || rendering?.luminance) return 'color-effect'
  if (descriptor.tip.alphaThreshold) return 'mask-threshold'
  if (behavior?.wetMix || behavior?.edgeBleed || behavior?.grain || behavior?.taper) return 'brush-effect'
  return undefined
}

/** First pressure-curve material DATA boundary. No context5, executable source
 * binding, author policy or raster grant is created here. */
export function extractCanonicalDefaultAutoPressureTextureProgramData(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>) {
 const reject=(reason:string)=>({supported:false as const,reasons:[reason]})
 try{
  const source=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
  if(!source||!Object.hasOwn(source,'value'))return reject('texture-original-source-unavailable')
  const captured=captureSourceTexturePressureProgram(source.value)
    const geometry=pressureTextureGeometry(descriptor,assets);if(!geometry.supported)return geometry
    const {patternAsset}=geometry
  const auto=extractDefaultAutoData(descriptor,false,'pressure-curve-data',captured.data)
  if(!auto.supported)return auto
  if(descriptor.mixer||descriptor.wet||descriptor.screentonePx||descriptor.behavior?.wetMix||descriptor.behavior?.edgeBleed||descriptor.behavior?.grain||descriptor.behavior?.taper)return reject('unsupported-texture-effect')
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,data:captured.data,program:captured.program,patternAsset})
 }catch{return reject('invalid-pressure-texture-program-data')}
}

function pressureTextureGeometry(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>){
 const reject=(reason:string)=>({supported:false as const,reasons:[reason]})
  const available=textureData(assets,['pattern']),pattern=textureData(available.pattern,['id','size'])
  if(typeof pattern.id!=='string'||!/^asset:[a-f0-9]{64}$/.test(pattern.id)||typeof pattern.size!=='number'||!Number.isInteger(pattern.size)||pattern.size<2||pattern.size>2048||(pattern.size&(pattern.size-1))!==0)return reject('texture-asset-unavailable')
  const field=Object.getOwnPropertyDescriptor(descriptor,'texture')
  if(!field||!Object.hasOwn(field,'value'))return reject('texture-descriptor-unavailable')
  const t=textureData(field.value,['id','periodPx','strength','application','patternSize','offset']),application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
  if(t.id!==pattern.id||t.strength!==1||application.mode!=='subtract'||application.soft!==false||offset.randomX!==false||offset.randomY!==false||size.width!==size.height||t.periodPx!==size.width)return reject('unsupported-pressure-texture')
  const dimension=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=1&&v<=2048
  if(!dimension(size.width)||size.width>pattern.size||!dimension(size.height)||size.height>pattern.size||!dimension(t.periodPx)||typeof offset.x!=='number'||typeof offset.y!=='number'||!Number.isSafeInteger(offset.x)||!Number.isSafeInteger(offset.y)||Object.is(offset.x,-0)||Object.is(offset.y,-0)||offset.x<0||offset.y<0||offset.x>=t.periodPx||offset.y>=t.periodPx)return reject('unsupported-static-texture-geometry')
  const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height})
 return {supported:true as const,patternAsset}
}

/** Closed native-default Soft DATA; no source, raster or room authority. */
export function extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>){
 const reject=(reason:string)=>({supported:false as const,reasons:[reason]})
 try{
  const field=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
  if(!field||!Object.hasOwn(field,'value'))return reject('texture-original-source-unavailable')
  const captured=captureSourceTextureNativeDefaultProgram(field.value),data=captured.data
  if(data.version!==2||data.source.kind!=='softAuto'||data.role!=='primary'||data.options.length!==9||data.compiled?.version!==4)return reject('native-default-soft-data-unavailable')
  // This original DATA-only frontier remains in the descriptor. A new explicit
  // Soft6 consumer interprets it only after full source/program validation.
  if(data.unsupported.some(reason=>reason!=='soft-auto-raster-author-unavailable'))return reject('unsupported-soft-texture-source')
  const source=data.source
  if(descriptor.model!=='stamp'||descriptor.behavior?.dual||source.ratio>1||source.spikes!==2||source.antialias||source.randomness!==0||source.density!==1||!data.flags.materialFixed1||!data.flags.textureEnabled)return reject('unsupported-soft-texture-source')
  if(!sourceStampPaintingMode(data))return reject('inconsistent-source-painting-mode')
  if(descriptor.mixer||descriptor.wet||descriptor.screentonePx||descriptor.behavior?.colorAdjustment||descriptor.behavior?.wetMix||descriptor.behavior?.edgeBleed||descriptor.behavior?.grain||descriptor.behavior?.taper)return reject('unsupported-texture-effect')
  const geometry=pressureTextureGeometry(descriptor,assets);if(!geometry.supported)return geometry
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,data:data as SourceStampData & {readonly version:2;readonly source:import('./sourceStampData.js').SourceSoftAutoData},program:captured.program,patternAsset:geometry.patternAsset})
 }catch{return reject('invalid-native-default-soft-texture-data')}
}

/** Closed Gaussian original pressure DATA. Random phase remains unresolved;
 * this creates no source binding, material, raster or author permission. */
export type CanonicalGaussianTexturePressureProgramDataResult =
 | {readonly supported:false;readonly reasons:readonly string[]}
 | {readonly supported:true;readonly status:'source-data-only';readonly rasterReady:false;
    readonly data:SourceStampData;
    readonly program:SourceTexturePressureProgramData;readonly patternAsset:CanonicalMaterialAsset;
    readonly phase:Readonly<{readonly kind:'unresolved-original-random-phase-v1';readonly x:number;readonly y:number;readonly randomX:true;readonly randomY:true}>}

export function extractCanonicalGaussianAutoTexturePressureProgramData(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>):CanonicalGaussianTexturePressureProgramDataResult{
 const reject=(reason:string)=>({supported:false as const,reasons:[reason]})
 try{
  const field=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
  if(!field||!Object.hasOwn(field,'value'))return reject('texture-original-source-unavailable')
  const captured=captureSourceGaussianTexturePressureProgram(field.value),data=captured.data
  if(data.version!==2||data.source.kind!=='gaussianAuto')return reject('gaussian-pressure-family-required')
  const source=data.source
  if(data.role!=='primary'||data.unsupported.length||data.options.length!==9||!data.flags.materialFixed1||!data.flags.textureEnabled||source.shape!=='circle'||source.antialias||source.ratio>1||source.spikes!==2||source.randomness!==0||source.density!==1||!sourceStampPaintingMode(data))return reject('unsupported-gaussian-texture-source')
  if(descriptor.model!=='stamp'||descriptor.mixer||descriptor.wet||descriptor.screentonePx||descriptor.behavior?.dual||descriptor.behavior?.colorAdjustment||descriptor.behavior?.wetMix||descriptor.behavior?.edgeBleed||descriptor.behavior?.grain||descriptor.behavior?.taper)return reject('unsupported-texture-effect')
  const available=textureData(assets,['pattern']),pattern=textureData(available.pattern,['id','size'])
  if(typeof pattern.id!=='string'||!/^asset:[a-f0-9]{64}$/.test(pattern.id)||typeof pattern.size!=='number'||!Number.isInteger(pattern.size)||pattern.size<2||pattern.size>2048||(pattern.size&(pattern.size-1))!==0)return reject('texture-asset-unavailable')
  const tfield=Object.getOwnPropertyDescriptor(descriptor,'texture')
  if(!tfield||!Object.hasOwn(tfield,'value'))return reject('texture-descriptor-unavailable')
  const t=textureData(tfield.value,['id','periodPx','strength','application','patternSize','offset']),application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
  if(t.id!==pattern.id||t.strength!==1||application.mode!=='subtract'||application.soft!==false||offset.randomX!==true||offset.randomY!==true)return reject('unsupported-gaussian-texture-data')
  const dimension=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=4096&&!Object.is(v,-0)
  if(!dimension(size.width)||!dimension(size.height)||size.width!==size.height||size.width>pattern.size||t.periodPx!==size.width||!dimension(t.periodPx)||typeof offset.x!=='number'||typeof offset.y!=='number'||!Number.isSafeInteger(offset.x)||!Number.isSafeInteger(offset.y)||Object.is(offset.x,-0)||Object.is(offset.y,-0)||offset.x<0||offset.y<0||offset.x>2147483647||offset.y>2147483647)return reject('unsupported-original-texture-geometry')
  const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height})
  const phase=Object.freeze({kind:'unresolved-original-random-phase-v1' as const,x:offset.x,y:offset.y,randomX:true as const,randomY:true as const})
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,data,program:captured.program,patternAsset,phase})
 }catch{return reject('invalid-gaussian-pressure-texture-data')}
}

/** Closed phase-independent union of already proven original pressure DATA. */
export function extractCanonicalTexturedAutoProgramData(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>) {
 const field=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
 if(!field||!Object.hasOwn(field,'value'))return {supported:false as const,reasons:['texture-original-source-unavailable']}
 const source=field.value&&typeof field.value==='object'?Object.getOwnPropertyDescriptor(field.value,'source'):undefined
 const kind=source&&Object.hasOwn(source,'value')&&source.value&&typeof source.value==='object'?Object.getOwnPropertyDescriptor(source.value,'kind'):undefined
 if(!kind||!Object.hasOwn(kind,'value'))return {supported:false as const,reasons:['texture-original-source-unavailable']}
 const k=kind.value
 if(k==='defaultAuto')return extractCanonicalDefaultAutoPressureTextureProgramData(descriptor,assets)
 if(k==='softAuto')return extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor,assets)
 if(k==='gaussianAuto')return extractCanonicalGaussianAutoTexturePressureProgramData(descriptor,assets)
 return {supported:false as const,reasons:['unsupported-textured-auto-family']}
}
