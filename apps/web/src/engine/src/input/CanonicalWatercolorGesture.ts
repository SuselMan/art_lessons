import { packDabs, type Dab, type Operation } from '@grafetto/shared'
import { DabSystem } from '../dabs/DabSystem'
import { bakeDabOpacity } from '../dabs/dabOpacity'
import { DEFAULT_DAB_SPACING_FACTOR, isFootprintSpacedTool } from '../dabs/dabSpacing'
import { ribbonProfileFor } from '../dabs/ribbonProfile'
import { shapingForTool } from '../presets/dabShaping'
import type { NibAngleConfig } from '../presets/markerPresets'
import type { TiltResponse } from '../presets/tiltCurve'
import { nibScallops, presetForTool, renderSizeScale } from '../presets/resolvePreset'
import { applyWatercolorEndTaper, applyWatercolorPooling, mottleSeedFromStrokeId, watercolorMixFromPreset, watercolorPaperDrained } from '../presets/watercolorPresets'
import { appendWatercolorLift } from '../presets/watercolorLift'
import { PaperWetness, quantizeWet, wetAt, isDryProfile } from '../paper/paperWetness'
import { WC_HALF_RES_RADIUS_PX } from '../watercolor/settleResolution'
import { PointerInput, type PointerData, type PressureMap } from './PointerInput'

