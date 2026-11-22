import type{BrushDyna,Dab}from'@grafetto/shared'
import type{ExperimentStamp}from'./brushExperiment'
export interface DynaState{x:number;y:number;vx:number;vy:number;initialized:boolean}
/** The old DynaDraw filter works on a normalized canvas. Its linear force and
 * velocity cancel that normalization when mapped back to world coordinates. */
export function dynaStamps(d:BrushDyna,input:Dab,state:DynaState,color:[number,number,number]):ExperimentStamp[]{
 if(!state.initialized){state.x=input.x;state.y=input.y;state.initialized=true;return[]}
 const dx=input.x-state.x,dy=input.y-state.y;if(Math.hypot(dx,dy)<.001)return[]
 const mass=5+155*d.mass;state.vx+=dx/mass;state.vy+=dy/mass
 if(Math.hypot(state.vx,state.vy)<.001)return[]
 const drag=1-d.drag*d.drag;state.vx*=drag;state.vy*=drag
 const x=state.x,y=state.y;state.x+=state.vx;state.y+=state.vy
 const speed=Math.min(d.diameter,Math.hypot(state.vx,state.vy)),radius=Math.trunc(d.diameter*.5+speed),sides=Math.trunc(d.diameter+speed)
 const points=Array.from({length:sides},(_,i)=>({x:x+radius*Math.cos(i*2*Math.PI/sides),y:y+radius*Math.sin(i*2*Math.PI/sides)}))
 return[{x,y,size:radius*2+2,aspect:1,angle:0,flowScale:1,color:[...color],polygon:{points,winding:false,hardEdge:false}}]
}
