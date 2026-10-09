/** Standalone browser-injectable observer; no callbacks wait, no math mutation. */
export function installPlannerAttribution(Adapter,device,record,isActive){
 const undo=[];let serial=0,current=null
 const wrap=(owner,name,decorate)=>{const original=owner[name];if(typeof original!=='function')throw Error('Attribution method absent: '+name);const replacement=decorate(original);owner[name]=replacement;undo.push(()=>{if(owner[name]===replacement)owner[name]=original})}
 wrap(Adapter.prototype,'runQuantum',original=>function(...args){
  if(!isActive())return original.apply(this,args)
  const previous=current,id=++serial;current={id,passes:[]};const started=performance.now();record('planner.quantum:start',{id,caller:'CanonicalPlanAdapter.runQuantum',source:'/src/engine/src/webgpuCanonical/settlePlanAdapter.ts'})
  let outcome='fulfilled';try{return original.apply(this,args)}catch(error){outcome='rejected';throw error}finally{record('planner.quantum:end',{id,wallCpuMs:performance.now()-started,passes:current.passes,passOverflow:!!current.overflow,outcome});current=previous}
 })
 for(const family of ['fieldOp','carryPair','pigmentColor','costDomainStep','diffuseStep','waterFrontStep','wcResample','brushPair','brushPass'])wrap(Adapter.prototype,family,original=>function(...args){
  if(current&&isActive()){if(current.passes.length<16)current.passes.push({family,mode:family==='fieldOp'?args[3]:undefined,...(family==='waterFrontStep'?{dryCost:args[3],max:args[6],climb:args[7],floor:args[8],stride:args[9]??1,scale:args[10]??1,sourceWidth:args[4]?.width,sourceHeight:args[4]?.height}:{} )});else current.overflow=true}
  return original.apply(this,args)
 })
 for(const kind of ['createComputePipeline','createRenderPipeline'])wrap(device,kind,original=>function(descriptor){const id=++serial,started=performance.now();record('pipeline.create:start',{id,kind,label:descriptor?.label??'',entryPoint:descriptor?.compute?.entryPoint??descriptor?.vertex?.entryPoint??'',source:'GPUDevice.'+kind});let outcome='fulfilled';try{return original.call(this,descriptor)}catch(error){outcome='rejected';throw error}finally{record('pipeline.create:end',{id,kind,wallCpuMs:performance.now()-started,outcome})}})
 return()=>{for(const restore of undo.reverse())restore()}
}
