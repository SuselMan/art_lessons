import {inheritSettleOpTags} from '../../../../../apps/web/src/engine/src/watercolor/WatercolorSettleQueue'
export interface FieldLease {release():void}
/** Whole-job lease, including suspended and reentrant operation continuations. */
export function fieldJobScope(lease:FieldLease){
 let depth=0,retired=false,released=false
 function flush(){if(retired&&!depth&&!released){released=true;lease.release()}}
 const retire=()=>{retired=true;flush()}
 function run<T>(work:()=>T):T{if(retired)throw Error('Retired field job');depth++;try{return work()}finally{depth--;flush()}}
 function wrapJob<T extends {ops:Array<()=>void>;finish():void;dispose():void}>(job:T):T{
  const wrappers=new WeakMap<()=>void,()=>void>()
  const ops=new Proxy(job.ops,{get(target,key,receiver){
   const value=Reflect.get(target,key,receiver)
   if(typeof key!=='string'||!/^\d+$/.test(key)||typeof value!=='function')return value
   let wrapped=wrappers.get(value)
   if(!wrapped){wrapped=()=>{try{return run(()=>value())}catch(error){try{job.dispose()}finally{retire()}throw error}};Object.defineProperties(wrapped,Object.getOwnPropertyDescriptors(value));inheritSettleOpTags(value,wrapped);wrappers.set(value,wrapped)}
   return wrapped
  }})
  return {...job,ops,finish:()=>run(()=>{try{job.finish()}finally{try{job.dispose()}finally{retire()}}}),dispose:()=>{try{job.dispose()}finally{retire()}}}
 }
 return {run,retire,wrapJob,get activeDepth(){return depth}}
}
