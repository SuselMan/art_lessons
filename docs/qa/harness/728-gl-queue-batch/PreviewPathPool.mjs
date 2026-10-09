import{CARRY_PREVIEW_TOTAL_BYTES}from'./PreviewPressurePool.mjs';
export const MULTISCALE_PREVIEW_TOTAL_BYTES=CARRY_PREVIEW_TOTAL_BYTES+3*2*128*128*4;
/** Preinput-only independent Q8 masks. No engine-pool ownership. */
export class PreviewPathPool{
 constructor({budgetBytes,create,excluded=[]}){
 if(!Number.isSafeInteger(budgetBytes)||budgetBytes<MULTISCALE_PREVIEW_TOTAL_BYTES)throw Error('Explicit19.125MiB budget');
 this.available=[];this.active=new Set();this.owned=[];this.disposed=false;const ids=new Set(excluded.map(f=>f.texture??f));
 try{for(let owner=0;owner<3;owner++){const pair=[];for(let i=0;i<2;i++){const f=create(128,128,'nearest');if(!f.texture||ids.has(f.texture))throw Error('Mask aliases existing ownership');ids.add(f.texture);this.owned.push(f);if(f.width!==128||f.height!==128)throw Error('Mask dimensions');pair.push(f)}this.available.push(pair)}}catch(error){for(const f of this.owned)f.destroy();throw error}
 }
 take(){if(this.disposed)throw Error('Path pool disposed');const fields=this.available.shift();if(!fields)return null;this.active.add(fields);let done=false;return{fields,bytes:131072,releaseAfterKnownIdle:()=>{if(done)return false;done=true;this.active.delete(fields);this.available.push(fields);return true}}}
 disposeAfterKnownIdle(){if(this.active.size)throw Error('Active path ownership');if(this.disposed)return;this.disposed=true;for(const f of this.owned)f.destroy();this.available=[]}
}
