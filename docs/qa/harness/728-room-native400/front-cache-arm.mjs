/** Owned QA context only. Original ordered waterFront producer remains intact. */
export function installFrontCacheArm(Adapter,enabled,dev,filmEnabled=false){
 if(typeof enabled!=='boolean'||typeof filmEnabled!=='boolean'||dev!==true)throw Error('Explicit DEV cache arm required')
 const original=Adapter.prototype.waterFrontStep,owners=new Map();let restored=false
 if(typeof original!=='function')throw Error('Original waterFront producer required')
 function wrapped(...args){
  if(this.diagnosticStaticDiffuseHeight||this.diagnosticLazyFrontClimb||this.diagnosticFrontSourceFilter)throw Error('Unrelated front variants must remain OFF')
  if(!owners.has(this))owners.set(this,{cache:this.diagnosticStaticFrontCache,film:this.diagnosticFrontFilmHoist})
  this.diagnosticStaticFrontCache=enabled
  this.diagnosticFrontFilmHoist=filmEnabled
  return original.apply(this,args)
 }
 Adapter.prototype.waterFrontStep=wrapped
 return{restore(){if(restored)return;restored=true;if(Adapter.prototype.waterFrontStep!==wrapped)throw Error('Cache arm ownership changed');Adapter.prototype.waterFrontStep=original;for(const [owner,prior]of owners){owner.diagnosticStaticFrontCache=prior.cache;owner.diagnosticFrontFilmHoist=prior.film};owners.clear()}}
}
