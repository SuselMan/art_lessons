import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { RibbonScratchPool,RibbonScratchRequest,RibbonScratchAcquisition } from '../buffers/RibbonScratchPool'
import type { WorldRect } from '../buffers/tileMath'
import type { PaintTarget } from '../buffers/ILayerBuffer'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import type { BrushGlBatchLifetimeFramebuffer } from './BrushGlBatch'
import type { CanonicalOwnedRgba8Target } from './CanonicalRgba8CompositePass'

// Factory provenance only: no handle/state registry and no caller-supplied
// arbitrary lease can be marked trusted. Non-native/custom layers still work,
// but remain on the original native validity-query path.
const closedLifetimes=new WeakMap<object,{gl:WebGLRenderingContext;closed:()=>boolean}>();
const nativeRetainTargets=TiledLayerBuffer.prototype.retainTargets;
function hasNativeRetainTargets(layer:TiledLayerBuffer):boolean {
  const own=Object.getOwnPropertyDescriptor(layer,'retainTargets')
  if(own)return 'value'in own&&own.value===nativeRetainTargets
  if(Object.getPrototypeOf(layer)!==TiledLayerBuffer.prototype)return false
  const inherited=Object.getOwnPropertyDescriptor(TiledLayerBuffer.prototype,'retainTargets')
  return !!inherited&&'value'in inherited&&inherited.value===nativeRetainTargets
}
export function isCanonicalOwnedLifetime(gl:WebGLRenderingContext,lifetime:object):boolean{const record=closedLifetimes.get(lifetime);if(!record||record.gl!==gl)return false;try{return record.closed()}catch{return false}}

/** Metadata-only binding to real, authoritative straight layer tiles. A binding
 * does not keep textures resident: each synchronous batch acquires its shared
 * lifetime, then releases before yielding. A later acquire revalidates exact
 * tile allocation identities, so reset/eviction cannot reuse a stale binding. */
export function bindCanonicalLayerTargets(layer: TiledLayerBuffer, targets: readonly PaintTarget[]): readonly CanonicalOwnedRgba8Target[] {
  if (layer.pixelEncoding !== 'straight-rgba8') throw new TypeError('Canonical targets require straight RGBA8 layer storage')
  if (!Array.isArray(targets) || targets.length > 64) throw new RangeError('Invalid canonical layer target capacity')
  const snapshot = targets.map(target => {
    if (!target || target.buffer?.pixelEncoding !== 'straight-rgba8') throw new TypeError('Canonical targets require straight RGBA8 buffers')
    return Object.freeze({ ...target })
  })
  // Validate the whole set before exposing target handles; this is metadata
  // only and deliberately does not trigger an eviction sweep on release.
  const native=layer instanceof TiledLayerBuffer&&hasNativeRetainTargets(layer)
  const acquire=native?()=>nativeRetainTargets.call(layer,snapshot):()=>layer.retainTargets(snapshot)
  acquire()()
  const layouts=new Map<PaintTarget['buffer'],BrushGlBatchLifetimeFramebuffer>()
  for(const {buffer,originX,originY}of snapshot){
    const certificate=buffer.verifiedFramebufferLayout
    if(!certificate)throw new Error('Canonical layer target lacks a current fixed framebuffer certificate')
    if(!layouts.has(buffer))layouts.set(buffer,Object.freeze({source:buffer,certificate,originX,originY}))
  }
  const lifetime = Object.freeze({ kind: 'external' as const, owner: Object.freeze({}), ownedFramebufferLayouts:Object.freeze([...layouts.values()]), lease: acquire })
  if(snapshot.length&&native)closedLifetimes.set(lifetime,{gl:snapshot[0].buffer.gl,closed:()=>hasNativeRetainTargets(layer)})
  return Object.freeze(snapshot.map(({ buffer, originX, originY }) => Object.freeze({
    brand: 'canonical-straight-rgba8-v1' as const,
    texture: buffer.texture, framebuffer: buffer.fbo, width: buffer.width, height: buffer.height,
    originX, originY, lifetime,
  })))
}

/** Physical tickets, separate from the engine's logical transient fence. This
 * wrapper owns taken scratch until explicit transfer; no draw lease crosses a
 * turn. Layer storage remains layer-owned even when a partial plan is closed. */
