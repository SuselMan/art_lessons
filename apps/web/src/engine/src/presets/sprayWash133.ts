export interface SprayWashRegion {x:number;y:number;width:number;height:number;originX:number;originY:number}
/** Tile-local top-down regions, ≤512², clipped to actual dirty footprint. */
export function* sprayWashRegions(bounds:{minX:number;minY:number;maxX:number;maxY:number},tile:{originX:number;originY:number;buffer:{width:number;height:number}},width:number,height:number):Generator<SprayWashRegion>{
 if(![width,height].every(v=>Number.isInteger(v)&&v>0&&v<=512))throw RangeError('Spray Wash scratch region exceeds512')
 const x0=Math.max(0,Math.floor(bounds.minX-tile.originX)),y0=Math.max(0,Math.floor(bounds.minY-tile.originY)),x1=Math.min(tile.buffer.width,Math.ceil(bounds.maxX-tile.originX)),y1=Math.min(tile.buffer.height,Math.ceil(bounds.maxY-tile.originY))
 for(let y=y0;y<y1;y+=height)for(let x=x0;x<x1;x+=width)yield{x,y,width:Math.min(width,x1-x),height:Math.min(height,y1-y),originX:tile.originX+x,originY:tile.originY+y}
}
