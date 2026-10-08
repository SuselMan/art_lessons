import {lazyFrontOracle} from './lazyFrontOracle'
import noiseAsset from '../../../../apps/web/src/engine/src/raster/watercolorNoise.txt?raw'
import { CanonicalWatercolorWebGpu } from '../../../../apps/web/src/engine/src/webgpuCanonical/backend'
import { CanonicalFieldBuffer } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import { CanonicalPlanAdapter } from '../../../../apps/web/src/engine/src/webgpuCanonical/settlePlanAdapter'
import { compareStages,type Stage } from './stages'
export async function sameInputFrontOracle(stages:Stage[],expected:Stage,metadata:unknown,paper:Uint8Array,side:number,lazyClimb=false,staticCache=false){
 const m=metadata as {x0:number;y0:number;dryCost:number;max:number;climb:number;floor:number;stride:number;scale:number;source:{filter:string};destination:{filter:string}}
 if(!m)throw new Error('Selected front metadata missing')
 const find=(key:string)=>{const s=stages.find(v=>v.key==='pressure:'+key);if(!s)throw new Error('Missing front '+key);return s}
 const input=find('frontInput'),coverage=find('frontCoverage')
 const owner=await CanonicalWatercolorWebGpu.create({canvas:document.createElement('canvas'),width:1024,height:1024,paper:{bytes:paper,width:side,height:side,origin:[0,0],texSize:[1024,1024],scale:1}})
 const adapter=new CanonicalPlanAdapter(owner),buffers:CanonicalFieldBuffer[]=[],errors:string[]=[]
 owner.device.addEventListener('uncapturederror',e=>errors.push(e.error.message))
 const field=(s:Stage,filter:string)=>{const b=new CanonicalFieldBuffer(owner,s.w,s.h,filter==='linear'?'linear':'nearest','same-input front');buffers.push(b);owner.device.queue.writeTexture({texture:b.texture},s.bytes.slice(),{bytesPerRow:s.w*4},[s.w,s.h]);return b}
 try{
  const source=field(input,m.source.filter),gate=field(coverage,'nearest'),out=field({...input,bytes:new Uint8Array(input.bytes.length)},m.destination.filter)
  owner.device.pushErrorScope('validation')
  adapter.runQuantum(()=>adapter.waterFrontStep({w:input.w,h:input.h,coverage:gate},m.x0,m.y0,m.dryCost,source,out,m.max,m.climb,m.floor,m.stride,m.scale))
  const bytes=await out.readBytes(),validation=await owner.device.popErrorScope()
  return{lazyClimb:lazyClimb?await lazyFrontOracle(input,coverage,paper,side,m):null,staticCache:staticCache?await lazyFrontOracle(input,coverage,paper,side,m,171,'static'):null,comparison:compareStages([{key:'sameInput',w:out.width,h:out.height,bytes}],[{...expected,key:'sameInput'}]),errors,paperSha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',paper.slice().buffer)),v=>v.toString(16).padStart(2,'0')).join(''),noiseAssetSha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(noiseAsset))),v=>v.toString(16).padStart(2,'0')).join(''),foreignFilm:'absent: explicitly guarded in actual GL capture',validation:validation?.message??null,input:'Actual GL captured Q8 input/coverage; same baked Fine paper, source/destination filters and original coordinates/scalars',limits:'One selected front operator, no foreign film; native baseline manual paper sampling unchanged'}
 }finally{buffers.forEach(b=>b.destroy());owner.destroy()}
}
