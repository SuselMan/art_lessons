/** Keep each live target job tied to the source captured at reset. No global
 * candidate scope survives a method call or a frame boundary. */
export function wrapExpansionTarget805<T extends {resetFromScratch:(...args:any[])=>any;step:(...args:any[])=>any;dry:(...args:any[])=>any;cancel:(...args:any[])=>any;destroy:(...args:any[])=>any}>(target:T,scope:{withSource:<R>(source:{entry:any},work:()=>R)=>R;invalidateWater?:()=>void}):T{
 const reset=target.resetFromScratch,step=target.step,dry=target.dry,cancel=target.cancel,destroy=target.destroy
 let source:{entry:any}|null=null
 const run=<R>(work:()=>R)=>{if(!source)throw Error('Simple paths target has no captured source');return scope.withSource(source,work)}
 target.resetFromScratch=function(scratch:any,tile:any,...rest:any[]){
  const entry=scratch.peek(tile.buffer);if(!entry?.inkLoad)throw Error('Simple paths require a raw source entry')
  source={entry};scope.invalidateWater?.()
  try{return run(()=>reset.call(this,scratch,tile,...rest))}catch(error){source=null;throw error}
 }
 target.step=function(...args:any[]){return run(()=>step.apply(this,args))}
 target.dry=function(...args:any[]){return run(()=>dry.apply(this,args))}
 target.cancel=function(...args:any[]){try{return cancel.apply(this,args)}finally{source=null}}
 target.destroy=function(...args:any[]){try{return destroy.apply(this,args)}finally{source=null}}
 return target
}
