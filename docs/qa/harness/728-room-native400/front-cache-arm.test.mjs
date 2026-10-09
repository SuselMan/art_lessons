import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installFrontCacheArm} from './front-cache-arm.mjs'
test('exact owned OFF/ON flag, original return/args and restoration',()=>{for(const enabled of [false,true]){class Adapter{diagnosticStaticFrontCache=false;waterFrontStep(...args){return{args,enabled:this.diagnosticStaticFrontCache}}}const prior=Adapter.prototype.waterFrontStep,a=new Adapter(),hook=installFrontCacheArm(Adapter,enabled,true);try{assert.deepEqual(a.waterFrontStep(1,2),{args:[1,2],enabled})}finally{hook.restore()}assert.equal(a.diagnosticStaticFrontCache,false);assert.equal(Adapter.prototype.waterFrontStep,prior)}})
test('unrelated variants and failed original producer remain fail closed and restorable',()=>{class Adapter{diagnosticStaticFrontCache=false;waterFrontStep(){throw Error('original')}}const prior=Adapter.prototype.waterFrontStep,a=new Adapter(),hook=installFrontCacheArm(Adapter,true,true);try{assert.throws(()=>a.waterFrontStep(),/original/);a.diagnosticLazyFrontClimb=true;assert.throws(()=>a.waterFrontStep(),/variants/)}finally{hook.restore()}assert.equal(Adapter.prototype.waterFrontStep,prior);assert.equal(a.diagnosticStaticFrontCache,false)})
test('factor arm is separately explicit and restores prior owner value',()=>{
 class Adapter{diagnosticStaticFrontCache=false;diagnosticStaticFrontCacheFactor=false;waterFrontStep(){return 7}}
 const hook=installFrontCacheArm(Adapter,true,true,false,true),a=new Adapter();assert.equal(a.waterFrontStep(),7);assert.equal(a.diagnosticStaticFrontCacheFactor,true);hook.restore();assert.equal(a.diagnosticStaticFrontCacheFactor,false)
 assert.throws(()=>installFrontCacheArm(Adapter,false,true,false,true));assert.throws(()=>installFrontCacheArm(Adapter,true,true,true,true))
})
