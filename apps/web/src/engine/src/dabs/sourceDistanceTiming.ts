/** bd6e8d0 distance-information law. Author planning only; replay never retimes.
 * The distance branch runs first and BOTH branches mutate the SAME accumulators.
 */
export const SOURCE_LONG_TIME=320000000000
export interface SourceSpacing { enabled:boolean; isotropic:boolean; x:number; y:number; angle:number; flipped?:boolean }
export interface SourcePointTime {x:number;y:number;t:number}
export class SourceDistanceTiming {
  x=0
  y=0
  time=0
  spacingElapsed=0
  timingElapsed=0
  clone():SourceDistanceTiming {return Object.assign(new SourceDistanceTiming(),this)}
  resetAccumulators():void {this.x=0;this.y=0;this.time=0}
  updateSpacing():void {this.spacingElapsed=0}
  updateTiming():void {this.timingElapsed=0}
  next(start:SourcePointTime,end:SourcePointTime,spacing:SourceSpacing,interval?:number):number {
    const distance=spacing.enabled?this.distance(start,end,spacing):-1
    const timed=interval===undefined?-1:this.timed(start.t,end.t,interval)
    const factor=distance<0?timed:timed<0?distance:Math.min(distance,timed)
    if(factor<0){this.spacingElapsed+=end.t-start.t;this.timingElapsed+=end.t-start.t}
    else{this.spacingElapsed=0;this.timingElapsed=0}
    return factor
  }
  private timed(start:number,end:number,interval:number):number {
    if(!(start<end))return -1
    const remaining=Math.min(SOURCE_LONG_TIME,Math.max(.5,interval))-this.time
    if(remaining<=0){this.resetAccumulators();return 0}
    if(remaining<=end-start){this.resetAccumulators();return remaining/(end-start)}
    this.time+=end-start
    return -1
  }
  private distance(start:SourcePointTime,end:SourcePointTime,s:SourceSpacing):number {
    if(start.x===end.x && start.y===end.y)return -1
    if(s.isotropic){
      // QVector2D stores float components and returns a float length.
      const f=Math.fround,dx=f(end.x-start.x),dy=f(end.y-start.y)
      const length=f(Math.sqrt(f(f(dx*dx)+f(dy*dy))))
      const remaining=Math.max(.5,s.x)-this.x
      if(remaining<=0){this.resetAccumulators();return 0}
      if(remaining<=length){this.resetAccumulators();return remaining/length}
      this.x+=length;return -1
    }
    const a=1/Math.max(.5,s.x),b=1/Math.max(.5,s.y)
    const gamma=(this.x*a)**2+(this.y*b)**2-1
    if(gamma>=0){this.resetAccumulators();return 0}
    const angle=s.flipped?2*Math.PI-s.angle:s.angle
    let dx=end.x-start.x,dy=end.y-start.y
    if(angle>2e-3){
      const cos=Math.cos(angle),sin=Math.sin(angle)
      // QTransform::map classifies a near-diagonal rotation as scale/identity.
      if(Math.abs(sin)<=1e-12){if(!(Math.abs(cos-1)<=1e-12)){dx*=cos;dy*=cos}}
      else [dx,dy]=[cos*dx+(-sin)*dy+0,sin*dx+cos*dy+0]
    }
    dx=Math.abs(dx);dy=Math.abs(dy)
    const alpha=(dx*a)**2+(dy*b)**2,beta=this.x*dx*a*a+this.y*dy*b*b
    const determinant=beta*beta-alpha*gamma
    if(determinant>=0){
      const factor=(-beta+Math.sqrt(determinant))/alpha
      if(factor>=0 && factor<=1){this.resetAccumulators();return factor}
      this.x+=dx;this.y+=dy
    }
    return -1
  }
}
export function sourceTimingInterval(rate:number,factor=1):number {
  return factor<=0?SOURCE_LONG_TIME:(1000/rate)/factor
}
