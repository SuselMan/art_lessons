import fs from 'node:fs'
import crypto from 'node:crypto'
import {chunkPlan} from './stage-transfer.mjs'
export async function transferSettleBoundaries(evaluate,out,worldROI=[402,352,78,96]){
 const records=await evaluate(()=>window.__settleBoundaryRecords)
 const roles=['inkLoad','inkColor','inkBase','colorBase','strokeInk','strokeColor','inkSettled','colorSettled','solventLoad','foreignSolventLoad']
 if(!records?.length||records.length>3)throw Error('Bounded settle records required')
 let bytes=0
 for(const r of records){if(r.skipped){if(r.stages.length)throw Error('Skipped settle has staged resources');continue}if(!r.published||r.error||r.stages.length!==2||r.stages[0].phase!=='before-prepare'||r.stages[1].phase!=='after-finish')throw Error('Incomplete settle boundary')
  if(JSON.stringify(r.stages[0].scalars)!==JSON.stringify(r.stages[1].scalars)||JSON.stringify(r.stages[0].fieldSeed)!==JSON.stringify(r.stages[1].fieldSeed))throw Error('Settle diagnostic scalars changed');for(const s of r.stages){if(JSON.stringify(s.worldROI)!==JSON.stringify(worldROI)||s.roles.map(x=>x.role).join()!==roles.join())throw Error('Settle ROI/roles changed');for(const role of s.roles){if(role.absent){if(role.byteLength!==0)throw Error('Absent settle resource has bytes');continue}if(role.byteLength!==worldROI[2]*worldROI[3]*4)throw Error('Settle field byte size changed');bytes+=role.byteLength}}
 }
 if(bytes>2*1024*1024)throw Error('Settle transfer exceeds2MiB')
 for(const r of records)for(const [si,s] of r.stages.entries())for(const role of s.roles){if(role.absent)continue;const file=`settle-${r.ordinal}-${si}-${role.role}.bin`,fd=fs.openSync(out+'/'+file,'wx'),hash=crypto.createHash('sha256');let count=0
  try{for(const c of chunkPlan(role.encodedLength)){const text=await evaluate(p=>window.__settleBoundaryPayloads.get(p.id).slice(p.offset,p.offset+p.length),{id:role.payloadId,...c});if(text.length!==c.length)throw Error('Settle payload changed');const b=Buffer.from(text,'base64');hash.update(b);count+=b.length;fs.writeSync(fd,b)}fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  if(count!==role.byteLength||hash.digest('hex')!==role.sha)throw Error('Settle payload SHA mismatch');role.file=file;await evaluate(p=>window.__settleBoundaryPayloads.delete(p),role.payloadId)
 }
 fs.writeFileSync(out+'/settle-boundaries.json',JSON.stringify(records));return{records,byteLength:bytes,scope:'Readonly same-world ROI before planner.prepare and after job.finish; no crop mass verdict'}
}
