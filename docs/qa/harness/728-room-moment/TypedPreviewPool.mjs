import{allocatePreviewPairs,FLOAT_PREVIEW_POOL_BYTES}from'./PreviewPairedFloatAllocator.mjs';
export const Q8_SLOT_BYTES=4*1024*1024+6*128*128*4;
export const F32_SLOT_BYTES=4*1024*1024+2*128*128*4+4*128*128*16;
/** OFF proposal. Own preview physical ledger only; no engine/runtime imports. */
export class TypedPreviewPool{
 constructor({gl,createQ8,enabled=false,budgetBytes,excluded=[],filter='nearest',allocatePairs=allocatePreviewPairs}){
  if(filter!=='nearest')throw Error('Float preview LINEAR unsupported; manual interpolation separate');
  if(typeof createQ8!=='function'||!Number.isSafeInteger(budgetBytes)||budgetBytes<3*(enabled?F32_SLOT_BYTES:Q8_SLOT_BYTES))throw Error('Explicit typed three-slot budget required');
  if(gl.isContextLost())throw Error('Lost context skip preview pool');
  this.all=[];this.available=[];this.active=new Set();this.disposed=false;this.format='rgba8';this.fallbackReason=null;
  const protectedIds=new Set(excluded.map(f=>f.texture??f));
  const destroy=slots=>{const seen=new Set();for(const s of slots)for(const k of['p0','c0','p1','c1','water','coverage','pending']){const f=s[k];if(f&&!protectedIds.has(f.texture)&&!seen.has(f)){seen.add(f);f.destroy()}}};
  const build=float=>{const slots=[],ids=new Set(excluded.map(f=>f.texture??f));try{for(let i=0;i<3;i++){
   const pairs=allocatePairs(gl,{enabled:float,budgetBytes:FLOAT_PREVIEW_POOL_BYTES,createQ8,excluded:[...ids]});const slot={pairs,...pairs.fields};slots.push(slot);for(const k of['p0','c0','p1','c1']){const f=slot[k];if(f.format===undefined)Object.defineProperty(f,'format',{value:pairs.format});if(f.format!==pairs.format)throw Error('Paired field format mismatch')}
   for(const[k,size]of[['water',128],['coverage',128],['pending',1024]])slot[k]=createQ8(size,size,k==='pending'?'linear':'nearest');
   for(const[k,size]of[['p0',128],['c0',128],['p1',128],['c1',128],['water',128],['coverage',128],['pending',1024]]){const f=slot[k];if(!f?.texture||f.width!==size||f.height!==size||ids.has(f.texture))throw Error('Typed preview identity/dimensions');ids.add(f.texture)}
  }return slots}catch(e){destroy(slots);throw e}};
  try{this.all=build(enabled);if(enabled&&this.all.some(s=>s.pairs.format!=='rgba32f')){
   this.fallbackReason=this.all.find(s=>s.pairs.format!=='rgba32f').pairs.reason??'Whole pool Q8 fallback';destroy(this.all);this.all=[];this.all=build(false);
  }this.format=this.all[0].pairs.format;this.bytes=3*(this.format==='rgba32f'?F32_SLOT_BYTES:Q8_SLOT_BYTES);if(this.bytes>budgetBytes)throw Error('Actual typed budget exceeded');this.available=[...this.all];
  }catch(e){destroy(this.all);this.all=[];throw e}
 }
 take(){if(this.disposed)throw Error('Disposed typedpool');const slot=this.available.pop();if(!slot)return null;this.active.add(slot);let released=false;const{pairs,...fields}=slot;return Object.freeze({...fields,format:this.format,bytes:this.bytes/3,release:()=>{if(released)return;released=true;this.active.delete(slot);this.available.push(slot)}})}
 owns(field){return this.all.some(s=>['p0','c0','p1','c1','water','coverage','pending'].some(k=>s[k]===field))}
 disposeAfterKnownIdle(){if(this.disposed)return;if(this.active.size)throw Error('Typed leases remain active');this.disposed=true;this.available=[];for(const s of this.all){for(const k of['p0','c0','p1','c1','water','coverage','pending'])s[k].destroy()}}
}
