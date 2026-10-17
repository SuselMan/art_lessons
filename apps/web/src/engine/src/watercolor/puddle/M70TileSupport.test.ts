import {it,expect} from 'vitest'
import {keepM70FixedGroup} from './M70FixedWindowSkip'
import {m70WindowGroups} from './M70WindowGroups'
it('matches OR of independent certified rect proofs for all fixed groups on all page formats',()=>{
 for(const [width,height] of [[1240,1754],[1754,1240],[1754,2480],[2480,1754],[2480,3508],[3508,2480]]){
 const page={width,height},rects=[{x:0,y:0,width:101,height:99},{x:width-110,y:height-120,width:110,height:120}],rect={x:0,y:0,width,height}
 let kept=0,legacy=0
 for(const g of m70WindowGroups(page,{width:Math.max(1536,Math.ceil(width/256)*256),height:Math.max(1536,Math.ceil(height/256)*256)},612)){
 const before=JSON.stringify(g)
 const expected=rects.some(r=>keepM70FixedGroup(page,g,{...page,rect:r}))
 expect(keepM70FixedGroup(page,g,{...page,rect,rects})).toBe(expected)
 expect(JSON.stringify(g)).toBe(before)
 kept+=Number(expected);legacy+=Number(keepM70FixedGroup(page,g,{...page,rect}))
 }
 expect(kept).toBeLessThanOrEqual(legacy)
 if(width>=2480||height>=2480)expect(kept).toBeLessThan(legacy)
 }
})
it('keeps every malformed list and preserves legacy and empty semantics',()=>{
 const page={width:4096,height:4096},g={field:{x:0,y:0,width:1536,height:1536},cores:[{x:0,y:0,width:256,height:256}]},rect={x:3000,y:3000,width:10,height:10}
 for(const rects of [null,{},[],[{x:NaN,y:0,width:1,height:1}],[{x:0,y:0,width:1,height:1}]])expect(keepM70FixedGroup(page,g,{...page,rect,rects} as any)).toBe(true)
 expect(keepM70FixedGroup(page,g,{...page,rect})).toBe(false)
 expect(keepM70FixedGroup(page,g,{...page,rect:null,rects:[]})).toBe(false)
 expect(keepM70FixedGroup(page,g,{...page,rect:null,rects:[rect]})).toBe(true)
})
import {capturePagedPuddleSource} from './PagedPuddleSource'
it('captures each clipped physical tile once, excluding dry original and including every material channel',()=>{
 const tiles=[{originX:0,originY:0,buffer:{width:4,height:4}},{originX:4,originY:4,buffer:{width:4,height:4}}]
 const plane=(channel:number,x:number,y:number)=>({readPixels:()=>{const b=new Uint8Array(64);b[(y*4+x)*4+channel]=255;return b}})
 for(let channel=0;channel<4;channel++)for(const name of ['coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad']){
 const empty={readPixels:()=>new Uint8Array(64)}
 const entries=tiles.map((_,i)=>({original:{readPixels:()=>new Uint8Array(64).fill(255)},inkLoad:empty,inkColor:empty,[name]:plane(channel,i?1:2,i?1:2)}))
 const captured=capturePagedPuddleSource({peek:(b:unknown)=>entries[tiles.findIndex(t=>t.buffer===b)]} as any,{allResident:()=>tiles} as any,{width:6,height:7},{} as any,{} as any)
 expect(captured.materialSupport).toEqual({width:6,height:7,rect:{x:2,y:0,width:4,height:6},rects:[{x:2,y:5,width:1,height:1},{x:5,y:0,width:1,height:1}]})
 }
})
