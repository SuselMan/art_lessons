import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createNativePuddleTarget} from './native-target-v58'
import {createDiagnosticRegions} from './diagnostic-regions'

/** M67 diagnostic: raw wash stays authoritative; dry preview never commits. */
export function installMiniPuddle(engine:any,size:number,_mode:'morph'|'material',onStatus=(_message:string)=>{}){
 const gl:WebGLRenderingContext=engine.gl,owner=engine._settlePlan
 const flags={blot:engine._ribbonPasses.diagnosticPigmentBlot,batch:engine._ribbonPainter.diagnosticBandBatch,lift:engine.diagnosticWatercolorLiftSteps,minimum:engine.diagnosticNativeFieldMinimum}
 engine._ribbonPasses.diagnosticPigmentBlot=.45;engine._ribbonPainter.diagnosticBandBatch=true
 engine.diagnosticWatercolorLiftSteps=4;engine.diagnosticNativeFieldMinimum=1024
 const originalPrepare=owner.prepare
 const target=createNativePuddleTarget(engine,size,{prepare:function(...args:any[]){const old=owner.diagnosticSkipBrushContacts;owner.diagnosticSkipBrushContacts=true;try{return originalPrepare.apply(owner,args)}finally{owner.diagnosticSkipBrushContacts=old}} as any})
 const regions=createDiagnosticRegions(engine,size)
 const raw=new AccumulationBuffer(gl,size,size),dryImage=new AccumulationBuffer(gl,size,size)
 raw.clear();dryImage.clear()
 const bounds={minX:0,minY:0,maxX:size,maxY:size}
 const keys=['_onStart','_onEnd','_display','_finishRibbonStroke','_scheduleDryingRepaint','_revealWash','_drawRibbonCompositeRect','_updateWetTexture'] as const
 const original=new Map(keys.map(k=>[k,engine[k]]))
 let down=false,destroyed=false,context:any=null,epoch=0,raf=0,maskDirty=false,goalPending=false,goalAfter=0,calculating=false,wantEffect=false,showEffect=false,goalReady=false
 const locate=()=>{const scratch=engine._ribbonStrokeScratch??engine._wash?.scratch,ctx=scratch?.finishContext;if(!ctx)return null;const tile=engine._resolveWithinSheet(ctx.target,bounds)[0],entry=tile&&scratch.peek(tile.buffer);return entry?.inkLoad&&entry.inkColor?{scratch,ctx,tile,entry}:null}
 function captureContext(){
  const s=engine._ribbonStrokeScratch??engine._wash?.scratch,live=engine._liveComposite
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
  ;(showEffect?dryImage:raw).copyTo(f.tile.buffer)
  f.ctx.target.markContentPainted(bounds);engine._paperPartialOK=false;engine._paperCacheKey='';engine._invalidateSplitCache()
 }
 function request(){if(!raf&&!destroyed)raf=requestAnimationFrame(frame)}
 function frame(at:number){
  raf=0;if(destroyed)return
  try{
   const f=locate()
   if(maskDirty&&!down){maskDirty=false;if(f)regions.update(f.entry)}
   if(goalPending&&!down&&at>=goalAfter&&f){goalPending=false;target.resetFromScratch(f.scratch,f.tile,epoch);calculating=true}
   if(calculating&&!down){
    target.step(4)
    if(target.state.done){calculating=false;target.dry();render(dryImage,target.buffers());goalReady=true;showEffect=wantEffect;regions.show(!showEffect);engine._display();onStatus(showEffect?'Показан сухой результат':'Исходные штрихи')}
    else onStatus('Расчёт сухого результата… '+target.state.iterations+'/'+target.state.total)
   }
   if(maskDirty||calculating||goalPending)request()
  }catch(e){goalPending=calculating=false;wantEffect=showEffect=false;regions.show(true);onStatus('Ошибка расчёта: '+(e as Error).message);throw e}
 }
 function cancelGoal(){target.cancel();goalPending=calculating=false;goalReady=false}
 function refreshRaw(){const f=locate();if(!f)return;render(raw,{p:f.entry.inkLoad,c:f.entry.inkColor,coverage:f.entry.coverage});maskDirty=true;request()}
 owner.prepare=()=>null
 engine._drawRibbonCompositeRect=function(...args:any[]){args[11]=0;return original.get('_drawRibbonCompositeRect')!.apply(engine,args)}
 engine._finishRibbonStroke=(scratch:any)=>{captureContext();if(engine._liveComposite?.scratch===scratch)engine._flushLiveComposite();scratch.diffusePending=false}
 engine._scheduleDryingRepaint=()=>{};engine._revealWash=()=>{}
 engine._updateWetTexture=()=>{engine._wetRect=[0,0,-1,-1]}
 if(engine._dryingTimer){clearTimeout(engine._dryingTimer);engine._dryingTimer=0}
 engine._display=function(...args:any[]){if(!down&&context)present();const result=original.get('_display')!.apply(engine,args);regions.draw();return result}
 engine._onStart=function(...args:any[]){
  cancelGoal();wantEffect=showEffect=false;regions.show(false)
  if(context)present()
  down=true;epoch++;if(engine._wash)engine._wash.endedAt=Infinity
  const r=original.get('_onStart')!.apply(engine,args);down=!!engine._strokeLayerId;return r
 }
 engine._onEnd=function(...args:any[]){
  const r=original.get('_onEnd')!.apply(engine,args);down=false;captureContext()
  if(engine._wash)engine._wash.endedAt=Infinity
  refreshRaw();regions.show(true);engine._display();onStatus('Исходные штрихи · контуры обновляются ползунками');return r
 }
 return{
  get state(){return{diagnostic:true,epoch,drawing:down,showingEffect:showEffect,effectRequested:wantEffect,calculating:calculating||goalPending,goalReady,regions:regions.state,target:{...target.state}}},
  tuningChanged(){maskDirty=true;goalReady=false;if(wantEffect){cancelGoal();goalPending=true;goalAfter=performance.now()+180;showEffect=false;regions.show(true);engine._display()}request()},
  toggleEffect(){
   wantEffect=!wantEffect
   if(!wantEffect){if(calculating||goalPending)cancelGoal();showEffect=false;regions.show(true);engine._display();onStatus('Исходные штрихи');return false}
   if(!locate()){wantEffect=false;onStatus('Сначала нарисуйте мазки');return false}
   if(goalReady){showEffect=true;regions.show(false);engine._display()}
   else{goalPending=true;goalAfter=0;request()}
   return wantEffect
  },
  dry(){return this.toggleEffect()},
  diagnosticMaskReadback:()=>regions.readback(),
  diagnosticGoalReadback(){const b=target.buffers();return{p:b.p.readPixels(),c:b.c.readPixels(),coverage:b.coverage.readPixels()}},
  diagnosticRawReadback(){const f=locate();return f?{p:f.entry.inkLoad.readPixels(),c:f.entry.inkColor.readPixels(),coverage:f.entry.coverage.readPixels()}:null},
  destroy(){
   if(destroyed)return;destroyed=true;if(raf)cancelAnimationFrame(raf)
   for(const key of keys)engine[key]=original.get(key)
   owner.prepare=originalPrepare;target.destroy();regions.destroy();raw.destroy();dryImage.destroy()
   engine._ribbonPasses.diagnosticPigmentBlot=flags.blot;engine._ribbonPainter.diagnosticBandBatch=flags.batch
   engine.diagnosticWatercolorLiftSteps=flags.lift;engine.diagnosticNativeFieldMinimum=flags.minimum
   engine._wetTexAt=0
  }
 }
}
