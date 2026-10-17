import type {MaterialRect} from './MaterialFieldPages'

/** World Y increases down the sheet; material rows and texture rows increase up.
 * A physical edge tile can extend past the sheet. Its surviving rows are at
 * the TOP of that texture, so using local Y=0 there silently loses the edge. */
export function materialTileIntersection(page: {width:number;height:number},
  tile: {originX:number;originY:number;width:number;height:number}):
  {field:MaterialRect;texture:MaterialRect}|null {
  if (![page.width,page.height,tile.width,tile.height].every(n=>Number.isSafeInteger(n)&&n>0)
    || ![tile.originX,tile.originY].every(Number.isSafeInteger)) throw new RangeError('Invalid material tile geometry')
  const left=Math.max(0,tile.originX),top=Math.max(0,tile.originY)
  const right=Math.min(page.width,tile.originX+tile.width),bottom=Math.min(page.height,tile.originY+tile.height)
  if(right<=left||bottom<=top)return null
  const width=right-left,height=bottom-top
  return {field:{x:left,y:page.height-bottom,width,height},
    texture:{x:left-tile.originX,y:tile.height-(bottom-tile.originY),width,height}}
}

/** Owned tightly packed rectangle from a bottom-up RGBA8 physical texture. */
export function extractMaterialTileRect(bytes:Uint8Array,width:number,height:number,rect:MaterialRect):Uint8Array {
  if(bytes.length!==width*height*4 || ![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)
    ||rect.x<0||rect.y<0||rect.width<0||rect.height<0||rect.x+rect.width>width||rect.y+rect.height>height)
    throw new RangeError('Invalid material tile read')
  const out=new Uint8Array(rect.width*rect.height*4)
  for(let y=0;y<rect.height;y++)out.set(bytes.subarray(((rect.y+y)*width+rect.x)*4,
    ((rect.y+y)*width+rect.x+rect.width)*4),y*rect.width*4)
  return out
}
