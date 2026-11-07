/** Krita Auto generator sector folding (bd6e8d0 KisMaskGenerator::fixRotation).
 * Input is physical generator coordinates BEFORE division by source radii.
 * Native standard rectangle additionally folds abs(x), unlike the circles.
 */
export function autoSpikeFold(x:number,y:number,spikes:number,standardRectangle=false):[number,number] {
  if(!Number.isInteger(spikes)||spikes<2||spikes>20||![x,y].every(Number.isFinite))throw new RangeError('Invalid Auto spikes')
  if(spikes===2)return [x,y]
  let xr=standardRectangle?Math.abs(x):x,yr=Math.abs(y)
  let angle=Math.atan2(yr,xr)
  const sector=Math.PI/spikes,step=2*sector,c=Math.cos(-step),s=Math.sin(-step)
  for(let i=0;i<20&&angle>sector;i++){
    const nextX=c*xr-s*yr
    yr=s*xr+c*yr;xr=nextX;angle-=step
  }
  return [xr,yr]
}
/** Allocation/characteristic axes are square; sourceRy still encodes Ratio. */
export function autoSpikeAllocation(radius:number,aspect:number,spikes?:number):{radius:number;aspect:number} {
  if(spikes!==undefined&&(!Number.isInteger(spikes)||spikes<2||spikes>20))throw new RangeError('Invalid Auto spikes')
  return spikes===undefined||spikes===2?{radius,aspect}:{radius:radius*aspect,aspect:1}
}
export const BRUSH_AUTO_SPIKES_GLSL=`
vec2 brushAutoSpikeFold(vec2 point,float spikes,bool standardRectangle) {
 if(spikes<2.5)return point;
 vec2 p=vec2(standardRectangle?abs(point.x):point.x,abs(point.y));
 float angle=atan(p.y,p.x),sector=3.141592653589793/spikes;
 float stepAngle=2.0*sector,c=cos(-stepAngle),s=sin(-stepAngle);
 for(int i=0;i<20;i++){
  if(angle>sector){p=vec2(c*p.x-s*p.y,s*p.x+c*p.y);angle-=stepAngle;}
 }
 return p;
}
`
