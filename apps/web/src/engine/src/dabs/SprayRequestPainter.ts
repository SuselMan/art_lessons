import type {CanonicalBeginSource} from './CanonicalBeginSource'
import {hasSpraySource146Scope} from '@grafetto/shared'
import type{RequestWashBatch}from'./RequestWashBatch'
import{hasSprayWash133Scope}from'@grafetto/shared'
import{advanceWashOpacity}from'../presets/brushWash'
import{sprayWashRegions}from'../presets/sprayWash133'
import type{BrushPressureSettings}from'../presets/digitalBrushPresets'
import type{BrushDescriptor,Dab}from'@grafetto/shared'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{TiledLayerBuffer}from'../buffers/TiledLayerBuffer'
import type{BrushContext}from'./BrushPainter'
import type{BehaviorStamp}from'../presets/brushBehavior'
import{behaviorStampsForDab}from'../presets/brushBehavior'
import{digitalBrushCeiling}from'../presets/digitalBrushPresets'
import{stageSpraySourceRequest,type SprayRequestState,type PreparedSprayRequest}from'../presets/sprayRequestStage'
import{sprayParticleColorControls}from'../presets/sprayParticleColor'
import{SpraySourceAtlas,type SpraySourceAtlasView}from'./SpraySourceAtlas'
import{SpraySourceBatch,type SpraySourceStyle}from'./SpraySourceBatch'
import{SprayImageBatch}from'./SprayImageBatch'
import type{PreparedBrushImageView}from'./PreparedBrushImageView'
export interface SprayScratchLease{buffer:AccumulationBuffer;assertCurrent():void;release():void}
export interface SprayWashOwner133{
 tile(tile:ReturnType<TiledLayerBuffer['resolveForPaint']>[number]):{coverage:AccumulationBuffer;previous:AccumulationBuffer}
 accepted():void
 present(tile:ReturnType<TiledLayerBuffer['resolveForPaint']>[number],bounds:{minX:number;minY:number;maxX:number;maxY:number}):void
}
export interface SprayExpandedRequest extends PreparedSprayRequest{opacityScale:number;foreground:readonly[number,number,number]}
/** Existing stamp dispatcher delegates only its newly admitted source options.
 * No wire or palette lookup lives here; target is the operation's actual layer. */
