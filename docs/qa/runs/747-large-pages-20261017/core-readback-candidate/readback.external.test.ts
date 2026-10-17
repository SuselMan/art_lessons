import {it,expect} from 'vitest'
import {committedReadRect} from './CommittedReadRect.external'
import {m70WindowGroups} from '../../../../../apps/web/src/engine/src/watercolor/puddle/M70WindowGroups'
import {extractMaterialTileRect} from '../../../../../apps/web/src/engine/src/watercolor/puddle/MaterialTileCoordinates'

const side=1536,full=new Uint8Array(side*side*4)
for(let y=0;y<side;y++)for(let x=0;x<side;x++){const k=(y*side+x)*4;full[k]=x&255;full[k+1]=x>>>8;full[k+2]=y&255;full[k+3]=y>>>8}
for(const [width,height]of [[1240,1754],[1754,1240],[1754,2480],[2480,1754],[2480,3508],[3508,2480],[1537,1553],[2177,901]])it(`preserves every owned core on ${width}x${height}`,()=>{
 let croppedBytes=0,baselineBytes=0,coreCount=0
 for(const {field,cores}of m70WindowGroups({width,height},{width:Math.max(side,Math.ceil(width/256)*256),height:Math.max(side,Math.ceil(height/256)*256)},612)){
  const read=committedReadRect(field,cores),cropped=extractMaterialTileRect(full,side,side,read)
  baselineBytes+=full.length;croppedBytes+=cropped.length
  for(const core of cores){
   const local={x:core.x-field.x,y:side-(core.y-field.y)-core.height,width:core.width,height:core.height}
   const expected=extractMaterialTileRect(full,side,side,local)
   const actual=extractMaterialTileRect(cropped,read.width,read.height,{...local,x:local.x-read.x,y:local.y-read.y})
   expect(actual.length).toBe(expected.length);expect(actual.every((v,i)=>v===expected[i])).toBe(true);coreCount++
  }
 }
 expect(coreCount).toBeGreaterThan(0);expect(croppedBytes).toBeLessThan(baselineBytes)
})
it('converts top-down negative window origins to GL rows and includes disjoint owned cores',()=>{
 expect(committedReadRect({x:-512,y:-256,width:1536,height:1536},[{x:0,y:0,width:256,height:256},{x:512,y:768,width:100,height:128}])).toEqual({x:512,y:384,width:612,height:896})
})
it('falls back conservatively for unknown, fractional or out-of-window ownership',()=>{
 const field={x:0,y:0,width:1536,height:1536},full={x:0,y:0,width:1536,height:1536}
 for(const cores of [[],[{x:0.5,y:0,width:256,height:256}],[{x:-1,y:0,width:256,height:256}],[{x:0,y:0,width:0,height:256}],[{x:0,y:1500,width:256,height:256}]])expect(committedReadRect(field,cores)).toEqual(full)
})
