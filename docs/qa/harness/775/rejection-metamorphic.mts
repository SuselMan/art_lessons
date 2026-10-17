// QA-only. Candidate is imported read-only from the agent's isolated worktree.
// Oracle never invokes rejectPending/confirm/absorbHistorical: it folds only
// accepted server events from scratch. It shares accepted-event folding, not rejection logic.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
const candidate=process.env.QA_CANDIDATE_WT??'/home/suselman/projects/pencil-agents/744-open-wet-undo-cache'
const fingerprint=()=>Object.fromEntries(['OperationLog.ts','controlHistory.ts','watercolorUndo.ts'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(candidate,'apps/web/src/engine/src/oplog',name))).digest('hex')]))
const beforeSource=fingerprint()
const {OperationLog}=await import(path.join(candidate,'apps/web/src/engine/src/oplog/OperationLog.ts'))
type OperationLog=InstanceType<typeof OperationLog>
import type {Operation} from '@grafetto/shared'
type E={op:Operation,state:'done'|'undone'|'gone',goneReason?:'branch'|'revoke'}
const output=process.env.QA_FUZZ_OUTPUT
if(!output)throw Error('QA_FUZZ_OUTPUT required')
fs.mkdirSync(output,{recursive:true})
const stroke=(id:string,userId:string,n:number):Operation=>({id,type:'stroke',userId,layerId:'L',strokeId:id,washId:'m70:L',tool:'watercolor',preset:n%5===0?'normal:100:0:PB29:round:wc@m70-r2-v1':'normal:80:60:PB29:round:wc@m70-r2-v1',color:[.1,.3,.8],opacity:1,timestamp:1000+n,dabs:[{x:8+n%3,y:8,size:8,opacity:1,pressure:.75,angle:0,aspect:1,hardness:1}]} as Operation)
const meta=(id:string,type:'operation_undo'|'operation_redo'|'operation_revoke',targetOpId:string,userId='A'):Operation=>({id,type,targetOpId,userId,timestamp:1100})
function authoritative(base:E[],accepted:Operation[]){
 const log=new OperationLog();if(base.length)log.prependHistorical(base.map(x=>({...x,serverSeq:x.op.seq})))
 for(const op of accepted){log.append(op,{serverSeq:op.seq},false);if(op.type==='operation_undo')log.applyUndo(op.targetOpId,op.userId);else if(op.type==='operation_redo')log.applyRedo(op.targetOpId,op.userId);else if(op.type==='operation_revoke')log.revoke(op.targetOpId)}return log
}
const projection=(l:OperationLog)=>l.watercolorEffectiveOperations().map(op=>[op.id,op.type==='stroke'?op.preset:op.type])
const states=(l:OperationLog,ids:Set<string>)=>l.entries.filter(e=>ids.has(e.op.id)).map(e=>[e.op.id,e.state,e.goneReason??null])
let checks=0
for(const partial of [false,true])for(let seed=1;seed<=120;seed++){
 let rng=seed;const rnd=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296}
 const a={...stroke('base-a','A',0),seq:1},base:E[]=partial?[{op:a,state:'undone'}]:[],accepted:Operation[]=partial?[]:[a],log=authoritative(base,accepted),trace:unknown[]=[];let seq=1
 const compare=(phase:string)=>{const oracle=authoritative(base,accepted),ids=new Set([...base.map(e=>e.op.id),...accepted.map(e=>e.id)]);try{assert.deepEqual(states(log,ids),states(oracle,ids));assert.deepEqual(projection(log),projection(oracle));for(const cutoff of [2,Math.max(2,log.entries.length-1)]){const prefix=log.historicalPrefix(cutoff);assert.equal(prefix.pixelOpDoneCount('L'),prefix.layerPixelOps('L').length)}}catch(error){fs.writeFileSync(output+'/failure.json',JSON.stringify({partial,seed,phase,trace,actual:states(log,ids),expected:states(oracle,ids),actualWater:projection(log),expectedWater:projection(oracle),error:String(error)},null,2));throw Error(`seed${seed} partial${partial} ${phase}: ${String(error)}`)}checks++}
 for(let n=0;n<24;n++){
  const oracle=authoritative(base,accepted),choice=rnd(),target=choice<.3?oracle.undoTarget('A'):choice<.52?oracle.redoTarget('A'):null,id=`s${seed}-${n}`
  const op=target?meta(id,choice<.3?'operation_undo':'operation_redo',target.id):stroke(id,'A',n+1)
  log.append(op,{pending:true},false);if(op.type==='operation_undo')log.applyUndo(op.targetOpId,'A');if(op.type==='operation_redo')log.applyRedo(op.targetOpId,'A');trace.push({event:'optimistic',op})
  if(rnd()<.3){const remote={...stroke(id+'-remote','B',n+1),seq:++seq};accepted.push(remote);log.append(remote,{serverSeq:remote.seq},false);trace.push({event:'remote',op:remote})}
  if(rnd()<.45){log.rejectPending(id);trace.push({event:'reject',id});compare('rejected');if(rnd()<.2){const late={...op,seq:++seq};accepted.push(late);log.confirm(id,late.seq!);trace.push({event:'late-accept',op:late});compare('late-accepted')}}
  else{const confirmed={...op,seq:++seq};accepted.push(confirmed);log.confirm(id,confirmed.seq!);trace.push({event:'accept',op:confirmed});compare('accepted')}
  // Duplicate authoritative hydration exercises metadata recovery with no new IDs.
  if(rnd()<.2&&accepted.length){const page=accepted.slice(-2);log.absorbHistorical(page);trace.push({event:'backfill',ids:page.map(x=>x.id)});compare('backfill')}
 }
}
const afterSource=fingerprint();assert.deepEqual(afterSource,beforeSource,'Candidate source changed during run; retry immutable READY snapshot')
fs.writeFileSync(output+'/summary.json',JSON.stringify({pass:true,source:beforeSource,harnessSHA:crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),seedRange:[1,120],modes:['fullhistory','partiallegacyundone'],seeds:240,localActions:5760,checks,scope:'OperationLog state/effectivewater; no GPU/pixel claim; authoritative-only fresh journal oracle; partial legacy separately'},null,2));console.log(JSON.stringify({pass:true,checks}))
