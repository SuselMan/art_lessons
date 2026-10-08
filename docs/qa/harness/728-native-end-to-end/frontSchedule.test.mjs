import{test}from'node:test'
import assert from'node:assert/strict'
import{firstOutboundSchedule}from'./frontSchedule.mjs'
test('retains complete actual141 alternating steps and rejects branch mixing',()=>{
 let i=0;const trace={ops:[]}
 for(let op=3;op<=38;op++){const events=[];for(let n=0;n<(op===38?1:4);n++,i++)events.push(['front',{w:1536,h:1536},0,40,50,{buffer:i%2?1:2},{buffer:i%2?2:1},104,30,.85,1,1,null]);if(op===38)events.push(['fieldOp',{buffer:2},{buffer:1},{buffer:1},1,0]);trace.ops.push({index:op,events})}
 assert.equal(firstOutboundSchedule(trace).steps,141)
 trace.ops[10].events[0][8]=15;assert.throws(()=>firstOutboundSchedule(trace),/changed/)
})

test('inward two plus nine phases retain Q8 order and reject phase substitution',async()=>{
 const{firstInwardSchedule}=await import('./frontSchedule.mjs');let i=0;const trace={ops:[]}
 for(let op=40;op<=43;op++){const events=[];for(let n=0;n<({40:2,41:4,42:4,43:1}[op]);n++,i++)events.push(['front',{w:1536,h:1536},0,40,50,{buffer:i%2?1:2},{buffer:i%2?2:1},12,i<2?0:15,i<2?1:.5,1,1,null]);if(op===43)events.push(['fieldOp',{buffer:2},{buffer:1},{buffer:1},1,0]);trace.ops.push({index:op,events})}
 assert.equal(firstInwardSchedule(trace).steps,11);trace.ops[0].events[1][8]=15;assert.throws(()=>firstInwardSchedule(trace),/changed/)
})
