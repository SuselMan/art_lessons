import type {BrushDescriptor,Dab}from'@grafetto/shared'
import type {SketchStamp}from'./brushSketch'
interface Point{x:number;y:number}
export interface CurveTraceState{points:Point[];previous?:Point;ordinal:number}
export interface CurveTraceStamp extends SketchStamp{requestGroup:number;pathOpacity:number}
const mid=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2})
/** Adaptive de Casteljau: bounded depth8/256 segments, <=.25px flatness
 * whenever that budget admits it. Control-polygon distance detects loops. */
export function flattenTrace(points:Point[],depth=0):Point[]{
 const a=points[0],b=points.at(-1)!,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
 const flat=points.slice(1,-1).every(p=>length?Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/length<=.25&&((p.x-a.x)*dx+(p.y-a.y)*dy)>=0&&((p.x-b.x)*dx+(p.y-b.y)*dy)<=0:Math.hypot(p.x-a.x,p.y-a.y)<=.25)
 if(flat||depth===8)return[a,b]
 let row=points;const left=[row[0]],right=[row.at(-1)!]
 while(row.length>1){row=row.slice(1).map((p,i)=>mid(row[i],p));left.push(row[0]);right.unshift(row.at(-1)!)}
 return[...flattenTrace(left,depth+1).slice(0,-1),...flattenTrace(right,depth+1)]
}
export function curveTraceStamps(brush:BrushDescriptor,dab:Dab,state:CurveTraceState,color:[number,number,number],controls:{width:number;opacity:number}):CurveTraceStamp[]{
 const c=brush.curveTrace!,previous=state.previous,point={x:dab.x,y:dab.y};state.previous=point
 // Native paintLine appends pi2, not the initial pi1.
 if(!previous)return[]
 const ordinal=state.ordinal++;state.points.push(point);if(state.points.length>c.history)state.points.shift()
 const width=Math.max(.01,dab.size*controls.width),out:CurveTraceStamp[]=[]
 if(width<.5)return out
 const segment=(a:Point,b:Point,path:number,opacity:number)=>{const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);out.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,size:width,aspect:(length+width)/width,angle:Math.atan2(dy,dx),flowScale:1,color:[...color],segmentLength:length,group:ordinal*2+path,groupOpacity:1,requestGroup:ordinal,pathOpacity:opacity})}
 if(c.connect)segment(previous,point,0,1)
 if(state.points.length===c.history&&c.opacity*controls.opacity>0){const p=state.points,n=p.length,step=Math.floor(n/3),control=c.smoothing?[p[0],p[Math.floor(n/2)],p[n-1]]:[p[0],p[step],p[step*2],p[n-1]],flat=flattenTrace(control)
  for(let i=1;i<flat.length;i++)segment(flat[i-1],flat[i],1,c.opacity*controls.opacity)
 }
 return out
}
