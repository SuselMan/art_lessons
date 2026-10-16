import {performance} from 'node:perf_hooks'
import {writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
const {OperationLog}=await import(pathToFileURL(process.cwd()+'/apps/web/src/engine/src/oplog/OperationLog.ts'))
const mode=process.argv[2]??'baseline'
function scene(count,layout){
 const log=new OperationLog()
 for(let i=0;i<count;i++){
  const x=layout==='disjoint'?i*100:(i%20)*8,y=layout==='disjoint'?0:Math.floor(i/20)%4*8
  const dabs=Array.from({length:24},(_,j)=>({x:x+j*2,y:y+(j%4),size:14,aspectRatio:1,angle:0,opacity:.65,pressure:.8,tiltX:0,tiltY:0,t:j*8}))
  log.append({id:'s'+i,type:'stroke',strokeId:'g'+i,washId:'m70:L',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',userId:i%2?'A':'B',timestamp:10000+i*12,layerId:'L',color:[.1,.2,.3],dabs},{serverSeq:i+1})
 }
 return log
}
function undo(log,i){
 const author=i%2?'A':'B',target=log.undoTarget(author)
 const meta={id:'undo'+i,type:'operation_undo',targetOpId:target.id,userId:author,timestamp:100000+i,seq:log.entries.length+1}
 log.append(meta,{serverSeq:meta.seq});log.applyUndo(target.id,author)
}
function pct(a,q){return [...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))]}
function run(count,layout,iterations=30){
 const log=scene(count,layout),times=[]
 const heapBefore=process.memoryUsage().heapUsed
 for(let i=0;i<iterations;i++){undo(log,i);const t=performance.now();log.layerPixelOps('L');times.push(performance.now()-t)}
 const t=performance.now();for(let i=0;i<100;i++)log.layerPixelOps('L');const cachedReads100Ms=performance.now()-t
 const coldEntries=log.entries.map(e=>({...e})),coldStart=performance.now()
 const {effectiveWatercolorOperations}=globalThis.helper
 const cold=effectiveWatercolorOperations(coldEntries)
 const coldHistoricalMs=performance.now()-coldStart
 return {count,layout,dabsPerStroke:24,iterations,firstUndoMs:times[0],repeatedUndoMedianMs:pct(times.slice(1),.5),repeatedUndoP95Ms:pct(times.slice(1),.95),cachedReads100Ms,coldHistoricalMs,heapDeltaBytes:process.memoryUsage().heapUsed-heapBefore,materialCount:cold.filter(o=>o.type==='stroke').length,times}
}
globalThis.helper=await import(pathToFileURL(process.cwd()+'/apps/web/src/engine/src/oplog/watercolorUndo.ts'))
run(40,'connected',3)
const rows=[]
for(const count of [100,800])for(const layout of ['connected','disjoint']){const r=run(count,layout);rows.push(r);console.log(JSON.stringify(r))}
writeFileSync('temp/wc-runs/undo-cpu-profile-20261017/'+mode+'.json',JSON.stringify({mode,node:process.version,rows},null,2))
