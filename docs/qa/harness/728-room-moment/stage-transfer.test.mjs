import test from 'node:test'
import assert from 'node:assert/strict'
import {chunkPlan,CHUNK_CHARS} from './stage-transfer.mjs'
test('bounded base64 chunks preserve Q8 binary and padding',()=>{for(const n of [0,1,3,65535,65536,368640,1048576]){const data=Buffer.alloc(n);for(let i=0;i<n;i++)data[i]=i%256;const text=data.toString('base64'),chunks=chunkPlan(text.length);assert.ok(chunks.every(c=>c.length<=CHUNK_CHARS));assert.deepEqual(Buffer.concat(chunks.map(c=>Buffer.from(text.slice(c.offset,c.offset+c.length),'base64'))),data)}for(const n of [-1,2*1024*1024+1,NaN])assert.throws(()=>chunkPlan(n))})
