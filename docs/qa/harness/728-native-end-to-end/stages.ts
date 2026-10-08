import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { CanonicalFieldBuffer } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import type { CanonicalBoundedSceneRunner } from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import type { PencilEngine } from '../../../../apps/web/src/engine/index'
type Buffer=AccumulationBuffer|CanonicalFieldBuffer
export interface Stage {key:string;w:number;h:number;bytes:Uint8Array}
function flip(bytes:Uint8Array,w:number,h:number){const out=new Uint8Array(bytes.length);for(let y=0;y<h;y++)out.set(bytes.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);return out}
/** Diagnostic COPY snapshots, never synchronous readback in physical pass. */
export function captureStages(engine:PencilEngine|CanonicalBoundedSceneRunner,native:boolean,maxBytes=64*1024*1024){
 const e=engine as any,passes=native?e.adapter:e._watercolorPasses,planner=native?e.planner:e._settlePlan
 if(!passes||!planner)throw new Error('Missing actual planner/pass stage hooks')
 const snapshots:Array<{key:string;buffer:Buffer}>=[],restorers:Array<()=>void>=[],seen=new Set<string>()
 let bytes=0,job=0
 const metadata:Array<{job:number;bounds:unknown;bloom:unknown;radius:unknown;water:unknown;landedWet:unknown;standing:unknown;wetPeak:unknown;dwell:unknown}>=[]
 const copy=(key:string,source:Buffer|null|undefined)=>{
  if(!source||seen.has(key))return
  const size=source.width*source.height*4;if(bytes+size>maxBytes)throw new Error('Stage snapshot budget exceeded')
  seen.add(key);bytes+=size
  if(native){const b=new CanonicalFieldBuffer(e.backend,source.width,source.height,'nearest','diagnostic '+key);(source as CanonicalFieldBuffer).copyTo(b);snapshots.push({key,buffer:b})}
  else{
   const gl=e.gl as WebGLRenderingContext,fb=gl.getParameter(gl.FRAMEBUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),texture=gl.getParameter(gl.TEXTURE_BINDING_2D)
   try{const b=new AccumulationBuffer(gl,source.width,source.height,'nearest');(source as AccumulationBuffer).copyTo(b);snapshots.push({key,buffer:b})}
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
  for(const [role,buffer] of Object.entries({coverage:entry.coverage,P:entry.inkLoad,C:entry.inkColor,V:entry.solventLoad}))copy(`source:${job}:${role}`,buffer as Buffer)
 },true)
 // Capture first identical logical operator after execution/encoding. Do not change scheduling.
 wrap(passes,'fieldOp',args=>{if(args[3]===10)copy('first:frontSeed',args[0])})
 wrap(passes,'waterFrontStep',args=>copy('first:front',args[5]))
 wrap(passes,'diffuseStep',args=>copy('first:diffuse',args[7]))
 wrap(passes,'brushPass',args=>copy('first:brush',args[5]))
 return{
  metadata,
  detach(){restorers.reverse().forEach(f=>f())},
  async read():Promise<Stage[]>{const out:Stage[]=[];for(const {key,buffer} of snapshots){const raw=native?await(buffer as CanonicalFieldBuffer).readBytes():(buffer as AccumulationBuffer).readPixels();out.push({key,w:buffer.width,h:buffer.height,bytes:native?raw:flip(raw,buffer.width,buffer.height)})}return out},
  destroy(){snapshots.forEach(({buffer})=>buffer.destroy());snapshots.length=0},
 }
}
export function compareStages(a:Stage[],b:Stage[]){const extra=b.filter(stage=>!a.some(x=>x.key===stage.key)).map(stage=>({key:stage.key,missingNative:true}));return [...a.map(stage=>{const other=b.find(x=>x.key===stage.key);if(!other)return{key:stage.key,missing:true};if(other.w!==stage.w||other.h!==stage.h)return{key:stage.key,dimensionMismatch:true,native:[stage.w,stage.h],gl:[other.w,other.h]};let changed=0,max=0,sum=0;for(let i=0;i<stage.bytes.length;i++){const d=Math.abs(stage.bytes[i]-other.bytes[i]);changed+=+(d>0);max=Math.max(max,d);sum+=d}return{key:stage.key,w:stage.w,h:stage.h,changed,max,mean:sum/stage.bytes.length,exact:changed===0}}),...extra]}
