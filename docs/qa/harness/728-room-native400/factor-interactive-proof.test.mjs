import {test} from 'node:test';import assert from 'node:assert/strict';import {assertFactorInteractiveObserved} from './factor-interactive-proof.mjs'
const sha='a'.repeat(64)
function fixture(){return{c:{actualObservedEnabled:true,observedFields:[{kind:'waterFront',completed:true,hits:0},{kind:'diffuse',completed:true,hits:1}]},r:{cache:{prep:2,hits:478,fallbacks:0,retainedBytes:0,cleanupFailures:0},paired:true,pairedCalls:210,film:false,filmVariants:[],factor:true,factorVariants:[{staticCache:true,encoded:480,shaderBytes:4500,shaderSHA:sha}]}}}
test('interactive factor has actual SHA/exact two-plan counts, unchanged paired/cache and original scheduler',()=>{const {c,r}=fixture();assert.equal(assertFactorInteractiveObserved(c,r,sha).encoded,480);for(const mutate of [(c,r)=>r.factor=false,(c,r)=>r.factorVariants[0].encoded=432,(c,r)=>r.factorVariants[0].shaderSHA='b'.repeat(64),(c,r)=>r.cache.fallbacks=1,(c,r)=>r.cache.retainedBytes=18,(c,r)=>r.cache.hits=430,(c,r)=>r.film=true,(c,r)=>r.pairedCalls=211,(c,r)=>c.observedFields[0].hits=1]){const f=fixture();mutate(f.c,f.r);assert.throws(()=>assertFactorInteractiveObserved(f.c,f.r,sha))}})
import {spawnSync} from 'node:child_process'
test('actual controller mode admits only complete flag set before required-resource gate, with no TDZ',()=>{
 const base={PATH:process.env.PATH,QA_NATIVE_FACTOR:'1',QA_NATIVE_COMBINED:'1',QA_NATIVE_SCHEDULING_OBSERVER:'1',QA_INTERACTIVE_MARKERS:'1',QA_SOURCE_PRECOMPILE:'1',QA_ACTUAL_OBSERVED_FIELDS:'1',QA_ACTUAL_ASYNC_PRESSURE:'1',QA_CARRY_HARDWARE_PRESSURE:'1',QA_SCENARIO:'water-pigment400-long'}
 const run=env=>spawnSync(process.execPath,['docs/qa/harness/728-room-native400/controller.mjs'],{env,encoding:'utf8',timeout:5000})
 const good=run(base);assert.equal(good.status,1);assert.match(good.stderr,/Explicit trusted QA_ENTRY_FILE/);assert.doesNotMatch(good.stderr,/Cannot access .* before initialization/)
 const bad=run({...base,QA_NATIVE_COMBINED:'0'});assert.match(bad.stderr,/Factor requires proved combined/)
})
