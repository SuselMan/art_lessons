import test from'node:test';import assert from'node:assert/strict';import{assertResumeReadiness}from'./ResumeReadiness.mjs';
const ready={owner:true,contentReady:true,snapshotReady:true,incomplete:false,ready:true,latestKnownSeq:0,coveredExpectedSeq:true,coveredNextSeq:false};
test('snapshot baseline does not require old stroke tail, but exact restored seq is mandatory',()=>{assertResumeReadiness(ready);assert.throws(()=>assertResumeReadiness({...ready,coveredExpectedSeq:false}));});
test('owner, restore and incomplete negative gates',()=>{for(const[k,v]of Object.entries({owner:false,contentReady:false,snapshotReady:false,incomplete:true,ready:false}))assert.throws(()=>assertResumeReadiness({...ready,[k]:v}));});
