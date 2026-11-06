import type{BrushParticle,Dab}from'@grafetto/shared'
import type{BrushStamp}from'./digitalBrushPresets'
export interface ParticleState{values:Float64Array;ordinal:number}
export interface ParticleStamp extends BrushStamp{group:number;color:[number,number,number]}
/** Fixed native integration step, independent of wall clock/frame/tile count.
 * The unusual absolute initial next-position is retained from native. */
export function particleStamps(p:BrushParticle,dab:Dab,state:ParticleState,color:[number,number,number]):ParticleStamp[]{
 const x=Math.fround(dab.x),y=Math.fround(dab.y),group=state.ordinal++,out:ParticleStamp[]=[]
 if(!state.values.length){state.values=new Float64Array(p.count*4);for(let j=0;j<p.count;j++)state.values.set([x,y,x,y],j*4)}
 for(let i=0;i<p.iterations;i++)for(let j=0;j<p.count;j++){
  const k=j*4,v=state.values,a=(j+p.iterations)*.5
  v[k+2]=(v[k+2]+(x-v[k])*p.scaleX*a)*p.gravity;v[k+3]=(v[k+3]+(y-v[k+1])*p.scaleY*a)*p.gravity
  v[k]+=v[k+2]*.00003;v[k+1]+=v[k+3]*.00003
  if(!Number.isFinite(v[k])||!Number.isFinite(v[k+1])||Math.abs(v[k])>2147483600||Math.abs(v[k+1])>2147483600)continue
  // Bilinear texture tents peak at texel centres; native weights address
  // floor(pos) and its three neighbours, hence this half-pixel translation.
  out.push({x:v[k]+.5,y:v[k+1]+.5,size:1,aspect:1,angle:0,flowScale:p.weight,color:[...color],group})
 }
 return out
}
