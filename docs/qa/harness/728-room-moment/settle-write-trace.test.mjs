import test from 'node:test'
import assert from 'node:assert/strict'
import {installSettleWriteTrace} from './settle-write-trace.mjs'
test('first load write follows resample temporary, preserves delegates and restores leases',async()=>{
 let count=0;const prior=globalThis.window,load={field:{}},base={field:{}},temp={field:{}},source={field:{}}
 class Executor{prepareSettle(){return{step:()=>false,finish:()=>{this.adapter.wcResample(temp,0,0,10,10,source,0,0,.5,1,null,base);this.backend.copyRegion(temp.field,load.field,[0,0],[0,0],[10,10])},dispose(){}}}}
 const src=installSettleWriteTrace.toString().replace("await import('/src/engine/src/webgpuCanonical/roomWatercolorExecutor.ts')",'({CanonicalRoomWatercolorExecutor:Executor})'),install=Function('Executor',`return (${src})`)(Executor)
 globalThis.window={};try{await install();const e=new Executor();e.scratch={gesture:2,tiles:{peek:()=>({inkLoad:load,inkBase:base})}};e.target={buffer:{}};e.adapter={wcResample(){count++},fieldOp(){count++}};e.backend={copyRegion(){count++},copyField(){count++}};const original=e.adapter.wcResample,job=e.prepareSettle({});job.step();job.finish();job.dispose();assert.equal(count,2);const trace=window.__settleWriteTrace[0];assert.equal(trace.firstLoadWrite.method,'copyRegion');assert.equal(trace.firstLoadWrite.phase,'finish');assert.equal(trace.firstLoadWrite.destinationRole,'inkLoad');assert.equal(trace.firstLoadWrite.preceding[0].method,'wcResample');assert.equal(trace.firstLoadWrite.preceding[0].mode,1);assert.equal(e.adapter.wcResample,original);window.__restoreSettleWriteTrace()}finally{globalThis.window=prior}
})
