import {TypedPreviewPool} from '../728-room-moment/TypedPreviewPool.mjs';
import {TypedPreviewTransport} from '../728-room-moment/TypedPreviewTransport.mjs';
import {createPreviewManualMaterial} from './PreviewManualMaterial.mjs';
import {withPreviewMaterialLinear} from './PreviewMaterialSampling.mjs';
import {PrewarmedPreviewPool} from './PrewarmedPreviewPool.mjs';
import {SealedPreviewTransport,PREVIEW_BYTES} from './SealedPreviewTransport.mjs';
import {SealedPreviewGlPort} from './SealedPreviewGlPort.mjs';
import {createPreviewWaterDomain} from './PreviewWaterDomain.mjs';
/** OFF-only runtime, no canonical callbacks/resources. Construction awaited before input. */
export async function createOwnedPreviewRuntime(e,morph,{event=()=>{},budgetBytes=3*PREVIEW_BYTES,excluded=[],observe=null,directDisplay=false,materialLinear=false,floatTransport=false,createBuffer=null,createDomain=createPreviewWaterDomain}={}){
 const AccumulationBuffer=createBuffer?null:(await import('/src/engine/src/buffers/AccumulationBuffer.ts')).AccumulationBuffer;
 const createQ8=(w,h,filter)=>createBuffer?createBuffer(w,h,filter):new AccumulationBuffer(e.gl,w,h,filter);const pool=floatTransport?new TypedPreviewPool({gl:e.gl,createQ8,enabled:true,budgetBytes,excluded}):new PrewarmedPreviewPool({create:createQ8,destroy:f=>f.destroy()},{budgetBytes,excluded});if(floatTransport)pool.disposeAfterFence=()=>pool.disposeAfterKnownIdle();let domain,manual;
 try{domain=await createDomain(e._watercolorPasses);
 if(floatTransport)manual=await createPreviewManualMaterial(e._ribbonPasses);
 const paper=e._watercolorPasses.ctx.paperWorldSize(),port=new SealedPreviewGlPort(e._watercolorPasses,{paperWidth:paper.w,paperHeight:paper.h,domainFromWater:domain});return bindOwnedPreviewRuntime(e,morph,{pool,port,domain,event,observe,directDisplay,materialLinear,manual,Transport:floatTransport?TypedPreviewTransport:SealedPreviewTransport})
 }catch(error){if(!e.gl.isContextLost())e.gl.finish();manual?.disposeAfterFence();domain?.disposeAfterFence();pool.disposeAfterFence();throw error}
}
/** Testable chronological seam; default factory above supplies real GL resources. */
export function bindOwnedPreviewRuntime(e,morph,{pool,port,domain,event=()=>{},observe=null,directDisplay=false,materialLinear=false,manual=null,Transport=SealedPreviewTransport}){
 const states=new Map();let frame=null,disposed=false;
 const material=(s)=>{const materialStarted=performance.now();const f=s.owner.lease.fields,recipe=s.owner.source.chunks.at(-1)?.composite;if(!recipe)throw Error('Preview needs owned immutable composite recipe');const pending=s.transport.lease.pending;f.original.copyTo(pending);const bounds={minX:0,minY:0,maxX:1024,maxY:1024},tile={buffer:pending,originX:0,originY:0,contentRect:bounds},l=s.transport.lease,side=s.transport.front;
  // Transport domain is support-only; production composite MUST read full readonly
  // source coverage (across/pool/standing-water), never the overwritten128 domain.
  const draw=()=>(manual?.passes??e._ribbonPasses).drawRibbonCompositeRect(tile,bounds,recipe.preset,recipe.profile,f.original,f.coverage,l[`p${side}`],l[`c${side}`],recipe.color,recipe.opacity,recipe.fieldSeed,recipe.spreadPx,recipe.fringeWater,recipe.migratePx,recipe.profile.normalizeDeposit?recipe.dabSpacing:0,recipe.strokeDir,recipe.bristleRadiusPx);if(materialLinear&&!manual){withPreviewMaterialLinear(e.gl,l[`p${side}`],l[`c${side}`],draw);port.stats.materialLinearDraws=(port.stats.materialLinearDraws??0)+1}else draw();const elapsed=performance.now()-materialStarted;port.stats.materialCpuSubmitMs=(port.stats.materialCpuSubmitMs??0)+elapsed;port.stats.materialCpuSubmitMaxMs=Math.max(port.stats.materialCpuSubmitMaxMs??0,elapsed);
 };
 const detach=s=>{const held=e._washReveals.get(s.owner.lease.fields.presentation);if(held?.pending===s.transport.lease.pending)held.pending=undefined};
 const retire=s=>{observe?.({stage:'retire',owner:s.owner,lease:s.transport.lease,front:s.transport.front,steps:s.steps});detach(s);s.fence=s.transport.retire();states.delete(s.owner.token);return s};
 const retired=[],releasedOwners=new WeakSet();
 const lost=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;for(const s of [...states.values()])retired.push(retire(s));event('owned-preview-context-lost')};
 const tick=()=>{frame=null;if(disposed)return;if(e.gl.isContextLost()){lost();return}for(const s of [...states.values()])if(s.owner.source.epoch!==s.epoch){retired.push(retire(s));event('owned-preview-stale-epoch',{sequence:s.owner.token.sequence})}const eligible=[...states.values()].at(-1);if(eligible&&!e._strokeId){const ticket=eligible.transport.begin();if(ticket){port.step(ticket);eligible.transport.complete(ticket);eligible.steps++;material(eligible);observe?.({stage:'step',owner:eligible.owner,lease:eligible.transport.lease,front:eligible.transport.front,steps:eligible.steps});event('owned-preview-step',{sequence:eligible.owner.token.sequence,epoch:eligible.epoch});e._scheduleDisplay()}}if(states.size)frame=requestAnimationFrame(tick)};
 const schedule=()=>{if(frame===null&&!disposed)frame=requestAnimationFrame(tick)};
 port.stats.format=pool.format??'rgba8';port.stats.fallbackReason=pool.fallbackReason??null;return {bytes:pool.bytes,stats:port.stats,get freeSlots(){return disposed||e.gl.isContextLost()?0:pool.available.length},
  /** Caller must hold shared ALL-command GPU-idle certificate. This method issues NO fence. */
  releaseRetiredOwnerAfterKnownIdle(owner){if(disposed||e.gl.isContextLost())throw Error('No preview reuse after dispose/context loss');if(releasedOwners.has(owner))return false;if(states.has(owner.token))throw Error('Cannot release active preview');const index=retired.findIndex(s=>s.owner===owner&&s.owner.token===owner.token);if(index<0)throw Error('Unknown retired preview owner');const s=retired[index];if(s.transport.state!=='RETIRING'||s.fence!==s.transport.retirement||s.fence.token!==owner.token||s.fence.epoch!==s.transport.epoch)throw Error('Stale preview retirement fence');if([...e._washReveals.values()].some(h=>h.pending===s.transport.lease.pending||h.before===s.transport.lease.pending))throw Error('Preview still attached to display');s.transport.releaseAfterFence(s.fence);retired.splice(index,1);releasedOwners.add(owner);event('owned-preview-released-after-known-idle',{sequence:owner.token.sequence});return true},
  seal(owner){if(disposed||states.has(owner.token))throw Error('Preview seal lifecycle');const lease=pool.take();if(!lease)throw Error('Preview capacity exhausted');let transport;try{transport=new Transport({source:owner.lease.fields,lease,token:owner.token})}catch(error){lease.release();throw error}const s={owner,transport,epoch:owner.source.epoch,steps:0};states.set(owner.token,s);try{port.initialize(transport.seal());if(directDisplay)morph.visibleField(owner).copyTo(lease.pending);else material(s);observe?.({stage:'initialize',owner:s.owner,lease:s.transport.lease,front:s.transport.front,steps:0});const held=morph.hold(owner);if(held.pending)throw Error('Preview pending already owned');held.pending=lease.pending;event('owned-preview-seal',{sequence:owner.token.sequence,epoch:s.epoch});schedule()}catch(error){retired.push(retire(s));throw error}},
  /** Called BEFORE exact source rebase; GL command ordering preserves issued preview reads. */
  beforeRebase(owner){const s=states.get(owner.token);if(s){if(directDisplay)s.transport.lease.pending.copyTo(morph.hold(owner).before);retired.push(retire(s))}},
  /** Do not release pooled textures on land/DOWN. Physical reuse only after idle fence. */
  retire(owner){const s=states.get(owner.token);if(s)retired.push(retire(s))},
  visibleField(owner){return directDisplay?states.get(owner.token)?.transport.lease.pending??null:null},
  ownsPending:field=>pool.owns(field),retirePending(field){for(const s of [...states.values()])if(s.transport.lease.pending===field)retired.push(retire(s))},handleContextLoss:lost,
  disposeAfterFence(){if(disposed)return;disposed=true;if(frame!==null)cancelAnimationFrame(frame);for(const s of [...states.values()])retired.push(retire(s));if(!e.gl.isContextLost())e.gl.finish();for(const s of retired)s.transport.releaseAfterFence(s.fence);pool.disposeAfterFence();domain.disposeAfterFence();manual?.disposeAfterFence()}
 }
}
