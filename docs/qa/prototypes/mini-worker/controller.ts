import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import type {createNativePuddleTarget,NativePuddleTargetOptions} from '../mini-puddle/native-target-v70'
import {createPuddlePresentation} from '../mini-puddle/presentation'
import {morphProgress} from '../mini-puddle/morph-clock'
import {createDiagnosticRegions} from './regions'
import {createWaterPreview} from './water-preview'

/** M69/M70: raw material owns each goal; presentation never feeds the solver. */
export function installInteractivePuddle(engine:any,size:number|{width:number;height:number},_mode:'morph'|'material',onStatus:(_message:string)=>void,createTarget:typeof createNativePuddleTarget, options:{noPauses?:boolean;goalDelayMs?:number;onGoal?:(state:unknown)=>void;onStep?:(row:{ms:number;iterations:number;done:boolean})=>void}={}){
 const width=typeof size==='number'?size:size.width,height=typeof size==='number'?size:size.height
 const gl:WebGLRenderingContext=engine.gl,owner=engine._settlePlan
 const flags={blot:engine._ribbonPasses.diagnosticPigmentBlot,batch:engine._ribbonPainter.diagnosticBandBatch,lift:engine.diagnosticWatercolorLiftSteps,minimum:engine.diagnosticNativeFieldMinimum}
 engine._ribbonPasses.diagnosticPigmentBlot=.45;engine._ribbonPainter.diagnosticBandBatch=true
 engine.diagnosticWatercolorLiftSteps=4;engine.diagnosticNativeFieldMinimum=1024
 const originalPrepare=owner.prepare
 const targetOptions:NativePuddleTargetOptions={fullResolution:typeof size!=='number',finalOnly:typeof size!=='number',prepare:function(...args:any[]){const old=owner.diagnosticSkipBrushContacts;owner.diagnosticSkipBrushContacts=true;try{return originalPrepare.apply(owner,args)}finally{owner.diagnosticSkipBrushContacts=old}} as any}
 const target=createTarget(engine,size as any,targetOptions)
 const regions=createDiagnosticRegions(engine,width)
 const waterPreview=createWaterPreview(gl)
 let presentation:ReturnType<typeof createPuddlePresentation>|null=null
 const rawNext=new AccumulationBuffer(gl,width,height)
 let morphEnabled=true,calculationEnabled=true,solvesStarted=0,solvesCompleted=0
 let live=false,liveActive=false,liveFinished=false,drying=false,clock=0,lastAt=0,lastShown=0,cancellations=0,liveInputs=0
 let finalTimer:ReturnType<typeof setTimeout>|null=null
 const duration=120000
 const raw=new AccumulationBuffer(gl,width,height),dryImage=new AccumulationBuffer(gl,width,height)
 raw.clear();dryImage.clear();rawNext.clear()
 const bounds={minX:0,minY:0,maxX:width,maxY:height}
 const keys=['_onStart','_onEnd','_display','_finishRibbonStroke','_scheduleDryingRepaint','_revealWash','_drawRibbonCompositeRect','_updateWetTexture','_flushLiveComposite'] as const
 const original=new Map(keys.map(k=>[k,engine[k]]))
 let ownedDiagnosticSource:any=null,replaySource:any=null,replayMode=false,diagnosticFinal=false
 let down=false,destroyed=false,context:any=null,epoch=0,raf=0,maskDirty=false,goalPending=false,goalAfter=0,calculating=false,wantEffect=false,showEffect=false,goalReady=false
 const locate=()=>{const scratch=replaySource??engine._ribbonStrokeScratch??engine._wash?.scratch,ctx=scratch?.finishContext;if(!ctx)return null;const tile=engine._resolveWithinSheet(ctx.target,bounds)[0],entry=tile&&scratch.peek(tile.buffer);return entry?.inkLoad&&entry.inkColor?{scratch,ctx,tile,entry}:null}
 function captureContext(){
  const s=replaySource??engine._ribbonStrokeScratch??engine._wash?.scratch,live=engine._liveComposite
  if(live?.scratch===s)context={...live}
  else if(s?.finishContext){const c=s.finishContext;context={...c,...s.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:c.fieldSeed,bristleRadiusPx:0})),strokeDir:s.noteDirection(0,0)}}
 }
 function render(image:AccumulationBuffer,m:any){
  const f=locate();if(!f||!context)return
  const c=context;image.clear()
  engine._drawRibbonCompositeRect({...f.tile,buffer:image},bounds,c.preset,c.profile,f.entry.original,m.coverage,m.p,m.c,c.color,c.opacity,c.fieldSeed,c.spreadPx??0,c.fringeWater??c.water??0,c.migratePx??0,0,c.strokeDir??[1,0],c.bristleRadiusPx??0)
 }
 function present(){
  const f=locate();if(!f)return
  const paint=live?(morphEnabled?presentation!.tick(0,{dry:drying}):goalReady?dryImage:raw):showEffect?dryImage:raw
  waterPreview.draw(f.tile.buffer,paint,f.entry.solventLoad??null,f.entry.foreignSolventLoad??null,liveFinished||showEffect?0:.16*(morphEnabled?1-morphProgress(clock,duration):1))
  f.ctx.target.markContentPainted(bounds);engine._paperPartialOK=false;engine._paperCacheKey='';engine._invalidateSplitCache()
 }
 function cancelFinalTimer(){if(finalTimer!==null){clearTimeout(finalTimer);finalTimer=null}}
 function finishLiveGoal(){const found=locate();if(found){dryImage.copyTo(found.tile.buffer);found.ctx.target.markContentPainted(bounds)}dryImage.copyTo(raw);presentation?.reset(dryImage,epoch);liveActive=false;liveFinished=true;drying=false;engine._paperWet.clear();engine._wetTexAt=0;engine._clearWash(false);context=null;engine._paperCacheKey='';engine._invalidateSplitCache();engine._display();onStatus('Высохло')}
 function scheduleFinalTimer(){cancelFinalTimer();finalTimer=setTimeout(()=>{finalTimer=null;if(!destroyed&&live&&!morphEnabled&&!down&&goalReady)finishLiveGoal()},duration)}
 function request(){if(!raf&&!destroyed)raf=requestAnimationFrame(frame)}
 function frame(at:number){
  raf=0;if(destroyed)return
  try{
   const f=locate()
   if(maskDirty&&!down){maskDirty=false;if(f&&!live)regions.update(f.entry)}
   if(goalPending&&!down&&at>=goalAfter&&f){goalPending=false;gl.disable(gl.SCISSOR_TEST);gl.colorMask(true,true,true,true);solvesStarted++;target.resetFromScratch(f.scratch,f.tile,epoch);calculating=true}
   if(calculating&&!down){
    const stepStart=performance.now();target.step(options.noPauses?100000:4);options.onStep?.({ms:performance.now()-stepStart,iterations:target.state.iterations,done:target.state.done})
    if(target.state.done){solvesCompleted++;calculating=false;target.dry();render(dryImage,target.buffers());goalReady=true;options.onGoal?.({...target.state});
     if(live){if(morphEnabled){presentation!.setTarget(dryImage,target.buffers().coverage,epoch);liveActive=true;lastAt=0;clock=0}else{liveActive=false;if(drying)finishLiveGoal();else{scheduleFinalTimer();engine._display();onStatus('Результат готов')}}}
     else{showEffect=wantEffect;regions.show(!showEffect);engine._display();onStatus(showEffect?'Показан сухой результат':'Исходные штрихи')}
    }
    else onStatus((live?'Расчёт цели… ':'Расчёт сухого результата… ')+target.state.iterations+'/'+target.state.total)
   }
   if(live&&morphEnabled&&liveActive&&!down){
    const dt=lastAt?Math.max(0,at-lastAt):0;lastAt=at;clock=Math.min(duration,clock+dt*(drying?100:1));
    const progress=morphProgress(clock,duration);
    if(at-lastShown>=(clock<5000||drying?15:33)||progress>=1){lastShown=at;presentation!.tick(Math.max(.01,dt),{dry:drying,progress});engine._display();onStatus('Живой морфинг · '+Math.round(progress*100)+'%'+(drying?' · ускоренная сушка':''))}
    if(progress>=1)finishLiveGoal()
   }
   if(maskDirty||calculating||goalPending||(live&&morphEnabled&&liveActive&&!down))request()
  }catch(e){goalPending=calculating=false;wantEffect=showEffect=false;regions.show(true);onStatus('Ошибка расчёта: '+(e as Error).message);throw e}
 }
 function cancelGoal(){cancelFinalTimer();target.cancel();goalPending=calculating=false;goalReady=false}
 function refreshRaw(){const f=locate();if(!f)return;render(raw,{p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage});maskDirty=true;request()}
 owner.prepare=()=>null
 engine._drawRibbonCompositeRect=function(...args:any[]){args[11]=0;return original.get('_drawRibbonCompositeRect')!.apply(engine,args)}
 engine._finishRibbonStroke=(scratch:any)=>{if(replayMode)replaySource=scratch;captureContext();if(engine._liveComposite?.scratch===scratch)engine._flushLiveComposite();scratch.diffusePending=false}
 engine._scheduleDryingRepaint=()=>{};engine._revealWash=()=>{}
 engine._updateWetTexture=()=>{engine._wetRect=[0,0,-1,-1]}
 if(engine._dryingTimer){clearTimeout(engine._dryingTimer);engine._dryingTimer=0}
 engine._display=function(...args:any[]){if(!diagnosticFinal&&(live||!down)&&context)present();const result=original.get('_display')!.apply(engine,args);regions.draw();return result}
 function acceptLiveInput(){const f=locate();if(!f)return;captureContext();render(rawNext,{p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage});if(morphEnabled)presentation!.acceptInput(raw,rawNext,epoch);rawNext.copyTo(raw);liveInputs++;present()}
 function scheduleLiveGoal(delay=options.goalDelayMs??(options.noPauses?0:60)){if(!calculationEnabled||!locate())return;cancelGoal();liveActive=false;liveFinished=false;goalPending=true;goalAfter=performance.now()+delay;clock=0;lastAt=0;request()}
 engine._flushLiveComposite=function(...args:any[]){const changed=!!engine._liveComposite?.scratch?.pendingComposite?.size;if(live&&changed)captureContext();const result=original.get('_flushLiveComposite')!.apply(engine,args);if(live&&changed)acceptLiveInput();return result}
 engine._onStart=function(...args:any[]){
  if(live&&(calculating||goalPending||liveActive))cancellations++;cancelGoal();liveActive=false;drying=false;wantEffect=showEffect=false;regions.show(false)
  if(!live&&context)present()
  down=true;if(live)liveFinished=false;epoch++;if(live&&morphEnabled)presentation!.invalidate(epoch);if(engine._wash)engine._wash.endedAt=Infinity
  const r=original.get('_onStart')!.apply(engine,args);down=!!engine._strokeLayerId;return r
 }
 engine._onEnd=function(...args:any[]){
  const r=original.get('_onEnd')!.apply(engine,args);down=false;captureContext()
  if(engine._wash)engine._wash.endedAt=Infinity
  if(live){acceptLiveInput();scheduleLiveGoal();regions.show(false);engine._display();onStatus(calculationEnabled?'Расчёт новой цели…':'Расчёт отключён · только живой мазок')}else{refreshRaw();regions.show(true);engine._display();onStatus('Исходные штрихи · контуры обновляются ползунками')}return r
 }
 return{
  get state(){return{diagnostic:true,live,calculationEnabled,solvesStarted,solvesCompleted,morphEnabled,presentationAllocated:!!presentation,active:liveActive,done:live?!down&&(liveFinished||(!liveActive&&!calculating&&!goalPending)):goalReady,dry:drying,progress:morphProgress(clock,duration),durationMs:duration,cancellations,liveInputs,epoch,drawing:down,showingEffect:showEffect,effectRequested:wantEffect,calculating:calculating||goalPending,goalReady,regions:regions.state,target:{...target.state}}},
  tuningChanged(){if(live){scheduleLiveGoal(180);regions.show(false);onStatus('Обновляется цель морфинга…');return}maskDirty=true;goalReady=false;if(wantEffect){cancelGoal();goalPending=true;goalAfter=performance.now()+180;regions.show(false);engine._display()}request()},
  toggleEffect(){
   wantEffect=!wantEffect
   if(!wantEffect){if(calculating||goalPending)cancelGoal();showEffect=false;regions.show(true);engine._display();onStatus('Исходные штрихи');return false}
   if(!locate()){wantEffect=false;onStatus('Сначала нарисуйте мазки');return false}
   if(goalReady){showEffect=true;regions.show(false);engine._display()}
   else{goalPending=true;goalAfter=0;request()}
   return wantEffect
  },
  setLive(value:boolean){
   if(value===live)return;cancelGoal();liveActive=false;drying=false;showEffect=wantEffect=false;live=value;clock=0;lastAt=0;
   if(live){if(morphEnabled){presentation??=createPuddlePresentation(gl,size,{smoothArrival:true});presentation.reset(raw,epoch)}regions.show(false);scheduleLiveGoal();engine._display();onStatus('Живое рисование · можно рисовать')}
   else{presentation?.destroy();presentation=null;maskDirty=true;regions.show(true);engine._display();request();onStatus('Исходные штрихи · контуры')}
  },
  setCalculationEnabled(value:boolean){
   if(value===calculationEnabled)return
   cancelGoal();calculationEnabled=value;liveActive=false;drying=false;showEffect=wantEffect=false
   if(!value){this.setMorphEnabled(false);if(live&&locate())acceptLiveInput();engine._display();onStatus('Расчёт отключён · только живой мазок')}
   else if(live){scheduleLiveGoal(0);engine._display();onStatus('Расчёт включён')}
  },
  setMorphEnabled(value:boolean){
   value=value&&calculationEnabled
   if(value===morphEnabled)return
   cancelFinalTimer();morphEnabled=value;liveActive=false;drying=false;clock=0;lastAt=0
   if(value&&live){presentation??=createPuddlePresentation(gl,size,{smoothArrival:true});presentation.reset(raw,epoch);if(goalReady&&!liveFinished&&locate()){presentation.setTarget(dryImage,target.buffers().coverage,epoch);liveActive=true;request()}}
   else{presentation?.destroy();presentation=null;if(live&&goalReady&&!liveFinished&&locate())scheduleFinalTimer()}
   if(live){engine._display();onStatus(value?'Морфинг включён':goalReady?'Результат готов':'Морфинг отключён')}
  },
  dry(){if(!calculationEnabled)return false;if(live){if(!locate()||liveFinished)return;if(!morphEnabled&&goalReady){cancelFinalTimer();finishLiveGoal();return true}drying=true;goalAfter=0;lastAt=performance.now();request();return true}return this.toggleEffect()},
  diagnosticMorphAt(progress:number){if(!live||!morphEnabled||!goalReady||!presentation)throw Error('Need a ready live goal');presentation.tick(1,{dry:false,progress:Math.max(0,Math.min(1,progress))});engine._display();return undefined},
  diagnosticMaskReadback:()=>regions.readback(),
  /** QA oracle: repeat from the unchanged raw wash, never animated pixels.
   * Used outside timing intervals; leaves the existing presentation untouched. */
  diagnosticRepeatGoal(finalOnly:boolean,maxOps=100000){
   const f=locate();if(!f||down||calculating||goalPending||!goalReady)throw Error('Repeat requires a completed stationary goal')
   const previous=targetOptions.finalOnly
   try{
    targetOptions.finalOnly=finalOnly;target.resetFromScratch(f.scratch,f.tile,epoch)
    while(!target.state.done)target.step(Math.max(1,maxOps))
    target.dry()
    return this.diagnosticGoalReadback()
   }finally{targetOptions.finalOnly=previous}
  },
  /** Isolated recorded-op QA seam. Never calls private pointer lifecycle. */
  diagnosticReplayScene(operations:any[]){
   if(down||calculating||engine._log.entries.length)throw Error('Replay requires a fresh idle engine')
   cancelGoal();replayMode=true;diagnosticFinal=false;context=null;replaySource=null
   engine.suspendDisplay()
   try{
    const layers=[...new Set(operations.map(op=>op.layerId))]
    for(const id of layers)if(!engine._layers.has(id))engine.initLayer(id)
    engine.setBaseLayers(layers);engine.setCompositeOrder(layers.map(id=>({id,opacity:1})));engine.setActiveLayer(layers.at(-1))
    for(const op of operations)engine.appendOperation(op,'remote')
    const f=locate();if(!f)throw Error('Recorded replay did not retain a native source')
    captureContext();if(!context)throw Error('Recorded replay context missing')
    epoch++;render(raw,{p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage})
    return{operationCount:operations.length,sourceReady:true,epoch}
   }finally{
    replayMode=false
    // A normal history batch retires every replay scratch in resumeDisplay.
    // This diagnostic explicitly owns the final source until engine.destroy.
    const retained=[...engine._replayRibbonChunks.entries()].filter(([,row]:any)=>row.scratch===replaySource)
    if(retained.length>1)throw Error('Ambiguous retained replay source')
    for(const[key]of retained)engine._replayRibbonChunks.delete(key)
    try{engine.resumeDisplay()}finally{for(const[key,row]of retained){if(engine._replayRibbonChunks.has(key))throw Error('Replay cache identity collision');engine._replayRibbonChunks.set(key,row)}}
   }
  },
  diagnosticSetOwnedSource(source:any){
   if(ownedDiagnosticSource||down||calculating)throw Error('Fresh stationary diagnostic source required')
   cancelGoal();ownedDiagnosticSource=source;replaySource=source;diagnosticFinal=false;context=null;epoch++;captureContext()
   if(!locate()||!context)throw Error('Injected diagnostic source/context missing')
   liveActive=false;drying=false;goalReady=false;render(raw,{p:locate()!.entry.inkLoad,c:locate()!.entry.inkColor,coverage:locate()!.entry.coverage})
  },
  diagnosticSource(){const f=locate();if(!f)throw Error('Native source missing');return f},
  diagnosticWithSource<T>(source:any,fn:()=>T):T{
   if(down||calculating||goalPending)throw Error('Stationary component diagnostic required')
   const saved={replaySource,context,epoch,goalReady,diagnosticFinal,liveActive,drying}
   try{replaySource=source;context=null;epoch++;captureContext();if(!locate()||!context)throw Error('Component context missing');return fn()}
   finally{replaySource=saved.replaySource;context=saved.context;epoch=saved.epoch;goalReady=saved.goalReady;diagnosticFinal=saved.diagnosticFinal;liveActive=saved.liveActive;drying=saved.drying}
  },
  diagnosticPresentInput(){
   const f=locate();if(!f)throw Error('Native input source required')
   render(raw,{p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage});diagnosticFinal=true;liveActive=false;drying=false
   raw.copyTo(f.tile.buffer);f.ctx.target.markContentPainted(bounds)
   engine._paperCacheKey='';engine._paperPartialOK=false;engine._invalidateSplitCache()
   original.get('_display')!.call(engine)
  },
  diagnosticPresentGoal(){
   const f=locate();if(!f||!target.state.done)throw Error('Completed goal required')
   render(dryImage,target.buffers());diagnosticFinal=true;liveActive=false;drying=false
   dryImage.copyTo(f.tile.buffer);f.ctx.target.markContentPainted(bounds)
   engine._paperCacheKey='';engine._paperPartialOK=false;engine._invalidateSplitCache()
   original.get('_display')!.call(engine)
  },
  diagnosticCancelCore(){target.cancel()},
  diagnosticRunCore(maxOps=100000){
   const f=locate();if(!f||down||calculating||goalPending)throw Error('Stationary component core source required')
   target.resetFromScratch(f.scratch,f.tile,epoch)
   while(!target.state.done)target.step(Math.max(1,maxOps))
   target.dry();return target.buffers()
  },
  diagnosticRunGoal(maxOps=100000){
   const f=locate();if(!f||down||calculating||goalPending)throw Error('Stationary replay source required')
   const started=performance.now();target.resetFromScratch(f.scratch,f.tile,epoch)
   while(!target.state.done)target.step(Math.max(1,maxOps))
   target.dry();this.diagnosticPresentGoal();goalReady=true
   const submitted=performance.now(),saved=gl.getParameter(gl.FRAMEBUFFER_BINDING),pixel=new Uint8Array(4)
   let status=0,error=0
   try{gl.bindFramebuffer(gl.FRAMEBUFFER,(dryImage as any)._fbo);status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);if(status!==gl.FRAMEBUFFER_COMPLETE)throw Error('Goal framebuffer incomplete');gl.readPixels(width>>1,height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);error=gl.getError();if(error)throw Error('Goal dependency GLerror '+error)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,saved)}
   const ready=performance.now()
   return{submitJsMs:submitted-started,runToDependentMs:ready-submitted,totalReadyMs:ready-started,iterations:target.state.iterations,status,glError:error,probeRGBA:Array.from(pixel),logicalReadBytes:4,qualification:'Reset, native solve, dry and final composite; dependent1px read, not universal GPU completion. Full output hashing/PNG excluded.'}
  },
  diagnosticCompletedCReadback(){if(!target.state.done)throw Error('Completed target required');return target.buffers().c.readPixels()},
  diagnosticGoalReadback(){const b=target.buffers();return{p:b.p.readPixels(),c:b.c.readPixels(),coverage:b.coverage.readPixels()}},
  diagnosticRawReadback(){const f=locate();return f?{p:f.entry.inkLoad.readPixels(),c:f.entry.inkColor.readPixels(),coverage:f.entry.coverage.readPixels()}:null},
  destroy(){
   if(destroyed)return;destroyed=true;cancelFinalTimer();if(raf)cancelAnimationFrame(raf)
   for(const key of keys)engine[key]=original.get(key)
   owner.prepare=originalPrepare;target.destroy();ownedDiagnosticSource?.destroy();regions.destroy();waterPreview.destroy();raw.destroy();dryImage.destroy();rawNext.destroy();presentation?.destroy()
   engine._ribbonPasses.diagnosticPigmentBlot=flags.blot;engine._ribbonPainter.diagnosticBandBatch=flags.batch
   engine.diagnosticWatercolorLiftSteps=flags.lift;engine.diagnosticNativeFieldMinimum=flags.minimum
   engine._wetTexAt=0
  }
 }
}
