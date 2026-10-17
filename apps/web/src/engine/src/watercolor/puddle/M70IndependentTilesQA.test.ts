import {it,expect,vi} from 'vitest'
import {independentM70TilesQA,createIndependentWindowTiming} from './M70IndependentTilesQA'
import {committedReadRect} from './CommittedReadRect'
it.each([[1,1],[1536,1536],[2048,512],[1537,1553],[2177,901],[3508,2480],[4961,3508]])('independent fixed fields cover %s×%s exactly with clipped nonoverlapping cores', (width,height)=>{
 const groups=independentM70TilesQA({width,height});expect(groups).toHaveLength(Math.ceil(width/1536)*Math.ceil(height/1536));let area=0
 for(const [i,g]of groups.entries()){
  expect(g.field.width).toBe(1536);expect(g.field.height).toBe(1536);expect(g.field.x%1536).toBe(0);expect(g.field.y%1536).toBe(0)
  const c=g.cores[0];expect(c.x).toBe(g.field.x);expect(c.y).toBe(g.field.y);expect(c.x+c.width).toBeLessThanOrEqual(width);expect(c.y+c.height).toBeLessThanOrEqual(height);area+=c.width*c.height
  const rect=committedReadRect(g.field,g.cores);expect(rect).toEqual({x:0,y:1536-c.height,width:c.width,height:c.height})
  for(const previous of groups.slice(0,i)){const p=previous.cores[0];expect(c.x>=p.x+p.width||p.x>=c.x+c.width||c.y>=p.y+p.height||p.y>=c.y+c.height).toBe(true)}
 }
 expect(area).toBe(width*height)
})
it('rejects invalid finite dimensions',()=>{for(const width of [0,-1,NaN,Infinity,1.5])expect(()=>independentM70TilesQA({width,height:100})).toThrow()})
it('host phases record exceptions, exclude yield idle time from active sum, preserve epoch and detached field',()=>{
 let now=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),window=independentM70TilesQA({width:1,height:1})[0]
 try{const timing=createIndependentWindowTiming(true,window,true,7,612);timing.measure('stepHostMs',()=>{now+=12});now+=100;expect(()=>timing.measure('readbackScatterHostMs',()=>{now+=3;throw Error('read')})).toThrow('read');timing.measure('cleanupHostMs',()=>{now+=2});const event=timing.finish(false);expect(event).toMatchObject({epoch:7,supportRadius:612,activeHostMs:17,elapsedHostMs:117,stepHostMs:12,readbackScatterHostMs:3,completed:false});expect(event.field).not.toBe(window.field)}finally{clock.mockRestore()}
})

import {MaterialFieldPages} from './MaterialFieldPages'
import {extractMaterialTileRect} from './MaterialTileCoordinates'
it.each([[13,7],[1537,19],[2177,901]])('bottom-up committed read/scatter preserves every owned byte for %s×%s', (width,height)=>{
 const output=new MaterialFieldPages({width,height})
 for(const group of independentM70TilesQA({width,height})){
  const full=new Uint8Array(1536*1536*4)
  for(let localY=0;localY<1536;localY++)for(let localX=0;localX<1536;localX++){
   const i=(localY*1536+localX)*4,worldX=group.field.x+localX,worldY=group.field.y+1535-localY
   full[i]=worldX%251;full[i+1]=worldY%251;full[i+2]=(worldX+worldY)%251;full[i+3]=255
  }
  const readRect=committedReadRect(group.field,group.cores),read=extractMaterialTileRect(full,1536,1536,readRect),rect={...group.field,y:height-group.field.y-1536}
  for(const core of group.cores){const interior={...core,y:height-core.y-core.height},local={x:interior.x-rect.x-readRect.x,y:interior.y-rect.y-readRect.y,width:interior.width,height:interior.height};output.writeRect(interior,extractMaterialTileRect(read,readRect.width,readRect.height,local))}
 }
 const bytes=output.snapshot().readRect({x:0,y:0,width,height})
 // Compare bytes directly without allocating a second full-page expected image.
 let first=-1
 for(let y=0;y<height&&first<0;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,topY=height-1-y;if(bytes[i]!==x%251||bytes[i+1]!==topY%251||bytes[i+2]!==(x+topY)%251||bytes[i+3]!==255){first=i;break}}
 expect(first).toBe(-1)
})
