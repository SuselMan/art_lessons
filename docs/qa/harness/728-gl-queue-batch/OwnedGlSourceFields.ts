import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type { OwnedPresentationLease } from './PresentationOwnerPrototype'
import type { SourceFieldRole } from './TypedGlSourceReplayPrototype'
export type OwnedGlRole=SourceFieldRole|'presentation'|'original'
const roles:readonly OwnedGlRole[]=['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm']
export interface OwnedGlSourceFields extends OwnedPresentationLease {readonly fields:Readonly<Record<OwnedGlRole,AccumulationBuffer>>}
/** Explicit per-role initialization: no old complete layer is inferred to be a new canonical base. */
export function createOwnedGlSourceFields(gl:WebGLRenderingContext,initial:Readonly<Record<OwnedGlRole,AccumulationBuffer|null>>,retire:(fields:readonly AccumulationBuffer[])=>void):OwnedGlSourceFields{
 const created:AccumulationBuffer[]=[],fields={}as Record<OwnedGlRole,AccumulationBuffer>
 const borrowed=new Set(Object.values(initial).filter((f):f is AccumulationBuffer=>f!==null).map(f=>f.texture))
 try{
  for(const role of roles){
   const source=initial[role]
   if(source&&(source.width!==1024||source.height!==1024))throw Error('Owner requires bounded1024 source')
   const field=new AccumulationBuffer(gl,1024,1024,role==='presentation'?'linear':'nearest')
   created.push(field)
   if(borrowed.has(field.texture)||created.slice(0,-1).some(previous=>previous.texture===field.texture))throw Error('Owner texture alias')
   fields[role]=field
   if(source)source.copyTo(field);else field.clear()
  }
 }catch(error){try{retire(created)}catch(cleanup){throw new AggregateError([error,cleanup],'Owner allocation cleanup failed')}throw error}
 let released=false
 const resources=Object.freeze(roles.map(role=>Object.freeze({identity:fields[role].texture,role:role==='presentation'?'presentation'as const:'canonical-source'as const,width:1024,height:1024})))
 return Object.freeze({fields:Object.freeze(fields),resources,bytes:roles.length*1024*1024*4,release(){if(released)return;released=true;retire(created)}})
}
/** Only invoke after cancellation/normal ownership fence; never from metadata cancellation alone. */
export function retireGlSourceFieldsAfterFence(gl:WebGLRenderingContext,fields:readonly AccumulationBuffer[]):void{
 if(!gl.isContextLost())gl.finish()
 for(const field of fields)field.destroy()
}
