import {bristleSoakHair139,type BristleSoakState139} from './bristleSoak139'
import type {BristleInkState} from './brushBristleInk'
import {assertBristleInitializationSize140,buildBristleInitialization140,type BristleInitialization140} from './bristleInitialization140'
import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {brushDabRandom} from './digitalBrushPresets'
import type {SketchStamp} from './brushSketch'
export interface BristleState {ordinal:number;oldPressure:number;previous?:{x:number;y:number};ends:[number,number][];ink?:BristleInkState;soak?:BristleSoakState139;initialization?:BristleInitialization140}
/** Hair positions are gesture state, never tile/frame state. Connected paths
 * preserve transformed endpoints across pressure/rotation changes. */
export interface BristleInkGeometry {hair:number;length:number;pressure:number;start:readonly[number,number];end:readonly[number,number];sampleAlpha?:number}
export interface BristleGeometryStamp extends SketchStamp {bristleInk?:BristleInkGeometry;bristleTrajectory142?:{start:readonly[number,number];end:readonly[number,number]}}
export function bristleStamps(brush:BrushDescriptor,dab:Dab,state:BristleState,color:[number,number,number],seed:number):SketchStamp[]{
 if(brush.bristle&&'ink' in brush.bristle)throw Error('Bristle depletion requires the prepared spatial ink route')
 return bristleGeometryStamps(brush,dab,state,color,seed)
}
/** Bounded geometry only. Ink state belongs to the request owner, before visibility/tile filtering. */
export function bristleGeometryStamps(brush:BrushDescriptor,dab:Dab,state:BristleState,color:[number,number,number],seed:number):BristleGeometryStamp[]{
 const b=brush.bristle!,previous=state.previous,ordinaryResize=b.version===1&&((brush.version>=141&&b.initialization?.resizePolicy==='mask-population-v1')||(brush.version>=143&&b.initialization?.resizePolicy==='source-area143-v1')),resize=ordinaryResize||b.version===2&&b.soak?.resizePolicy==='mask-population-v1'
 if(resize){
  const sourceSize=assertBristleInitializationSize140(state.initialization,[dab])
  if(ordinaryResize&&!state.initialization){
   if(previous)throw Error('Bristle initialization is missing before the first anchor')
   // Pure bounded reconstruction succeeds before publishing any anchor/state.
   const initialization=buildBristleInitialization140(brush,sourceSize)
   state.initialization=initialization
  }
  if(previous&&!state.initialization)throw Error('Bristle resized initialization was not prepared')
 }
 state.previous={x:dab.x,y:dab.y}
 if(!previous)return[]
 const ordinal=state.ordinal++,dx=dab.x-previous.x,dy=dab.y-previous.y
 let mouse=1
 if(b.mousePressure){state.oldPressure=(4*state.oldPressure+.02+Math.max(0,1-Math.hypot(dx,dy)/20))/5;mouse=1-state.oldPressure}
 const scale=dab.size*b.scale*mouse,shear=2*dab.pressure*mouse*b.shear,c=Math.cos(-dab.angle),sn=Math.sin(-dab.angle),out:BristleGeometryStamp[]=[]
 const hairs=resize?state.initialization!.hairs:b.hairs
 for(let i=0;i<hairs.length;i++){
  const [x,y,length]=hairs[i],random=(salt:number)=>(brushDabRandom(seed^Math.imul(ordinal+1,0x9e3779b9),i*2+salt)*2-1)*b.random
  const xx=(x+shear*y)*scale+random(0)*scale/Math.max(1,dab.size),yy=(y+shear*x)*scale+random(1)*scale/Math.max(1,dab.size),end:[number,number]=[c*xx-sn*yy,sn*xx+c*yy],start=b.connected?state.ends[i]??end:end
  state.ends[i]=end
  if(b.threshold&&length<1-dab.pressure)continue
  const sampled=state.soak?bristleSoakHair139(state.soak,i):undefined
  const x1=previous.x+start[0],y1=previous.y+start[1],x2=dab.x+end[0],y2=dab.y+end[1],distance=Math.hypot(x2-x1,y2-y1)
  out.push({x:(x1+x2)/2,y:(y1+y2)/2,size:1,aspect:distance+1,angle:Math.atan2(y2-y1,x2-x1),flowScale:length,color:sampled?[sampled[0],sampled[1],sampled[2]]:[...color],group:ordinal,groupOpacity:1,segmentLength:distance,...(ordinaryResize&&brush.version===142&&b.antialias&&b.compositing?{bristleTrajectory142:{start:[x1,y1] as const,end:[x2,y2] as const}}:{}),...('ink' in b?{bristleInk:{hair:i,length,pressure:2*dab.pressure*mouse,...(sampled?{sampleAlpha:sampled[3]}:{}),start:[x1,y1] as const,end:[x2,y2] as const}}:{})})
 }
 return out
}
