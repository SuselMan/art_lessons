/** Visual-only existing reveal mechanism. Never bind these outputs to canonical source/settle. */
export class OwnedPresentationMorphBridge{
 constructor(engine,{event=()=>{},durationMs=2000,scratch=null}={}){this.e=engine;this.event=event;this.durationMs=durationMs;this.bindings=new Map();this.scratch=scratch;}
 tile(owner){return{buffer:owner.lease.fields.presentation,originX:0,originY:0};}
 hold(owner){const tile=this.tile(owner),layer=this.e._layers.get(owner.token.layerId);let held=this.e._washReveals.get(tile.buffer);if(!held){this.e._revealWash(tile,layer);held=this.e._washReveals.get(tile.buffer);if(!held)throw Error('Owned reveal missing');held.progressive=true;held.startedAt=null;held.durationMs=this.durationMs;held.frameAt=performance.now();}return held;}
 inherit(owner,parentBuffer){const parent=this.e._washReveals.get(parentBuffer);this.bindings.set(owner.token, {owner,parentBuffer});if(!parent)return;if(!parent.progressive)throw Error('QA morph requires progressive parent reveal');const held=this.hold(owner);parent.before.copyTo(held.before);held.startedAt=null;this.event('owned-reveal-inherit',{sequence:owner.token.sequence});}
 beforeCanonical(owner,parentBuffer){this.bindings.set(owner.token,{owner,parentBuffer});this.hold(owner);}
 withScratch(draw){return this.scratch?this.scratch.withEnginePool(this.e,draw):draw();}
 paint(owner,bounds,draw){return this.withScratch(()=>this.paintWithinPool(owner,bounds,draw));}
 paintWithinPool(owner,bounds,draw){const tile=this.tile(owner),previous=this.e._revealBeforeBatch(tile,bounds);let complete=false;try{const result=draw();this.e._revealAfterBatch(tile,bounds,previous);complete=true;return result;}finally{if(!complete&&previous)this.e._ribbonScratchPool.release(previous);}}
 /** Called synchronously immediately after original advance; oldBefore has not been re-acquired. */
 parentAdvanced(parentBuffer,oldBefore,newBefore,latest){return this.withScratch(()=>this.parentAdvancedWithinPool(parentBuffer,oldBefore,newBefore,latest));}
 parentAdvancedWithinPool(parentBuffer,oldBefore,newBefore,latest){if(oldBefore===newBefore||!latest)return;const binding=this.bindings.get(latest.token);if(binding?.parentBuffer!==parentBuffer)return;const held=this.e._washReveals.get(latest.lease.fields.presentation);if(!held)return;const out=this.e._ribbonScratchPool.acquire(1024,1024);try{if([held.before,oldBefore,newBefore].some(f=>f.texture===out.texture))throw Error('Visual delta output feedback');this.e._fieldOp(out,held.before,newBefore,3,1,{c:oldBefore,scissor:[0,0,1024,1024]});out.copyTo(held.before);this.event('owned-parent-progress',{sequence:latest.token.sequence});}finally{this.e._ribbonScratchPool.release(out);}}
 rebaseStarted(owner){const held=this.hold(owner);held.startedAt=held.frameAt=performance.now();held.durationMs=this.durationMs;this.event('owned-material-reveal',{sequence:owner.token.sequence});}
 visibleField(owner){const buffer=owner.lease.fields.presentation,held=this.e._washReveals.get(buffer);return held&&this.e._revealHold(held,performance.now())>0?held.before:buffer;}
 retire(owner){this.bindings.delete(owner.token);const buffer=owner.lease.fields.presentation,held=this.e._washReveals.get(buffer);if(!held)return;for(const field of new Set([held.before,held.pending,held.wetMask].filter(Boolean)))this.e._revealPoolRelease(field);this.e._washReveals.delete(buffer);}
}
