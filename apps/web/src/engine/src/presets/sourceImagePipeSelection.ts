/** Independent selection arithmetic from pinned Krita bd6e8d, image-pipe
 * selectPre/selectPost. No asset access, server randomness or replay queries. */
export type SourceImagePipeMode='constant'|'incremental'|'random'|'pressure'|'angular'|'xtilt'|'ytilt'|'velocity'
export interface SourceImagePipeDimension {readonly mode:SourceImagePipeMode;readonly rank:number;readonly stride:number}
export interface SourceImagePipeQuery {
 readonly pressure:number;readonly drawingAngleRadians:number
 /** Native paint-information tilt in degrees (KoPointerEvent passes tablet tilt). */
 readonly xTilt:number;readonly yTilt:number
 /** Native VIEW pixels/ms, before the speed sensor's /30 normalization. */
 readonly drawingSpeed:number
}
export interface SourceImagePipeRandom {generate(min:number,max:number):number}
const modes:readonly string[]=['constant','incremental','random','pressure','angular','xtilt','ytilt','velocity']
const round=(n:number)=>n<0?-Math.floor(-n+0.5):Math.floor(n+0.5)
export function captureSourceImagePipeDimensions(input:readonly SourceImagePipeDimension[],frameCount:number,declaredCells:number):readonly Readonly<SourceImagePipeDimension>[] {
 if(!Number.isSafeInteger(declaredCells)||declaredCells<1||declaredCells>256||!Number.isSafeInteger(frameCount)||frameCount<1||frameCount>256||input.length<1||input.length>4)throw new RangeError('Unsupported bounded image pipe')
 let product=1
 for(const d of input){if(!modes.includes(d.mode)||!Number.isSafeInteger(d.rank)||d.rank<1||d.rank>256||!Number.isSafeInteger(d.stride)||d.stride<0||d.stride>256)throw new RangeError('Invalid pipe dimension');product*=d.rank;if(product>256)throw new RangeError('Image pipe rank product exceeds capacity')}
 // Native parser divides declared ncells successively (not actual loaded frame count).
 let stride=declaredCells
 for(const d of input){stride=Math.trunc(stride/d.rank);if(d.stride!==stride)throw new RangeError('Invalid image pipe rank stride')}
 return Object.freeze(input.map(d=>Object.freeze({mode:d.mode,rank:d.rank,stride:d.stride})))
}
/** Native prepareForSeqNo calls this immediately before chooseNextBrush,
 * once for the actual paint sequence. It is not an additional after-paint RNG
 * step. Caller owns/captures the returned indices in author state. */
export function sourceImagePipePost(dimensions:readonly SourceImagePipeDimension[],previous:readonly number[],sequence:number,random:SourceImagePipeRandom):readonly number[]{
 if(previous.length!==dimensions.length||!Number.isSafeInteger(sequence)||sequence< -1)throw new RangeError('Invalid pipe cursor')
 return Object.freeze(dimensions.map((d,i)=>{
  const old=previous[i];if(!Number.isSafeInteger(old)||old<0||old>=d.rank)throw new RangeError('Invalid pipe index')
  if(d.mode==='incremental')return(sequence>=0?sequence:old+1)%d.rank
  if(d.mode==='random'){const v=random.generate(0,d.rank-1);if(!Number.isSafeInteger(v)||v<0||v>=d.rank)throw new RangeError('Invalid author pipe RNG');return v}
  return old
 }))
}
export function sourceImagePipeFrame(dimensions:readonly SourceImagePipeDimension[],indices:readonly number[],frameCount:number,q:SourceImagePipeQuery):number {
 if(indices.length!==dimensions.length||!Number.isSafeInteger(frameCount)||frameCount<1||frameCount>256||![q.pressure,q.drawingAngleRadians,q.xTilt,q.yTilt,q.drawingSpeed].every(Number.isFinite)||q.pressure<0||q.pressure>1||q.xTilt< -90||q.xTilt>90||q.yTilt< -90||q.yTilt>90||q.drawingSpeed<0)throw new RangeError('Invalid image pipe query')
 let sum=0
 for(let i=0;i<dimensions.length;i++){
  const d=dimensions[i];let index=indices[i]
  if(!Number.isSafeInteger(index)||index<0||index>=d.rank)throw new RangeError('Invalid image pipe state')
  switch(d.mode){
   case 'pressure':index=Math.trunc(q.pressure*(d.rank-1)+0.5);break
   case 'angular':{const tau=2*Math.PI,angle=((q.drawingAngleRadians+3*Math.PI/4)%tau+tau)%tau;index=Math.trunc(angle/tau*d.rank);break}
   case 'xtilt':index=round(q.xTilt/2*d.rank)+Math.trunc(d.rank/2);break
   case 'ytilt':index=round(q.yTilt/2*d.rank)+Math.trunc(d.rank/2);break
   case 'velocity':index=round(Math.min(3,Math.log(q.drawingSpeed+1))/3*((d.rank-1)+0.5));break
  }
  // Native accumulator is quint32, including out-of-rank tilt endpoints.
  sum=(sum+d.stride*index)>>>0
 }
 return sum%frameCount
}
