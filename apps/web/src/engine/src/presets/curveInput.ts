import type{Dab}from'@grafetto/shared'
type Point={x:number;y:number}
export interface CurveInputState{previous?:Dab;older?:Dab;tangent?:Point;finished?:boolean}
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const mix=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
const length=(a:Point)=>Math.hypot(a.x,a.y)
function intersection(a:Point,b:Point,c:Point,d:Point):{point:Point;t:number;u:number}|undefined{
 const ab=sub(b,a),cd=sub(d,c),ac=sub(c,a),den=ab.x*cd.y-ab.y*cd.x
 if(den===0)return
 const t=(ac.x*cd.y-ac.y*cd.x)/den,u=(ac.x*ab.y-ac.y*ab.x)/den
 return{point:mix(a,b,t),t,u}
}
function controls(a:Dab,b:Dab,t1:Point,t2:Point):[Point,Point]{
 const d1={x:a.x+t1.x,y:a.y+t1.y},d2={x:b.x-t2.x,y:b.y-t2.y},cross=intersection(d1,d2,a,b)
 let target1:Point,target2:Point
 if(cross&&cross.t>=0&&cross.t<=1&&cross.u>=0&&cross.u<=1){const half=length(sub(b,a))/2;target1=mix(a,d1,half/length(t1));target2=mix(b,d2,half/length(t2))}
 else{const cross=intersection(a,d1,b,d2),target=cross&&Math.abs(cross.point.x)+Math.abs(cross.point.y)<=1e6?cross.point:mix(a,b,.5);target1=target;target2=target}
 const v1=length(t1),v2=length(t2),similarity=Math.max(.5,Math.min(v1/v2,v2/v1)),coefficient=.8*(1-Math.max(0,similarity-.8))
 return[mix(a,target1,coefficient*(v1>v2?1:similarity)),mix(b,target2,coefficient*(v1>v2?similarity:1))]
}
function midpoint(a:Dab,b:Dab,p:Point):Dab{
 const value={...b,x:p.x,y:p.y}
 for(const key of ['pressure','size','tiltX','tiltY','t','sourceTime']as const){const x=a[key],y=b[key];if(x!==undefined&&y!==undefined)value[key]=(x+y)/2}
 return value
}
/** Basic smoothing calls paintLine after flattening the input cubic at .5px.
 * Curve paintops count these endpoints, rather than raw browser events. */
function segment(a:Dab,b:Dab,c1:Point,c2:Point,depth=0):Dab[]{
 const delta=sub(b,a),size=length(delta),distance=(p:Point)=>size?Math.abs(delta.x*(p.y-a.y)-delta.y*(p.x-a.x))/size:NaN
 if(depth===8||!Number.isFinite(distance(c1))||distance(c1)<.5&&distance(c2)<.5)return[b]
 const l2=mix(a,c1,.5),h=mix(c1,c2,.5),l3=mix(l2,h,.5),r3=mix(c2,b,.5),r2=mix(h,r3,.5),middle=midpoint(a,b,mix(l3,r2,.5))
 return[...segment(a,middle,l2,l3,depth+1),...segment(middle,b,r2,r3,depth+1)]
}
function basicSegment(a:Dab,b:Dab,t1:Point,t2:Point):Dab[]{
 if(length(t1)===0||length(t2)===0)return[]
 const [c1,c2]=controls(a,b,t1,t2)
 return segment(a,b,c1,c2)
}
const tangent=(a:Dab,b:Dab):Point=>{const dt=Math.max(1,b.sourceTime!-a.sourceTime!);return{x:(b.x-a.x)/dt,y:(b.y-a.y)/dt}}
export function curveInputRequests(dab:Dab,state:CurveInputState):Dab[]{
 if(state.finished)throw Error('Curve input already finished')
 const next={...dab},previous=state.previous
 state.previous=next
 if(!previous)return[next]
 let out:Dab[]=[]
 if(!state.tangent)state.tangent=tangent(previous,next)
 else{
  const t=tangent(state.older!,next)
  out=length(t)===0||length(state.tangent)===0?[next]:basicSegment(state.older!,previous,state.tangent,t)
  state.tangent=t
 }
 state.older=previous
 return out
}
export function finishCurveInput(state:CurveInputState):Dab[]{
 if(state.finished)return[]
 state.finished=true
 return state.tangent&&state.older&&state.previous?basicSegment(state.older,state.previous,state.tangent,tangent(state.older,state.previous)):[]
}
