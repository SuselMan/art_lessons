import {PrewarmedPreviewPool} from './PrewarmedPreviewPool.mjs';
import {SealedPreviewTransport,PREVIEW_BYTES} from './SealedPreviewTransport.mjs';
import {SealedPreviewGlPort} from './SealedPreviewGlPort.mjs';
import {createPreviewWaterDomain} from './PreviewWaterDomain.mjs';
/** OFF-only runtime, no canonical callbacks/resources. Construction awaited before input. */
export async function createOwnedPreviewRuntime(e,morph,{event=()=>{},budgetBytes=3*PREVIEW_BYTES,excluded=[],createBuffer=null,createDomain=createPreviewWaterDomain}={}){
 const AccumulationBuffer=createBuffer?null:(await import('/src/engine/src/buffers/AccumulationBuffer.ts')).AccumulationBuffer;
 const pool=new PrewarmedPreviewPool({create:(w,h,filter)=>createBuffer?createBuffer(w,h,filter):new AccumulationBuffer(e.gl,w,h,filter),destroy:f=>f.destroy()},{budgetBytes,excluded});let domain;
 try{domain=await createDomain(e._watercolorPasses);
 const paper=e._watercolorPasses.ctx.paperWorldSize(),port=new SealedPreviewGlPort(e._watercolorPasses,{paperWidth:paper.w,paperHeight:paper.h,domainFromWater:domain});return bindOwnedPreviewRuntime(e,morph,{pool,port,domain,event})
 }catch(error){if(!e.gl.isContextLost())e.gl.finish();domain?.disposeAfterFence();pool.disposeAfterFence();throw error}
}
/** Testable chronological seam; default factory above supplies real GL resources. */
export function bindOwnedPreviewRuntime(e,morph,{pool,port,domain,event=()=>{}}){
 const states=new Map();let frame=null,disposed=false;
 const material=(s)=>{const f=s.owner.lease.fields,recipe=s.owner.source.chunks.at(-1)?.composite;if(!recipe)throw Error('Preview needs owned immutable composite recipe');const pending=s.transport.lease.pending;f.original.copyTo(pending);const bounds={minX:0,minY:0,maxX:1024,maxY:1024},tile={buffer:pending,originX:0,originY:0,contentRect:bounds},l=s.transport.lease,side=s.transport.front;
  e._ribbonPasses.drawRibbonCompositeRect(tile,bounds,recipe.preset,recipe.profile,f.original,l.coverage,l[`p${side}`],l[`c${side}`],recipe.color,recipe.opacity,recipe.fieldSeed,recipe.spreadPx,recipe.fringeWater,recipe.migratePx,recipe.profile.normalizeDeposit?recipe.dabSpacing:0,recipe.strokeDir,recipe.bristleRadiusPx)
 };
 const detach=s=>{const held=e._washReveals.get(s.owner.lease.fields.presentation);if(held?.pending===s.transport.lease.pending)held.pending=undefined};
 const retire=s=>{detach(s);s.fence=s.transport.retire();states.delete(s.owner.token);return s};
 const retired=[];
 const lost=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;for(const s of [...states.values()])retired.push(retire(s));event('owned-preview-context-lost')};
 const tick=()=>{frame=null;if(disposed)return;if(e.gl.isContextLost()){lost();return}for(const s of [...states.values()])if(s.owner.source.epoch!==s.epoch){retired.push(retire(s));event('owned-preview-stale-epoch',{sequence:s.owner.token.sequence})}const eligible=[...states.values()].at(-1);if(eligible&&!e._strokeId){const ticket=eligible.transport.begin();if(ticket){port.step(ticket);eligible.transport.complete(ticket);material(eligible);event('owned-preview-step',{sequence:eligible.owner.token.sequence,epoch:eligible.epoch});e._scheduleDisplay()}}if(states.size)frame=requestAnimationFrame(tick)};
 const schedule=()=>{if(frame===null&&!disposed)frame=requestAnimationFrame(tick)};
 return {bytes:pool.bytes,stats:port.stats,
  seal(owner){if(disposed||states.has(owner.token))throw Error('Preview seal lifecycle');const lease=pool.take();if(!lease)throw Error('Preview capacity exhausted');let transport;try{transport=new SealedPreviewTransport({source:owner.lease.fields,lease,token:owner.token})}catch(error){lease.release();throw error}const s={owner,transport,epoch:owner.source.epoch};states.set(owner.token,s);try{port.initialize(transport.seal());material(s);const held=morph.hold(owner);if(held.pending)throw Error('Preview pending already owned');held.pending=lease.pending;event('owned-preview-seal',{sequence:owner.token.sequence,epoch:s.epoch});schedule()}catch(error){retired.push(retire(s));throw error}},
  /** Called BEFORE exact source rebase; GL command ordering preserves issued preview reads. */
  beforeRebase(owner){const s=states.get(owner.token);if(s)retired.push(retire(s))},
  /** Do not release pooled textures on land/DOWN. Physical reuse only after idle fence. */
  retire(owner){const s=states.get(owner.token);if(s)retired.push(retire(s))},
  ownsPending:field=>pool.owns(field),handleContextLoss:lost,
  disposeAfterFence(){if(disposed)return;disposed=true;if(frame!==null)cancelAnimationFrame(frame);for(const s of [...states.values()])retired.push(retire(s));if(!e.gl.isContextLost())e.gl.finish();for(const s of retired)s.transport.releaseAfterFence(s.fence);pool.disposeAfterFence();domain.disposeAfterFence()}
 }
}
