import {canonicalSourceColorFieldsForDescriptor,canonicalSourceColorFieldAssets,type CanonicalSourceColorFields} from './canonicalSourceSpatialColor.js'
import {canonicalSourceTipGradient,type CanonicalSourceTipGradient} from './canonicalSourceTipGradient.js'
import {sourceColorProviderKind} from './sourceStampData.js'
import type {BrushDescriptor} from './brushes.js'
import type {SourceStampData} from './sourceStampData.js'
import type {CanonicalMaterialAsset,CanonicalMaterialImageSource} from './canonicalMaterialCodec.js'
export interface CanonicalPixelGradientMapTemplate {
 readonly kind:'gradient-map-template-v1'
 readonly grayAsset:string
 readonly grayFrames?:readonly string[]
 readonly application:'plain-gradient'|'spatial-mask'
}
export interface CanonicalPixelSourceMaterialInputs {
 readonly sourceTipGradient?:CanonicalSourceTipGradient
 readonly sourceColorFields?:CanonicalSourceColorFields
 readonly sourceColorAvailable?:readonly Readonly<{id:string;size:number}>[]
}
/** Strict START resource capture, independent of a prepared program identity. */
export function capturePixelSourceMaterialInputs(original:BrushDescriptor,value:CanonicalPixelSourceMaterialInputs|undefined):Readonly<{sourceTipGradient?:CanonicalSourceTipGradient;sourceColorFields?:CanonicalSourceColorFields;spatialAssets:readonly CanonicalMaterialAsset[]}>{
 if(value===undefined)return{spatialAssets:[]}
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('Invalid Pixel START inputs')
 const descriptors=Object.getOwnPropertyDescriptors(value)
 if(Reflect.ownKeys(value).some(k=>typeof k!=='string'||!['sourceTipGradient','sourceColorFields','sourceColorAvailable'].includes(k)||!Object.hasOwn(descriptors[k],'value')))throw new TypeError('Invalid Pixel START input field')
 const tip=descriptors.sourceTipGradient,fields=descriptors.sourceColorFields,available=descriptors.sourceColorAvailable
 const sourceTipGradient=tip?canonicalSourceTipGradient(tip.value):undefined
 const sourceColorFields=fields?canonicalSourceColorFieldsForDescriptor(original,fields.value):undefined
 if(fields&&!sourceColorFields||available&&!fields)throw new TypeError('Unbound source color START resource')
 const spatialAssets=sourceColorFields?canonicalSourceColorFieldAssets(sourceColorFields,available?.value??[]):[]
 return{...sourceTipGradient?{sourceTipGradient}:{},...sourceColorFields?{sourceColorFields}:{},spatialAssets}
}
export function pixelGradientMapMaterial(template:CanonicalPixelGradientMapTemplate,gradient:CanonicalSourceTipGradient):NonNullable<CanonicalMaterialImageSource['imageMaterial']>{
 return Object.freeze({kind:'gradient-map-v1',grayAsset:template.grayAsset,...template.grayFrames?{grayFrames:template.grayFrames}:{},application:template.application,gradient:canonicalSourceTipGradient(gradient)})
}
export function pixelPreparationImageAssets(source:CanonicalMaterialImageSource,assets:readonly CanonicalMaterialAsset[]){
 const refs=new Set(source.frames??[source.asset]);return assets.filter(a=>refs.has(a.id))
}
/** Original image pixels occupy their actual rectangle, not the square
 * drawing crop. Named consumers share this check; legacy PNG stays separate. */
export function captureOriginalPixelImageGrid(descriptor:BrushDescriptor,data:SourceStampData,asset:Readonly<{id:string;size:number}>,frameIndex=0){
 const fail=():never=>{throw new TypeError('Invalid original image pixel grid')}
 const size=asset.size,bounds=descriptor.tip.maskBounds,sampling=descriptor.tip.imageSampling,animation=descriptor.tip.animation
 const frame=animation?.frameBounds?.[frameIndex]
 if(!Number.isInteger(frameIndex)||frameIndex<0||frameIndex>=(animation?.frames.length??1)||asset.id!==(animation?.frames[frameIndex]??descriptor.tip.mask))return fail()
 const width=frame?frame.width*size:data.brush.width,height=frame?frame.height*size:data.brush.height
 if(!Number.isInteger(size)||size<2||size>2048||(size&(size-1))!==0||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>size||height>size||!bounds)return fail()
 const rect=frame?{x:frame.x*size,y:frame.y*size,width,height}:sampling?.sourceRect??{x:Math.floor((size-width)/2),y:Math.floor((size-height)/2),width,height}
 if(!frame&&sampling&&(sampling.kind!=='integer-pyramid'||sampling.signal!=='inverse-gray')||!Object.values(rect).every(Number.isSafeInteger)||rect.x<0||rect.y<0||rect.width!==width||rect.height!==height||rect.x+width>size||rect.y+height>size)return fail()
 const longest=Math.max(width,height)
 if(frameIndex===0&&(width!==data.brush.width||height!==data.brush.height))return fail()
 if(frameIndex===0&&(bounds.x!==(rect.x+(width-longest)/2)/size||bounds.y!==(rect.y+(height-longest)/2)/size||bounds.width!==longest/size||bounds.height!==longest/size))return fail()
 return Object.freeze({x:rect.x,y:rect.y,width,height})
}
/** Internal shared capture for already original-bound image roles. Not exported
 * by the shared barrel and never an execution/source grant. */
