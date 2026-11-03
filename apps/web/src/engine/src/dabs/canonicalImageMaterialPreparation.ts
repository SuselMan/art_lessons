import {canonicalSourceMaterialContext,canonicalPixelTextureAsset,canonicalImageFrameAsset,canonicalImageMaterialPin,type CanonicalMaterialContextV2,type CanonicalMaterialAsset} from '@grafetto/shared'
import {canonicalImageMaskCapacity,canonicalImageRequiredSourceLevels} from './canonicalImageCapacity'
import type {BrushMipCache} from './BrushMipCache'
import type {CanonicalImageMaterialSourceInput,CanonicalMaskAssetSourceInput,CanonicalPatternSourceInput} from './CanonicalMaskSourceBank'

/** All original image roles/frames for the existing bank. Planning only: no
 * bitmap reads, source grants or selection queries. Indexed recipes select the
 * recorded slot/frame; repeated alpha with different channels stays distinct. */
export function prepareCanonicalImageMaterialSources(material:CanonicalMaterialContextV2,cpu:BrushMipCache,readOriginal:(asset:CanonicalMaterialAsset)=>Uint8Array,assertCurrent:()=>void){
 const count=()=>{
  const field=Object.getOwnPropertyDescriptor(material,'assets')
  if(!field||!Object.hasOwn(field,'value')||!Array.isArray(field.value)||field.value.length>2048)throw new TypeError('Invalid original image asset inventory')
  let frames=0
  for(const key of ['primarySource','maskSource']){
   const role=Object.getOwnPropertyDescriptor(material,key)
   if(!role){if(key==='primarySource')throw new TypeError('Original primary source missing');continue}
   if(!Object.hasOwn(role,'value')||!role.value||typeof role.value!=='object')throw new TypeError('Invalid original role')
   const kind=Object.getOwnPropertyDescriptor(role.value,'kind');if(!kind||!Object.hasOwn(kind,'value'))throw new TypeError('Invalid original role kind')
   if(kind.value!=='image')continue
   const ids=Object.getOwnPropertyDescriptor(role.value,'frames')
   if(ids&&(!Object.hasOwn(ids,'value')||!Array.isArray(ids.value)||ids.value.length<1||ids.value.length>256))throw new TypeError('Invalid original image frames')
   frames+=ids?ids.value.length:1
  }
  if(frames>512||frames<1&&!Object.getOwnPropertyDescriptor(material,'sourceColorFields')&&!Object.getOwnPropertyDescriptor(material,'roleTextures'))throw new RangeError('Original image frame inventory')
  return{assets:field.value.length,frames}
 }
 const inventory=count(),metadataBytes=8192+inventory.assets*1024+inventory.frames*1024,releaseCpu=cpu.reserve(metadataBytes)
 let adopted=false
 try{
  assertCurrent();const after=count();if(after.assets!==inventory.assets||after.frames!==inventory.frames)throw new Error('Original image inventory changed during reservation')
  const context=canonicalSourceMaterialContext(material),byId=new Map(context.assets.map(asset=>[asset.id,asset]))
  if(byId.size!==context.assets.length)throw new TypeError('Duplicate original asset identity')
  const used=new Set<string>(),inputs:(CanonicalImageMaterialSourceInput|CanonicalMaskAssetSourceInput|CanonicalPatternSourceInput)[]=[],geometries:ReturnType<typeof canonicalImageMaterialPin>[]=[],seen=new Set<string>()
  const sameCrop=(a:CanonicalMaterialAsset,b:CanonicalMaterialAsset)=>a.size===b.size&&a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height
  const read=(plane:CanonicalMaterialAsset)=>{assertCurrent();const bytes=readOriginal(plane);assertCurrent();return bytes}
  for(const [slot,source]of [[0,context.primarySource],[1,context.maskSource]] as const){
   if(!source||source.kind!=='image')continue
   const ids=source.frames??[source.asset],alphaAssets:CanonicalMaterialAsset[]=[],law=source.imageMaterial
   for(let index=0;index<ids.length;index++){
    const asset=canonicalImageFrameAsset(source,context.assets,index)
    used.add(asset.id);alphaAssets.push(asset)
    const sourceSlot=context.imageFrameIndices?slot:undefined,frameIndex=context.imageFrameIndices?index:undefined
    if(!law){
     const key=JSON.stringify([sourceSlot,frameIndex,asset]);if(seen.has(key))continue;seen.add(key)
     inputs.push(Object.freeze({asset,...sourceSlot!==undefined?{sourceSlot}:{},...frameIndex!==undefined?{frameIndex}:{},readOriginalCoverage:()=>read(asset)}));continue
    }
    const channelIds=law.kind==='lightness-map-v1'?[law.grayFrames?.[index]??law.grayAsset]:law.frames?.[index]??law.channels
    if(ids.length>1&&(law.kind==='lightness-map-v1'?law.grayFrames?.length!==ids.length:law.frames?.length!==ids.length))throw new TypeError('Original paired frame count differs')
    const channels=Object.freeze(channelIds.map(id=>{const plane=byId.get(id);if(!plane||plane.size!==asset.size||!source.frameBounds&&!sameCrop(plane,asset))throw new TypeError('Original material channel crop differs');used.add(id);return source.frameBounds?Object.freeze({...plane,x:asset.x,y:asset.y,width:asset.width,height:asset.height}):plane}))
    const key=JSON.stringify([sourceSlot,frameIndex,asset,law.kind,channels])
    if(seen.has(key))continue;seen.add(key)
    inputs.push(Object.freeze({kind:'image-material-rgba8' as const,asset,...sourceSlot!==undefined?{sourceSlot}:{},...frameIndex!==undefined?{frameIndex}:{},material:law.kind,channels,readOriginalCoverage:()=>read(asset),readOriginalChannels:()=>Object.freeze(channels.map(read))}))
   }
   const original=[...new Map(alphaAssets.map(a=>[a.id,byId.get(a.id)!])).values()]
   geometries.push(source.frameBounds?Object.freeze({primarySource:Object.freeze({kind:'image' as const,asset:source.asset,brushScale:source.brushScale,brushAngle:source.brushAngle,...source.frames?{frames:source.frames}:{},frameBounds:source.frameBounds}),assets:Object.freeze(original)}):canonicalImageMaterialPin({kind:'image',asset:source.asset,brushScale:source.brushScale,brushAngle:source.brushAngle,...source.frames?{frames:source.frames}:{}},original))
  }
  for(const [sourceSlot,field]of [[0,context.sourceColorFields?.primary],[1,context.sourceColorFields?.mask]] as const){
   if(!field||field.kind==='total-random-rgb8-hash-v1')continue
   const resource=field.resource,storage=byId.get(resource.alphaAsset),asset=storage?Object.freeze({...storage,x:resource.x,y:resource.y,width:resource.width,height:resource.height}):undefined
   if(!asset||asset.size!==resource.size)throw new TypeError('Original spatial pattern crop missing')
   used.add(asset.id)
   const channels=Object.freeze(resource.channels.map(id=>{const plane=byId.get(id);if(!plane||plane.size!==asset.size)throw new TypeError('Original spatial pattern channel differs');used.add(id);return Object.freeze({...plane,x:asset.x,y:asset.y,width:asset.width,height:asset.height})}))
   inputs.push(Object.freeze({kind:'image-material-rgba8' as const,asset,sourceSlot,material:'color-stamp-v1' as const,channels,readOriginalCoverage:()=>read(asset),readOriginalChannels:()=>Object.freeze(channels.map(read))}))
  }
  for(const pin of [context.roleTextures?.primary,context.roleTextures?.mask])if(pin){
   const asset=canonicalPixelTextureAsset(pin,context.assets)
   used.add(asset.id)
   const alphaAsset=pin.law==='pixel-color-texture-v1'?canonicalPixelTextureAsset(pin,context.assets,'alpha'):undefined
   if(pin.law==='pixel-color-texture-v1'&&!alphaAsset)throw new TypeError('Original role pattern alpha missing')
   if(alphaAsset)used.add(alphaAsset.id)
   inputs.push(Object.freeze({kind:'raw-pattern-l8' as const,asset,pin,readOriginalGray:()=>read(asset),...alphaAsset?{alphaAsset,readOriginalAlpha:()=>read(alphaAsset)}:{}}))
  }
  if(used.size!==context.assets.length)throw new TypeError('Unexpected original image planes')
  const geometry=geometries[0],capacity=geometry?canonicalImageMaskCapacity(geometry.primarySource,geometry.assets):undefined,levels=new Map<string,{asset:CanonicalMaterialAsset;indexes:Set<number>}>()
  for(const pin of geometries)for(const item of canonicalImageRequiredSourceLevels(pin.primarySource,pin.assets)){let held=levels.get(JSON.stringify(item.asset));if(!held){held={asset:item.asset,indexes:new Set()};levels.set(JSON.stringify(item.asset),held)}for(const index of item.indexes)held.indexes.add(index)}
  for(const input of inputs)if('kind'in input&&input.kind==='image-material-rgba8'&&!levels.has(JSON.stringify(input.asset)))levels.set(JSON.stringify(input.asset),{asset:input.asset,indexes:new Set([0])})
  const requiredLevels=Object.freeze([...levels.values()].map(item=>Object.freeze({asset:item.asset,indexes:Object.freeze([...item.indexes].sort((a,b)=>a-b))})))
  assertCurrent();let released=false
  const plan=Object.freeze({context,source:context.primarySource,geometry,capacity,requiredLevels,inputs:Object.freeze(inputs),assets:context.assets,metadataBytes,release(){if(released)return;released=true;releaseCpu()}})
  adopted=true;return plan
 }finally{if(!adopted)releaseCpu()}
}
