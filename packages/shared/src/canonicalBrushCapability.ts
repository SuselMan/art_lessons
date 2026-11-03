import {captureOriginalPixelImageGrid,captureOriginalPixelImageRole} from './canonicalPixelImageSourceCapture.js'
import {sourceColorProviderKind} from './sourceStampData.js'
import {captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from './canonicalSourceScale.js'
import {canonicalMaskingBlendModes,isCanonicalMaskingBlendMode} from './canonicalMaskingBlend.js'
import {canonicalPixelPrimaryTexturePin,canonicalMultiplyPrimaryTexturePin,resolveCanonicalTexturePhase,canonicalPrimaryTexturePin,canonicalFixedPrimaryTexturePin,type CanonicalPrimaryTexturePin,type CanonicalFixedPrimaryTexturePin} from './canonicalPrimaryTexture.js'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,CANONICAL_STROKE_RASTER_PROFILE,canonicalStrokeRasterContract,type CanonicalStrokeRasterProfile,type CanonicalStrokeComposition} from './canonicalStrokeFrame.js'
import {brushAssetIds,isBrushLibrary,type BrushDescriptor} from './brushes.js'
import type { CanonicalMaterialAsset,CanonicalMaterialImageSource } from './canonicalMaterialCodec.js'
import { captureSourcePlainAutoGeometryData, captureSourceTextureNativeDefaultProgram, captureSourceTexturePressureProgram, captureSourceGaussianTexturePressureProgram, isSourceStampData, sourceStampSourceKind, sourceStampRequiredCurves, type SourceStampData, type SourceTexturePressureProgramData } from './sourceStampData.js'

/** Only the native outer law representable by canonical over32 today.
 * This checks composition of an already verified descriptor, not source-data
 * readiness, descriptor schema, alphaDarken mode or other execution policy. */
function nativeOuterBlend(descriptor:BrushDescriptor):CanonicalStrokeComposition['outerBlend']|undefined {
  const behavior=descriptor.behavior,rendering=behavior?.rendering
  if(behavior?.erase===true)return 'erase'
  if((rendering?.wetEdges??0)!==0||(rendering?.burntEdges??0)!==0)return
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
  if(!mode||outerBlend!=='over'&&(!contract.genericSC||outerBlend!=='erase'&&mode!=='wash'))return
  return Object.freeze({mode,outerBlend})
}

/** Named Pixel composition extension. The browser HSY law is explicit and
 * never admitted by the historical native composition selector. */
