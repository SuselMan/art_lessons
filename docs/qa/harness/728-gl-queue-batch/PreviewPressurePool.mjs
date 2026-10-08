import{FINITE_PREVIEW_TOTAL_BYTES}from'./PreviewFixedPool.mjs';
import{PREVIEW_PRESSURE_THREE_OWNER_BYTES}from'./PreviewCarryContract.mjs';
export const CARRY_PREVIEW_TOTAL_BYTES=FINITE_PREVIEW_TOTAL_BYTES+PREVIEW_PRESSURE_THREE_OWNER_BYTES;
/** Own Q8 pressure only. Preinput allocation; release requires caller's GPU-idle certificate. */
export class PreviewPressurePool{
 constructor({budgetBytes,create,excluded=[]}){
  if(!Number.isSafeInteger(budgetBytes)||budgetBytes<CARRY_PREVIEW_TOTAL_BYTES)throw Error('Explicit18.75MiB carry preview budget required');
  this.bytes=PREVIEW_PRESSURE_THREE_OWNER_BYTES;this.all=[];this.available=[];this.active=new Set();this.disposed=false;const ids=new Set(excluded.map(f=>f.texture??f));
  try{for(let i=0;i<3;i++){const fields={};this.all.push(fields);for(const role of['pressure0','pressure1']){const f=create(128,128,'nearest');fields[role]=f;if(f.width!==128||f.height!==128||!f.texture||ids.has(f.texture))throw Error('Pressure source/output alias or dimensions');ids.add(f.texture)}this.available.push(fields)}}catch(error){for(const fields of this.all)for(const f of Object.values(fields))f.destroy();throw error}
 }
 take(){if(this.disposed)throw Error('Pressure pool disposed');const fields=this.available.shift();if(!fields)return null;this.active.add(fields);let released=false;return{fields,bytes:2*128*128*4,releaseAfterKnownIdle:()=>{if(released)return false;released=true;this.active.delete(fields);this.available.push(fields);return true}}}
 disposeAfterKnownIdle(){if(this.disposed)return;if(this.active.size)throw Error('Pressure pool active leases');this.disposed=true;for(const fields of this.all)for(const f of Object.values(fields))f.destroy();this.available=[]}
}
