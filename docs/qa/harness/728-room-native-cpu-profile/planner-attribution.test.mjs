import test from 'node:test'
import assert from 'node:assert/strict'
import {installPlannerAttribution} from './planner-attribution.mjs'
test('observer preserves order arguments identity return and restores method references',()=>{
 class Adapter{runQuantum(fn){return fn()}fieldOp(...args){return args[0]}}
 for(const name of ['carryPair','pigmentColor','costDomainStep','diffuseStep','waterFrontStep','wcResample','brushPair','brushPass'])Adapter.prototype[name]=()=>{}
 const descriptor={compute:{entryPoint:'main'}},device={createComputePipeline(d){assert.equal(d,descriptor);return descriptor},createRenderPipeline(d){return d}},before=Adapter.prototype.runQuantum,records=[];let active=false
 const restore=installPlannerAttribution(Adapter,device,(stage,data)=>records.push({stage,...data}),()=>active),adapter=new Adapter(),token={}
 assert.equal(adapter.runQuantum(()=>adapter.fieldOp(token,null,null,15)),token);assert.equal(records.length,0);active=true
 assert.equal(adapter.runQuantum(()=>adapter.fieldOp(token,null,null,15)),token);assert.equal(records.at(-1).passes[0].mode,15);assert.equal(device.createComputePipeline(descriptor),descriptor);restore();assert.equal(Adapter.prototype.runQuantum,before)
})