export function canonicalPixelSourceComposition(descriptor:BrushDescriptor,rasterProfile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE):ReturnType<typeof canonicalSourceComposition>{
 const existing=canonicalSourceComposition(descriptor,rasterProfile)
 if(existing)return existing
 let contract:ReturnType<typeof canonicalStrokeRasterContract>
 try{contract=canonicalStrokeRasterContract(rasterProfile)}catch{return}
 const rendering=descriptor.behavior?.rendering,data=descriptor.sourceStamp
 if(!contract.genericSC||descriptor.behavior?.erase||rendering?.blendMode!=='color'||(rendering.wetEdges??0)!==0||(rendering.burntEdges??0)!==0||!isSourceStampData(data)||(data.settings.CompositeOp!==undefined&&data.settings.CompositeOp!=='color')||sourceStampPaintingMode(data)!=='wash')return
 return Object.freeze({mode:'wash',outerBlend:'colorHsyBrowser'})
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

/** Original explicit image application is not an alpha-mask fallback.
 * Legacy resource-derived mode stays with the original paired asset capture. */
function pixelImageRootAttributes(xml:unknown):ReadonlyMap<string,string>|undefined{
 if(typeof xml!=='string')return undefined
 const tag=/^\s*(?:<\?xml[^?]*\?>\s*)?<[-\w:.]+((?:\s+[-\w:.]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/.exec(xml)
 if(!tag)return undefined
 const attributes=new Map<string,string>()
 for(const entry of tag[1].matchAll(/\s+([-\w:.]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)){
   if(attributes.has(entry[1]))return undefined
   const raw=entry[2]??entry[3]
   if(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(raw))return undefined
   let valid=true
   const value=raw.replace(/&([^;]+);/g,(_,entity:string)=>{
     const named:Readonly<Record<string,string>>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}
     if(Object.hasOwn(named,entity))return named[entity]
     const cp=entity.startsWith('#x')?Number.parseInt(entity.slice(2),16):Number(entity.slice(1))
     if(!Number.isSafeInteger(cp)||!(cp===9||cp===10||cp===13||cp>=32&&cp<=0xd7ff||cp>=0xe000&&cp<=0xfffd||cp>=0x10000&&cp<=0x10ffff)){valid=false;return ''}
     return String.fromCodePoint(cp)
   })
   if(!valid)return undefined
   attributes.set(entry[1],value)
 }
 return attributes

}

function unsupportedPixelImageApplication(data:SourceStampData,descriptor:BrushDescriptor):boolean{
 const attributes=pixelImageRootAttributes(data.settings.brush_definition)
 if(!attributes)return true
 const number=(key:string)=>{const raw=attributes.get(key);return raw===undefined?undefined:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim())?Number(raw):NaN}
 // Native legacy preserveLightness takes precedence over brushApplication.
 if(attributes.has('preserveLightness'))return !Number.isFinite(number('preserveLightness'))
 if(!attributes.has('brushApplication'))return false
 const application=number('brushApplication')
 return application===3?descriptor.tip.material?.kind!=='gradient':application===undefined||![0,1,2].includes(application)
}

function extractImageFrameCapability(
  descriptor:BrushDescriptor,asset:{readonly id:string;readonly size:number},
  policy?:Readonly<{frameIndex?:number;animation?:NonNullable<BrushDescriptor['tip']['animation']>;material?:'verified-primary-texture';pixelTexture?:true;nativeImage?:true;role?:'primary'|'mask';dual?:true}>,
):CanonicalSinglePngResult {
  const animation=policy?.animation
  const reject = (reason: string): CanonicalSinglePngResult => ({ supported: false, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (data === undefined) return reject('legacy-descriptor-no-source-data')
  if (!isSourceStampData(data)) return reject('invalid-source-data')
  if (sourceStampSourceKind(data) !== 'image') return reject('source-material-is-not-image')
  if(policy?.nativeImage||policy?.pixelTexture){
    const original=pixelImageRootAttributes(data.settings.brush_definition)
    if(original?.get('type')==='abr_brush'){
      const proof=descriptor.tip.abrSource,selector=original.get('filename')||original.get('name')
      if(!proof||!selector||proof.sampleName!==selector||proof.width!==data.brush.width||proof.height!==data.brush.height)return reject('declared-abr-original-proof-unavailable')
    }
  }
  if((policy?.nativeImage||policy?.pixelTexture)&&unsupportedPixelImageApplication(data,descriptor))return reject('original-image-application-consumer-unavailable')
  if (data.unsupported.some(reason=>!(policy?.role==='mask'&&reason==='mask-prefix-and-master-size-unresolved')&&!((policy?.pixelTexture||policy?.nativeImage)&&(reason==='source-image-adjustments-unavailable'||reason==='source-color-provider-unresolved'&&(sourceColorProviderKind(data)!==undefined&&sourceColorProviderKind(data)!=='plain'))))) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== (policy?.role??'primary') || descriptor.behavior?.dual&&!policy?.dual) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'bitmap' || descriptor.tip.animation !== animation || descriptor.tip.material&&!policy?.pixelTexture&&!policy?.nativeImage) return reject('unsupported-source-material')
  const sampling = descriptor.tip.imageSampling
  const namedImage=!!(policy?.pixelTexture||policy?.nativeImage)
  let sourceRect=sampling?.sourceRect
  if(namedImage){try{sourceRect=captureOriginalPixelImageGrid(descriptor,data,asset,policy?.frameIndex??0)}catch{return reject('native-cas-source-grid-unavailable')}}
  if (!sourceRect || !namedImage&&(!sampling||sampling.kind !== 'integer-pyramid'||sampling.signal !== 'inverse-gray') || descriptor.tip.mask !== (animation?.frames[0] ?? asset.id)
    || !/^asset:[a-f0-9]{64}$/.test(asset.id) || !Number.isInteger(asset.size) || asset.size < 2 || asset.size > 2048
    || !Object.values(sourceRect).every(v => Number.isInteger(v) && v >= 0)
    || (!namedImage||!animation?.frameBounds)&&(sourceRect.width !== data.brush.width || sourceRect.height !== data.brush.height)
    || sourceRect.x + sourceRect.width > asset.size || sourceRect.y + sourceRect.height > asset.size) return reject('native-cas-source-grid-unavailable')
  if ((!data.flags.materialFixed1&&!((policy?.pixelTexture||policy?.nativeImage)&&hasCanonicalCapturedMaterialConsumers(data))) || (policy?.material==='verified-primary-texture'?!data.flags.textureEnabled:data.flags.textureEnabled) || descriptor.behavior?.colorAdjustment&&!((policy?.pixelTexture||policy?.nativeImage)&&hasCanonicalCapturedColorConsumers(data))) return reject('unsupported-material-consumer')
  if (data.options.length !== 9) return reject('native-option-program-unavailable')
  const rotation = data.options.find(o => o.id === 'Rotation')!
  const fan = rotation.checked && rotation.useCurve ? rotation.sensors.find(s => s.id === 'drawingAngle' && s.fanCorners) : undefined
  if (fan && (fan.fanStep! < 5 || fan.fanStep! > 90)) return reject('unsupported-source-fan-step')
  // This is the retained source reader's mode, not descriptor rendering or the
  // opacity option. Missing PaintOpAction is incremental in brush settings.
  const mode=sourceStampPaintingMode(data)
  if(!mode)return reject('inconsistent-source-painting-mode')
  const rect = sourceRect
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
function textureStrengthSettings(value:unknown,mode:'explicit'|'primary-grain8'='explicit'):boolean {
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
    &&typeof captured['Texture/Strength/Sensor']==='string'&&(mode==='primary-grain8'?primaryGrainPressureIdentity(captured['Texture/Strength/Sensor']):texturePressureIdentity(captured['Texture/Strength/Sensor']))
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
  return sourceStampRequiredCurves([...data.options,...(data.materialOptions??[]),...(data.colorOptions??[]),...(data.textureOption?[data.textureOption]:[])]).length === 0 || data.compiled !== undefined
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
/** Named extended native material consumers; historical extractors remain fixed1. */
function hasCanonicalCapturedColorConsumers(data:SourceStampData):boolean{
 const options=data.colorOptions,active=(name:string)=>['true','1'].includes((data.settings['Pressure'+name]??'false').toLowerCase())
 if(!['Mix','Darken','h','s','v'].some(active))return (sourceColorProviderKind(data)!==undefined&&sourceColorProviderKind(data)!=='plain')
 if(!options||options.length!==5||!data.compiled||!hasCanonicalSourceCurvePrograms(data)||sourceColorProviderKind(data)===undefined)return false
 return ['Mix','Darken','h','s','v'].every((id,i)=>options[i].id===id&&options[i].checked===active(id)&&options[i].min===0&&options[i].max===1&&Math.abs(options[i].strength)<=1)
}
function hasCanonicalCapturedMaterialConsumers(data:SourceStampData):boolean {
 const options=data.materialOptions,active=(name:string)=>['true','1'].includes((data.settings['Pressure'+name]??'false').toLowerCase())
 if(!data.compiled||!hasCanonicalSourceCurvePrograms(data))return false
 const materials=['Softness','LightnessStrength','Sharpness'],colors=['Mix','Darken','h','s','v']
 if(materials.some(active)&&(!options||options.length!==3||!materials.every((id,i)=>options[i].id===id&&options[i].checked===active(id))))return false
 if(colors.some(active)&&!hasCanonicalCapturedColorConsumers(data))return false
 return materials.some(active)||colors.some(active)
}
function resolvedMaskSourceReason(data:SourceStampData,reason:string,role:'primary'|'mask'|undefined,extendedSpikes:boolean,seededMask=false):boolean {
 if(extendedSpikes&&reason==='source-color-provider-unresolved'&&(sourceColorProviderKind(data)!==undefined&&sourceColorProviderKind(data)!=='plain'))return true
 if(role==='mask'&&reason==='mask-prefix-and-master-size-unresolved')return true
 if(!extendedSpikes||data.version!==2||data.source.kind==='image')return false
 if(reason==='soft-auto-raster-author-unavailable'&&data.source.kind==='softAuto'&&data.compiled?.version===2&&data.compiled.radialCurve){const resolution=Math.floor(data.source.diameter*4+.5);return Number.isSafeInteger(resolution)&&resolution+(data.source.shape==='rect'?1:2)<=16384}
 return ['default-auto-mask-parameters-unavailable','gaussian-auto-mask-parameters-unavailable'].includes(reason)&&Number.isSafeInteger(data.source.spikes)&&data.source.spikes>=2&&data.source.spikes<=64&&(seededMask?[data.source.randomness,data.source.density].every(v=>Number.isFinite(v)&&v>=0&&v<=1):data.source.randomness===0&&data.source.density===1)
}
function extractDefaultAutoData(descriptor: BrushDescriptor, seededDensity: boolean, material: 'plain'|'fixed-one-texture'|'pressure-curve-data'|'pixel-texture' = 'plain',capturedData?:SourceStampData,role?:'primary'|'mask',extendedSpikes=false,seededMask=false):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceDefaultAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = capturedData??descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'defaultAuto') return reject('source-material-is-not-default-auto')
  if (!seededDensity && data.unsupported.some(reason=>!resolvedMaskSourceReason(data,reason,role,extendedSpikes,seededMask))) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== (role??'primary') || descriptor.behavior?.dual&&role===undefined) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp' || descriptor.tip.kind !== 'procedural' || descriptor.tip.profile?.kind !== 'standard'
    || descriptor.tip.mask || descriptor.tip.animation || descriptor.tip.imageSampling || descriptor.tip.material) return reject('inconsistent-default-auto-descriptor')
  const source = data.source
  if ((!extendedSpikes?source.spikes!==2:!Number.isSafeInteger(source.spikes)||source.spikes<2||source.spikes>64) || (!seededMask&&source.randomness !== 0)||![source.randomness,source.density].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||(!seededMask&&!seededDensity&&source.density!==1) || (!data.flags.materialFixed1&&!(extendedSpikes&&hasCanonicalCapturedMaterialConsumers(data)))
    || (material !== 'plain' ? !data.flags.textureEnabled : data.flags.textureEnabled)
    || (descriptor.behavior?.colorAdjustment&&!(extendedSpikes&&hasCanonicalCapturedColorConsumers(data)))) return reject('unsupported-default-auto-material-consumer')
  const p = descriptor.tip.profile
  if (p.shape !== (source.shape === 'circle' ? 'ellipse' : 'rectangle') || p.horizontalFade !== source.horizontalFade
    || p.verticalFade !== source.verticalFade || p.antialias !== source.antialias) return reject('inconsistent-default-auto-profile')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !(material==='pressure-curve-data'&&capturedData?.compiled?.version===3 ? true : hasCanonicalSourceCurvePrograms(data))) return reject('native-option-program-unavailable')
  // The historical tag conflates spikes, randomness and density. Only the
  // density-only frontier is retired, AFTER every source/material/program check.
  // Retain the original tag/data; never normalize unrelated unsupported reasons.
  if (data.unsupported.some(reason=>!resolvedMaskSourceReason(data,reason,role,extendedSpikes,seededMask)) && !(seededDensity && source.density < 1
    && data.unsupported.length === 1 && data.unsupported[0] === 'default-auto-mask-parameters-unavailable')) {
    return { supported: false, reasons: [...data.unsupported] }
  }
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceDefaultAutoData } }
}

