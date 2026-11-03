import type {BrushDescriptor} from './brushes.js'
import type {SourceStampData} from './sourceStampData.js'
import type {CanonicalMaterialAsset,CanonicalMaterialImageSource} from './canonicalMaterialCodec.js'
/** Internal shared capture for already original-bound image roles. Not exported
 * by the shared barrel and never an execution/source grant. */
export function captureOriginalPixelImageRole(descriptor:BrushDescriptor,data:SourceStampData,available:readonly Readonly<{id:string;size:number}>[],foregroundOpacity:number,brushScale=data.brush.scale){
 const fail=():never=>{throw new TypeError('Invalid original image pipe planes')}
 if(descriptor.sourceStamp!==data||!Number.isFinite(foregroundOpacity)||foregroundOpacity<0||foregroundOpacity>1||!Number.isFinite(brushScale)||brushScale<=0)return fail()
 const assets:CanonicalMaterialAsset[]=[]
 let source:CanonicalMaterialImageSource
  const ids=descriptor.tip.animation?.frames??[descriptor.tip.mask!],bounds=descriptor.tip.maskBounds
  if(!bounds||!ids.length)return fail()
  for(const id of ids){const a=available.find(a=>a.id===id);if(!a)return fail();const rect={x:bounds.x*a.size,y:bounds.y*a.size,width:bounds.width*a.size,height:bounds.height*a.size};if(!Object.values(rect).every(Number.isSafeInteger)||rect.width!==data.brush.width||rect.height!==data.brush.height)return fail();if(!assets.some(a=>a.id===id))assets.push(Object.freeze({...a,...rect}))}
  const alpha=assets[0],material=descriptor.tip.material
  let imageMaterial:CanonicalMaterialImageSource['imageMaterial']
  const plane=(id:string)=>{const a=available.find(a=>a.id===id);if(!a||a.size!==alpha.size)return fail();const p=Object.freeze({...alpha,id});if(!assets.some(a=>a.id===id))assets.push(p);return id}
  if(material?.kind==='lightness'){

   const enabled=data.settings.PressureLightnessStrength==='true',strength=enabled?Math.max(0,Math.min(1,Number(data.settings.LightnessStrengthValue??'1'))):1
   if(!Number.isFinite(strength)||material.strength!==strength)return fail()
   const grayFrames=material.grayFrames;if(grayFrames&&(grayFrames.length!==ids.length||grayFrames[0]!==material.gray))return fail()
   imageMaterial=Object.freeze({kind:'lightness-map-v1',grayAsset:plane(material.gray),...grayFrames?{grayFrames:Object.freeze(grayFrames.map(plane))}:{},strength,foregroundAlpha:foregroundOpacity})
  }else if(material?.kind==='color'){

   const frames=material.frames;if(frames&&(frames.length!==ids.length||frames[0].some((id,i)=>id!==material.channels[i])))return fail()
   imageMaterial=Object.freeze({kind:'color-stamp-v1',channels:Object.freeze([plane(material.channels[0]),plane(material.channels[1]),plane(material.channels[2])] as const),...frames?{frames:Object.freeze(frames.map(f=>Object.freeze([plane(f[0]),plane(f[1]),plane(f[2])] as const)))}:{},foregroundOpacity})
  }
  source=Object.freeze({kind:'image',asset:alpha.id,brushScale,brushAngle:data.brush.angle,...descriptor.tip.animation?{frames:Object.freeze([...ids])}:{},...imageMaterial?{imageMaterial}:{}})

 return Object.freeze({source,assets:Object.freeze(assets)})
}

/** Descriptor provenance is added only by this existing SHA-bound wrapper. */
export function captureOriginalPixelImageSource(descriptor:BrushDescriptor,data:SourceStampData,descriptorSha256:string,available:readonly Readonly<{id:string;size:number}>[],foregroundOpacity:number,brushScale=data.brush.scale){
 if(typeof descriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptorSha256))throw new TypeError('Invalid image descriptor SHA')
 const image=captureOriginalPixelImageRole(descriptor,data,available,foregroundOpacity,brushScale)
 return Object.freeze({...image,source:Object.freeze({...image.source,descriptorId:descriptor.id,descriptorVersion:descriptor.version,descriptorSha256})})
}
