import type {PointerData} from './PointerInput'

/** Functional sensor mapping from Krita bd6e8d0: view distance/ms, filtered
 * sampling interval, >5px tracking window, speed/30. Browser event timestamps
 * are used explicitly; this is not the native default dispatch-clock claim.
 * Independent implementation; no native source is included in the bundle. */
export class CanonicalPointerSpeed {
  private readonly distances=new Float64Array(512)
  private readonly intervals=new Float64Array(200)
  private readonly sorted=new Float64Array(200)
  private distanceNext=1
  private distanceCount=1
  private intervalNext=0
  private intervalCount=0
  private intervalSum=0
  private x=0
  private y=0
  private time=0
  private initialized=false
  private value=0
  get nativeViewSpeed():number{return this.value}
  get normalized():number{return Math.min(1,this.value/30)}
  reset(x:number,y:number,time:number):void {
    if(![x,y,time].every(Number.isFinite))throw new RangeError('Invalid native source speed origin')
    this.x=x;this.y=y;this.time=time;this.initialized=true;this.value=0
    this.distanceNext=1;this.distanceCount=1;this.distances[0]=0
    // Keep the bounded tablet sample-rate estimate across strokes, as native
    // clear() does. The new stroke's position/time reference is always fresh.
  }
  sample(x:number,y:number,time:number):number {
    if(![x,y,time].every(Number.isFinite))throw new RangeError('Invalid native source speed sample')
    if(!this.initialized){this.reset(x,y,time);return 0}
    const distance=Math.hypot(x-this.x,y-this.y),dt=time-this.time
    // Identical coordinates are repeated native samples. A zero/backward DOM
    // timestamp does not invent velocity: aggregate from the last timed point.
    if(!Number.isFinite(distance)||!Number.isFinite(dt))throw new RangeError('Native source speed overflow')
    if(distance<=1e-12||dt<=0)return this.normalized
    this.x=x;this.y=y;this.time=time
    if(this.intervalCount===200)this.intervalSum-=this.intervals[this.intervalNext]
    else this.intervalCount++
    this.intervals[this.intervalNext]=dt;this.intervalSum+=dt;this.intervalNext=(this.intervalNext+1)%200
    this.sorted.set(this.intervals.subarray(0,this.intervalCount))
    const ordered=this.sorted.subarray(0,this.intervalCount);ordered.sort()
    const useful=Math.max(1,Math.round(.8*this.intervalCount)),cut=this.intervalCount-useful,low=Math.round(.5*cut),high=cut-low
    let sum=this.intervalSum
    for(let i=0;i<low;i++)sum-=ordered[i]
    for(let i=0;i<high;i++)sum-=ordered[this.intervalCount-1-i]
    const average=sum/useful
    this.distances[this.distanceNext]=distance;this.distanceNext=(this.distanceNext+1)%512;this.distanceCount=Math.min(512,this.distanceCount+1)
    let total=0,totalTime=0
    for(let n=0;n<this.distanceCount;n++){
      total+=this.distances[(this.distanceNext-1-n+512)%512];totalTime+=average
      if(n+1>3&&total>5)break
    }
    if(totalTime>0&&total>5)this.value=total/totalTime
    return this.normalized
  }
}
function bounded(value:number|undefined,min:number,max:number,name:string):number {
  if(value===undefined)return 0
  if(!Number.isFinite(value)||value<min||value>max)throw new RangeError('Invalid pointer '+name)
  return value
}
/** W3C twist is clockwise [0,359]; native rotation is signed degrees, consumed
 * as rotation/180. Tangential pressure already uses the native [-1,1] domain. */
export function canonicalPointerHardware(input:Pick<PointerData,'twist'|'tangentialPressure'|'sourceSpeed'>):{speed:number;rotation:number;tangentialPressure:number} {
  const twist=bounded(input.twist,0,359,'twist')
  return{speed:bounded(input.sourceSpeed,0,1,'source speed'),rotation:twist>180?twist-360:twist,tangentialPressure:bounded(input.tangentialPressure,-1,1,'tangential pressure')}
}