/** Gaussian raw-source retention/compiler capability. Existing round/bitmap
 * tips are legacy approximations; this result grants neither their execution
 * nor a Gaussian author/material/wire path. */
export function extractGaussianAutoSourceDataCapability(descriptor:BrushDescriptor){return extractGaussianAutoDataCore(descriptor)}
function extractGaussianAutoDataCore(descriptor:BrushDescriptor,role?:'primary'|'mask',extendedSpikes=false,pixelTexture=false,seededMask=false):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceGaussianAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'gaussianAuto') return reject('source-material-is-not-gaussian-auto')
  if (data.unsupported.some(reason=>!resolvedMaskSourceReason(data,reason,role,extendedSpikes,seededMask))) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== (role??'primary') || descriptor.behavior?.dual&&role===undefined) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp') return reject('inconsistent-gaussian-auto-descriptor')
  const source = data.source
  if ((!extendedSpikes&&source.shape !== 'circle') || source.ratio > 1 || (!extendedSpikes?source.spikes!==2:!Number.isSafeInteger(source.spikes)||source.spikes<2||source.spikes>64) || (!seededMask&&(source.randomness!==0||source.density!==1))||![source.randomness,source.density].every(v=>Number.isFinite(v)&&v>=0&&v<=1)
    || (!data.flags.materialFixed1&&!(extendedSpikes&&hasCanonicalCapturedMaterialConsumers(data))) || (pixelTexture?!data.flags.textureEnabled:data.flags.textureEnabled) || (descriptor.behavior?.colorAdjustment&&!(extendedSpikes&&hasCanonicalCapturedColorConsumers(data)))) return reject('unsupported-gaussian-auto-material-consumer')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceGaussianAutoData } }
}

/** Soft data readiness only. Schema validation binds the mapped radial entry
 * to the retained raw curve; it does not attest the compiler or admit pixels. */
export function extractSoftAutoSourceDataCapability(descriptor:BrushDescriptor){return extractSoftAutoDataCore(descriptor)}
function extractSoftAutoDataCore(descriptor:BrushDescriptor,role?:'primary'|'mask',extendedSpikes=false,pixelTexture=false,seededMask=false):
  { readonly supported: true; readonly status: 'source-data-only'; readonly rasterReady: false; readonly data: SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceSoftAutoData } } |
  { readonly supported: false; readonly reasons: readonly string[] } {
  const reject = (reason: string) => ({ supported: false as const, reasons: [reason] })
  const data = descriptor.sourceStamp
  if (!isSourceStampData(data)) return reject('invalid-or-missing-source-data')
  if (data.version !== 2 || data.source.kind !== 'softAuto') return reject('source-material-is-not-soft-auto')
  if (data.unsupported.some(reason=>!resolvedMaskSourceReason(data,reason,role,extendedSpikes,seededMask))) return { supported: false, reasons: [...data.unsupported] }
  if (data.role !== (role??'primary') || descriptor.behavior?.dual&&role===undefined) return reject('mask-master-size-unresolved')
  if (descriptor.model !== 'stamp') return reject('inconsistent-soft-auto-descriptor')
  const source = data.source
  if (source.ratio > 1 || (!extendedSpikes?source.spikes!==2:!Number.isSafeInteger(source.spikes)||source.spikes<2||source.spikes>64) || (!extendedSpikes&&(source.shape!=='circle'||source.antialias)) || (!seededMask&&(source.randomness!==0||source.density!==1))||![source.randomness,source.density].every(v=>Number.isFinite(v)&&v>=0&&v<=1)
    || (!data.flags.materialFixed1&&!(extendedSpikes&&hasCanonicalCapturedMaterialConsumers(data))) || (pixelTexture?!data.flags.textureEnabled:data.flags.textureEnabled) || (descriptor.behavior?.colorAdjustment&&!(extendedSpikes&&hasCanonicalCapturedColorConsumers(data)))) return reject('unsupported-soft-auto-material-consumer')
  if (!sourceStampPaintingMode(data)) return reject('inconsistent-source-painting-mode')
  if (data.options.length !== 9 || !hasCanonicalSourceCurvePrograms(data)) return reject('native-option-program-unavailable')
  if (data.compiled?.version !== 2 || !data.compiled.radialCurve) return reject('native-radial-program-unavailable')
  return { supported: true, status: 'source-data-only', rasterReady: false,
    data: data as SourceStampData & { readonly version: 2; readonly source: import('./sourceStampData.js').SourceSoftAutoData } }
}

/** Composition belongs to the explicit trusted raster profile. Retaining a
 * source mask or author program cannot grant unsupported destination/effect law. */
export function canonicalSourceEffectReject(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile):string|undefined{return sourceEffectReject(descriptor,profile,false)}
function sourceEffectReject(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile,nativeSharpness:boolean,pixelComposition=false):string|undefined {
  const behavior = descriptor.behavior, rendering = behavior?.rendering
  if (!(pixelComposition?canonicalPixelSourceComposition(descriptor,profile):canonicalSourceComposition(descriptor,profile))) return 'outer-composition'
  if (rendering && (rendering.mode !== 'buildUp' || rendering.opacityCeiling === 'shape' || rendering.accumulation === 'maxAlpha')) return 'stroke-rendering-mode'
  if (rendering?.gammaCorrect || rendering?.luminance) return 'color-effect'
  if (descriptor.tip.alphaThreshold&&!nativeSharpness) return 'mask-threshold'
  if (behavior?.wetMix || behavior?.edgeBleed || behavior?.grain || behavior?.taper) return 'brush-effect'
  return undefined
}

/** Native Sharpness is supplied by resolved material parameters on the named
 * Pixel path. Legacy alphaThreshold entrypoints retain their old rejection. */
export function canonicalPixelSourceEffectReject(descriptor:BrushDescriptor,profile:CanonicalStrokeRasterProfile):string|undefined{
 const data=descriptor.sourceStamp,threshold=descriptor.tip.alphaThreshold
 let nativeSharpness=false
 if(threshold&&canonicalStrokeRasterContract(profile).genericSC&&isSourceStampData(data)&&hasCanonicalCapturedMaterialConsumers(data)&&['true','1'].includes((data.settings.PressureSharpness??'false').toLowerCase())){
  const value=Number(data.settings.SharpnessValue??data.settings['Sharpness/factor']??'1')
  const softness=data.settings.SharpnessValue===undefined&&data.settings['Sharpness/factor']!==undefined?value:Number(data.settings['Sharpness/softness']??'0')/100
  nativeSharpness=Number.isFinite(value)&&value>=0&&value<=1&&Number.isFinite(softness)&&softness>=0&&softness<=1&&threshold.value===value&&threshold.softness===softness
 }
 return sourceEffectReject(descriptor,profile,nativeSharpness,true)
}

/** First pressure-curve material DATA boundary. No context5, executable source
 * binding, author policy or raster grant is created here. */
