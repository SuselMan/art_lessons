import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assertFactorObservedConsumed} from './factor-consumption-proof.mjs'
const sha='a'.repeat(64)
function fixture(){return{c:{actualObservedEnabled:true,observedFields:[{kind:'waterFront',completed:true,hits:0},{kind:'diffuse',completed:true,hits:1}]},r:[0,1].map(i=>({frontCacheFactor:true,frontFilmHoist:false,cache:{fallbacks:0},factorVariant:[{staticCache:true,shaderSHA:sha,shaderBytes:9000,encoded:240*(i+1)}]}))}}
test('actual factor variant requires exactly all 240 cached front dispatches each operation',()=>{const {c,r}=fixture();assert.equal(assertFactorObservedConsumed(c,r,sha).encodedFirstJob,240);for(const mutate of [(c,r)=>c.observedFields[0].hits=1,(c,r)=>r[1].factorVariant[0].encoded=432,(c,r)=>r[0].factorVariant[0].shaderSHA='b'.repeat(64),(c,r)=>r[0].factorVariant[0].staticCache=false,(c,r)=>r[1].factorVariant.push({...r[1].factorVariant[0]}),(c,r)=>r[0].frontFilmHoist=true,(c,r)=>r[0].cache.fallbacks=1]){const f=fixture();mutate(f.c,f.r);assert.throws(()=>assertFactorObservedConsumed(f.c,f.r,sha))}})
