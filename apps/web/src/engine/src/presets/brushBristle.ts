import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {brushDabRandom} from './digitalBrushPresets'
import type {SketchStamp} from './brushSketch'
export interface BristleState {ordinal:number;oldPressure:number;previous?:{x:number;y:number};ends:[number,number][]}
/** Hair positions are gesture state, never tile/frame state. Connected paths
 * preserve transformed endpoints across pressure/rotation changes. */
export function bristleStamps(brush:BrushDescriptor,dab:Dab,state:BristleState,color:[number,number,number],seed:number):SketchStamp[]{
 const b=brush.bristle!,previous=state.previous;state.previous={x:dab.x,y:dab.y}
 if(!previous)return[]
 const ordinal=state.ordinal++,dx=dab.x-previous.x,dy=dab.y-previous.y
 let mouse=1
 if(b.mousePressure){state.oldPressure=(4*state.oldPressure+.02+Math.max(0,1-Math.hypot(dx,dy)/20))/5;mouse=1-state.oldPressure}
 const scale=dab.size*b.scale*mouse,shear=2*dab.pressure*mouse*b.shear,c=Math.cos(-dab.angle),sn=Math.sin(-dab.angle),out:SketchStamp[]=[]
 for(let i=0;i<b.hairs.length;i++){
  const [x,y,length]=b.hairs[i],random=(salt:number)=>(brushDabRandom(seed^Math.imul(ordinal+1,0x9e3779b9),i*2+salt)*2-1)*b.random
  const xx=(x+shear*y)*scale+random(0)*scale/Math.max(1,dab.size),yy=(y+shear*x)*scale+random(1)*scale/Math.max(1,dab.size),end:[number,number]=[c*xx-sn*yy,sn*xx+c*yy],start=b.connected?state.ends[i]??end:end
  state.ends[i]=end
  if(b.threshold&&length<1-dab.pressure)continue
  const x1=previous.x+start[0],y1=previous.y+start[1],x2=dab.x+end[0],y2=dab.y+end[1],distance=Math.hypot(x2-x1,y2-y1)
  out.push({x:(x1+x2)/2,y:(y1+y2)/2,size:1,aspect:distance+1,angle:Math.atan2(y2-y1,x2-x1),flowScale:length,color:[...color],group:ordinal,groupOpacity:1,segmentLength:distance})
 }
 return out
}
