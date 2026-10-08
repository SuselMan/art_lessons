import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {installSettleBoundaryProbe} from './settle-boundary-probe.mjs'
import {transferSettleBoundaries} from './settle-boundary-transfer.mjs'
test('real observer pipeline snapshots before prepare, after finish; padded rows, SHA ACK and absence',async()=>{
 const events=[],buffers=[],prior=globalThis.window
 class Executor {prepareSettle(){events.push('prepare');return{finish(){events.push('finish');field.texture.value=29},async publish(){events.push('publish')},dispose(){events.push('dispose')}}}}
 const field={texture:{value:17}},state={inkLoad:field,inkColor:field,solventLoad:field,filmGesture:2,solventGesture:2}
 const source=installSettleBoundaryProbe.toString().replace("await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')",'({CanonicalRoomWatercolorExecutor:Executor})'),install=Function('Executor',`return (${source})`)(Executor),original=Executor.prototype.prepareSettle
 globalThis.window={};globalThis.GPUBufferUsage={COPY_DST:1,MAP_READ:2};globalThis.GPUMapMode={READ:1}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'settle-boundary-'))
 try{await install();const e=new Executor();e.target={buffer:{width:1024,height:1024}};e.scratch={gesture:2,materialGesture:2,tiles:{peek:()=>state},foreignSources:[]};e.backend={device:{createBuffer:({size})=>{const b={data:new Uint8Array(size),async mapAsync(){assert(!this.dead)},getMappedRange(){return this.data.buffer},unmap(){},destroy(){this.dead=true}};buffers.push(b);return b}}};e.adapter={runQuantum:fn=>fn({encoder:{copyTextureToBuffer(a,b,size){assert.deepEqual(a.origin,[402,352]);assert.equal(b.bytesPerRow,512);for(let y=0;y<size[1];y++)b.buffer.data.fill(a.texture.value,y*512,y*512+size[0]*4)}}})}
 const task=e.prepareSettle({bounds:{minX:0,minY:0,maxX:1024,maxY:1024}});task.finish();await task.publish();task.dispose();const decoded=await transferSettleBoundaries(async(f,a)=>f(a),dir);assert.equal(decoded.byteLength,6*78*96*4);assert.deepEqual(events,['prepare','finish','publish','dispose']);assert.equal(fs.readFileSync(dir+'/settle-0-0-inkLoad.bin')[0],17);assert.equal(fs.readFileSync(dir+'/settle-0-1-inkLoad.bin')[0],29);assert.equal(decoded.records[0].stages[0].roles.find(x=>x.role==='inkSettled').absent,true);assert.equal(window.__settleBoundaryPayloads.size,0);assert(buffers.every(b=>b.dead));window.__restoreSettleBoundaryProbe();assert.equal(Executor.prototype.prepareSettle,original)
 // Finish/publish failure must not claim success; disposal and restoration
 // release both captures even before any asynchronous transfer.
 Executor.prototype.prepareSettle=()=>({finish(){},async publish(){throw Error('real publish rejected')},dispose(){}});await install();const failed=e.prepareSettle({bounds:{}});failed.finish();await assert.rejects(failed.publish(),/real publish rejected/);assert.equal(window.__settleBoundaryRecords[0].published,false);assert.match(window.__settleBoundaryRecords[0].error,/real publish rejected/);failed.dispose();assert(buffers.every(b=>b.dead));window.__restoreSettleBoundaryProbe();Executor.prototype.prepareSettle=original

 }finally{window.__restoreSettleBoundaryProbe?.();globalThis.window=prior;fs.rmSync(dir,{recursive:true,force:true})}
})
