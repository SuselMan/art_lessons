import {describe,it,expect} from 'vitest'
import {CanonicalWatercolorSettlePlan} from './CanonicalWatercolorSettlePlan'
import {traceFixture} from './CanonicalWatercolorSettlePlan.fixture'
type Ref={buffer:number;w:number;h:number}
const isRef=(v:unknown):v is Ref=>!!v&&typeof v==='object'&&'buffer' in v
function run(half:boolean,mixed:boolean,film:boolean,abort:boolean,enabled:boolean){
 const f=traceFixture(half,mixed,film,true,true),builder=new CanonicalWatercolorSettlePlan(f.context)
 builder.diagnosticSkipSinglePaintColourSnapshot=enabled
 const job=builder.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:f.width/2-12,minY:f.width/2-12,maxX:f.width/2+12,maxY:f.width/2+12},.2,half?400:8,1,1,1,1,0,(...args)=>f.record('preview',args))!
 if(abort)job.ops[0]();else{for(const op of job.ops)op();job.finish()}
 job.dispose();job.dispose();builder.destroyTextures()
 return{events:f.events,stats:builder.colourSnapshotStats}
}
function elideDeadReference(events:unknown[][],id:number){
 const rewrite=(v:unknown):unknown=>isRef(v)?{...v,buffer:v.buffer>id?v.buffer-1:v.buffer}:Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)])):v
 return events.filter(e=>!e.some(v=>isRef(v)&&v.buffer===id)).map(e=>rewrite(e))
}
describe('dead half-resolution single-paint colour snapshot',()=>{
 for(const half of [false,true])for(const mixed of [false,true])for(const film of [false,true])for(const abort of [false,true]){
  it(`same chronology except unreachable snapshot half=${half} mixed=${mixed} film=${film} abort=${abort}`,()=>{
   const off=run(half,mixed,film,abort,false),on=run(half,mixed,film,abort,true)
   if(!half||mixed){expect(on.events).toEqual(off.events);expect(on.stats.skipped).toBe(0);return}
   expect(on.stats.skipped).toBe(1)
   const copies=off.events.filter(e=>e[0]==='copy')
   const snapshot=copies[1][2] as Ref
   // An unread destination: only its allocation, initialization copy and release refer to it.
   const uses=off.events.filter(e=>e.some(v=>isRef(v)&&v.buffer===snapshot.buffer))
   expect(uses.map(e=>e[0])).toEqual(['acquire','copy','release'])
   expect(on.stats.storageBytesAvoided).toBe(snapshot.w*snapshot.h*4)
   expect(on.stats.copyPixelsAvoided).toBe(snapshot.w*snapshot.h)
   expect(on.events).toEqual(elideDeadReference(off.events,snapshot.buffer))
  })
 }
 it('single→mixed wash transition reevaluates ownership and preserves the next paired snapshot',()=>{
  const sequence=(enabled:boolean)=>{
   const f=traceFixture(true,false,true,true,true),builder=new CanonicalWatercolorSettlePlan(f.context)
   builder.diagnosticSkipSinglePaintColourSnapshot=enabled
   for(let phase=0;phase<2;phase++){
    if(phase)f.scratch.paints.add('0,0,1')
    const job=builder.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:1000,minY:1000,maxX:1048,maxY:1048},.2,400,1,1,1,1)!
    for(const op of job.ops)op();job.finish();job.dispose()
   }
   builder.destroyTextures();return{events:f.events,stats:builder.colourSnapshotStats}
  }
  const off=sequence(false),on=sequence(true)
  const dead=(off.events.filter(e=>e[0]==='copy')[1][2] as Ref).buffer
  expect(on.stats.skipped).toBe(1)
  expect(on.events).toEqual(elideDeadReference(off.events,dead))
 })

 it('dispose before capture counts avoided allocation but no executed copy',()=>{
  const f=traceFixture(true,false,true,true,true),builder=new CanonicalWatercolorSettlePlan(f.context)
  builder.diagnosticSkipSinglePaintColourSnapshot=true
  const job=builder.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:1000,minY:1000,maxX:1048,maxY:1048},.2,400,1,1,1,1)!
  job.dispose();builder.destroyTextures()
  expect(builder.colourSnapshotStats.skipped).toBe(1)
  expect(builder.colourSnapshotStats.storageBytesAvoided).toBeGreaterThan(0)
  expect(builder.colourSnapshotStats.copyPixelsAvoided).toBe(0)
 })

})
