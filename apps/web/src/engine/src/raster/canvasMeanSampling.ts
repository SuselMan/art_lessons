import type { WorldRect } from '../buffers/tileMath'

/** Qt integer rectangle inset: truncate each offset towards zero, preserving
 * the integer centre. The source uses current mask bounds at previous centre. */
export function canvasMeanRect(previous: {x:number;y:number}, width:number, height:number, radius:number): WorldRect {
  const x=Math.round(previous.x-width/2), y=Math.round(previous.y-height/2)
  const cx=x+Math.floor((width-1)/2), cy=y+Math.floor((height-1)/2)
  if(radius<=0)return {minX:cx,minY:cy,maxX:cx+1,maxY:cy+1}
  const dx=Math.trunc(width*(radius-1)/2),dy=Math.trunc(height*(radius-1)/2)
  return {minX:Math.min(x-dx,cx),minY:Math.min(y-dy,cy),maxX:Math.max(x+width+dx,cx+1),maxY:Math.max(y+height+dy,cy+1)}
}

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