export class SprayRequestPainter{
 private source?:SpraySourceAtlas
 private readonly batch:SpraySourceBatch
 private images?:SprayImageBatch
 private epoch={}
 private sourcePrepared=false
 private readonly ctx:BrushContext
 private readonly acquire:(w:number,h:number)=>SprayScratchLease
 private readonly image:(s:BehaviorStamp,brush:BrushDescriptor)=>PreparedBrushImageView
 private readonly mask:(s:BehaviorStamp,brush:BrushDescriptor)=>PreparedBrushImageView|undefined
 constructor(ctx:BrushContext,acquire:(w:number,h:number)=>SprayScratchLease,image:(s:BehaviorStamp,brush:BrushDescriptor)=>PreparedBrushImageView,mask:(s:BehaviorStamp,brush:BrushDescriptor)=>PreparedBrushImageView|undefined){this.ctx=ctx;this.acquire=acquire;this.image=image;this.mask=mask;this.batch=new SpraySourceBatch(ctx.gl)}
 prepare(wash=false,kernel?:RequestWashBatch){if(wash)this.batch.prepare(true,kernel);else{(this.source??=new SpraySourceAtlas(this.ctx.gl)).prepare();this.batch.prepare();(this.images??=new SprayImageBatch(this.ctx.gl)).prepare();this.sourcePrepared=true}}
 assertSourcePrepared(){if(!this.sourcePrepared)throw Error('Spray146 source pipeline is not prepared')}
 assertWashPrepared(){this.batch.assertWashPrepared()}
 reset(){this.sourcePrepared=false;this.epoch={};this.source?.reset();this.batch.reset();this.images?.reset()}
 destroy(){this.sourcePrepared=false;this.epoch={};this.source?.destroy();this.batch.destroy();this.images?.destroy()}
 paint(target:TiledLayerBuffer,dabs:readonly Dab[],brush:BrushDescriptor,state:SprayRequestState,color:[number,number,number],pressure:BrushPressureSettings,sizeMultiplier:number,washOwner?:SprayWashOwner133,source?:CanonicalBeginSource){
  const canonical=brush.spray?.color.sourcePolicy!==undefined
  if(canonical&&(!hasSpraySource146Scope(brush)||!source||source.capability!=='spray146'||source.target!==target))throw Error('Spray146 frozen source is missing')
  if(canonical)this.assertSourcePrepared()
  source?.assertCurrent()
  const wash=hasSprayWash133Scope(brush)
  if(wash){if(!washOwner)throw Error('Spray Wash requires its stroke owner');this.assertWashPrepared()}else if(washOwner)throw Error('Invalid Spray Wash scope')
  const spray=brush.spray!,epoch=this.epoch,current=()=>{if(epoch!==this.epoch)throw Error('Spray request GL generation changed');source?.assertCurrent()}
  if(!wash&&brush.behavior?.rendering?.accumulation!=='directOver'||brush.behavior?.rendering?.blendMode!=='normal'||brush.texture||brush.paperInteraction||brush.tip.material||(spray.particle.shape==='tip'&&(brush.tip.imageSampling||brush.tip.profile||brush.tip.autoShape||brush.tip.autoNoise))||brush.behavior?.taper||brush.behavior?.edgeBleed||brush.behavior?.wetMix)throw Error('Spray source combination is not admitted')
  const dimensions=target.coarseWorldSize(1),bg=state.execution?.brushSource?.background
  if((spray.color.fillBackground||spray.color.mixBackground)&&!bg)throw Error('Spray requires recorded background')
  const background:readonly[number,number,number,number]=bg?[bg[0]/255,bg[1]/255,bg[2]/255,bg[3]/255]:[0,0,0,0]
  for(const dab of dabs){
   const ordinal=state.dabSequence??0,prior=state.sprayPainterOpacity??1,previous=state.previous
   const transaction=stageSpraySourceRequest(brush,state,working=>{const request:{spray?:Omit<SprayExpandedRequest,'stamps'>}={};const stamps=behaviorStampsForDab(brush,dab,working,color,{sprayRequest:request});if(!request.spray)throw Error('Spray request geometry was not captured');return{...request.spray,stamps}})
   const prepared=transaction.prepared
   const stamps=prepared.stamps.map(s=>({...s,size:s.size*sizeMultiplier})),controls=stamps.map((_,i)=>sprayParticleColorControls(spray.color,state.seed,ordinal,i))
   let flow=brush.flow
   if(brush.flowPer==='pass'&&flow<1){const diameter=Math.max(dab.size*sizeMultiplier,.5),travel=previous?this.ctx.segmentLength(dab,previous,diameter*.5):diameter*Math.max(brush.spacing,.001);flow=1-Math.pow(1-flow,Math.min(travel/(diameter*(brush.flowSpan??1)),1))}
   const opacity=Math.max(0,Math.min(1,digitalBrushCeiling(brush,dab.pressure,pressure.opacity)*prepared.opacityScale*(wash?1:state.opacity)))
   const measureBounds=()=>{
    const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
    const include=(x:number,y:number,r:number)=>{bounds.minX=Math.min(bounds.minX,x-r);bounds.minY=Math.min(bounds.minY,y-r);bounds.maxX=Math.max(bounds.maxX,x+r);bounds.maxY=Math.max(bounds.maxY,y+r)}
    for(const s of stamps)include(s.x,s.y,s.size*(1+s.aspect)*.5+1)
    if(transaction.background&&transaction.background.radius>0)include(transaction.background.x,transaction.background.y,transaction.background.radius+1)
    return bounds
   }
   let atlas:SpraySourceAtlasView|undefined,request:SprayScratchLease|undefined,failed=false,failure:unknown
   try{
    current()
    // An empty native logical request still advances expansion/ordinal/carry.
    // There is no request image, stroke Wash step, physical tile or display write.
    if(wash&&stamps.length===0){transaction.commit();washOwner!.accepted();continue}
    // Existing tile recovery can synchronously replay another133 request.
    // Resolve before this request owns temporary scratch or publishes state.
    const washBounds=wash?measureBounds():undefined
    const washTiles=washBounds&&Number.isFinite(washBounds.minX)?target.resolveForPaint(washBounds):undefined
    current()
    if(spray.color.sampleInput&&!spray.particle.image&&stamps.length){const points=(spray.color.perParticle?stamps:[stamps[0]]).map(s=>({x:s.x,y:s.y}));atlas=(this.source??=new SpraySourceAtlas(this.ctx.gl)).collect(points,{cellWidth:dimensions.w,cellHeight:dimensions.h,assertCurrent:current,acquire:size=>this.acquire(size,size),resolveCells:rect=>source?source.resolveForRead(rect):target.resolveVisible(rect)})}
    const views=stamps.map(s=>spray.particle.image?this.image(s,brush):this.mask(s,brush));for(const view of views)view?.assertCurrent()
    request=this.acquire(wash?Math.min(512,dimensions.w):dimensions.w,wash?Math.min(512,dimensions.h):dimensions.h);request.assertCurrent();current()
    if(wash&&(request.buffer.width>512||request.buffer.height>512))throw Error('Spray Wash lease exceeds512')
    // No counters/carry are published until source and temporary resources exist.
    const washStep=wash&&stamps.length?advanceWashOpacity(transaction.working.washOpacity??={average:0,maximum:0},opacity):undefined
    transaction.commit()
    if(wash)washOwner!.accepted()
    const bounds=washBounds??measureBounds()
    if(Number.isFinite(bounds.minX)){
    const normalizedForeground=prepared.foreground
    const style:SpraySourceStyle={shape:spray.particle.shape,sample:!!spray.color.sampleInput,mix:!!spray.color.mixBackground,pressure:dab.pressure,foreground:[...normalizedForeground,1],background,painterOpacity:prior,hardness:brush.tip.hardness,...(wash?{requestOver:true as const}:{})}
    const draw=stamps.map((stamp,i)=>{const control=controls[i],r=control.randomAlpha,factor=r===undefined?1:spray.particle.image?r:r*r;return{stamp,control,sourceIndex:spray.color.perParticle?i:0,flow:Math.max(0,Math.min(1,factor>0?flow*stamp.flowScale/factor:0))}})
    for(const tile of washTiles??target.resolveForPaint(bounds)){
     const owner=wash?washOwner!.tile(tile):undefined
     const regions=wash?sprayWashRegions(bounds,tile,request.buffer.width,request.buffer.height):[{x:0,y:0,width:tile.buffer.width,height:tile.buffer.height,originX:tile.originX,originY:tile.originY}]
     for(const region of regions){
     current();request.assertCurrent();atlas?.assertCurrent();if(!wash&&(tile.buffer.width!==request.buffer.width||tile.buffer.height!==request.buffer.height))throw Error('Spray request tile geometry changed')
     request.buffer.clear()
     if(transaction.background&&transaction.background.radius>0){const b=transaction.background,stamp={x:b.x,y:b.y,size:2*b.radius,aspect:1,angle:0,flipX:1,flipY:1}
      this.batch.paint([{stamp,control:{sourceIndex:0,hsv:[0,0,0],randomAlpha:undefined},sourceIndex:0,flow:1}],{...style,shape:'ellipse',sample:false,mix:false,foreground:background,painterOpacity:b.opacity},request.buffer,region.originX,region.originY,undefined,undefined,this.ctx.paper.texture)}
     // Preserve particle order and frame ownership, including overlaps.
     for(let start=0;start<draw.length;){const view=views[start];let end=start+1
      while(end<draw.length&&views[end]?.texture===view?.texture)end++
      view?.assertCurrent();const group=draw.slice(start,end)
      if(spray.particle.image){if(!view)throw Error('Spray image frame is not prepared');(this.images??=new SprayImageBatch(this.ctx.gl)).paint(group.map(item=>({x:item.stamp.x,y:item.stamp.y,width:item.stamp.size*item.stamp.aspect,height:item.stamp.size,angle:item.stamp.angle,opacity:(item.control.randomAlpha??prior)*item.flow,hsv:item.control.hsv})),view,request.buffer,region.originX,region.originY)}
      else this.batch.paint(group,style,request.buffer,region.originX,region.originY,atlas,view,this.ctx.paper.texture)
      start=end
     }
     if(owner&&washStep){
      const bottom=tile.buffer.height-region.y-region.height
      owner.coverage.copyRegionInto(owner.previous,region.x,bottom,region.x,bottom,region.width,region.height)
      this.batch.transferWash(request.buffer,owner.previous,owner.coverage,region,opacity,washStep.average)
     }else if(!wash)this.batch.transfer(request.buffer,tile.buffer,opacity)
     }
     if(owner&&washStep)washOwner!.present(tile,bounds)
    }
    target.markContentPainted(bounds)
    }
   }catch(error){failed=true;failure=error;transaction.cancel()}
   finally{for(const release of[()=>request?.release(),()=>atlas?.release()])try{release()}catch(error){if(!failed){failed=true;failure=error}}}
   if(failed)throw failure
  }
 }
}
