import {describe,it,expect} from 'vitest'
import {MaterialFieldPages} from './MaterialFieldPages'
import {extractMaterialTileRect,materialTileIntersection} from './MaterialTileCoordinates'

describe('finite sheet material coordinates',()=>{
  it.each([[1240,1754],[1754,1240],[1754,2480],[2480,1754],[2480,3508],[3508,2480]])(
    'keeps every pixel of %ix%i including partial bottom/right tiles',(width,height)=>{
      const field=new MaterialFieldPages({width,height})
      // Encode world rows and columns independently, so a vertical flip or
      // an overhang offset cannot accidentally pass a constant-colour test.
      for(let oy=0;oy<height;oy+=1024)for(let ox=0;ox<width;ox+=1024){
        const intersection=materialTileIntersection({width,height},{originX:ox,originY:oy,width:1024,height:1024})!
        const bytes=new Uint8Array(1024*1024*4)
        for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
          const at=(y*1024+x)*4
          bytes[at]=(ox+x)%251;bytes[at+1]=(oy+1023-y)%253;bytes[at+2]=137;bytes[at+3]=255
        }
        field.writeRect(intersection.field,extractMaterialTileRect(bytes,1024,1024,intersection.texture))
      }
      const snapshot=field.snapshot()
      for(const y of [0,1,height-1,height-2,Math.min(1023,height-1),Math.min(1024,height-1)]){
        const row=snapshot.readRect({x:0,y,width,height:1})
        for(let x=0;x<width;x++)expect(Array.from(row.subarray(x*4,x*4+4))).toEqual([x%251,(height-1-y)%253,137,255])
      }
    })
  it('clips negative tiles and ignores tiles outside the finite page',()=>{
    expect(materialTileIntersection({width:100,height:80},{originX:-20,originY:-10,width:64,height:64})).toEqual({field:{x:0,y:26,width:44,height:54},texture:{x:20,y:0,width:44,height:54}})
    expect(materialTileIntersection({width:100,height:80},{originX:100,originY:0,width:64,height:64})).toBeNull()
  })
})
