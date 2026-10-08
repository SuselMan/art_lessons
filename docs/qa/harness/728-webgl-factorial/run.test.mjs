import {test} from 'node:test'
import assert from 'node:assert/strict'
import {compareFields} from './run.mjs'
const fields=()=>({records:[{key:'P',role:'pigment',width:2,height:2,channels:4,byteLength:16,nonzero:1,max:1,sum:1,sha256:'abc'}],coverage:{nonemptyRequiredRoles:true}})
test('strict actual field gate rejects bytehash/shape/empty changes',()=>{
 assert.equal(compareFields(fields(),fields()).valid,true)
 for(const key of ['sha256','width','sum']){const b=fields();b.records[0][key]='changed';assert.equal(compareFields(fields(),b).valid,false)}
 const b=fields();b.coverage.nonemptyRequiredRoles=false;assert.equal(compareFields(fields(),b).valid,false)
 assert.equal(compareFields(undefined,undefined).valid,false)
})
