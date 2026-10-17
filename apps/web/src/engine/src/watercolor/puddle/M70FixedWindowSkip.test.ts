import assert from 'node:assert/strict'
import {keepM70FixedGroup,unionM70Support} from './M70FixedWindowSkip'
import {it} from 'vitest'
it('matches independent sparse support and pixel-distance oracles without changing fixed geometry',async()=>{
let seed=747,checks=0
const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n}
for(let trial=0;trial<300;trial++){
 const width=1+random(96),height=1+random(96),bytes=new Uint8Array(width*height*4)
 const points:Array<[number,number]>=[]
 for(let i=0;i<12;i++){const x=random(width),y=random(height);bytes[(y*width+x)*4+random(4)]=1+random(255);points.push([x,y])}
 const support=unionM70Support(null,{x:0,y:0,width,height},bytes)!
 assert.equal(support.x,Math.min(...points.map(p=>p[0])));assert.equal(support.y,Math.min(...points.map(p=>p[1])))
 assert.equal(support.x+support.width,Math.max(...points.map(p=>p[0]))+1);assert.equal(support.y+support.height,Math.max(...points.map(p=>p[1]))+1);checks+=4
}
// Independent pixel-distance oracle, including bottom-up support → top-down cores.
for(let trial=0;trial<1000;trial++){
 const width=4096,height=3508,s={x:random(width),y:random(height),width:1,height:1}
 const c={x:random(width-16),y:random(height-16),width:1+random(16),height:1+random(16)}
 let intersects=false
 for(let y=c.y;y<c.y+c.height;y++)for(let x=c.x;x<c.x+c.width;x++)if(Math.max(Math.abs(x-s.x),Math.abs((height-1-y)-s.y))<=612)intersects=true
 const g={field:{x:0,y:0,width:1536,height:1536},cores:[c]}
 assert.equal(keepM70FixedGroup({width,height},g,{width,height,rect:s}),intersects);checks++
 const before=JSON.stringify(g);keepM70FixedGroup({width,height},g,{width,height,rect:s});assert.equal(JSON.stringify(g),before);checks++
}
const page={width:2480,height:3508},group={field:{x:0,y:0,width:1536,height:1536},cores:[{x:0,y:0,width:256,height:256}]}
for(const proof of [undefined,{...page,rect:{x:NaN,y:0,width:1,height:1}},{...page,rect:{x:0,y:0,width:Infinity,height:1}},{...page,width:1,rect:null},{...page,rect:{x:-1,y:0,width:1,height:1}}]){assert.equal(keepM70FixedGroup(page,group,proof),true);checks++}
assert.equal(keepM70FixedGroup(page,group,{...page,rect:null}),false);checks++
// Every material channel contributes; an all-zero field is a known-empty proof.
for(let channel=0;channel<4;channel++){const b=new Uint8Array(8);b[4+channel]=1;assert.deepEqual(unionM70Support(null,{x:301,y:257,width:2,height:1},b),{x:302,y:257,width:1,height:1});checks++}
assert.equal(unionM70Support(null,{x:0,y:0,width:2,height:1},new Uint8Array(8)),null);checks++
// Independent coverage ownership check on real fixed groups; every bottom-up
// source row maps exactly once, irrespective of whether its group is skipped.
const {m70WindowGroups}=await import('./M70WindowGroups')
const coveragePage={width:1754,height:2480},domain={width:1792,height:2560},counts=new Uint8Array(coveragePage.width*coveragePage.height)
let skipped=0,kept=0
const proof={...coveragePage,rect:{x:0,y:0,width:1,height:1}}
for(const g of m70WindowGroups(coveragePage,domain,612)){
 if(keepM70FixedGroup(coveragePage,g,proof))kept++;else skipped++
 for(const c of g.cores){
  const glY=coveragePage.height-c.y-c.height
  assert.ok(glY>=0&&glY+c.height<=coveragePage.height)
  for(let j=0;j<c.height;j++)for(let i=0;i<c.width;i++)counts[(glY+j)*coveragePage.width+c.x+i]++
 }
}
assert.ok(kept>0&&skipped>0);assert.ok(counts.every(n=>n===1))
assert.equal(checks,3211)
})
