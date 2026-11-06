import type{BrushExperiment,Dab}from'@grafetto/shared'
import type{BrushStamp}from'./digitalBrushPresets'
import{flattenTrace}from'./brushCurveTrace'
export interface PolygonPoint{x:number;y:number}
interface Bounds{minX:number;minY:number;maxX:number;maxY:number}
export interface ExperimentState{points:PolygonPoint[];previous?:PolygonPoint;firstLine:boolean;speedPoint?:PolygonPoint;speedCoeff:number;smoothPoint?:PolygonPoint;smoothDistance:number;bounds?:Bounds}
export interface PolygonGeometry{points:PolygonPoint[];winding:boolean;hardEdge:boolean}
export interface ExperimentStamp extends BrushStamp{polygon:PolygonGeometry;color:[number,number,number]}
export function experimentStamps(e:BrushExperiment,dab:Dab,s:ExperimentState,color:[number,number,number]):ExperimentStamp[]{
 const point={x:Math.fround(dab.x),y:Math.fround(dab.y)},previous=s.previous;s.previous=point
 if(!previous){s.points=[point];s.speedPoint=point;s.smoothPoint=point;return[]}
 if(s.firstLine){s.points.push(point);s.firstLine=false}
 else{
  let next=point
  if(e.speedEnabled){const dx=point.x-previous.x,dy=point.y-previous.y,length=Math.hypot(dx,dy);if(length>=.1){s.speedCoeff=.6*s.speedCoeff+.4*(.5*length*e.speed*.35);const p=s.speedPoint!;next={x:.6*p.x+.4*(previous.x+dx*s.speedCoeff/length),y:.6*p.y+.4*(previous.y+dy*s.speedCoeff/length)};s.speedPoint=next}}
  const length=Math.trunc(Math.abs(next.x-previous.x)+Math.abs(next.y-previous.y))
  if(e.smoothingEnabled){s.smoothDistance+=length;if(s.smoothDistance>e.smoothing){const p=s.smoothPoint!,end={x:(p.x+next.x)/2,y:(p.y+next.y)/2};s.points.push(...flattenTrace([s.points.at(-1)!,p,end]).slice(1));s.smoothPoint=next;s.smoothDistance=0}}
  else s.points.push(next)
  if(e.displaceEnabled){const last=s.points.at(-1)!,speed=Math.trunc(e.displace*.14+1-length);s.points=s.points.map(p=>{const dx=p.x-last.x,dy=p.y-last.y,length=Math.hypot(dx,dy);return length>.5?{x:p.x+dx*speed/length,y:p.y+dy*speed/length}:p})}
 }
 // Deterministic decimation bounds long gestures while keeping endpoints.
 if(s.points.length>8192)s.points=s.points.filter((_,i)=>i===0||i===s.points.length-1||i%2===0)
 const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
 for(const p of s.points){bounds.minX=Math.min(bounds.minX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.maxY=Math.max(bounds.maxY,p.y)}
 const old=s.bounds;s.bounds=bounds
 const union=old?{minX:Math.min(old.minX,bounds.minX),minY:Math.min(old.minY,bounds.minY),maxX:Math.max(old.maxX,bounds.maxX),maxY:Math.max(old.maxY,bounds.maxY)}:bounds
 return[{x:(union.minX+union.maxX)/2,y:(union.minY+union.maxY)/2,size:Math.max(1,union.maxX-union.minX,union.maxY-union.minY)+2,aspect:1,angle:0,flowScale:1,color:[...color],polygon:{points:[...s.points],winding:e.winding,hardEdge:e.hardEdge}}]
}