export function extractCanonicalDefaultAutoPressureTextureProgramData(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>) {return extractDefaultPressureTextureProgramDataCore(descriptor,assets,false)}
function extractDefaultPressureTextureProgramDataCore(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>,savedPhase7:boolean) {
 const reject=(reason:string)=>({supported:false as const,reasons:[reason]})
 try{
  const source=Object.getOwnPropertyDescriptor(descriptor,'sourceStamp')
  if(!source||!Object.hasOwn(source,'value'))return reject('texture-original-source-unavailable')
  const captured=captureSourceTexturePressureProgram(source.value)
    const geometry=pressureTextureGeometry(descriptor,assets,savedPhase7);if(!geometry.supported)return geometry
    const {patternAsset}=geometry
  const auto=extractDefaultAutoData(descriptor,false,'pressure-curve-data',captured.data)
  if(!auto.supported)return auto
  if(descriptor.mixer||descriptor.wet||descriptor.screentonePx||descriptor.behavior?.wetMix||descriptor.behavior?.edgeBleed||descriptor.behavior?.grain||descriptor.behavior?.taper)return reject('unsupported-texture-effect')
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,data:captured.data,program:captured.program,patternAsset})
 }catch{return reject('invalid-pressure-texture-program-data')}
}

function pressureTextureGeometry(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>,savedPhase7:boolean){
 const reject=(reason:string)=>({supported:false as const,reasons:[reason]})
  const available=textureData(assets,['pattern']),pattern=textureData(available.pattern,['id','size'])
  if(typeof pattern.id!=='string'||!/^asset:[a-f0-9]{64}$/.test(pattern.id)||typeof pattern.size!=='number'||!Number.isInteger(pattern.size)||pattern.size<2||pattern.size>2048||(pattern.size&(pattern.size-1))!==0)return reject('texture-asset-unavailable')
  const field=Object.getOwnPropertyDescriptor(descriptor,'texture')
  if(!field||!Object.hasOwn(field,'value'))return reject('texture-descriptor-unavailable')
  const t=textureData(field.value,['id','periodPx','strength','application','patternSize','offset']),application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
  if(t.id!==pattern.id||t.strength!==1||application.mode!=='subtract'||application.soft!==false||(savedPhase7?(typeof offset.randomX!=='boolean'||typeof offset.randomY!=='boolean'):(offset.randomX!==false||offset.randomY!==false))||size.width!==size.height||t.periodPx!==size.width)return reject('unsupported-pressure-texture')
  const dimension=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=1&&v<=2048
  if(!dimension(size.width)||size.width>pattern.size||!dimension(size.height)||size.height>pattern.size||!dimension(t.periodPx)||typeof offset.x!=='number'||typeof offset.y!=='number'||!Number.isSafeInteger(offset.x)||!Number.isSafeInteger(offset.y)||Object.is(offset.x,-0)||Object.is(offset.y,-0)||!savedPhase7&&(offset.x<0||offset.y<0||offset.x>=t.periodPx||offset.y>=t.periodPx))return reject('unsupported-static-texture-geometry')
  const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height})
 return {supported:true as const,patternAsset}
}

/** Closed native-default Soft DATA; no source, raster or room authority. */
export function extractCanonicalSoftAutoNativeDefaultTextureProgramData(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>) {return extractSoftNativeDefaultTextureProgramDataCore(descriptor,assets,false)}
function extractSoftNativeDefaultTextureProgramDataCore(descriptor:BrushDescriptor,assets:Readonly<{pattern:Readonly<{id:string;size:number}>}>,savedPhase7:boolean){
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
  const geometry=pressureTextureGeometry(descriptor,assets,savedPhase7);if(!geometry.supported)return geometry
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
 if(k==='defaultAuto')return extractDefaultPressureTextureProgramDataCore(descriptor,assets,true)
 if(k==='softAuto')return extractSoftNativeDefaultTextureProgramDataCore(descriptor,assets,true)
 if(k==='gaussianAuto')return extractCanonicalGaussianAutoTexturePressureProgramData(descriptor,assets)
 return {supported:false as const,reasons:['unsupported-textured-auto-family']}
}

/** Immutable known-mechanism DATA only, never a read/BEGIN/root grant. */
export function extractCanonicalPlainAutoTiltGeometryData(original:unknown):
 {readonly supported:false;readonly reasons:readonly string[]} |
 Readonly<{supported:true;status:'source-data-only';rasterReady:false;kind:'plain-auto-tilt-v1';descriptor:Readonly<BrushDescriptor>;data:Extract<ReturnType<typeof extractDefaultAutoSourceDataCapability>,{supported:true}>['data'];maxScale:1;maxRatio:1;allRotations:true}> {
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const captured=captureSourcePlainAutoGeometryData(original),descriptor=captured.descriptor as unknown as BrushDescriptor,data=captured.data
  const base=extractDefaultAutoData(descriptor,false,'plain',data)
  if(!base.supported)return reject(base.reasons.join(','))
  if(base.data.source.shape!=='circle'||sourceStampPaintingMode(data)!=='wash'||data.timing.enabled||data.brush.scale!==1||data.flags.mirrorX||data.flags.mirrorY||data.options.some(o=>o.checked&&['Scatter','Mirror'].includes(o.id)))return reject('plain-tilt unsupported mechanism')
  const single=(id:string,sensor:string)=>{const o=data.options.find(o=>o.id===id);return !!o&&o.checked&&o.useCurve&&o.useSameCurve&&o.curveMode===0&&o.strength===1&&o.min===0&&o.max===1&&o.sensors.length===1&&o.sensors[0].id===sensor}
  if(!single('Size','tiltElevation')||!single('Ratio','tiltElevation')||!single('Rotation','tiltDirection'))return reject('plain-tilt option subset')
  if(data.options.some(o=>o.checked&&o.useCurve&&o.sensors.some(x=>!['pressure','tiltElevation','tiltDirection'].includes(x.id))))return reject('plain-tilt sensor subset')
  for(const o of data.options)if(o.checked&&!['Size','Ratio','Rotation'].includes(o.id)&&o.useCurve&&(o.sensors.length!==1||o.sensors[0].id!=='pressure'))return reject('plain-tilt auxiliary option')
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,kind:'plain-auto-tilt-v1' as const,descriptor:Object.freeze(descriptor),data:base.data,maxScale:1 as const,maxRatio:1 as const,allRotations:true as const})
 }catch{return reject('invalid plain-tilt original DATA')}
}

/** Full original DATA copy before image/material filters inspect nested fields.
 * Local bounded capture only; this does not attest origin, hashes or CAS bytes. */