export function prepareCanonicalLayerFrame(layer:TiledLayerBuffer,pool:RibbonScratchPool,rects:readonly Readonly<WorldRect>[],requests:readonly RibbonScratchRequest[]):CanonicalLayerFrame {
  if(layer.pixelEncoding!=='straight-rgba8')throw new TypeError('Canonical targets require straight RGBA8 layer storage')
  const targets=layer.preparePaintTargetRects(rects)
  let scratch:RibbonScratchAcquisition|undefined
  try{if(requests.length)scratch=pool.prepareAcquisition(requests)}catch(primary){try{targets.close()}catch{/* Preserve acquisition error. */}throw primary}
  const owned=new Map<number,AccumulationBuffer>()
  let closed=false
  const current=()=>{if(closed)throw new Error('Closed canonical layer frame')}
  return Object.freeze({targetCount:targets.length,scratchCount:requests.length,
    takeTarget(index:number){current();return targets.take(index)},
    takeResidentTarget(index:number){current();return targets.takeResident(index)},
    takeScratch(index:number){current();if(owned.has(index))throw new Error('Scratch admission already taken');const buffer=scratch!.take(index);owned.set(index,buffer);return buffer},
    takeResidentScratch(index:number){current();if(owned.has(index))throw new Error('Scratch admission already taken');const buffer=scratch!.takeResident(index);if(buffer)owned.set(index,buffer);return buffer},
    scratchAt(index:number){current();const buffer=owned.get(index);if(!buffer)throw new Error('Scratch admission not owned');return buffer},
    transferScratch(index:number){current();const buffer=owned.get(index);if(!buffer)throw new Error('Scratch admission not owned');owned.delete(index);return buffer},
    close(options:{lost?:boolean}={}){if(closed)return;closed=true;let failed=false,error:unknown
      const clean=(f:()=>void)=>{try{f()}catch(e){if(!failed){failed=true;error=e}}}
      for(const buffer of owned.values())if(!options.lost)clean(()=>pool.release(buffer));owned.clear()
      clean(()=>scratch?.close());clean(()=>targets.close());if(failed)throw error
    }})
}
export interface CanonicalLayerFrame {
 readonly targetCount:number
 readonly scratchCount:number
 takeTarget(index:number):PaintTarget
 takeResidentTarget(index:number):PaintTarget|undefined
 takeScratch(index:number):AccumulationBuffer
 takeResidentScratch(index:number):AccumulationBuffer|undefined
 scratchAt(index:number):AccumulationBuffer
 transferScratch(index:number):AccumulationBuffer
 close(options?:{lost?:boolean}):void
}

/** Native raw-wash owner closure: accepts resources/metadata, NEVER a caller
 * supplied lease callback. This is the executor's former implementation. */
export function createCanonicalRawLifetime(gl:WebGLRenderingContext,owner:{alive:boolean;leases:number},local:AccumulationBuffer,position:{x:number;y:number;width:number;height:number},original?:AccumulationBuffer):CanonicalOwnedRgba8Target['lifetime']{
 if(original===local)throw new Error('Canonical wash requires distinct scratch allocations');
 const data=(object:object,key:string)=>{try{const d=Object.getOwnPropertyDescriptor(object,key);return d&&Object.hasOwn(d,'value')?d.value:undefined}catch{return undefined}};
 const plainOwner=()=>typeof data(owner,'alive')==='boolean'&&typeof data(owner,'leases')==='number';
 const plainPosition=['x','y','width','height'].every(key=>typeof data(position,key)==='number');
 const native=plainOwner()&&plainPosition;
 if(native)position={x:position.x,y:position.y,width:position.width,height:position.height};

 const pinned=[local,...original?[original]:[]].map(buffer=>{
  const certificate=buffer.verifiedFramebufferLayout;
  if(!certificate||buffer.gl!==gl||buffer.pixelEncoding!=='straight-rgba8'||buffer.samplingFilter!=='nearest'||buffer.width!==position.width||buffer.height!==position.height)throw new Error('Stale canonical raw wash framebuffer certificate');
  return{buffer,certificate,texture:buffer.texture,framebuffer:buffer.fbo};
 });
 const ownedPointSampler=Object.freeze({texture:pinned[0].texture,source:local,epoch:owner});
 const ownedFramebufferLayouts=Object.freeze(pinned.map(({buffer,certificate})=>Object.freeze({source:buffer,certificate,originX:position.x,originY:position.y})));
 const current=()=>owner.alive&&pinned.every(p=>p.buffer.storageOwnerCurrent&&p.buffer.texture===p.texture&&p.buffer.fbo===p.framebuffer&&p.buffer.gl===gl&&p.buffer.width===position.width&&p.buffer.height===position.height&&p.buffer.verifiedFramebufferLayout===p.certificate);
 const lifetime=Object.freeze({kind:'external' as const,owner,ownedPointSampler,ownedFramebufferLayouts,lease:()=>{
  if(!current()||gl.isContextLost()||!current())throw new Error('Stale canonical raw wash');owner.leases++;let held=true;return()=>{if(held){held=false;owner.leases--}};
 }});
 if(native&&pinned.every(p=>p.buffer instanceof AccumulationBuffer))closedLifetimes.set(lifetime,{gl,closed:plainOwner});
 return lifetime;
}
