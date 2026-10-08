import {readRetainedWater} from './RetainedWaterProbe.mjs';
import {prewarmWetOverlayTexture} from './PrewarmWetOverlayTexture.mjs';
import {watercolorWashSignature} from '../../../../apps/web/src/engine/src/presets/watercolorPresets.ts';
import {RibbonStrokePainter as OwnerPainter} from '../../../../temp/owner-fifo-runtime/OwnerRibbonStrokePainter.ts';
import {PresentationOwnerPrototype} from './PresentationOwnerPrototype.ts';
import {PrewarmedGlOwnerPool} from './PrewarmedGlOwnerPool.ts';
import {OwnedGlPreparedSource} from './OwnedGlPreparedSource.ts';
import {TypedGlSourceReplayPrototype} from './TypedGlSourceReplayPrototype.ts';
import {createPreparedGlSourcePort} from './PreparedGlSourceDraw.ts';
import {readOwnedVisibleProbe} from './OwnedVisibleProbe.mjs';
import {ReservedVisualScratch} from './ReservedVisualScratch.mjs';
import {OwnedPresentationMorphBridge} from './OwnedPresentationMorphBridge.mjs';
import {prewarmEngineRevealSlots} from './PrewarmedEngineRevealSlots.ts';
const roles=['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'];
/** QA runtime only: never imported by production or the existing 5352 review. */
export function installOwnerFifo(e,{capacity=3,budgetBytes=156*1024*1024,status=()=>{},diagnosticLastOwnerMorph=false,diagnosticMaterialRebase=false,diagnosticPrewarmWetTexture=false,retainedPayloadBudgetBytes=16*1024*1024,revealBudgetBytes=diagnosticMaterialRebase?32*1024*1024:16*1024*1024,visualScratchBudgetBytes=8*1024*1024}={}){
 if(diagnosticMaterialRebase&&diagnosticLastOwnerMorph)throw Error('Choose one diagnostic morph mode');
 const page=e._pageSize();
 if(e._infinite||page.w!==1024||page.h!==1024||e._strokeLayerId||e._settle||e._wcCanonical.pending)throw Error('Owner FIFO requires idle bounded1024 Room');
 if(!e._minmaxExt)throw Error('Owner FIFO requires original MAX capability');
 const canonicalLayer=e._layers?.get(e._activeId);if(!canonicalLayer)throw Error('Owner FIFO requires loaded active layer');
 const canonicalTiles=e._ribbonPainterContext.resolveWithinSheet(canonicalLayer,{minX:0,minY:0,maxX:1024,maxY:1024});if(canonicalTiles.length!==1||canonicalTiles[0].originX||canonicalTiles[0].originY)throw Error('Owner prewarm requires one canonical tile');
 const wetTexturePrewarm=diagnosticPrewarmWetTexture?prewarmWetOverlayTexture(e):null;
 const pool=new PrewarmedGlOwnerPool(e.gl,capacity,budgetBytes);
 const originalScratchPool=e._ribbonScratchPool;let revealPrewarm=null,visualScratchPrewarm=null;try{revealPrewarm=diagnosticLastOwnerMorph||diagnosticMaterialRebase?prewarmEngineRevealSlots({acquire:(w,h)=>e._revealPoolAcquire(w,h),release:f=>e._revealPoolRelease(f)},pool.physicalIdentities,revealBudgetBytes,diagnosticMaterialRebase?8:4):null;if(diagnosticMaterialRebase)visualScratchPrewarm=new ReservedVisualScratch({acquire:(w,h)=>originalScratchPool.acquire(w,h),release:f=>originalScratchPool.release(f)},new Set([...pool.physicalIdentities,...revealPrewarm.resources.map(r=>r.identity)]),visualScratchBudgetBytes)}catch(error){if(!e.gl.isContextLost())e.gl.finish();pool.disposeAfterFence();throw error}
 const coordinator=new PresentationOwnerPrototype({maxOwners:capacity,budgetBytes,detachFinish:finish=>Object.freeze({...finish})});
 const painter=new OwnerPainter(e._ribbonPainterContext),originalPainter=e._ribbonPainter;
 for(const key of Object.keys(originalPainter))if(key!=='ctx'&&(typeof originalPainter[key]==='boolean'||typeof originalPainter[key]==='string'))painter[key]=originalPainter[key];
 const originals={asyncFinish:e._wcAsyncFinish,work:e._ribbonStrokeWork,finish:e._finishRibbonStroke,start:e._onStart,previews:e._asyncLocalPreviewTiles,enqueue:e._wcCanonical.enqueue,blocked:e._wcCanonical.ctx.blocked,advance:e._advanceWashReveal};
 const owners=new Map(),byScratch=new WeakMap();let landedVersion=0,disposed=false,morphHold=null;
 const drawContext={gl:()=>e.gl,stamps:()=>e._stamps,paperTex:()=>e._paperTex,quadBuf:()=>e._quadBuf,minmaxExt:()=>e._minmaxExt};
 const trace=[];const event=(kind,data={})=>{if(trace.length<2048)trace.push({kind,at:performance.now(),...data})};
 const morph=diagnosticMaterialRebase?new OwnedPresentationMorphBridge(e,{event,scratch:visualScratchPrewarm}):null;
 let probeCount=0;const probe=(owner,phase)=>{if(globalThis.__ownerRetainedWaterProbe&&phase==='sealed-source')event('owned-retained-water',readRetainedWater(owner));if(!globalThis.__ownerMorphProbe||probeCount>=16||!owner?.probePoint)return;const data=readOwnedVisibleProbe(e,owner,phase,morph?morph.visibleField(owner):owner.lease.fields.presentation);if(data){probeCount++;event('owned-visible-probe',data)}};
 const latest=layerId=>[...owners.values()].filter(o=>o.token.layerId===layerId&&coordinator.visible().includes(o.token)).at(-1);
 const mapFor=scratch=>{let map=byScratch.get(scratch);if(!map){map=new Map();byScratch.set(scratch,map)}return map};
 const cancelOwner=owner=>{
  if(!coordinator.cancel(owner.token))return;
  event('cancel',{sequence:owner.token.sequence});
  if(coordinator.snapshot().active===owner.token)queueMicrotask(()=>{if(coordinator.snapshot().active!==owner.token)return;if(!e.gl.isContextLost())e.gl.finish();coordinator.completeCancellation(owner.token);owners.delete(owner.token);event('cancel-fenced',{sequence:owner.token.sequence})});
  else owners.delete(owner.token);
 };
 const ensureOwner=(scratch,request,target)=>{
  const map=mapFor(scratch),gesture=request.metadata.gesture;let owner=map.get(gesture);if(owner)return owner;
  const layerId=e._strokeLayerId;if(!layerId)throw Error('Source owner has no active layer');
  const prior=latest(layerId);let parentBuffer=prior?.lease.fields.presentation;const initial=Object.fromEntries(roles.map(role=>[role,null]));
  if(prior){
   if(prior.scratch!==scratch)throw Error('QA cross-wash presentation requires explicit foreign-source adapter');
   for(const role of ['presentation','original','coverage','pigmentLoad','colourLoad','solventLoad'])initial[role]=prior.lease.fields[role];
  }else{
   const tiles=e._ribbonPainterContext.resolveWithinSheet(target,{minX:0,minY:0,maxX:1024,maxY:1024});
   if(tiles.length!==1||tiles[0].originX||tiles[0].originY)throw Error('QA source requires exactly one canonical tile');
   const tile=tiles[0];parentBuffer=tile.buffer;const entry=[...scratch.tileEntries()].find(([buffer])=>buffer===tile.buffer)?.[1];
   initial.presentation=tile.buffer;initial.original=entry?.original??tile.buffer;
   if(entry){initial.coverage=entry.coverage;initial.pigmentLoad=entry.inkLoad;initial.colourLoad=entry.inkColor;initial.solventLoad=entry.solventLoad??null}
  }
  const lease=pool.take(initial);if(!lease)throw Error('QA owner capacity exhausted before source');
  const source=new OwnedGlPreparedSource({lease,context:drawContext,ribbon:e._ribbonPasses,watercolor:e._watercolorPasses,retainForRebase:diagnosticMaterialRebase,retainedPayloadBudgetBytes,ownerToken:diagnosticMaterialRebase?{layerId,gesture}:undefined});
  const admission=coordinator.admit(layerId,gesture,{...lease,release:()=>{if(owner)morph?.retire(owner);source.retire()}});if(!admission.accepted){source.retire();throw Error('QA owner admission '+admission.reason)}
  owner={token:admission.token,gesture,scratch,lease,source,canonicalStarted:false};try{if(morph)morph.inherit(owner,parentBuffer)}catch(error){coordinator.cancel(owner.token);throw error}
  map.set(gesture,owner);owners.set(owner.token,owner);event('admit',{sequence:owner.token.sequence,bytes:coordinator.snapshot().bytes});return owner;
 };
 if(morph)e._advanceWashReveal=function(buffer,reveal,now){const before=reveal.before;const result=originals.advance.call(e,buffer,reveal,now);morph.parentAdvanced(buffer,before,reveal.before,latest(reveal.layerId));return result};
 e._ribbonPainter=painter;e._wcAsyncFinish=true;
 e._wcCanonical.ctx.blocked=()=>originals.blocked()||coordinator.snapshot().owners[0]?.status==='drawing';
 e._onStart=function(...args){
  if(disposed)return;
  if(diagnosticLastOwnerMorph&&morphHold){const held=e._washReveals.get(morphHold.buffer);if(held&&e._revealHold(held,performance.now())>0){status('QA diagnostic morph: новый DOWN пока не поддержан; не пользовательский режим');event('diagnostic-morph-backpressure');return}morphHold=null}
  const open=e._wash,previous=[...owners.values()].at(-1);
  if(e._opts.tool!=='watercolor'&&!previous){e._wcAsyncFinish=false;return originals.start.apply(e,args)}
  e._wcAsyncFinish=true;
  if(e._opts.tool!=='watercolor'||previous&&(!open||open.scratch!==previous.scratch||open.layerId!==e._activeId||open.signature!==watercolorWashSignature(e._opts.pencilType,e._opts.graphiteColor)||performance.now()-open.endedAt>1000)){status('QA: дождитесь завершения перед сменой слоя/краски или новым wash');event('scope-backpressure');return}
  if(pool.free===0){status('Очередь акварели заполнена: дождитесь завершения мазка');event('backpressure');return}
  status('');return originals.start.apply(e,args);
 };
 e._ribbonStrokeWork=function*(target,dabs,preset,presetName,profile,color,scratch,prev,wet,seed,defer=false,piece=0){
  if(!(e._wcAsyncFinish&&defer&&scratch===e._ribbonStrokeScratch)){yield* originals.work.apply(e,arguments);return}
  yield* painter.paint(target,dabs,preset,presetName,profile,color,scratch,prev,wet,seed,defer,piece,{waterOnly:false,segmented:false,deferMaterial:request=>{
   if(!request.typedSource)throw Error('Prepared source capture missing');
   const owner=ensureOwner(scratch,request,target),recipe=request.typedSource;const stamp=recipe.commands.find(command=>command.kind==='stamp'&&command.phase==='pigment');if(stamp&&!owner.probePoint)owner.probePoint=[...stamp.stamp.center];
   const paint=()=>owner.source.paint({commands:recipe.commands,rect:recipe.rect,film:!!recipe.composite.profile.normalizeDeposit&&!!e._minmaxExt,waterOnly:false,composite:recipe.composite});if(morph)morph.paint(owner,recipe.composite.bounds,paint);else paint();
   coordinator.publishSource(owner.token);if(!owner.probedInitial){probe(owner,'first-source');owner.probedInitial=true}e._markPaperDamage(recipe.composite.bounds);e._invalidateSplitCache();e._scheduleDisplay();event('publish',{sequence:owner.token.sequence});
   e._holdAsyncScratch(scratch);
   e._wcCanonical.enqueue({execute:function*(){
    if(!owner.canonicalStarted){const head=coordinator.takeCanonical();if(head?.token!==owner.token)throw Error('Canonical FIFO owner order');owner.canonicalStarted=true;owner.version=landedVersion}
    scratch.activateMaterialFilm(request.metadata.gesture);
    if(recipe.foreignImport.enabled)yield* painter.importForeignWater(target,scratch,recipe.foreignImport.dabs,preset,recipe.foreignImport.wetProfile,request.metadata.foreignSources??[]);
    const tiles=e._ribbonPainterContext.resolveWithinSheet(target,recipe.composite.bounds);if(tiles.length!==1)throw Error('Canonical source escaped tile');const tile=tiles[0];
    const entry=scratch.getOrCreate(tile.buffer),film=scratch.filmBuffers(tile.buffer);if(!film?.strokeColor||!film.colorBase||!entry.inkColor||!entry.inkLoad)throw Error('Canonical P/C source fields missing');
    const running=scratch.runningCoverage(tile.buffer);let solvent;
    const f={coverage:entry.coverage,coverageFilm:running??entry.coverage,pigmentLoad:entry.inkLoad,pigmentBase:film.inkBase,pigmentFilm:film.strokeInk,colourLoad:entry.inkColor,colourBase:film.colorBase,colourFilm:film.strokeColor};
    for(const [role,key]of[['solventLoad','load'],['solventBase','base'],['solventFilm','film']])Object.defineProperty(f,role,{get(){solvent??=scratch.solventFilm(tile.buffer);return solvent[key]}});
    new TypedGlSourceReplayPrototype({segments:[{commands:recipe.commands,rect:recipe.rect}],expectedPredecessorVersion:owner.version,film:!!recipe.composite.profile.normalizeDeposit&&!!e._minmaxExt,captureRunningCoverage:false,initializeMaterialFilm:false,initializeSolventFilm:false}).execute(createPreparedGlSourcePort({bindCurrentCanonical:()=>({landedVersion,fields:f}),tile,context:drawContext,ribbon:e._ribbonPasses,watercolor:e._watercolorPasses,presetHardness:preset.hardness}));
    const c=recipe.composite;e._drawRibbonCompositeRect(tile,c.bounds,c.preset,c.profile,entry.original,entry.coverage,entry.inkLoad,entry.inkColor,c.color,c.opacity,c.fieldSeed,c.spreadPx,c.fringeWater,c.migratePx,c.profile.normalizeDeposit?c.dabSpacing:0,c.strokeDir,c.bristleRadiusPx);
    target.markContentPainted(c.bounds);e._releaseAsyncScratch(scratch,false);event('canonical-source',{sequence:owner.token.sequence});yield 0;
   },cancel:lost=>{request.cancel(lost);e._releaseAsyncScratch(scratch,lost);cancelOwner(owner)}});
  }});
 };
 e._finishRibbonStroke=function(scratch,...args){
  const owner=mapFor(scratch).get(args[3]?.gesture??scratch.gesture);
  if(args[3]&&owner&&morph){
   const layer=e._layers.get(owner.token.layerId),tile=e._ribbonPainterContext.resolveWithinSheet(layer,{minX:0,minY:0,maxX:1024,maxY:1024})[0],visible=latest(owner.token.layerId);if(visible&&visible!==owner)morph.beforeCanonical(visible,tile.buffer);
   const reveal=e._revealWash;e._revealWash=function(target,layer){reveal.call(e,target,layer);const held=e._washReveals.get(target.buffer);if(!held)throw Error('Canonical morph owner missing');morph.visibleField(owner).copyTo(held.before);event('material-morph-transfer',{sequence:owner.token.sequence})};try{return originals.finish.call(e,scratch,...args)}finally{e._revealWash=reveal}
  }
  if(args[3]&&owner&&diagnosticLastOwnerMorph&&!([...owners.values()].some(next=>next.token.sequence>owner.token.sequence))){
   const reveal=e._revealWash;e._revealWash=function(tile,layer){reveal.call(e,tile,layer);const held=e._washReveals.get(tile.buffer);if(!held)throw Error('Original reveal owner missing');owner.lease.fields.presentation.copyTo(held.before);owner.presentationTransferred=true;morphHold={buffer:tile.buffer,sequence:owner.token.sequence};event('diagnostic-morph-transfer',{sequence:owner.token.sequence})};
   try{return originals.finish.call(e,scratch,...args)}finally{e._revealWash=reveal}
  }
  if(!owner||args[3])return originals.finish.call(e,scratch,...args);
  probe(owner,'sealed-source');coordinator.seal(owner.token,scratch.captureFinishMetadata());event('seal',{sequence:owner.token.sequence});
  const enqueue=e._wcCanonical.enqueue;e._wcCanonical.enqueue=function(request){return enqueue.call(this,{execute:function*(){yield* request.execute();if(morph){
     const layer=e._layers.get(owner.token.layerId),tile=e._ribbonPainterContext.resolveWithinSheet(layer,{minX:0,minY:0,maxX:1024,maxY:1024})[0],entry=scratch.peek(tile.buffer);if(!entry?.inkLoad||!entry.inkColor||!entry.solventLoad)throw Error('Read-only landed material roles missing');
     let fields={presentation:tile.buffer,original:entry.original,coverage:entry.coverage,pigmentLoad:entry.inkLoad,colourLoad:entry.inkColor,solventLoad:entry.solventLoad},predecessorGesture=owner.gesture;
     for(const next of [...owners.values()].filter(next=>next.token.layerId===owner.token.layerId&&next.token.sequence>owner.token.sequence).sort((a,b)=>a.token.sequence-b.token.sequence)){morph.hold(next);next.source.rebaseFromPredecessor({ownerToken:next.source.rebaseToken,layerId:next.token.layerId,predecessorGesture,expectedEpoch:next.source.epoch,nextEpoch:next.source.epoch+1,fields});morph.rebaseStarted(next);probe(next,'material-rebase');fields=Object.fromEntries(['presentation','original','coverage','pigmentLoad','colourLoad','solventLoad'].map(role=>[role,next.lease.fields[role]]));predecessorGesture=next.gesture;event('material-rebase',{sequence:next.token.sequence,epoch:next.source.epoch})}
    }landedVersion++;coordinator.land(owner.token);owners.delete(owner.token);e._invalidateSplitCache();e._scheduleDisplay();event('land',{sequence:owner.token.sequence,landedVersion})},cancel:lost=>{request.cancel(lost);cancelOwner(owner)}})};
  try{return originals.finish.call(e,scratch,...args)}finally{e._wcCanonical.enqueue=enqueue}
 };
 e._asyncLocalPreviewTiles=function(){const result=new Map(originals.previews.call(e));for(const token of coordinator.visible()){const owner=owners.get(token);if(owner&&!owner.presentationTransferred)result.set(token.layerId,[{buffer:owner.lease.fields.presentation,originX:0,originY:0}])}return result};
 return{trace,wetTexturePrewarm,diagnosticPrewarmWetTexture,snapshot:()=>coordinator.snapshot(),prewarmedBytes:pool.bytes,prewarmedRevealBytes:revealPrewarm?.bytes??0,diagnosticLastOwnerMorph,diagnosticMaterialRebase,prewarmedVisualScratchBytes:visualScratchPrewarm?.bytes??0,retainedPayloadBudgetBytes,dispose(){if(disposed)return;disposed=true;e._wcCanonical.cancel(e.gl.isContextLost());coordinator.dispose();if(!e.gl.isContextLost())e.gl.finish();const active=coordinator.snapshot().active;if(active)coordinator.completeCancellation(active);visualScratchPrewarm?.disposeAfterFence();pool.disposeAfterFence();e._wcAsyncFinish=originals.asyncFinish;e._ribbonPainter=originalPainter;e._ribbonStrokeWork=originals.work;e._finishRibbonStroke=originals.finish;e._onStart=originals.start;e._asyncLocalPreviewTiles=originals.previews;e._wcCanonical.ctx.blocked=originals.blocked;if(morph)e._advanceWashReveal=originals.advance}};
}