function capturePrimaryGrainOriginal(value:unknown):unknown {
 let nodes=0,chars=0
 const stack=new Set<object>()
 const copy=(v:unknown,depth:number):unknown=>{
  if(++nodes>8192||depth>24)throw new TypeError('Primary grain descriptor bound')
  if(v===null||typeof v==='boolean')return v
  if(typeof v==='number'){if(!Number.isFinite(v))throw new TypeError('Nonfinite primary grain DATA');return v}
  if(typeof v==='string'){chars+=v.length;if(v.length>65536||chars>524288)throw new TypeError('Primary grain text bound');return v}
  if(!v||typeof v!=='object'||stack.has(v))throw new TypeError('Primary grain DATA required')
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v),keys=Reflect.ownKeys(v)
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw new TypeError('Primary grain DATA prototype')
  const length=array?Object.getOwnPropertyDescriptor(v,'length'):undefined
  if(array?(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>4096||keys.length!==length.value+1):keys.length>256)throw new TypeError('Primary grain DATA keys')
  const out:Record<string,unknown>|unknown[]=array?[]:Object.create(null);stack.add(v)
  try{for(const key of keys){if(array&&key==='length')continue;if(typeof key!=='string'||key.length>128||array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=length!.value))throw new TypeError('Primary grain DATA key');chars+=key.length;if(chars>524288)throw new TypeError('Primary grain text bound');const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value'))throw new TypeError('Primary grain DATA accessor');Object.defineProperty(out,key,{value:copy(d.value,depth+1),enumerable:true})}}
  finally{stack.delete(v)}
  return Object.freeze(out)
 }
 return copy(value,0)
}
/** This native default grammar is enabled ONLY by the named8 classifier. */
function primaryGrainPressureIdentity(xml:string):boolean {
 return texturePressureIdentity(xml)||xml.length<=2048&&/^[ \t\r\n]*(?:<!DOCTYPE params>[ \t\r\n]*)?<params[ \t\r\n]+id[ \t\r\n]*=[ \t\r\n]*(?:"pressure"|'pressure')[ \t\r\n]*\/>[ \t\r\n]*$/.test(xml)
}
export function extractCanonicalPrimaryGrainImageAuthorData(original:unknown,assets:Readonly<{primary:Readonly<{id:string;size:number}>;pattern:Readonly<{id:string;size:number}>}>) {
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const available=textureData(assets,['primary','pattern']),primary=textureData(available.primary,['id','size']),pattern=textureData(available.pattern,['id','size'])
  if(typeof primary.id!=='string'||typeof primary.size!=='number'||typeof pattern.id!=='string'||typeof pattern.size!=='number'||primary.id===pattern.id)return reject('primary-grain assets unavailable')
  // Reuse the existing descriptor schema against declared metadata only. The
  // synthetic library envelope is NOT a claim of original import provenance.
  const descriptorData=capturePrimaryGrainOriginal(original)
  const library={schemaVersion:1,brushes:[{descriptor:descriptorData,name:'',source:'',warnings:[]}],assets:[primary,pattern].map(a=>({id:a.id,size:a.size,file:String(a.id).slice(6)+'.bin'})),skipped:[]}
  if(!isBrushLibrary(library))return reject('invalid primary-grain original descriptor')
  const descriptor=library.brushes[0].descriptor,data=descriptor.sourceStamp
  if(!isSourceStampData(data)||data.version!==2||data.source.kind!=='image'||data.compiled?.version!==2||!hasCanonicalSourceCurvePrograms(data)||data.timing.enabled||data.unsupported.length||data.flags.mirrorX||data.flags.mirrorY)return reject('primary-grain image program unavailable')
  if(descriptor.mixer||descriptor.wet||descriptor.screentonePx||descriptor.behavior?.dual||canonicalSourceEffectReject(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return reject('unsupported primary-grain effect')
  const selected=canonicalSourceComposition(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
  if(selected?.mode!=='buildup'||selected.outerBlend!=='over')return reject('primary-grain requires original buildup OVER')
  if(data.options.some(o=>o.checked&&['Ratio','Scatter','Mirror','Spacing','Rate'].includes(o.id)))return reject('unsupported primary-grain option')
  for(const o of data.options){if(!o.checked)continue
   const sensors=o.id==='Size'?['pressure','tiltElevation']:o.id==='Rotation'?['drawingAngle','tiltDirection']:['pressure']
   if(!['Size','Rotation','Opacity','Flow'].includes(o.id)||!o.useCurve||!o.useSameCurve||o.curveMode!==0||o.min!==0||o.max!==1||o.strength!==1||o.sensors.length!==1||!sensors.includes(o.sensors[0].id))return reject('unsupported primary-grain sensor/curve')
  }
  if(!textureStrengthSettings(data.settings,'primary-grain8'))return reject('primary-grain native pressure identity unavailable')
  if(Object.keys(data.settings).some(k=>k.startsWith('Texture/Pattern/')&&k!=='Texture/Pattern/Enabled'))return reject('unresolved retained pattern preprocessing')
  const t=textureData(descriptor.texture,['id','periodPx','strength','application','patternSize','offset']),application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
  if(t.id!==pattern.id||t.strength!==1||application.mode!=='multiply'||application.soft!==false||offset.randomX!==false||offset.randomY!==false||typeof size.width!=='number'||typeof size.height!=='number'||size.width!==size.height||t.periodPx!==size.width||typeof offset.x!=='number'||typeof offset.y!=='number')return reject('unsupported primary-grain texture law')
  const phasePolicy=Object.freeze({width:size.width,height:size.height,offsetX:offset.x,offsetY:offset.y,randomX:false,randomY:false})
  const phase=resolveCanonicalTexturePhase(phasePolicy,()=>{throw new TypeError('Unexpected primary-grain entropy')})
  const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height})
  canonicalMultiplyPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'hard-multiply-u8-native-v1',width:size.width,height:size.height,periodX:size.width,periodY:size.height,phase,strength:'recorded-grain-v1'},patternAsset)
  const image=extractImageFrameCapability(descriptor,{id:primary.id,size:primary.size},{material:'verified-primary-texture'})
  if(!image.supported)return image
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,kind:'primary-grain-image-author-v1' as const,descriptor:Object.freeze(descriptor),data,image:image.capability,patternAsset,phasePolicy,strengthPolicy:'pressure-identity-half-up-u8-v1' as const,composition:selected})
 }catch{return reject('invalid primary-grain original DATA')}
}

