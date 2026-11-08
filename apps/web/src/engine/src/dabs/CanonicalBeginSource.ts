import type{ILayerBuffer,PaintTarget}from'../buffers/ILayerBuffer'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{WorldRect}from'../buffers/tileMath'
import{canonicalBeginBindingKey}from'./CanonicalBeginRuntime'
import type{CanonicalBeginBinding,CanonicalBeginNotReady,CanonicalBeginResult,CanonicalBeginCapability}from'./CanonicalBeginRuntime'
import type{CanvasProjectionSampler,ProjectionSampleLayer}from'../raster/CanvasProjectionSampler'
export interface CanonicalBeginLayeredView{readonly binding:CanonicalBeginBinding;readonly layers:readonly{readonly opacity:number;readonly tiles:readonly PaintTarget[]}[];assertCurrent():void;release():void}
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
 static captureMerged(target:ILayerBuffer,binding:CanonicalBeginBinding,view:CanonicalBeginLayeredView,acquireLease:(width:number,height:number)=>CanonicalSourceLease,claimBytes:CanonicalSourceClaim,onReleased:(()=>void)|undefined,capability:CanonicalBeginCapability,projection:Pick<CanvasProjectionSampler,'gather'>):{kind:'ready';owner:CanonicalBeginSource}|CanonicalBeginNotReady{
  const leases:CanonicalSourceLease[]=[],tiles:PaintTarget[]=[]
  let unclaim:(()=>void)|undefined,owner:CanonicalBeginSource|undefined,failed=false,restore:(()=>void)|undefined
  try{
   view.assertCurrent()
   if(canonicalBeginBindingKey(binding)!==canonicalBeginBindingKey(view.binding))throw Error('Canonical projection BEGIN mismatch')
   const side=512,cells=new Map<string,{originX:number;originY:number}>();let gl:WebGLRenderingContext|undefined;const ranges:{x0:number;y0:number;x1:number;y1:number}[]=[]
   const layers:ProjectionSampleLayer[]=view.layers.map(layer=>{
    if(!Number.isFinite(layer.opacity)||layer.opacity<0||layer.opacity>1)throw Error('Invalid canonical layer opacity')
    const seen=new Set<string>(),fixed:PaintTarget[]=[]
    for(const tile of layer.tiles){
     const w=tile.buffer.width,h=tile.buffer.height
     if(!Number.isSafeInteger(w)||w<=0||!Number.isSafeInteger(h)||h<=0||!Number.isSafeInteger(tile.originX)||!Number.isSafeInteger(tile.originY)||(gl!==undefined&&gl!==tile.buffer.gl))throw Error('Invalid canonical projection tile')
     gl=tile.buffer.gl;const key=JSON.stringify([tile.originX,tile.originY,w,h])
     if(seen.has(key))throw Error('Duplicate canonical projection layer cell');seen.add(key)
     if(fixed.some(t=>tile.originX<t.originX+t.buffer.width&&tile.originY<t.originY+t.buffer.height&&tile.originX+w>t.originX&&tile.originY+h>t.originY))throw Error('Overlapping canonical layer tiles')
     const frozen=Object.freeze({...tile,contentRect:tile.contentRect?Object.freeze({...tile.contentRect}):null});fixed.push(frozen)
     if(tile.contentRect){const c=tile.contentRect
      if(![c.minX,c.minY,c.maxX,c.maxY].every(Number.isSafeInteger)||c.minX<tile.originX||c.minY<tile.originY||c.maxX>tile.originX+w||c.maxY>tile.originY+h||c.maxX<c.minX||c.maxY<c.minY)throw Error('Invalid canonical content bounds')
      if(c.maxX>c.minX&&c.maxY>c.minY)ranges.push({x0:Math.floor(c.minX/side),y0:Math.floor(c.minY/side),x1:Math.ceil(c.maxX/side),y1:Math.ceil(c.maxY/side)})
     }
    }
    // Only the borrowed fixed BEGIN list is visible to the existing sampler.
    return{opacity:layer.opacity,buffer:{resolveVisible:(rect:WorldRect)=>fixed.filter(t=>t.originX<rect.maxX&&t.originY<rect.maxY&&t.originX+t.buffer.width>rect.minX&&t.originY+t.buffer.height>rect.minY)}}
   })
   // Exact rectangle-union count without allocating a cell set before budget admission.
   const xs=[...new Set(ranges.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);let count=0
   for(let i=1;i<xs.length;i++){const left=xs[i-1]!,right=xs[i]!,ys=ranges.filter(r=>r.x0<right&&r.x1>left).map(r=>[r.y0,r.y1]as const).sort((a,b)=>a[0]-b[0]);let bottom=0,top=0,total=0,first=true
    for(const y of ys){if(first){bottom=y[0];top=y[1];first=false}else if(y[0]<=top)top=Math.max(top,y[1]);else{total+=top-bottom;bottom=y[0];top=y[1]}}if(!first)total+=top-bottom;count+=(right-left)*total
   }
   const bytes=count*side*side*4
   if(!Number.isSafeInteger(bytes))throw Error('Canonical projection byte overflow')
   const claim=claimBytes(bytes);if(typeof claim!=='function')return claim;unclaim=claim
   for(const r of ranges)for(let y=r.y0;y<r.y1;y++)for(let x=r.x0;x<r.x1;x++)cells.set(JSON.stringify([x,y]),{originX:x*side,originY:y*side})
   if(gl){const g=gl,framebuffer=g.getParameter(g.FRAMEBUFFER_BINDING),active=g.getParameter(g.ACTIVE_TEXTURE),texture=g.getParameter(g.TEXTURE_BINDING_2D);let texture0=texture
    try{g.activeTexture(g.TEXTURE0);texture0=g.getParameter(g.TEXTURE_BINDING_2D)}finally{g.activeTexture(active)}
    restore=()=>{let bad=false,primary:unknown;for(const fn of[()=>g.bindFramebuffer(g.FRAMEBUFFER,framebuffer),()=>g.activeTexture(g.TEXTURE0),()=>g.bindTexture(g.TEXTURE_2D,texture0),()=>g.activeTexture(active),()=>g.bindTexture(g.TEXTURE_2D,texture)])try{fn()}catch(error){if(!bad){bad=true;primary=error}}if(bad)throw primary}
   }
   const sourceBuffers=new Set(view.layers.flatMap(layer=>layer.tiles.map(t=>t.buffer))),sourceTextures=new Set([...sourceBuffers].map(b=>b.texture))
   for(const cell of cells.values()){
    view.assertCurrent();const lease=acquireLease(side,side);leases.push(lease);lease.assertCurrent()
    if(sourceBuffers.has(lease.buffer)||sourceTextures.has(lease.buffer.texture)||leases.slice(0,-1).some(l=>l.buffer===lease.buffer||l.buffer.texture===lease.buffer.texture)||lease.buffer.width!==side||lease.buffer.height!==side)throw Error('Invalid canonical projection scratch')
    const rect={minX:cell.originX,minY:cell.originY,maxX:cell.originX+side,maxY:cell.originY+side}
    projection.gather(lease.buffer,rect,layers);view.assertCurrent();lease.assertCurrent()
    // Conservative content bound; no readback is needed to tighten it.
    tiles.push(Object.freeze({buffer:lease.buffer,originX:cell.originX,originY:cell.originY,contentRect:Object.freeze(rect)}))
   }
   view.assertCurrent();const frozen=structuredClone(binding);Object.freeze(frozen.begin)
   owner=new CanonicalBeginSource(target,Object.freeze(frozen),tiles,capability,{refs:1,leases,unclaim,onReleased});return{kind:'ready',owner}
  }catch(error){failed=true;throw error}finally{
   let bad=false,primary:unknown;const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!bad){bad=true;primary=error}}}
   attempt(()=>view.release());if(restore)attempt(restore)
   if(bad&&owner){attempt(()=>owner!.release());owner=undefined;leases.length=0;unclaim=undefined}
   if(!owner){for(const lease of leases)attempt(()=>lease.release());if(unclaim){attempt(unclaim);attempt(()=>onReleased?.())}}
   if(!failed&&bad)throw primary
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
