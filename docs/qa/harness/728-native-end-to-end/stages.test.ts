import test from 'node:test'
import assert from 'node:assert/strict'
import { CanonicalFieldBuffer } from '../../../../apps/web/src/engine/src/webgpuCanonical/fieldBuffer'
import { captureStages,compareStages } from './stages'
test('hooks preserve real arguments/returns, snapshot once, read only after explicit read, restore methods',async()=>{
 let copies=0,reads=0,id=0
 const data=new Map<any,Uint8Array>()
 const owner:any={createField:(_label:any,width:number,height:number)=>{const field={width,height,texture:{id:id++},view:{}};data.set(field,new Uint8Array(width*height*4).fill(7));return field},copyField:(a:any,b:any)=>{copies++;data.set(b,data.get(a)!.slice())},readField:(f:any)=>{reads++;return Promise.resolve(data.get(f)!.slice())},destroyField:()=>{}}
 const source=new CanonicalFieldBuffer(owner,2,2)
 const prepare=function(...args:any[]){assert.equal(args[0],scratch);return token},front=function(...args:any[]){assert.equal(args[5],source);return token},diffuse=()=>token,brush=()=>token,fieldOp=()=>token,token={}
 const planner={prepare},passes={waterFrontStep:front,diffuseStep:diffuse,brushPass:brush,fieldOp},scratch={peek:()=>({coverage:source,inkLoad:source,inkColor:source,solventLoad:source})}
 const gate=captureStages({backend:owner,planner,adapter:passes} as any,true)
 assert.equal(planner.prepare(scratch,[{buffer:source}],{minX:0},0,50,1,0,1,0,0),token)
 assert.equal(passes.waterFrontStep({},0,0,1,source,source),token);passes.waterFrontStep({},0,0,1,source,source)
 assert.equal(copies,5);assert.equal(reads,0)
 data.get(source.field)!.fill(99)
 const result=await gate.read();assert.equal(reads,5);assert.equal(result[0].bytes[0],7)
 gate.detach();assert.equal(planner.prepare,prepare);assert.equal(passes.waterFrontStep,front);gate.destroy()
})
test('stage comparator rejects changed alpha, missing native/GL roles and unequal extents',()=>{
 const s={key:'source:1:P',w:1,h:1,bytes:Uint8Array.from([0,0,0,4])},other={...s,bytes:Uint8Array.from([0,0,0,5])}
 const changed=compareStages([s],[other])[0] as any;assert.equal(changed.exact,false);assert.equal(changed.changed,1);assert.equal(changed.max,1)
 assert.equal((compareStages([s],[])[0] as any).missing,true)
 assert.equal((compareStages([],[s])[0] as any).missingNative,true)
 assert.equal((compareStages([s],[{...s,w:2}])[0] as any).dimensionMismatch,true)
})
test('brush oracle ignores stale outside scissor; top-row bytes respect bottom-up GL rect; changed written pixel rejects',()=>{
 const clean={key:'first:brush',w:1,h:2,bytes:Uint8Array.from([0,0,0,0,1,2,3,4]),writtenRect:[0,0,1,1] as const}
 const poisoned={...clean,bytes:Uint8Array.from([200,200,200,200,1,2,3,4])}
 assert.equal((compareStages([clean],[poisoned])[0] as any).exact,true)
 poisoned.bytes[7]=5
 const diff=compareStages([clean],[poisoned])[0] as any;assert.equal(diff.changed,1);assert.equal(diff.comparedBytes,4)
 assert.equal((compareStages([clean],[{...clean,writtenRect:[0,1,1,1]}])[0] as any).writtenRectMismatch,true)
})
test('prediffuse coarse checkpoints skip basic outputs and stay in fixed one-shot budget',async()=>{
 let id=0;const data=new Map<any,Uint8Array>(),owner:any={createField:(_label:any,width:number,height:number)=>{const field={width,height,texture:{id:id++},view:{}};data.set(field,new Uint8Array(width*height*4));return field},copyField:(a:any,b:any)=>data.set(b,data.get(a)!.slice()),readField:(f:any)=>Promise.resolve(data.get(f)!.slice()),destroyField:()=>{}}
 const b=new CanonicalFieldBuffer(owner,2,2),entry={coverage:b,inkLoad:b,inkColor:b,solventLoad:b},scratch={peek:()=>entry}
 const passes:any={fieldOp(){},waterFrontStep(){},diffuseStep(){},brushPass(){}}
 const planner:any={prepare(){}}
 const gate=captureStages({backend:owner,planner,adapter:passes} as any,true,192,'prediffuse')
 planner.prepare(scratch,[{buffer:b}],{},0,50,1,0,1,0,0)
 for(const mode of [0,10,12,11,6,15])passes.fieldOp(b,b,b,mode,0)
 passes.diffuseStep({w:2,h:2},0,0,1,1024,1024,b,b,3,false,b,b)
 const snapshots=await gate.read();assert.equal(snapshots.length,12)
 assert(!snapshots.some(s=>s.key==='source:1:C'||s.key==='first:diffuse'))
 assert(snapshots.some(s=>s.key==='coarse:mobileSplit'));assert.equal((gate.primitiveMetadata.diffuse as any).sourceRole,'pigment')
 const before=gate.chronology.length;passes.fieldOp(b,b,b,0,0);assert.equal(gate.chronology.length,before)
 gate.detach();gate.destroy()
})
