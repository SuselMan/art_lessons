import fs from 'node:fs'
import crypto from 'node:crypto'
export const CHUNK_CHARS=65536
export function chunkPlan(length){if(!Number.isInteger(length)||length<0||length>2*1024*1024)throw Error('Bounded stage base64 length required');return Array.from({length:Math.ceil(length/CHUNK_CHARS)},(_,i)=>({offset:i*CHUNK_CHARS,length:Math.min(CHUNK_CHARS,length-i*CHUNK_CHARS)}))}
/** Small CDP replies; one artifact/contact at a time, explicit ACK releases page strings. */
export async function transferStages(evaluate,out){
 const meta=await evaluate(()=>window.__momentStageResults.map(r=>({...r,stages:r.stages.map(({base64,...s})=>({...s,encodedLength:base64.length}))})))
 if(meta.length!==3||meta.some(r=>!r.published||r.observerError||r.stages.length!==8))throw Error('Incomplete bounded stage cohort')
 let total=0
 for(let i=0;i<meta.length;i++)for(let j=0;j<meta[i].stages.length;j++){
  const s=meta[i].stages[j],file=`stage-${i}-${j}.bin`,fd=fs.openSync(out+'/'+file,'wx'),hash=crypto.createHash('sha256');let bytes=0
  try{for(const chunk of chunkPlan(s.encodedLength)){const text=await evaluate(p=>window.__momentStageResults[p.i].stages[p.j].base64.slice(p.offset,p.offset+p.length),{i,j,...chunk});if(text.length!==chunk.length)throw Error('Stage chunk length changed');const block=Buffer.from(text,'base64');hash.update(block);fs.writeSync(fd,block);bytes+=block.length}}finally{fs.closeSync(fd)}
  if(bytes!==s.byteLength||hash.digest('hex')!==s.sha)throw Error('Bounded binary stage SHA mismatch')
  total+=bytes;s.file=file;await evaluate(p=>{delete window.__momentStageResults[p.i].stages[p.j].base64;return true},{i,j})
 }
 fs.writeFileSync(out+'/moment-stages.json',JSON.stringify(meta));return{meta,byteLength:total,chunkChars:CHUNK_CHARS,scope:'Binary chunked CDP transfer, no numeric arrays; sequential release ACK'}
}
