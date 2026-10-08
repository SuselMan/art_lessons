import{allocatePreviewPairs,FLOAT_PREVIEW_POOL_BYTES}from'../728-room-moment/PreviewPairedFloatAllocator.mjs';
import{PREVIEW_FIXED_PAIR_BYTES,PREVIEW_FIXED_THREE_OWNER_BYTES}from'./PreviewSettlingBudget.mjs';
export const FINITE_PREVIEW_TOTAL_BYTES=FLOAT_PREVIEW_POOL_BYTES+PREVIEW_FIXED_THREE_OWNER_BYTES;
/** Preinput three-owner extra ping-pong pool. No allocator on seal/DOWN. */
export class PreviewFixedPool {
 constructor(gl,{budgetBytes,createQ8,excluded=[],allocate=allocatePreviewPairs}){
  if(!Number.isSafeInteger(budgetBytes)||budgetBytes<FINITE_PREVIEW_TOTAL_BYTES)throw Error('Explicit18.375MiB finite preview budget required');
  const identities=new Set(excluded.map(f=>f.texture??f));
  this.available=[];this.active=new Set();this.all=[];this.bytes=PREVIEW_FIXED_THREE_OWNER_BYTES;this.disposed=false;
  try{for(let i=0;i<3;i++){const allocation=allocate(gl,{enabled:true,budgetBytes,createQ8,excluded:[...excluded,...this.all.flatMap(a=>Object.values(a.fields))]});if(allocation.format!=='rgba32f'){allocation.destroyAfterKnownIdle();throw Error('Finite preview requires renderable Float32')}
   if(allocation.bytes!==PREVIEW_FIXED_PAIR_BYTES){allocation.destroyAfterKnownIdle();throw Error('Fixed pair ledger mismatch')}
   const fields=Object.values(allocation.fields);if(fields.length!==4||fields.some(f=>f.width!==128||f.height!==128||!f.texture||identities.has(f.texture))||new Set(fields.map(f=>f.texture)).size!==4){allocation.destroyAfterKnownIdle();throw Error('Fixed pair identity/dimension alias')}for(const f of fields)identities.add(f.texture);
   this.all.push(allocation);this.available.push(allocation)}}catch(e){for(const a of this.all)a.destroyAfterKnownIdle();throw e}
 }
 take(){if(this.disposed)throw Error('Fixed pool disposed');const a=this.available.shift();if(!a)return null;this.active.add(a);let released=false;return{fields:a.fields,bytes:a.bytes,releaseAfterKnownIdle:()=>{if(released)return false;released=true;this.active.delete(a);this.available.push(a);return true}}}
 disposeAfterKnownIdle(){if(this.disposed)return;if(this.active.size)throw Error('Fixed pool active leases');this.disposed=true;for(const a of this.all)a.destroyAfterKnownIdle();this.available=[]}
}
