import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type {PencilEngine} from '../../../../apps/web/src/engine/index'
import type {CanonicalBoundedSceneRunner} from '../../../../apps/web/src/engine/src/webgpuCanonical/boundedSceneRunner'
import {commonSourceShape,validateCommonSourcePayload,type CommonSourceShape,type SourceBuffer} from './commonSourceContract'
export interface CommonSourcePayload extends CommonSourceShape {scalarsJson:string;metadataJson:string;materialGesture:number;pigmentInputsKnownZero:boolean;origin:readonly[number,number]}
const metadata=(args:any[])=>{const m=args[12]??args[0];return JSON.stringify({gesture:m.gesture,paints:Array.from(m.paints),brushTravel:m.brushTravel,wetContacts:m.wetContacts,foreignSources:m.foreignSources,dryCtx:m.dryCtx?{bounds:m.dryCtx.bounds,radiusPx:m.dryCtx.radiusPx,standing:m.dryCtx.standing}:null})}
const scalars=(args:any[])=>JSON.stringify(args.slice(2,10))
const shape=(args:any[])=>{if(args[1].length!==1||args[1][0].originX!==0||args[1][0].originY!==0)throw Error('Common source requires one origin0 actual tile');const e=args[0].peek(args[1][0].buffer);if(!e)throw Error('Common source entry missing');return{entry:e,target:args[1][0].buffer,shape:commonSourceShape(e,args[1][0].buffer)}}
/** Before original planner.prepare: immutable GPU copies; CPU read only after owner settles. */
export function captureActualGlSource(engine:PencilEngine){
 const e=engine as any,planner=e._settlePlan,original=planner.prepare,copies=new Map<number,AccumulationBuffer>();let payload:CommonSourcePayload|null=null,calls=0
 planner.prepare=function(...args:any[]){calls++;if(calls!==1)throw Error('Common-source fixture unexpectedly has multiple jobs')
  const s=shape(args),gl=e.gl as WebGLRenderingContext,fb=gl.getParameter(gl.FRAMEBUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),texture=gl.getParameter(gl.TEXTURE_BINDING_2D),viewport=gl.getParameter(gl.VIEWPORT)
  payload={...s.shape,scalarsJson:scalars(args),metadataJson:metadata(args),materialGesture:args[0].materialGesture,pigmentInputsKnownZero:args[0].pigmentInputsKnownZero,origin:[0,0]}
  try{for(const f of payload.fields)if(f.presence==='field'&&!copies.has(f.alias!)){const source=f.role==='target'?s.target:s.entry[f.role],copy=new AccumulationBuffer(gl,1024,1024,f.filter!);source.copyTo(copy);copies.set(f.alias!,copy)}}finally{gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(...Array.from(viewport) as[number,number,number,number])}
  return original.apply(this,args)
 }
 return{
 read(){if(!payload||calls!==1)throw Error('Common source not captured exactly once');const bytes=new Map<number,Uint8Array>();for(const [id,b]of copies){const raw=b.readPixels(),top=new Uint8Array(raw.length);for(let y=0;y<1024;y++)top.set(raw.subarray((1023-y)*4096,(1024-y)*4096),y*4096);bytes.set(id,top)}for(const f of payload.fields)if(f.presence==='field')f.bytes=bytes.get(f.alias!);return payload},
 destroy(){planner.prepare=original;for(const b of copies.values())b.destroy();copies.clear()}
 }
}
/** Strict prevalidated all-role upload, recorded before the same planner's first commands.
 * No source CPU preparation repeats, no field merge or artistic model change. */
export function installCommonSourceImport(runner:CanonicalBoundedSceneRunner,payload:CommonSourcePayload){
 const e=runner as any,planner=e.planner,original=planner.prepare;let calls=0,uploadedBytes=0
 planner.prepare=function(...args:any[]){calls++;if(calls!==1)throw Error('Common-source control unexpectedly has multiple jobs');const s=shape(args)
  validateCommonSourcePayload(payload,s.shape)
  if(payload.scalarsJson!==scalars(args)||payload.metadataJson!==metadata(args)||payload.materialGesture!==args[0].materialGesture||payload.pigmentInputsKnownZero!==args[0].pigmentInputsKnownZero)throw Error('Common-source CPU request/film metadata differs; import refused before writes')
  const written=new Set<number>();for(const f of payload.fields)if(f.presence==='field'&&!written.has(f.alias!)){const out=f.role==='target'?s.target:s.entry[f.role];runner.backend.upload(out.field,f.bytes!);written.add(f.alias!);uploadedBytes+=f.bytes!.length}
  return original.apply(this,args)
 }
 return{get calls(){return calls},get uploadedBytes(){return uploadedBytes},detach(){planner.prepare=original}}
}
export type CommonSourceBuffer=SourceBuffer
