import test from'node:test';import assert from'node:assert/strict';import{runMixedLeaseUiLifecycle}from'./MixedLeaseUiLifecycle.mjs';
test('complete controller sequence handles balanced Undo count and actual Dry effect',async()=>{
 const old=globalThis.window,first={type:'stroke',id:'first'},last={type:'stroke',id:'last'};let ops=[first,last],wet=10;const clicks=[],waits=[];
 const e={getOperations:()=>ops,_layers:new Map([['L',{}]]),_paperWet:{countWet:()=>wet},_wcCanonical:{pending:false},_rebuildJobs:new Set(),_settle:null};globalThis.window={__engine:e};
 const page={evaluate:async(fn,arg)=>fn(arg),locator:selector=>({selector}),getByRole:(_,options)=>({and:locator=>({count:async()=>1,click:async()=>{
  if(options.name.test('Undo')){assert.ok(locator.selector.includes('headerIconBtn'));clicks.push('undo');ops=[first,{type:'operation_undo',id:'undo',targetOpId:'last'}];assert.equal(ops.length,2);}
  else if(options.name.test('Redo')){clicks.push('redo');ops=[first,last,{type:'operation_undo',id:'undo'},{type:'operation_redo',id:'redo'}];}
  else{assert.ok(locator.selector.includes('toolIconBtn'));clicks.push('dry');ops.push({type:'paper_dry',id:'dry'});wet=0;}
 }})}),waitForFunction:async(fn,arg)=>{assert.equal(fn(arg),true);waits.push(true)}};
 const whole=async()=>({sha:ops.filter(o=>o.type==='stroke').map(o=>o.id).join(','),width:10,height:10,nonwhite:100,glError:0,lost:false});
 try{const r=await runMixedLeaseUiLifecycle(page,{whole});assert.deepEqual(clicks,['undo','redo','dry']);assert.equal(waits.length,3);assert.equal(r.before.sha,r.redo.sha);assert.notEqual(r.before.sha,r.undo.sha);assert.equal(r.wetBeforeDry,10);assert.equal(r.wetAfterDry,0);assert.equal(window.__mixedUiPartial.phase,'complete');}finally{globalThis.window=old;}
});
