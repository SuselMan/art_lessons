import {createContourClip} from './clip-contour-v05'
// M58: M14 plus protected native background mixing.
import { morphProgress } from './morph-clock'
import { AccumulationBuffer } from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import { wetDryMsFor } from '../../../../apps/web/src/engine/src/paper/paperWetness'
import { createNativePuddleTarget } from './native-target-v58'
import { createPuddlePresentation } from './presentation'
import { createMaterialBlend } from './material-blend-v01'

/** Standalone experiment. The native live input path is deliberately untouched. */
export function installMiniPuddle(engine: any, size: number, mode: 'morph'|'material', onStatus=(_message:string)=>{}) {
  const oldBlot=engine._ribbonPasses.diagnosticPigmentBlot;engine._ribbonPasses.diagnosticPigmentBlot=.45
  const painter=engine._ribbonPainter,oldBandBatch=painter.diagnosticBandBatch;painter.diagnosticBandBatch=true
  const warmSource=new AccumulationBuffer(engine.gl,2,2),warmTarget=new AccumulationBuffer(engine.gl,2,2);try{warmSource.clear();engine._watercolorPasses.fieldOp(warmTarget,warmSource,warmSource,1,1)}finally{warmSource.destroy();warmTarget.destroy()}
  const gl:WebGLRenderingContext=engine.gl
  const originalPrepare=engine._settlePlan.prepare
  const previewAllowed=Object.getOwnPropertyDescriptor(engine._settleQueue,'allowProgressPreview')
  Object.defineProperty(engine._settleQueue,'allowProgressPreview',{configurable:true,get:()=>true})
  const fullResolution=false
  const target=createNativePuddleTarget(engine,size,{prepare:originalPrepare,fullResolution})
  const presentation=mode==='morph'?createPuddlePresentation(gl,size):null
  const blend=createMaterialBlend(gl,size)
  const clip=createContourClip(gl,size)
  const make=()=>new AccumulationBuffer(gl,size,size)
  const base={p:make(),c:make(),coverage:make()}, shown=presentation?base:{p:make(),c:make(),coverage:make()}, rgba=make(),blank=make()
  const owned=[...new Set([...Object.values(base),...Object.values(shown),rgba,blank])];for(const b of owned)b.clear()
  const bounds={minX:0,minY:0,maxX:size,maxY:size}
  const hooks=['_onStart','_onEnd','_onMove','_display','_finishRibbonStroke','_scheduleDryingRepaint','_revealWash','_drawRibbonCompositeRect'] as const
  const original=new Map(hooks.map(k=>[k,engine[k]]))
  let epoch=0,active=false,down=false,drying=false,destroyed=false,raf=0,lastAt=0,clock=0,duration=120000,goalReady=false,finished=false
  let wetDuration=0
  let pendingGoal:(()=>void)|null=null,goalAfter=0
  let segmentReady=false,segmentStart=0,segmentEnd=0
  let published=-1,lastShown=0,lastStatus=0,cancellations=0,inputs=0,context:any=null
  const scratch=()=>engine._ribbonStrokeScratch??engine._wash?.scratch
  function locate(){const s=scratch(),ctx=s?.finishContext;if(!ctx)return null;const tile=engine._resolveWithinSheet(ctx.target,bounds)[0];const entry=tile?s.peek(tile.buffer):null;return entry?{scratch:s,tile,entry,ctx}:null}
  function capture(){const s=scratch(),lc=engine._liveComposite;if(lc?.scratch===s)context={...lc};else if(s?.finishContext){const c=s.finishContext;context={...c,...s.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:c.fieldSeed,bristleRadiusPx:0})),strokeDir:s.noteDirection(0,0)}}}
  function render(m=target.buffers()){const found=locate();if(!found||!context)return;const c=context;rgba.clear();engine._drawRibbonCompositeRect({...found.tile,buffer:rgba},bounds,c.preset,c.profile,found.entry.original,m.coverage,m.p,m.c,c.color,c.opacity,c.fieldSeed,c.spreadPx??0,c.fringeWater??c.water??0,c.migratePx??0,0,c.strokeDir??[1,0],c.bristleRadiusPx??0)}
  function commit(){const found=locate();if(!active||!found)return;const m=presentation||finished?target.buffers():shown,e=found.entry;
    // Presentation is not canonical material. Restart new input from raw deposits.
    const canonical=finished?m:base
    for(const dest of (finished||!presentation?[e.inkLoad,e.inkSettled,e.inkBase,e.inkDry]:[e.inkSettled,e.inkBase,e.inkDry]))if(dest)canonical.p.copyTo(dest)
    for(const dest of (finished||!presentation?[e.inkColor,e.colorSettled,e.colorBase,e.colorDry]:[e.colorSettled,e.colorBase,e.colorDry]))if(dest)canonical.c.copyTo(dest)
    if(finished||!presentation)canonical.coverage.copyTo(e.coverage)
  }
  function request(){if(!raf&&!destroyed)raf=requestAnimationFrame(frame)}
  function frame(at:number){raf=0;if(destroyed||down||!active)return;if(pendingGoal){if(at<goalAfter){request();return}const initialize=pendingGoal;pendingGoal=null;initialize()}const dt=lastAt?Math.max(0,at-lastAt):0;lastAt=at;clock=Math.min(duration,clock+dt*(drying?100:1));const renderInterval=presentation&&(clock<5000||drying)?15:33;const progress=presentation?morphProgress(clock,duration):clock/duration
    if(presentation||!segmentReady)target.step(drying?4:1)
    const revision=target.state.revision??target.state.iterations
    if(presentation){if(revision!==published){render();presentation.setTarget(rgba,target.buffers().coverage,epoch,{preserveAnchor:goalReady});goalReady=true;published=revision}}
    else {
      if(revision!==published){
        published=revision
        if(target.state.iterations>0){segmentStart=segmentEnd;segmentEnd=duration*(target.state.done?1:target.state.iterations/Math.max(1,target.state.total));segmentReady=true}
      }
      if(segmentReady&&at-lastShown>=renderInterval){
        const t=Math.max(0,Math.min(1,(clock-segmentStart)/Math.max(1,segmentEnd-segmentStart))),m=target.buffers()
        blend.mix(base.p,m.p,t,shown.p);blend.mix(base.c,m.c,t,shown.c);blend.mix(base.coverage,m.coverage,t,shown.coverage);render(shown)
        if(t>=1){shown.p.copyTo(base.p);shown.c.copyTo(base.c);shown.coverage.copyTo(base.coverage);segmentReady=false}
      }
    }
    if(target.state.done&&progress>=1&&!segmentReady&&!finished){target.dry();finished=true;commit();engine._paperWet.clear();engine._wetTexAt=0;render();if(presentation)presentation.setTarget(rgba,target.buffers().coverage,epoch)}
    if(at-lastShown>=renderInterval||finished){lastShown=at;presentation?.tick(dt,{dry:drying,progress});engine._display()}
    if(at-lastStatus>250||finished){lastStatus=at;onStatus(`${mode==='morph'?'Морфинг':'Материал'} · ${Math.round(progress*100)}% · ${Math.round(duration/1000)} с · расчёт ${target.state.iterations}/${target.state.total}`)}
    if(!finished)request();else drying=false
  }
  engine._drawRibbonCompositeRect=function(...args:any[]){args[11]=0;return original.get('_drawRibbonCompositeRect')!.apply(engine,args)}
  engine._settlePlan.prepare=()=>null
  engine._finishRibbonStroke=(s:any)=>{capture();if(engine._liveComposite?.scratch===s)engine._flushLiveComposite();s.diffusePending=false}
  engine._scheduleDryingRepaint=()=>{};engine._revealWash=()=>{}
  if(engine._dryingTimer){clearTimeout(engine._dryingTimer);engine._dryingTimer=0}
  engine._display=function(...args:unknown[]){
    if(active&&!down){const found=locate();if(found){clip.draw(presentation?presentation.tick(0,{dry:drying}):rgba,base.coverage,found.entry.original).copyTo(found.tile.buffer);found.ctx.target.markContentPainted(bounds);engine._paperPartialOK=false;engine._paperCacheKey='';engine._invalidateSplitCache()}}
    return original.get('_display')!.apply(engine,args)
  }
  engine._onStart=function(...args:unknown[]){if(active&&!finished)cancellations++;if(!finished)commit();pendingGoal=null;target.cancel();if(finished){wetDuration=0;engine._clearWash(false);context=null;}if(raf){cancelAnimationFrame(raf);raf=0}active=false;down=true;drying=false;finished=false;goalReady=false;epoch++;if(engine._wash)engine._wash.endedAt=Infinity;const r=original.get('_onStart')!.apply(engine,args);down=!!engine._strokeLayerId;return r}
  engine._onMove=function(...args:unknown[]){if(down)inputs++;return original.get('_onMove')!.apply(engine,args)}
  engine._onEnd=function(...args:unknown[]){const r=original.get('_onEnd')!.apply(engine,args);down=false;capture();const found=locate();if(found){const e=found.entry;e.inkLoad.copyTo(base.p);e.inkColor.copyTo(base.c);e.coverage.copyTo(base.coverage);if(!presentation){base.p.copyTo(shown.p);base.c.copyTo(shown.c);base.coverage.copyTo(shown.coverage);}found.tile.buffer.copyTo(rgba);presentation?.reset(rgba,epoch);wetDuration=Math.max(wetDuration,wetDryMsFor(Math.max(found.ctx.wetPeak,found.ctx.profile.waterLevel)));duration=wetDuration;pendingGoal=()=>{target.resetFromScratch(found.scratch,found.tile,epoch);published=target.state.revision};goalAfter=performance.now()+60;active=true;clock=0;lastAt=0;published=target.state.revision;segmentReady=false;segmentStart=0;segmentEnd=0;lastShown=0;request()}return r}
  presentation?.reset(blank,epoch)
  return {
    get state(){return {mode,fullResolution,epoch,iterations:target.state.iterations,total:target.state.total,done:!down&&(!active||finished),drawing:down,dry:drying,active,cancellations,inputs,progress:presentation?morphProgress(clock,duration):clock/duration,timeProgress:clock/duration,durationMs:duration,target:{...target.state,epoch:pendingGoal?epoch:target.state.epoch,done:pendingGoal?false:target.state.done,iterations:pendingGoal?0:target.state.iterations},presentation:presentation?.state??null}},
    diagnosticGoalRestart(){const f=locate();if(!f||down||finished)throw Error('Need an active raw wash');pendingGoal=null;target.resetFromScratch(f.scratch,f.tile,epoch);request()},
    diagnosticBackgroundReadback(){return target.backgroundReadback()},
    diagnosticGoalRgbaReadback(){return rgba.readPixels()},
    diagnosticGoalReadback(){const b=target.buffers();return {p:b.p.readPixels(),c:b.c.readPixels(),coverage:b.coverage.readPixels()}},
    diagnosticSnapshot(kind:'goal'|'shown'|'raw'){
      const found=locate();if(!found)throw Error('No wet material')
      const current=presentation?.tick(0,{dry:drying})??rgba
      if(kind==='raw')render({p:found.entry.inkLoad,c:found.entry.inkColor,coverage:found.entry.coverage})
      ;(kind==='shown'?current:rgba).copyTo(found.tile.buffer)
      engine._paperPartialOK=false;engine._paperCacheKey='';engine._invalidateSplitCache()
      original.get('_display')!.call(engine)
      const png=(gl.canvas as HTMLCanvasElement).toDataURL('image/png')
      current.copyTo(found.tile.buffer);engine._paperCacheKey='';engine._invalidateSplitCache();original.get('_display')!.call(engine)
      if(kind==='raw')render()
      return png
    },
    dry(){goalAfter=0;drying=true;lastAt=performance.now();request()},
    destroy(){if(destroyed)return;destroyed=true;engine._ribbonPasses.diagnosticPigmentBlot=oldBlot;painter.diagnosticBandBatch=oldBandBatch;pendingGoal=null;if(raf)cancelAnimationFrame(raf);for(const k of hooks)engine[k]=original.get(k);engine._settlePlan.prepare=originalPrepare;if(previewAllowed)Object.defineProperty(engine._settleQueue,'allowProgressPreview',previewAllowed);else delete engine._settleQueue.allowProgressPreview;target.destroy();presentation?.destroy();blend.destroy();clip.destroy();for(const b of owned)b.destroy()},
  }
}
