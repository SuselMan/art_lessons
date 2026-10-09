import test from 'node:test'
import assert from 'node:assert/strict'
import {summarizeCpuProfile} from './profile.mjs'
test('exclusive sample attribution keeps call graph and time units',()=>{const result=summarizeCpuProfile({startTime:100,endTime:3100,nodes:[{id:1,callFrame:{functionName:'root',url:'',lineNumber:-1},children:[2]},{id:2,callFrame:{functionName:'work',url:'work.js',lineNumber:4}}],samples:[2,1,2],timeDeltas:[1000,500,1500]});assert.equal(result.sampledMs,3);assert.equal(result.topExclusive[0].function,'work');assert.equal(result.topExclusive[0].exclusiveMs,2.5);assert.equal(result.topExclusive[0].line,5);assert.deepEqual(result.nodes[0].children,[2])})
test('malformed profiles fail instead of silently reporting attribution',()=>{assert.throws(()=>summarizeCpuProfile({nodes:[],samples:[1],timeDeltas:[]}));assert.throws(()=>summarizeCpuProfile({nodes:[],samples:[1],timeDeltas:[2]}))})
