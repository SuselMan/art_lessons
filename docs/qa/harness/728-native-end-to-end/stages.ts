import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { CanonicalFieldBuffer } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import type { CanonicalBoundedSceneRunner } from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import type { PencilEngine } from '../../../../apps/web/src/engine/index'
type Buffer=AccumulationBuffer|CanonicalFieldBuffer
export interface Stage {key:string;w:number;h:number;bytes:Uint8Array;writtenRect?:readonly[number,number,number,number]}
function flip(bytes:Uint8Array,w:number,h:number){const out=new Uint8Array(bytes.length);for(let y=0;y<h;y++)out.set(bytes.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);return out}
/** Diagnostic COPY snapshots, never synchronous readback in physical pass. */
export function captureStages(engine:PencilEngine|CanonicalBoundedSceneRunner,native:boolean,maxBytes=96*1024*1024,probe:'basic'|'prediffuse'='basic'){
 const e=engine as any,passes=native?e.adapter:e._watercolorPasses,planner=native?e.planner:e._settlePlan
 if(!passes||!planner)throw new Error('Missing actual planner/pass stage hooks')
 const snapshots:Array<{key:string;buffer:Buffer;writtenRect?:readonly[number,number,number,number]}>=[],restorers:Array<()=>void>=[],seen=new Set<string>()
 let bytes=0,job=0
 const metadata:Array<{job:number;bounds:unknown;bloom:unknown;radius:unknown;water:unknown;landedWet:unknown;standing:unknown;wetPeak:unknown;dwell:unknown}>=[]
 const primitiveMetadata:Record<string,unknown>={}
 const chronology:unknown[]=[],roles=new WeakMap<object,string>();let beforeDiffuse=true,unknownRole=0
 const record=(event:unknown)=>{if(chronology.length>=512)throw new Error('Pre-diffuse chronology budget exceeded');chronology.push(event)}
 const role=(buffer:any)=>{if(!buffer)return null;let name=roles.get(buffer);if(!name){name=`temporary${unknownRole++}`;roles.set(buffer,name)}return{name,w:buffer.width,h:buffer.height,filter:buffer.filter??buffer._baseFilter}}
 const copy=(key:string,source:Buffer|null|undefined,writtenRect?:readonly[number,number,number,number])=>{
  if(!source||seen.has(key))return
  const size=source.width*source.height*4;if(bytes+size>maxBytes)throw new Error('Stage snapshot budget exceeded')
  seen.add(key);bytes+=size
  if(native){const b=new CanonicalFieldBuffer(e.backend,source.width,source.height,'nearest','diagnostic '+key);(source as CanonicalFieldBuffer).copyTo(b);snapshots.push({key,buffer:b,writtenRect:writtenRect?[...writtenRect]:undefined})}
  else{
   const gl=e.gl as WebGLRenderingContext,fb=gl.getParameter(gl.FRAMEBUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),texture=gl.getParameter(gl.TEXTURE_BINDING_2D)
   try{const b=new AccumulationBuffer(gl,source.width,source.height,'nearest');(source as AccumulationBuffer).copyTo(b);snapshots.push({key,buffer:b,writtenRect:writtenRect?[...writtenRect]:undefined})}
   finally{gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindFramebuffer(gl.FRAMEBUFFER,fb)}
  }
 }
 const wrap=(object:any,name:string,after:(args:any[],result:any)=>void,before=false)=>{
  const original=object[name];if(typeof original!=='function')throw new Error('Missing actual stage method '+name)
  object[name]=function(...args:any[]){if(before)after(args,undefined);const result=original.apply(this,args);if(!before)after(args,result);return result};restorers.push(()=>{object[name]=original})
 }
 wrap(planner,'prepare',args=>{
  job++;if(job>2)return
  metadata.push({job,bounds:structuredClone(args[2]),bloom:args[3],radius:args[4],water:args[5],landedWet:args[6],standing:args[7],wetPeak:args[8],dwell:args[9]})
  const scratch=args[0],target=args[1][0],entry=scratch.peek(target.buffer)
  if(!entry)throw new Error('Source snapshot missing actual scratch entry')
  for(const [name,buffer] of Object.entries(entry))if(buffer&&typeof buffer==='object'&&'width' in buffer)roles.set(buffer,`source:${name}`)
  for(const [role,buffer] of Object.entries({coverage:entry.coverage,P:entry.inkLoad,C:entry.inkColor,V:entry.solventLoad}))if(probe!=='prediffuse'||role!=='C')copy(`source:${job}:${role}`,buffer as Buffer)
 },true)
 // Record primitive chronology only until the first diffusion; no unbounded trace.
 if(planner.ctx?.fieldFor)wrap(planner.ctx,'fieldFor',(_args,field)=>{for(const name of ['a','b','c','ca','cb','cc','coverage','mask','pressure','band'])if(field[name])roles.set(field[name],`field:${name}`)})
 if(typeof passes.wcResample==='function')wrap(passes,'wcResample',args=>{if(beforeDiffuse)record({kind:'resample',out:role(args[0]),dst:args.slice(1,5),source:role(args[5]),src:args.slice(6,9),mode:args[9],old:role(args[10]),base:role(args[11]),clamp:args[12]})})
 if(typeof passes.pigmentColor==='function')wrap(passes,'pigmentColor',args=>{if(beforeDiffuse)record({kind:'absorption',out:role(args[0]),source:role(args[1]),tau:[...args[2]]})})
 wrap(passes,'fieldOp',args=>{
  if(beforeDiffuse){if(chronology.length>=512)throw new Error('Pre-diffuse chronology budget exceeded');const o=args[5]??{};record({kind:'fieldOp',mode:args[3],k:args[4],out:role(args[0]),a:role(args[1]),b:role(args[2]),c:role(o.c),d:role(o.d),e:role(o.e),scalars:Object.fromEntries(['dir','tau','scissor','origin','size','band','world'].filter(k=>o[k]!==undefined).map(k=>[k,structuredClone(o[k])]))})}
  if(args[3]===10)copy('first:frontSeed',args[0])
  if(probe==='prediffuse'){
   if(args[3]===0)copy('coarse:mobileSplit',args[0])
   if(args[3]===12)copy('coarse:outwardPressure',args[1])
   if(args[3]===11)copy('coarse:extendedCoverage',args[0])
   if(args[3]===6)copy('coarse:band',args[0])
   if(args[3]===15){copy('coarse:firstCarryInput',args[1]);copy('coarse:firstCarryOutput',args[0])}
  }
 })
 wrap(passes,'waterFrontStep',args=>{
  primitiveMetadata.front??={field:[args[0].w,args[0].h],x0:args[1],y0:args[2],dryCost:args[3],max:args[6],climb:args[7],floor:args[8],stride:args[9]??1,scale:args[10]??1}
  if(beforeDiffuse&&chronology.length>=512)throw new Error('Pre-diffuse chronology budget exceeded')
  if(beforeDiffuse)record({kind:'front',out:role(args[5]),source:role(args[4]),max:args[6],climb:args[7],floor:args[8],stride:args[9]??1})
  if(probe==='basic')copy('first:front',args[5])
 })
 wrap(passes,'diffuseStep',args=>{if(probe==='basic')copy('first:diffuse',args[7])})
 wrap(passes,'diffuseStep',args=>{
  primitiveMetadata.diffuse??={field:[args[0].w,args[0].h],x0:args[1],y0:args[2],scale:args[3],paper:[args[4],args[5]],radius:args[8],preparedRadius:Math.max(1,Math.round(args[8]/args[3])),knight:args[9],sourceRole:args[6]===args[11]?'pigment':'color',sourceFilter:args[6].filter??args[6]._baseFilter,gateFilter:args[10].filter??args[10]._baseFilter}
  if(beforeDiffuse){record({kind:'diffuse',out:role(args[7]),source:role(args[6]),gate:role(args[10]),radius:args[8],knight:args[9]});beforeDiffuse=false}
  copy('first:diffuseInput',args[6]);copy('first:diffuseGate',args[10])
 },true)
 wrap(passes,'brushPass',args=>{primitiveMetadata.brush??={field:[args[0].w,args[0].h],radius:args[2],scale:args[3],sourceRole:args[4]===args[9]?'color':'pigment',flowRect:[...args[7]],scissor:[...args[8]],gain:args[10]};if(probe==='basic')copy('first:brush',args[5],args[8])})
 return{
  metadata,primitiveMetadata,chronology,
  detach(){restorers.reverse().forEach(f=>f())},
  async read():Promise<Stage[]>{const out:Stage[]=[];for(const {key,buffer,writtenRect} of snapshots){const raw=native?await(buffer as CanonicalFieldBuffer).readBytes():(buffer as AccumulationBuffer).readPixels();out.push({key,w:buffer.width,h:buffer.height,bytes:native?raw:flip(raw,buffer.width,buffer.height),writtenRect})}return out},
  destroy(){snapshots.forEach(({buffer})=>buffer.destroy());snapshots.length=0},
 }
}
export function compareStages(a:Stage[],b:Stage[]){
 const extra=b.filter(stage=>!a.some(x=>x.key===stage.key)).map(stage=>({key:stage.key,missingNative:true}))
 return [...a.map(stage=>{
  const other=b.find(x=>x.key===stage.key);if(!other)return{key:stage.key,missing:true}
  if(other.w!==stage.w||other.h!==stage.h)return{key:stage.key,dimensionMismatch:true,native:[stage.w,stage.h],gl:[other.w,other.h]}
  if(JSON.stringify(stage.writtenRect)!==JSON.stringify(other.writtenRect))return{key:stage.key,writtenRectMismatch:true,native:stage.writtenRect,gl:other.writtenRect}
  let changed=0,max=0,sum=0,compared=0
  for(let i=0;i<stage.bytes.length;i++){
   if(stage.writtenRect){const pixel=Math.floor(i/4),x=pixel%stage.w+.5,y=stage.h-Math.floor(pixel/stage.w)-.5,r=stage.writtenRect;if(x<r[0]||y<r[1]||x>=r[0]+r[2]||y>=r[1]+r[3])continue}
   const d=Math.abs(stage.bytes[i]-other.bytes[i]);changed+=+(d>0);max=Math.max(max,d);sum+=d;compared++
  }
  return{key:stage.key,w:stage.w,h:stage.h,writtenRect:stage.writtenRect,comparedBytes:compared,changed,max,mean:compared?sum/compared:0,exact:changed===0}
 }),...extra]
}
