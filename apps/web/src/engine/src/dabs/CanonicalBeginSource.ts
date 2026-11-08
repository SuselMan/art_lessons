import type{ILayerBuffer,PaintTarget}from'../buffers/ILayerBuffer'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{WorldRect}from'../buffers/tileMath'
import{canonicalBeginBindingKey}from'./CanonicalBeginRuntime'
import type{CanonicalBeginBinding,CanonicalBeginNotReady,CanonicalBeginResult,CanonicalBeginCapability}from'./CanonicalBeginRuntime'
export type CanonicalBeginSourceView=Extract<CanonicalBeginResult,{kind:'ready'}>['view']
export interface CanonicalSourceLease{readonly buffer:AccumulationBuffer;assertCurrent():void;release():void}
export type CanonicalSourceClaim=(bytes:number)=>(()=>void)|CanonicalBeginNotReady
interface SourceStorage{refs:number;leases:CanonicalSourceLease[];unclaim:()=>void;onReleased?:()=>void}
/** Original RGBA only, from the shared bounded pool. No destination planes,
 * current-canvas fallback, readback, or additional owner registry. */
export class CanonicalBeginSource{
 readonly tiles:readonly PaintTarget[]
 readonly target:ILayerBuffer
 readonly binding:CanonicalBeginBinding
 readonly capability:CanonicalBeginCapability
 private storage:SourceStorage
 private live=true
 private constructor(target:ILayerBuffer,binding:CanonicalBeginBinding,tiles:readonly PaintTarget[],capability:CanonicalBeginCapability,storage:SourceStorage){this.target=target;this.binding=binding;this.capability=capability;this.storage=storage;this.tiles=Object.freeze(tiles)}
 static capture(target:ILayerBuffer,binding:CanonicalBeginBinding,view:CanonicalBeginSourceView,acquireLease:(width:number,height:number)=>CanonicalSourceLease,claimBytes:CanonicalSourceClaim,onReleased:(()=>void)|undefined,capability:CanonicalBeginCapability):{kind:'ready';owner:CanonicalBeginSource}|CanonicalBeginNotReady{
  let restore:(()=>void)|undefined,unclaim:(()=>void)|undefined,owner:CanonicalBeginSource|undefined,failed=false;const leases:CanonicalSourceLease[]=[],tiles:PaintTarget[]=[]
  try{
   view.assertCurrent();if(canonicalBeginBindingKey(binding)!==canonicalBeginBindingKey(view.binding))throw Error('Canonical source BEGIN mismatch');let bytes=0;const keys=new Set<string>()
   for(const tile of view.tiles){const{width,height}=tile.buffer,key=JSON.stringify([tile.originX,tile.originY,width,height]);if(keys.has(key)||![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||![tile.originX,tile.originY].every(Number.isFinite))throw Error('Invalid canonical source tile');keys.add(key);bytes+=width*height*4;if(!Number.isSafeInteger(bytes))throw Error('Canonical source byte overflow')}
   const claim=claimBytes(bytes);if(typeof claim!=='function')return claim;unclaim=claim
   const gl=view.tiles[0]?.buffer.gl
   if(gl){const framebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE),texture=gl.getParameter(gl.TEXTURE_BINDING_2D);let texture0=texture;try{if(active!==gl.TEXTURE0){gl.activeTexture(gl.TEXTURE0);texture0=gl.getParameter(gl.TEXTURE_BINDING_2D)}}finally{gl.activeTexture(active)}restore=()=>{let failed=false,primary:unknown;for(const fn of[()=>gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer),()=>gl.activeTexture(gl.TEXTURE0),()=>gl.bindTexture(gl.TEXTURE_2D,texture0),()=>gl.activeTexture(active),()=>gl.bindTexture(gl.TEXTURE_2D,texture)])try{fn()}catch(error){if(!failed){failed=true;primary=error}}if(failed)throw primary}}
   for(const tile of view.tiles){view.assertCurrent();const lease=acquireLease(tile.buffer.width,tile.buffer.height);leases.push(lease);lease.assertCurrent();if(lease.buffer===tile.buffer||lease.buffer.texture===tile.buffer.texture||lease.buffer.width!==tile.buffer.width||lease.buffer.height!==tile.buffer.height)throw Error('Invalid canonical source scratch');tile.buffer.copyTo(lease.buffer);view.assertCurrent();lease.assertCurrent();tiles.push(Object.freeze({...tile,buffer:lease.buffer,contentRect:tile.contentRect?Object.freeze({...tile.contentRect}):null}))}
   view.assertCurrent();const frozen=structuredClone(binding);Object.freeze(frozen.begin);owner=new CanonicalBeginSource(target,Object.freeze(frozen),tiles,capability,{refs:1,leases,unclaim,onReleased});return{kind:'ready',owner}
  }catch(error){failed=true;throw error}finally{
   let cleanupFailed=false,primary:unknown;const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!cleanupFailed){cleanupFailed=true;primary=error}}}
   attempt(()=>view.release())
   if(restore)attempt(restore)
   if(cleanupFailed&&owner){attempt(()=>owner!.release());owner=undefined;leases.length=0;unclaim=undefined}
   if(!owner){for(const lease of leases)attempt(()=>lease.release());if(unclaim){attempt(unclaim);attempt(()=>onReleased?.())}}
   if(!failed&&cleanupFailed)throw primary
  }
 }
 assertCurrent():void{if(!this.live)throw Error('Canonical source was retired');for(const lease of this.storage.leases)lease.assertCurrent()}
 resolveForRead(bounds:WorldRect):readonly PaintTarget[]{this.assertCurrent();return this.tiles.filter(t=>t.originX<bounds.maxX&&t.originY<bounds.maxY&&t.originX+t.buffer.width>bounds.minX&&t.originY+t.buffer.height>bounds.minY)}
 retain():CanonicalBeginSource{this.assertCurrent();this.storage.refs++;return new CanonicalBeginSource(this.target,this.binding,this.tiles,this.capability,this.storage)}
 release():void{
  if(!this.live)return;this.live=false;if(--this.storage.refs)return;let failed=false,primary:unknown
  const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;primary=error}}}
  for(const lease of this.storage.leases)attempt(()=>lease.release());this.storage.leases=[];attempt(this.storage.unclaim);attempt(()=>this.storage.onReleased?.());if(failed)throw primary
 }
}