export interface WatercolorGestureSettings {
 tool:'watercolor';preset:string;color:[number,number,number];size:number;opacity:number
 nibAngle:NibAngleConfig;tiltResponse:TiltResponse
}
export interface GestureProvenance {strokeId:string;washId?:string;layerId:string;userId:string}
export interface BakedWatercolorChunk extends GestureProvenance {
 dabs:Dab[];previous?:Dab;wet:string;strokeSeed:[number,number];operationIndex:number;dabOffset:number
}
export interface WatercolorGestureOwner {
 paperWet:PaperWetness;now():number;timestamp():number;operationId():string
 /** Synchronous CPU preparation once per batch. Owner owns tile fanout and GPU FIFO. */
 onPreparedChunk(chunk:BakedWatercolorChunk):{standing?:Map<Dab,number>;dabPool?:WeakMap<Dab,number>}|void
 onLocalStroke(operation:Operation, boundary:'partial'|'end'):void
 /** Partial operation must finish its old film before later batches use the new film. */
 onChunkBoundary?():void
 snapPoint?(x:number,y:number):{x:number;y:number}
}
/** Canonical input/log seam only. No ACK, layer ownership, resource scheduling or Room API. */
export class CanonicalWatercolorGesture {
 private readonly dabs=new DabSystem()
 private settings?:WatercolorGestureSettings
 private provenance?:GestureProvenance
 private recorded:Dab[]=[]
 private tail?:Dab
 private wet=''
 private started=0
 private index=0
 private offset=0
 private box:{minX:number;minY:number;maxX:number;maxY:number;half:number}|null=null
 constructor(private readonly owner:WatercolorGestureOwner){}
 begin(e:PointerData,settings:WatercolorGestureSettings,provenance:GestureProvenance):void {
  if(settings.tool!=='watercolor')throw new Error('Only canonical watercolor is supported')
  if(this.provenance)throw new Error('Finish the current gesture before beginning another')
  this.settings={...settings,color:[...settings.color],nibAngle:{...settings.nibAngle}}
  this.provenance={...provenance};this.recorded=[];this.tail=undefined;this.wet='';this.index=0;this.offset=0;this.box=null;this.started=e.timeStamp
  const {preset,nibAngle,tiltResponse}=settings,p=presetForTool('watercolor',preset)
  this.dabs.setShaping(shapingForTool('watercolor',preset,nibAngle,tiltResponse))
  this.dabs.curvatureTolerancePx=ribbonProfileFor('watercolor',preset).curvatureTolerancePx
  this.dabs.spacingFactor=DEFAULT_DAB_SPACING_FACTOR
  this.dabs.footprint=isFootprintSpacedTool('watercolor')?{sizeScale:renderSizeScale('watercolor',preset),hardness:p.hardness}:null
  this.dabs.nibScallop=nibScallops('watercolor',preset)?{sizeScale:renderSizeScale('watercolor',preset)}:null
  this.owner.paperWet.dropPending()
  const point=this.snap(e)
  this.paint(this.dabs.startStroke(point.x,point.y,e.pressure,e.tiltX,e.tiltY,settings.size,e.speed),e.speed,0)
 }
 move(e:PointerData):void {
  if(!this.provenance)return
  const p=this.snap(e)
  this.paint(this.dabs.continueStroke(p.x,p.y,e.pressure,e.tiltX,e.tiltY,this.settings!.size,e.speed),e.speed,e.timeStamp-this.started)
 }
 end(e:PointerData):void {
  if(!this.provenance)return
  const s=this.settings!,pending=this.dabs.endStroke(s.size,e.speed)
  applyWatercolorEndTaper(pending,e.speed)
  applyWatercolorPooling(pending,e.speed,ribbonProfileFor('watercolor',s.preset).waterLevel)
  appendWatercolorLift(pending,this.tail?[this.tail,...this.recorded]:this.recorded)
  this.paint(pending,e.speed,e.timeStamp-this.started)
  this.flush('end');this.owner.paperWet.commitPending(this.owner.now())
  this.provenance=undefined;this.settings=undefined;this.recorded=[];this.tail=undefined;this.box=null;this.wet=''
 }
 /** Uses the actual DOM normalizer, including coalesced events and calibrated pressure. */
 attach(canvas:HTMLCanvasElement,begin:()=>{settings:WatercolorGestureSettings;provenance:GestureProvenance},transform:(x:number,y:number)=>{x:number;y:number},pressureMap:PressureMap|null=null):()=>void {
  const input=new PointerInput(canvas).setTransform(transform).setPressureMap(pressureMap)
  input.on('start',e=>{const data=begin();this.begin(e,data.settings,data.provenance)}).on('move',e=>this.move(e)).on('end',e=>this.end(e))
  return ()=>input.destroy()
 }
 private snap(e:PointerData){return this.owner.snapPoint?.(e.x,e.y)??{x:e.x,y:e.y}}
 private paint(batch:Dab[],speed:number,elapsed:number):void {
  if(!batch.length)return
  const s=this.settings!,p=this.provenance!,preset=presetForTool('watercolor',s.preset)
  bakeDabOpacity(batch,speed,'watercolor',s.preset,s.opacity,s.size,this.dabs.spacingFactor)
  for(const dab of batch)dab.t=elapsed
  const now=this.owner.now();let wet=''
  for(const dab of batch)wet+=quantizeWet(this.owner.paperWet.sampleUnderNib(p.layerId,dab.x,dab.y,dab.size*.5*preset.sizeMultiplier*Math.max(dab.aspectRatio,1),now))
  this.wet+=wet
  const delivery=this.owner.onPreparedChunk({...p,dabs:batch,previous:this.recorded.at(-1)??this.tail,wet,strokeSeed:mottleSeedFromStrokeId(p.strokeId),operationIndex:this.index,dabOffset:this.offset+this.recorded.length})
  const depositedAt=this.owner.now(),water=watercolorMixFromPreset(s.preset).water
  for(let i=0;i<batch.length;i++){
   const dab=batch[i],drained=watercolorPaperDrained(wetAt(wet,i),water)
   if(drained>0)this.owner.paperWet.drain(p.layerId,dab.x,dab.y,dab.size*.5,drained)
   this.owner.paperWet.deposit(p.layerId,dab.x,dab.y,dab.size*.5,delivery?.standing?.get(dab)??water,depositedAt,true,delivery?.dabPool?.get(dab)??0)
   this.note(dab)
  }
  this.recorded.push(...batch)
  const b=this.box!,nib=b.half*preset.sizeMultiplier,span=1100*(nib>=WC_HALF_RES_RADIUS_PX?2:1)
  if(this.recorded.length>=800||Math.max(b.maxX-b.minX,b.maxY-b.minY)+s.size>span){this.flush('partial');this.owner.onChunkBoundary?.()}
 }
 private note(d:Dab):void {
  const half=d.size*.5*Math.max(d.aspectRatio,1),b=this.box
  if(!b){this.box={minX:d.x,minY:d.y,maxX:d.x,maxY:d.y,half};return}
  if(half>b.half)b.half=half
  if(d.x<b.minX)b.minX=d.x;if(d.x>b.maxX)b.maxX=d.x
  if(d.y<b.minY)b.minY=d.y;if(d.y>b.maxY)b.maxY=d.y
 }
 private flush(boundary:'partial'|'end'):void {
  if(!this.recorded.length)return
  const p=this.provenance!,s=this.settings!
  this.owner.onLocalStroke({id:this.owner.operationId(),type:'stroke',userId:p.userId,layerId:p.layerId,tool:'watercolor',preset:s.preset,color:s.color,dabsPacked:packDabs(this.recorded),timestamp:this.owner.timestamp(),strokeId:p.strokeId,...(p.washId?{washId:p.washId}:{}),...(this.wet&&!isDryProfile(this.wet)?{wet:this.wet}:{})},boundary)
  this.tail=this.recorded.at(-1);this.offset+=this.recorded.length;this.index++;this.recorded=[];this.wet='';this.box=null
 }
}
