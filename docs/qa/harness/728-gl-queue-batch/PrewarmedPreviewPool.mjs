import {PREVIEW_BYTES} from './SealedPreviewTransport.mjs';
/** Physical buffers owned here, never returned to engine._revealPoolRelease. */
export class PrewarmedPreviewPool {
 constructor(port,{capacity=3,budgetBytes,excluded=[]}={}){
  if(capacity!==3||!Number.isSafeInteger(budgetBytes)||budgetBytes<capacity*PREVIEW_BYTES)throw Error('Explicit three-owner preview budget required');
  this.port=port;this.available=[];this.all=[];this.active=new Set();this.bytes=capacity*PREVIEW_BYTES;this.disposed=false;const ids=new Set(excluded);
  try{for(let n=0;n<capacity;n++){const slot={};this.all.push(slot);for(const role of ['p0','c0','p1','c1','water','coverage','pending']){const size=role==='pending'?1024:128,field=port.create(size,size,role==='pending'?'linear':'nearest');slot[role]=field;if(!field?.texture||field.width!==size||field.height!==size||ids.has(field.texture))throw Error('Prewarm physical identity/dimensions');ids.add(field.texture)}this.available.push(slot)}}catch(error){for(const slot of this.all)for(const field of Object.values(slot))port.destroy(field);throw error}
 }
 take(){if(this.disposed)throw Error('Disposed preview pool');const slot=this.available.pop();if(!slot)return null;this.active.add(slot);let released=false;return Object.freeze({...slot,bytes:PREVIEW_BYTES,release:()=>{if(released)return;released=true;this.active.delete(slot);this.available.push(slot)}})}
 owns(field){return this.all.some(slot=>Object.values(slot).includes(field))}
 /** Call only after GPUidle + all transport.retire/releaseAfterFence calls. */
 disposeAfterFence(){if(this.disposed)return;if(this.active.size)throw Error('Preview leases remain active');this.disposed=true;this.available=[];for(const slot of this.all)for(const field of Object.values(slot))this.port.destroy(field)}
}
