import fs from 'node:fs'
import crypto from 'node:crypto'
export const CHUNK_CHARS=65536
export function chunkPlan(length){if(!Number.isInteger(length)||length<0||length>2*1024*1024)throw Error('Bounded stage base64 length required');return Array.from({length:Math.ceil(length/CHUNK_CHARS)},(_,i)=>({offset:i*CHUNK_CHARS,length:Math.min(CHUNK_CHARS,length-i*CHUNK_CHARS)}))}
/** Small CDP replies; one artifact/contact at a time, explicit ACK releases page strings. */
export async function transferStages(evaluate,out,{sourceOnly=false,zeroState=false,activeSnapshot=false}={}){
 const meta=await evaluate(()=>window.__momentStageResults)
 if(activeSnapshot&&(!sourceOnly||zeroState))throw Error('Explicit active snapshot source-only contract required')
 const roles=['P','C','inkBase','colorBase','strokeInk','strokeColor',...(activeSnapshot?['inkSettled','colorSettled']:[])]
 const expected=sourceOnly?(activeSnapshot||zeroState?[...roles.map(x=>'source-'+x),...roles.map(x=>'post-'+x),'presentation-after-sourcepublish']:['source-P','source-C','presentation-after-sourcepublish']):null
 if(meta.length!==3||meta.some(r=>!r.published||r.observerError||r.stages.length!==(expected?expected.length:8)||(expected&&(r.recipe!==null||r.stages.map(s=>s.stage).join(',')!==expected.join(',')))))throw Error('Incomplete bounded stage cohort')
 const bytes=meta.reduce((sum,r)=>sum+r.stages.reduce((n,s)=>n+s.byteLength,0),0)
 if(!Number.isSafeInteger(bytes)||bytes<0||bytes>(activeSnapshot?3:29)*1024*1024)throw Error('Stage binary byte budget exceeded')

 let total=0
 for(let i=0;i<meta.length;i++)for(let j=0;j<meta[i].stages.length;j++){
  const s=meta[i].stages[j],file=`stage-${i}-${j}.bin`,fd=fs.openSync(out+'/'+file,'wx'),hash=crypto.createHash('sha256');let bytes=0
  try{for(const chunk of chunkPlan(s.encodedLength)){const text=await evaluate(p=>window.__momentStagePayloads.get(p.payloadId).slice(p.offset,p.offset+p.length),{payloadId:s.payloadId,...chunk});if(text.length!==chunk.length)throw Error('Stage chunk length changed');const block=Buffer.from(text,'base64');hash.update(block);fs.writeSync(fd,block);bytes+=block.length}fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  if(bytes!==s.byteLength||hash.digest('hex')!==s.sha)throw Error('Bounded binary stage SHA mismatch')
  total+=bytes;s.file=file;await evaluate(p=>{return window.__momentStagePayloads.delete(p.payloadId)},{payloadId:s.payloadId})
 }
 fs.writeFileSync(out+'/moment-stages.json',JSON.stringify(meta));return{meta,byteLength:total,chunkChars:CHUNK_CHARS,scope:'Binary chunked CDP transfer, no numeric arrays; sequential release ACK'}
}
