import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {addFirstFrontQuantum} from './preparePressureSeedInput.mjs'
test('first quantum retains four original alternating resources and rejects changed recipe',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'front-quantum-')),tracePath=path.join(dir,'trace.json')
 const e=i=>['front',{w:1536,h:1536},0,40,50,{buffer:i%2?1:2},{buffer:i%2?2:1},104,30,.85,1,1,null]
 const trace={packetSha256:'passport',ops:[{index:3,events:[0,1,2,3].map(e)}]},input={checkpointSha256:'passport',front:{stride:1}}
 try{fs.writeFileSync(tracePath,JSON.stringify(trace));assert.equal(addFirstFrontQuantum(input,{tracePath}).front.steps,4);trace.ops[0].events[2][8]=15;fs.writeFileSync(tracePath,JSON.stringify(trace));assert.throws(()=>addFirstFrontQuantum(input,{tracePath}),/changed/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
})
