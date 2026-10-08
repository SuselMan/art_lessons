import{test}from'node:test';import assert from'node:assert/strict';import{validateSourceProvenance,retainGateResult}from'./controllerGuards.mjs';
test('mismatched expected source aborts before following owned-target admission',()=>{let targetCreates=0;assert.throws(()=>{validateSourceProvenance('wrong',{code:'actual'});targetCreates++});assert.equal(targetCreates,0);validateSourceProvenance('actual',{code:'actual'})});
test('returned result survives subsequent source validation rejection',()=>{const report={code:'expected',rows:[]},result={code:'other',oracle:{rows:[{index:44}]}};let persisted;assert.throws(()=>retainGateResult(report,{report:result},()=>{persisted=JSON.parse(JSON.stringify(report))},'source'));assert.deepEqual(persisted.rows[0].report,result);assert.equal(report.rows.length,1)});

import vm from 'node:vm'
import {invokeGate} from './controllerGuards.mjs'
test('serialized page invocation has no outer api capture for each actual gate',async()=>{
 for(const [api,name]of [['source','runSourceCoverage'],['contribution','runSourceContribution'],['endToEnd','runEndToEnd'],['brushFlow','runPreBrush68FlowControl'],['brushChain','runBrush14Chain'],['brushNative','runPreBrush68NativeGate'],['preBrush','runPreBrush68Gate'],['pressure','runPressureSeedOracle']]){
  const options={substitutions:[44]},fn=vm.runInNewContext('('+invokeGate.toString()+')',{window:{[name]:received=>({name,received})}})
  const result=await fn({api,options});assert.equal(result.name,name);assert.equal(result.received,options)
 }
})
