/** Native sector-fold principle (KisMaskGenerator::fixRotation). Browser-number
 * atan2 is deliberate functional arithmetic, not KisFastMath bit identity.
 * Fixed spikes cap bounds the repeated rotations for every coverage sample. */
export function sourceAutoSpikes(spikes:number):number {
  if(!Number.isSafeInteger(spikes)||spikes<2||spikes>64)throw new RangeError('Unsupported Auto spikes')
  return spikes
}
export function sourceAutoSector(x:number,y:number,spikes:number):readonly[number,number] {
  sourceAutoSpikes(spikes)
  if(spikes===2)return [x,Math.abs(y)]
  y=Math.abs(y)
  const sector=Math.PI/spikes,step=2*sector,cs=Math.cos(-step),ss=Math.sin(-step)
  let angle=Math.atan2(y,x)
  while(angle>sector){const previous=x;x=cs*x-ss*y;y=ss*previous+cs*y;angle-=step}
  return [x,y]
}