/** Captured native Pixel Auto mechanism; DATA only, never a policy/BEGIN grant. */
export function extractCanonicalDynamicAutoGeometryData(original:unknown,assets?:Readonly<{pattern:Readonly<{id:string;size:number}>}>) {
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const captured=capturePrimaryGrainOriginal(original)
  const library={schemaVersion:1,brushes:[{descriptor:captured,name:'',source:'',warnings:[]}],assets:assets?[{id:assets.pattern.id,size:assets.pattern.size,file:assets.pattern.id.slice(6)+'.bin'}]:[],skipped:[]}
  if(!isBrushLibrary(library))return reject('invalid dynamic Auto descriptor')
  const descriptor=library.brushes[0].descriptor,data=descriptor.sourceStamp
  if(!isSourceStampData(data)||data.version!==2||data.source.kind==='image'||data.unsupported.some(reason=>!resolvedMaskSourceReason(data,reason,undefined,true,true))||canonicalPixelSourceEffectReject(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return reject('unsupported dynamic Auto source')
  const material=data.flags.textureEnabled?(assets?extractCanonicalTexturedAutoProgramData(descriptor,assets):undefined):data.source.kind==='defaultAuto'?extractDefaultAutoData(descriptor,false,'plain',data,undefined,true,true):data.source.kind==='gaussianAuto'?extractGaussianAutoDataCore(descriptor,undefined,true,false,true):extractSoftAutoDataCore(descriptor,undefined,true,false,true)
  if(!material?.supported)return reject('unsupported dynamic Auto kernel/program')
  if(data.brush.scale<=0||data.brush.scale>1)return reject('dynamic Auto scale bound')
  const airbrush=data.settings['PaintOpSettings/isAirbrushing']
  if(airbrush!==undefined&&airbrush!=='true'&&airbrush!=='false'||(airbrush==='true')!==data.timing.enabled||!Number.isFinite(data.timing.rate)||data.timing.rate<=0||typeof data.timing.ignoreDistance!=='boolean')return reject('inconsistent dynamic Auto timing')
  for(const option of [...data.options,...(data.materialOptions??[]),...(data.colorOptions??[]),...(data.textureOption?[data.textureOption]:[])]){
   if(!option.checked)continue
   if((option.id==='Size'||option.id==='Ratio')&&(option.min<0||option.max>1))return reject('dynamic Auto geometry bound')
   // The application's flat canvas supplies native default perspective=1.
   for(const sensor of option.sensors)if(option.useCurve&&sensor.id==='drawingAngle'&&sensor.fanCorners&&(!Number.isFinite(sensor.fanStep)||sensor.fanStep!<5||sensor.fanStep!>90))return reject('dynamic Auto fan bound')
  }
  return Object.freeze({supported:true as const,status:'source-data-only' as const,rasterReady:false as const,kind:'dynamic-auto-geometry-v1' as const,descriptor,data,material,maxScale:1 as const,maxRatio:1 as const,allRotations:true as const})
 }catch{return reject('invalid dynamic Auto original DATA')}
}

/** Native dual role binding retains the actual master/child and blend law.
 * It never projects a mask into a primary descriptor or grants execution. */
export function extractCanonicalPixelDualSourceData(original:unknown,available:readonly Readonly<{id:string;size:number}>[],options?:CanonicalSourceScaleOptions) {
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const captured=capturePrimaryGrainOriginal(original)
  const library={schemaVersion:1,brushes:[{descriptor:captured,name:'',source:'',warnings:[]}],assets:available.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
  if(!isBrushLibrary(library))return reject('invalid dual original descriptor')
  const descriptor=library.brushes[0].descriptor,dual=descriptor.behavior?.dual
  if(!dual||dual.brush.behavior?.dual)return reject('dual child unavailable')
  const nativeMode=descriptor.sourceStamp?.settings['MaskingBrush/MaskingCompositeOp']
  const nativeModes:Readonly<Record<string,import('./canonicalMaskingBlend.js').CanonicalMaskingBlendMode>>={multiply:'multiply',darken:'darken',overlay:'overlay',dodge:'colorDodge',burn:'colorBurn',linear_burn:'linearBurn',linear_dodge:'add',hard_mix_photoshop:'hardMix',hard_mix_softer_photoshop:'hardMixSofter',subtract:'subtract'}
  const blendMode=typeof nativeMode==='string'&&Object.hasOwn(nativeModes,nativeMode)?nativeModes[nativeMode]:undefined
  if(!isCanonicalMaskingBlendMode(blendMode)||canonicalMaskingBlendModes.indexOf(blendMode)>=10)return reject('unsupported native masking blend')
  const composition=canonicalPixelSourceComposition(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
  if(!composition)return reject('Missing effective dual composition')
  const role=(d:BrushDescriptor,id:'primary'|'mask')=>{
   const data=d.sourceStamp
   if(!isSourceStampData(data)||data.role!==id||sourceStampSourceKind(data)!=='image'&&data.unsupported.some(reason=>!resolvedMaskSourceReason(data,reason,id,true,true))||canonicalPixelSourceEffectReject(d,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return reject('unsupported dual role source')
   const material=data.version===2&&data.source.kind==='defaultAuto'?extractDefaultAutoData(d,false,data.flags.textureEnabled?'pixel-texture':'plain',data,id,true,true):data.version===2&&data.source.kind==='gaussianAuto'?extractGaussianAutoDataCore(d,id,true,data.flags.textureEnabled,true):data.version===2&&data.source.kind==='softAuto'?extractSoftAutoDataCore(d,id,true,data.flags.textureEnabled,true):(()=>{
    const assets:CanonicalMaterialAsset[]=[]
    for(const [frameIndex,frame] of (d.tip.animation?.frames??[d.tip.mask!]).entries()){
      const asset=available.find(a=>a.id===frame);if(!asset)return reject('dual image frame asset unavailable')
      const captured=extractImageFrameCapability(d,asset,{frameIndex,role:id,dual:true,nativeImage:true,...data.flags.textureEnabled?{material:'verified-primary-texture' as const,pixelTexture:true}:{},animation:d.tip.animation});if(!captured.supported)return captured
      assets.push(captured.capability.asset)
    }
    if(!assets.length||assets.length>256||!d.tip.animation?.frameBounds&&assets.some(a=>['size','x','y','width','height'].some(k=>Reflect.get(a,k)!==Reflect.get(assets[0],k))))return reject('dual image frame grids differ')
    const first=extractImageFrameCapability(d,available.find(a=>a.id===d.tip.mask)!,{role:id,dual:true,nativeImage:true,...data.flags.textureEnabled?{material:'verified-primary-texture' as const,pixelTexture:true}:{},animation:d.tip.animation})
    return first.supported?Object.freeze({...first,frameAssets:Object.freeze(assets)}):first
   })()
   if(!material.supported)return material
   const textureSource=data.flags.textureEnabled?capturePixelRoleTexture(d,data,available,composition):undefined
   if(textureSource&&!textureSource.supported)return textureSource
   return Object.freeze({supported:true as const,descriptor:d,data,material,...textureSource?{textureSource}:{}})
  }
  const primary=role(descriptor,'primary');if(!primary.supported)return primary
  const mask=role(dual.brush,'mask');if(!mask.supported)return mask
  const settings=primary.data.settings
  if(settings['MaskingBrush/Enabled']!=='true')return reject('native masking brush not enabled')
  const useMaster=settings['MaskingBrush/UseMasterSize']??'true',coefficient=settings['MaskingBrush/MasterSizeCoeff']??'1'
  if(!['true','false'].includes(useMaster)||!/^[ \t]*[+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[ \t]*$/.test(coefficient))return reject('invalid native master size policy')
  const coeff=Number(coefficient),baseSize=(d:SourceStampData)=>d.version===2&&d.source.kind!=='image'?d.source.diameter:Math.max(d.brush.width,d.brush.height)
  const selectedScale=captureCanonicalSourceScaleOptions(options).sourceScale??primary.data.brush.scale
  const requested=coeff*baseSize(primary.data)*selectedScale
  if(!Number.isFinite(coeff)||coeff<=0||!Number.isFinite(requested)||requested<=0)return reject('invalid native master size')
  const effectiveMaskScale=useMaster==='true'?Math.min(requested,3000)/baseSize(mask.data):mask.data.brush.scale
  if(!Number.isFinite(effectiveMaskScale)||effectiveMaskScale<=0)return reject('invalid effective mask scale')
  const captureImageRole=(role:typeof primary,scale:number):Readonly<typeof primary&{effectiveBrushScale:number;imageSource?:CanonicalMaterialImageSource;imageAssets?:readonly CanonicalMaterialAsset[]} >=>{
   if(sourceStampSourceKind(role.data)!=='image')return Object.freeze({...role,effectiveBrushScale:scale})
   const image=captureOriginalPixelImageRole(role.descriptor,role.data,available,1,scale)
   return Object.freeze({...role,effectiveBrushScale:scale,imageSource:image.source,imageAssets:image.assets})
  }
  return Object.freeze({supported:true as const,kind:'pixel-dual-source-v1' as const,descriptor,primary:captureImageRole(primary,selectedScale),mask:captureImageRole(mask,effectiveMaskScale),blendMode,sampling:dual.sampling??'independent',masterSizePolicy:Object.freeze({kind:'krita-default-max-mask-size-v1' as const,maxSize:3000 as const,useMasterSize:useMaster==='true',coefficient:coeff,effectiveSize:baseSize(mask.data)*effectiveMaskScale})})
 }catch{return reject('invalid dual original DATA')}
}

/** Common original-image material capture; no replacement alpha descriptor. */
function captureCanonicalImageMaterialSource(original:unknown,available:readonly Readonly<{id:string;size:number}>[]){
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 const captured=capturePrimaryGrainOriginal(original),library={schemaVersion:1,brushes:[{descriptor:captured,name:'',source:'',warnings:[]}],assets:available.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
 if(!isBrushLibrary(library))return reject('invalid image material original descriptor')
 const descriptor=library.brushes[0].descriptor,data=descriptor.sourceStamp,material=descriptor.tip.material
 if(!isSourceStampData(data)||sourceStampSourceKind(data)!=='image'||data.role!=='primary'||data.unsupported.some(reason=>reason!=='source-image-adjustments-unavailable'&&!(reason==='source-color-provider-unresolved'&&(sourceColorProviderKind(data)!==undefined&&sourceColorProviderKind(data)!=='plain')))||!material||descriptor.tip.animation||descriptor.behavior?.dual||data.flags.textureEnabled||canonicalPixelSourceEffectReject(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return reject('unsupported image material source')
 const settings=data.settings,fixed=(name:string)=>settings['Pressure'+name]===undefined||settings['Pressure'+name]==='false'||settings[name+'UseCurve']==='false'&&Number(settings[name+'Value']??'1')===1
 if(!data.materialOptions&&(!fixed('Softness')||settings.PressureSharpness==='true')||(['h','s','v','Darken','Mix'].some(name=>['true','1'].includes((settings['Pressure'+name]??'false').toLowerCase()))&&!hasCanonicalCapturedColorConsumers(data))||!hasCanonicalSourceCurvePrograms(data))return reject('unsupported image material option program')
 const alpha=available.find(a=>a.id===descriptor.tip.mask),bounds=descriptor.tip.maskBounds
 if(!alpha||!bounds)return reject('image material alpha/grid unavailable')
 const rect={x:bounds.x*alpha.size,y:bounds.y*alpha.size,width:bounds.width*alpha.size,height:bounds.height*alpha.size}
 if(!Object.values(rect).every(Number.isSafeInteger)||rect.width!==data.brush.width||rect.height!==data.brush.height)return reject('image material original grid mismatch')
 return Object.freeze({supported:true as const,descriptor,data,material,asset:Object.freeze({id:alpha.id,size:alpha.size,...rect})})
}
/** Paired alpha/gray source material, without rewriting it as an alpha-only tip. */
export function extractCanonicalLightnessImageSourceData(original:unknown,available:readonly Readonly<{id:string;size:number}>[]){
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const c=captureCanonicalImageMaterialSource(original,available);if(!c.supported)return c
  const {descriptor,data,material,asset}=c
  if(material.kind!=='lightness')return reject('original lightness material required')
  const enabled=data.settings.PressureLightnessStrength==='true'
  if(enabled&&data.settings.LightnessStrengthUseCurve!=='false'&&!data.materialOptions)return reject('lightness compiled material option unavailable')
  const strength=enabled?Math.max(0,Math.min(1,Number(data.settings.LightnessStrengthValue??'1'))):1
  if(!Number.isFinite(strength)||material.strength!==strength)return reject('inconsistent lightness strength')
  const gray=available.find(a=>a.id===material.gray)
  if(!gray||gray.size!==asset.size)return reject('lightness paired CAS metadata unavailable')
  return Object.freeze({supported:true as const,kind:'lightness-image-source-v1' as const,descriptor,data,asset,grayAsset:Object.freeze({...asset,id:gray.id}),strength})
 }catch{return reject('invalid lightness original DATA')}
}
/** Straight original RGB channels remain separate immutable L8 CAS planes. */
export function extractCanonicalColorImageSourceData(original:unknown,available:readonly Readonly<{id:string;size:number}>[]){
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const c=captureCanonicalImageMaterialSource(original,available);if(!c.supported)return c
  if(c.material.kind!=='color'||c.material.frames)return reject('original static color material required')
  const channel=(id:string)=>{const a=available.find(a=>a.id===id);if(!a||a.size!==c.asset.size)throw new TypeError('Color channel grid mismatch');return Object.freeze({...c.asset,id})}
  const channels=Object.freeze([channel(c.material.channels[0]),channel(c.material.channels[1]),channel(c.material.channels[2])] as const)
  return Object.freeze({supported:true as const,kind:'color-image-source-v1' as const,descriptor:c.descriptor,data:c.data,asset:c.asset,channels})
 }catch{return reject('invalid color original DATA')}
}

/** Unified named Pixel texture source; old subtract/pressure families stay closed. */
/** One private role leaf. Callers supply the actual captured role and effective
 * master composition; no descriptor cloning, role rewriting or admission. */
function capturePixelRoleTexture(descriptor:BrushDescriptor,data:SourceStampData,available:readonly Readonly<{id:string;size:number}>[],composition:Readonly<Pick<CanonicalStrokeComposition,'mode'|'outerBlend'>>){
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 const texture=descriptor.texture;if(!texture||!data.flags.textureEnabled)return reject('Missing original role texture')
  const option=data.textureOption
  if(!option||option.id!=='Texture/Strength/'||option.checked!==['true','1'].includes((data.settings['PressureTexture/Strength/']??'false').toLowerCase())||option.min!==0||option.max!==1||option.strength<0||option.strength>1||!hasCanonicalSourceCurvePrograms(data))return reject('native texture strength option unavailable')
  if(data.timing.enabled!==(data.settings['PaintOpSettings/isAirbrushing']==='true')||!Number.isFinite(data.timing.rate)||data.timing.rate<=0)return reject('inconsistent Pixel timing')
  const color=texture.application?.mode==='lightness'||texture.application?.mode==='gradient'
  const autoErase=['true','1'].includes((data.settings['Texture/Pattern/AutoInvertOnErase']??'false').toLowerCase())
  if(!autoErase&&texture.eraseVariant!==undefined)return reject('Unbound texture erase variant')
  const t=textureData(texture,['id','periodPx','strength','application','patternSize','offset',...color?['colorSource']:[],...autoErase?['eraseVariant']:[]]),application=textureData(t.application,['mode','soft']),size=textureData(t.patternSize,['width','height']),offset=textureData(t.offset,['x','y','randomX','randomY'])
  if(!(isCanonicalMaskingBlendMode(application.mode)||application.mode==='lightness'||application.mode==='gradient')||typeof application.soft!=='boolean'||typeof size.width!=='number'||typeof size.height!=='number'||typeof offset.x!=='number'||typeof offset.y!=='number'||typeof offset.randomX!=='boolean'||typeof offset.randomY!=='boolean')return reject('invalid Pixel texture geometry/law')
  const variant=autoErase?textureData(t.eraseVariant,['id',...color?['colorSource']:[]]):undefined
  const basePattern=available.find(a=>a.id===t.id),erasePattern=variant?available.find(a=>a.id===variant.id):undefined
  if(!basePattern||variant&&(!erasePattern||erasePattern.size!==basePattern.size))return reject('Texture erase variant grid differs')
  if(color){for(const pair of [{entry:t,asset:basePattern},...variant&&erasePattern?[{entry:variant,asset:erasePattern}]:[]]){const planes=textureData(pair.entry.colorSource,['gray','alpha']),alpha=available.find(a=>a.id===planes.alpha);if(planes.gray!==pair.asset.id||!alpha||alpha.size!==pair.asset.size)return reject('Original texture variant alpha differs')}}
  const selected=composition.outerBlend==='erase'?variant:undefined
  const pattern=available.find(a=>a.id===(selected?.id??t.id));if(!pattern)return reject('Pixel pattern unavailable')
  const patternAsset=Object.freeze({id:pattern.id,size:pattern.size,x:0,y:0,width:size.width,height:size.height}),phasePolicy=Object.freeze({width:size.width,height:size.height,offsetX:offset.x,offsetY:offset.y,randomX:offset.randomX,randomY:offset.randomY})
  const colorSource=color?textureData(selected?selected.colorSource:t.colorSource,['gray','alpha']):undefined
  const alpha=colorSource?available.find(a=>a.id===colorSource.alpha):undefined
  if(colorSource&&(colorSource.gray!==pattern.id||!alpha||alpha.size!==pattern.size))return reject('original color texture planes unavailable')
  if(!color)canonicalPixelPrimaryTexturePin({kind:'canvasTexture',asset:pattern.id,law:'pixel-texture-u8-v1',mode:application.mode,soft:application.soft,width:size.width,height:size.height,periodX:size.width,periodY:size.height,phase:resolveCanonicalTexturePhase(phasePolicy,()=>0),strength:'recorded-grain-v1'},patternAsset)
  const originalAssetIds=autoErase?brushAssetIds(descriptor):undefined
  if(originalAssetIds&&originalAssetIds.length>2048)return reject('Original texture variant inventory exceeds source bound')
  const originalAssets=originalAssetIds?Object.freeze(originalAssetIds.map(id=>{const a=available.find(a=>a.id===id);if(!a)throw new TypeError('Original texture variant inventory missing');return Object.freeze({id:a.id,size:a.size})})):undefined
  for(const o of [...data.options,...(data.materialOptions??[]),...(data.colorOptions??[]),option])if(o.checked){if(!Number.isFinite(o.strength))return reject('unavailable Pixel source sensor');if(['Size','Ratio'].includes(o.id)&&(o.min<0||o.max>1||o.strength<0||o.strength>1))return reject('unbounded Pixel geometry option')}
  const base={kind:'canvasTexture' as const,asset:patternAsset.id,width:patternAsset.width,height:patternAsset.height,periodX:patternAsset.width,periodY:patternAsset.height}
  const textureGeometry=application.mode==='lightness'||application.mode==='gradient'?Object.freeze({...base,law:'pixel-color-texture-v1' as const,mode:application.mode,alphaAsset:alpha?.id??(()=>{throw new TypeError('Missing original role texture alpha')})()}):Object.freeze({...base,law:'pixel-texture-u8-v1' as const,mode:application.mode,soft:application.soft})
  return Object.freeze({supported:true as const,...originalAssets?{originalAssets}:{},patternAsset,phasePolicy,textureGeometry,mode:application.mode,...alpha?{alphaAsset:Object.freeze({...alpha,x:0,y:0,width:size.width,height:size.height})}:{},soft:application.soft,strengthOption:option})
}
export type CanonicalPixelRoleTextureSource=Extract<ReturnType<typeof capturePixelRoleTexture>,{supported:true}>
export function extractCanonicalPixelTextureSourceData(original:unknown,available:readonly Readonly<{id:string;size:number}>[]){
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const captured=capturePrimaryGrainOriginal(original),library={schemaVersion:1,brushes:[{descriptor:captured,name:'',source:'',warnings:[]}],assets:available.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
  if(!isBrushLibrary(library))return reject('invalid Pixel texture original')
  const descriptor=library.brushes[0].descriptor,data=descriptor.sourceStamp,texture=descriptor.texture
  if(!isSourceStampData(data)||data.version!==2||data.role!=='primary'||!data.flags.textureEnabled||!texture||descriptor.behavior?.dual||descriptor.mixer||descriptor.wet||descriptor.screentonePx||canonicalPixelSourceEffectReject(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return reject('unsupported Pixel texture original')
  const composition=canonicalPixelSourceComposition(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
  if(!composition)return reject('unsupported Pixel texture composition')
  const textureSource=capturePixelRoleTexture(descriptor,data,available,composition);if(!textureSource.supported)return textureSource
  const source=data.source
  const material=source.kind==='defaultAuto'?extractDefaultAutoData(descriptor,false,'pixel-texture',data,undefined,true,true):source.kind==='gaussianAuto'?extractGaussianAutoDataCore(descriptor,undefined,true,true,true):source.kind==='softAuto'?extractSoftAutoDataCore(descriptor,undefined,true,true,true):(()=>{const a=available.find(a=>a.id===descriptor.tip.mask);return a?extractImageFrameCapability(descriptor,a,{material:'verified-primary-texture',pixelTexture:true,...descriptor.tip.animation?{animation:descriptor.tip.animation}:{}}):reject('Pixel primary image unavailable')})()
  if(!material.supported)return material
  // Every option is resolved by the existing native query engine. Resource
  // maxima still reject expansion beyond the bounded mask geometry domain.
  return Object.freeze({...textureSource,supported:true as const,kind:'pixel-texture-source-v1' as const,descriptor,data,material,composition})
 }catch{return reject('invalid Pixel texture source DATA')}
}

/** Named DATA classifier for the new request-local browser mask RNG law.
 * Historical Default/Gaussian/Soft extractors remain closed. */
export function extractCanonicalSeededAutoMaskData(original:unknown){
 const result=extractCanonicalDynamicAutoGeometryData(original)
 if(!result.supported)return result
 if(result.data.version!==2||result.data.source.kind==='image'||![result.data.source.randomness,result.data.source.density].every(v=>Number.isFinite(v)&&v>=0&&v<=1))return {supported:false as const,reasons:Object.freeze(['unbounded seeded mask source'])}
 return Object.freeze({...result,coverageProfile:'seeded-auto-mask-browser-v1' as const})
}

/** Native pipe dimensions are immutable source DATA; replay records only frame IDs. */
export function extractCanonicalPixelImageSourceData(original:unknown,available:readonly Readonly<{id:string;size:number}>[]){
 const reject=(reason:string)=>({supported:false as const,reasons:Object.freeze([reason])})
 try{
  const captured=capturePrimaryGrainOriginal(original),library={schemaVersion:1,brushes:[{descriptor:captured,name:'',source:'',warnings:[]}],assets:available.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
  if(!isBrushLibrary(library))return reject('invalid native image pipe original')
  const descriptor=library.brushes[0].descriptor,data=descriptor.sourceStamp,animation=descriptor.tip.animation
  if(!isSourceStampData(data)||sourceStampSourceKind(data)!=='image'||data.role!=='primary'||data.flags.textureEnabled||!hasCanonicalSourceCurvePrograms(data)||descriptor.behavior?.dual||descriptor.mixer||descriptor.wet||descriptor.screentonePx||canonicalPixelSourceEffectReject(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE))return reject('unsupported native image pipe source')
  const assets:CanonicalMaterialAsset[]=[]
  for(const [frameIndex,id] of (animation?.frames??[descriptor.tip.mask!]).entries()){const a=available.find(a=>a.id===id);if(!a)return reject('native pipe alpha unavailable');const c=extractImageFrameCapability(descriptor,a,{frameIndex,animation,nativeImage:true});if(!c.supported)return c;assets.push(c.capability.asset)}
  if(!animation?.frameBounds&&assets.some(a=>['size','x','y','width','height'].some(k=>Reflect.get(a,k)!==Reflect.get(assets[0],k))))return reject('native pipe grids differ')
  const composition=canonicalPixelSourceComposition(descriptor,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
  if(!composition)return reject('native image pipe composition unavailable')
  return Object.freeze({supported:true as const,kind:'pixel-image-source-v1' as const,descriptor,data,animation,assets:Object.freeze(assets),composition})
 }catch{return reject('invalid native image pipe original DATA')}
}

/** Historical named pipe wrapper stays explicit; shared implementation also
 * serves static source images without widening the old PNG entry. */
export function extractCanonicalNativeImagePipeSourceData(original:unknown,available:readonly Readonly<{id:string;size:number}>[]){
 const result=extractCanonicalPixelImageSourceData(original,available)
 if(!result.supported)return result
 if(result.animation?.mode!=='native-dimensions-v1')return {supported:false as const,reasons:Object.freeze(['native image pipe dimensions required'])}
 return Object.freeze({...result,kind:'native-image-pipe-source-v1' as const,animation:result.animation})
}