export function captureOriginalPixelImageRole(descriptor:BrushDescriptor,data:SourceStampData,available:readonly Readonly<{id:string;size:number}>[],foregroundOpacity:number,brushScale=data.brush.scale){
 const fail=():never=>{throw new TypeError('Invalid original image pipe planes')}
 if(descriptor.sourceStamp!==data||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1||!Number.isFinite(brushScale)||brushScale<=0)return fail()
 const assets:CanonicalMaterialAsset[]=[]
 let source:CanonicalMaterialImageSource
  const ids=descriptor.tip.animation?.frames??[descriptor.tip.mask!],bounds=descriptor.tip.maskBounds
  if(!bounds||!ids.length)return fail()
  const frameAssets=ids.map((id,index)=>{const a=available.find(a=>a.id===id);if(!a)return fail();return Object.freeze({id:a.id,size:a.size,...captureOriginalPixelImageGrid(descriptor,data,a,index)})})
  for(const a of frameAssets)if(!assets.some(p=>p.id===a.id))assets.push(a)
  const alpha=assets[0],material=descriptor.tip.material
  let imageMaterial:CanonicalMaterialImageSource['imageMaterial']
  let gradientMapTemplate:CanonicalPixelGradientMapTemplate|undefined
  const plane=(id:string,index=0)=>{const selected=frameAssets[index],a=available.find(a=>a.id===id);if(!selected||!a||a.size!==selected.size)return fail();const p=Object.freeze({...selected,id});if(!assets.some(a=>a.id===id))assets.push(p);return id}
  if(material?.kind==='gradient'){
   const grayFrames=material.grayFrames;if(grayFrames&&(grayFrames.length!==ids.length||grayFrames[0]!==material.gray))return fail()
   const provider=sourceColorProviderKind(data)
   gradientMapTemplate=Object.freeze({kind:'gradient-map-template-v1',grayAsset:plane(material.gray),...grayFrames?{grayFrames:Object.freeze(grayFrames.map((id,index)=>plane(id,index)))}:{},application:provider==='total_random'||provider==='pattern'||provider==='lockedpattern'?'spatial-mask':'plain-gradient'})
  }else if(material?.kind==='lightness'){

   const enabled=data.settings.PressureLightnessStrength==='true',strength=enabled?Math.max(0,Math.min(1,Number(data.settings.LightnessStrengthValue??'1'))):1
   if(!Number.isFinite(strength)||material.strength!==strength)return fail()
   const grayFrames=material.grayFrames;if(grayFrames&&(grayFrames.length!==ids.length||grayFrames[0]!==material.gray))return fail()
   imageMaterial=Object.freeze({kind:'lightness-map-v1',grayAsset:plane(material.gray),...grayFrames?{grayFrames:Object.freeze(grayFrames.map((id,index)=>plane(id,index)))}:{},strength,foregroundAlpha:foregroundOpacity})
  }else if(material?.kind==='color'){

   const frames=material.frames;if(frames&&(frames.length!==ids.length||frames[0].some((id,i)=>id!==material.channels[i])))return fail()
   imageMaterial=Object.freeze({kind:'color-stamp-v1',channels:Object.freeze([plane(material.channels[0]),plane(material.channels[1]),plane(material.channels[2])] as const),...frames?{frames:Object.freeze(frames.map((f,index)=>Object.freeze([plane(f[0],index),plane(f[1],index),plane(f[2],index)] as const)))}:{},foregroundOpacity})
  }
  source=Object.freeze({kind:'image',asset:alpha.id,brushScale,brushAngle:data.brush.angle,...descriptor.tip.animation?{frames:Object.freeze([...ids])}:{},frameBounds:Object.freeze(frameAssets.map(({x,y,width,height})=>Object.freeze({x,y,width,height}))),...imageMaterial?{imageMaterial}:{}})

 return Object.freeze({source,assets:Object.freeze(assets),...gradientMapTemplate?{gradientMapTemplate}:{}})
}

/** Descriptor provenance is added only by this existing SHA-bound wrapper. */
export function captureOriginalPixelImageSource(descriptor:BrushDescriptor,data:SourceStampData,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],foregroundOpacity:number,brushScale=data.brush.scale){
 if(typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))throw new TypeError('Invalid image descriptor SHA')
 const image=captureOriginalPixelImageRole(descriptor,data,available,foregroundOpacity,brushScale)
 return Object.freeze({...image,source:Object.freeze({...image.source,descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256})})
}
