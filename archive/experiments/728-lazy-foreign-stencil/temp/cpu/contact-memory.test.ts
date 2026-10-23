import { it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { brushDragContactGroups, brushDragContacts } from '../../apps/web/src/engine/src/watercolor/brushDrag'
import { brushDragFieldWork } from '../../apps/web/src/engine/src/watercolor/brushDragFieldWork'
it('measures real captured packed1396 contact bytes and descriptor cost',()=>{
 const input=JSON.parse(readFileSync('temp/cpu/prepare-geometry.json','utf8')), results=[]
 for(const fixture of input.geometry){
  const rect=input.rects.find(x=>x.seq===fixture.seq).rect
  const t=performance.now(), groups=brushDragContactGroups(fixture.brushTravel,rect), descriptorsMs=performance.now()-t
  const t1=performance.now(), eager=brushDragContacts(fixture.brushTravel,rect), eagerMs=performance.now()-t1
  let totalBytes=0, peakBytes=0, checkpoints=0,maxNextMs=0
  for(let i=0;i<groups.length;i++){
   const work=brushDragFieldWork(groups[i].travel,groups[i].rect);let result
   do{const a=performance.now();result=work.next();maxNextMs=Math.max(maxNextMs,performance.now()-a);checkpoints++}while(!result.done)
   expect(Buffer.from(result.value!.pixels).equals(Buffer.from(eager[i].field.pixels))).toBe(true)
   totalBytes+=result.value!.pixels.byteLength;peakBytes=Math.max(peakBytes,result.value!.pixels.byteLength)
  }
  results.push({seq:fixture.seq,travel:fixture.brushTravel.length,groups:groups.length,descriptorsMs,eagerMs,totalUploadBytes:totalBytes,largestPayloadBytes:peakBytes,oldClosureRetainedBytes:totalBytes,newPendingPayloadBoundBytes:peakBytes,checkpoints,maxNextMs,fieldsSHA:eager.map(c=>createHash('sha256').update(c.field.pixels).digest('hex'))})
 }
 writeFileSync('temp/cpu/contact-memory.json',JSON.stringify({scope:'CPU Node real captured geometry; bytes/reference bound, not browser GC latency or GPU budget',inputSHA:input.inputSHA,results},null,2))
},60000)
