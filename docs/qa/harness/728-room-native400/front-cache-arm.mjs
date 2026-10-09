/** Owned QA context only. Original ordered waterFront producer remains intact. */
export function installFrontCacheArm(Adapter,enabled,dev,filmEnabled=false,factorEnabled=false,tileEnabled=false){
 if(typeof tileEnabled!=='boolean'||tileEnabled&&(!enabled||!factorEnabled||filmEnabled)||typeof enabled!=='boolean'||typeof filmEnabled!=='boolean'||typeof factorEnabled!=='boolean'||factorEnabled&&(!enabled||filmEnabled)||dev!==true)throw Error('Explicit DEV cache arm required')
 const original=Adapter.prototype.waterFrontStep,owners=new Map();let restored=false
 if(typeof original!=='function')throw Error('Original waterFront producer required')
 function wrapped(...args){
  if(this.diagnosticStaticDiffuseHeight||this.diagnosticLazyFrontClimb||this.diagnosticFrontSourceFilter||tileEnabled&&(this.diagnosticIdentityFieldCopy||this.diagnosticMode5SharedTile))throw Error('Unrelated front variants must remain OFF')
  if(!owners.has(this))owners.set(this,{cache:this.diagnosticStaticFrontCache,film:this.diagnosticFrontFilmHoist,factor:this.diagnosticStaticFrontCacheFactor,tile:this.diagnosticFrontSharedTile})
  this.diagnosticStaticFrontCache=enabled
  this.diagnosticFrontFilmHoist=filmEnabled
  this.diagnosticStaticFrontCacheFactor=factorEnabled
  this.diagnosticFrontSharedTile=tileEnabled
  return original.apply(this,args)
 }
 Adapter.prototype.waterFrontStep=wrapped
 return{get restored(){return restored},restore(){if(restored)return;restored=true;if(Adapter.prototype.waterFrontStep!==wrapped)throw Error('Cache arm ownership changed');Adapter.prototype.waterFrontStep=original;for(const [owner,prior]of owners){owner.diagnosticStaticFrontCache=prior.cache;owner.diagnosticFrontFilmHoist=prior.film;owner.diagnosticStaticFrontCacheFactor=prior.factor;owner.diagnosticFrontSharedTile=prior.tile};owners.clear()}}
}
