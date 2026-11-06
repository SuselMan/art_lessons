import type {BrushDescriptor,Dab} from '@grafetto/shared'
import {brushDabRandom,type BrushStamp} from './digitalBrushPresets'
const WINDOW=32768,CELL=32,MAX_CONNECTIONS=4096
interface Point {x:number;y:number;ordinal:number}
export interface SketchState {
 points:(Point|undefined)[]
 cells:Map<string,Set<number>>
 ordinal:number
 previous?:Point
 color:[number,number,number]
 alpha:number
}
export interface SketchStamp extends BrushStamp {color:[number,number,number];group:number;groupOpacity:number;segmentLength:number}
const key=(x:number,y:number)=>`${Math.floor(x/CELL)},${Math.floor(y/CELL)}`
/** State is plain cloneable values; spatial buckets preserve chronological order
 * within the retained gesture window. No viewport/tile/frame enters selection. */
export function sketchStamps(brush:BrushDescriptor,dab:Dab,state:SketchState,baseColor:[number,number,number],seed:number,controls:{width:number;offset:number;probability:number},groupOpacity:number):SketchStamp[]{
 const s=brush.sketch!,ordinal=state.ordinal++,point={x:dab.x,y:dab.y,ordinal},slot=ordinal%WINDOW,old=state.points[slot]
 if(old){const k=key(old.x,old.y),cell=state.cells.get(k);cell?.delete(old.ordinal);if(!cell?.size)state.cells.delete(k)}
 state.points[slot]=point
 const k=key(point.x,point.y),cell=state.cells.get(k)??new Set<number>();cell.add(ordinal);state.cells.set(k,cell)
 const previous=state.previous;state.previous=point
 if(dab.size<=.01)return[]
 const radius=dab.size*.5,threshold=radius*radius,width=Math.max(.9,s.width*controls.width),offset=s.offset*controls.offset,probability=s.probability*controls.probability
 const out:SketchStamp[]=[]
 const segment=(x1:number,y1:number,x2:number,y2:number)=>{const dx=x2-x1,dy=y2-y1;out.push({x:(x1+x2)*.5,y:(y1+y2)*.5,size:width,aspect:(width+Math.hypot(dx,dy))/width,angle:Math.atan2(dy,dx),flowScale:state.alpha,color:[...state.color],segmentLength:Math.hypot(dx,dy),group:ordinal,groupOpacity})}
 if(s.connect&&previous)segment(previous.x,previous.y,point.x,point.y)
 const candidates:number[]=[]
 const minX=Math.floor((point.x-radius)/CELL),maxX=Math.floor((point.x+radius)/CELL),minY=Math.floor((point.y-radius)/CELL),maxY=Math.floor((point.y+radius)/CELL)
 if((maxX-minX+1)*(maxY-minY+1)>WINDOW){for(const p of state.points)if(p&&Math.hypot(p.x-point.x,p.y-point.y)<radius)candidates.push(p.ordinal)}
 else for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)for(const id of state.cells.get(`${x},${y}`)??[]) {const p=state.points[id%WINDOW]!;if((p.x-point.x)**2+(p.y-point.y)**2<threshold)candidates.push(id)}
 candidates.sort((a,b)=>a-b)
 for(const id of candidates.slice(-MAX_CONNECTIONS)){
  const p=state.points[id%WINDOW]!,dx=p.x-point.x,dy=p.y-point.y,distance=dx*dx+dy*dy
  const random=(salt:number)=>brushDabRandom((seed^Math.imul(ordinal+1,0x9e3779b9))>>>0,Math.imul(id+1,8)+salt)
  const reject=s.distanceDensity ? probability>0?distance/(threshold*probability):Infinity : 1-probability
  if(random(0)<reject)continue
  if(s.randomRGB)state.color=[baseColor[0]*random(1),baseColor[1]*random(2),baseColor[2]*random(3)]
  state.alpha=(s.distanceOpacity?Math.floor(1-distance/threshold+.5):1)*(s.randomOpacity?random(4):1)
  const ox=dx*offset,oy=dy*offset
  segment(point.x+ox,point.y+oy,s.magnetify?p.x-ox:point.x-ox,s.magnetify?p.y-oy:point.y-oy)
 }
 return out
}
