/** Mathematical radical-inverse sequence, independent of brush RNG. Native
 * rounds each coordinate over [0,size-1]; tiny rectangles may repeat pixels. */
function radicalInverse(index:number,base:number):number {
  let result=0,weight=1/base
  while(index){result+=(index%base)*weight;index=Math.floor(index/base);weight/=base}
  return result
}
export const CANVAS_MEAN_TAPS=Array.from({length:64},(_,i)=>[radicalInverse(i+1,2),radicalInverse(i+1,3)] as const)
export function canvasMeanCoordinates(width:number,height:number):number[][] {
  return CANVAS_MEAN_TAPS.slice(0,Math.min(64,width*height)).map(([x,y])=>[Math.floor(x*(width-1)+.5),Math.floor(y*(height-1)+.5)])
}
