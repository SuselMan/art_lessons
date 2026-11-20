import type{BrushDeform,Dab}from'@grafetto/shared'
import type{BehaviorStamp}from'./brushBehavior'
import{brushDabRandom}from'./digitalBrushPresets'
import{brushFootprintBounds}from'../dabs/brushFootprint'
export interface DeformState{counter:number;previous?:{x:number;y:number}}
export interface DeformRequest{x:number;y:number;sourceX:number;sourceY:number;radiusX:number;radiusY:number;angle:number;mode:number;factor:number;deltaX:number;deltaY:number;amount:number;referenceRadius:number;bilinear:boolean;density:number;seed:number;bounds:{minX:number;minY:number;maxX:number;maxY:number};source:{minX:number;minY:number;maxX:number;maxY:number};span:number}
/** One request contains all source reach before writing. No evolving colour
 * reservoir; native current-data mode reads the complete pre-request image. */
export function deformRequest(g:BrushDeform,dab:Dab,stamp:BehaviorStamp,sizeMultiplier:number,state:DeformState,seed:number):DeformRequest|undefined{
 const previous=state.previous;state.previous={x:Math.fround(dab.x),y:Math.fround(dab.y)}
 if(g.mode===5&&!previous)return
 const count=state.counter;state.counter=Math.min(1e6,count+1)
 const radiusY=stamp.size*sizeMultiplier*.5,radiusX=radiusY*stamp.aspect
 if(Math.min(radiusX,radiusY)<.25||g.density===0)return
 const random=(n:number)=>brushDabRandom(seed^Math.imul(count,0x9e3779b9),n),jitter=dab.size/g.baseScale*g.jitter*.5,x=stamp.x+(random(0)*2-1)*jitter,y=stamp.y+(random(1)*2-1)*jitter
 const dx=previous?dab.x-previous.x:0,dy=previous?dab.y-previous.y:0,c=Math.cos(stamp.angle),s=Math.sin(stamp.angle),deltaX=c*dx+s*dy,deltaY=-s*dx+c*dy
 const sign=g.mode===1||g.mode===3?1:-1,factor=g.mode<=2?1+sign*(g.counter?count*count/100:g.amount):g.mode<=4?sign*(g.counter?count*Math.PI/180:g.amount*Math.PI):1,referenceRadius=Math.max(.001,dab.size/(2*g.baseScale)),radius=Math.max(radiusX,radiusY)
 let reach=radius
 if(g.mode<=2){const f=Math.abs(factor);if(f<.000001)return;reach*=f<.5?1/(2*Math.sqrt(f*(1-f))):1}
 else if(g.mode===5)reach+=Math.hypot(dx,dy)*g.amount
 else if(g.mode===7)reach*=1+g.amount*(radius/referenceRadius)**2
 else if(g.mode===8)reach+=g.amount*Math.SQRT2
 reach+=2
 const bounds=brushFootprintBounds(x,y,radiusY,stamp.aspect,stamp.angle,1)!,minX=Math.floor(Math.min(dab.x-reach,bounds.minX)),minY=Math.floor(Math.min(dab.y-reach,bounds.minY)),span=Math.ceil(Math.max(dab.x+reach-minX,dab.y+reach-minY,bounds.maxX-minX,bounds.maxY-minY))
 if(span>2048)return
 return{x,y,sourceX:dab.x,sourceY:dab.y,radiusX,radiusY,angle:stamp.angle,mode:g.mode,factor,deltaX,deltaY,amount:g.amount,referenceRadius,bilinear:g.bilinear,density:g.density,seed:Math.floor(random(2)*4294967296)>>>0,bounds,source:{minX,minY,maxX:minX+span,maxY:minY+span},span}
}
