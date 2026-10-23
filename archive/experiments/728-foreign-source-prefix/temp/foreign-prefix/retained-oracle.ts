import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { strokeDabs } from '../../packages/shared/src/dabCodec'
import type { Operation, StrokeOperation } from '../../packages/shared/src'
import type { LogEntry } from '../../apps/web/src/engine/src/oplog/OperationLog'
import { foreignWaterSourceStart } from '../../apps/web/src/engine/src/watercolor/foreignWater'

function seed(id:string|undefined):[number,number]{if(!id)return[0,0];let a=0x811c9dc5,b=0x01000193;for(let i=0;i<id.length;i++){const c=id.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b+c+i,0x85ebca6b)>>>0}return[(a%100000)/97,(b%100000)/89]}
const ops:Operation[]=JSON.parse(fs.readFileSync('/home/suselman/projects/pencil-agents/728-clear-prefix-elision/temp/clear-prefix-gate/input.json','utf8')).ops
const histories:Array<{entries:LogEntry[];op:StrokeOperation}>=[]
const entries:LogEntry[]=[]
for(const op of ops){
 if(op.type==='operation_undo'){const target=entries.find(e=>e.op.id===op.targetOpId);if(target)target.state='undone'}
 entries.push({op,state:'done'})
 if(op.type==='stroke'&&op.wet&&[...op.wet].some(c=>c!=='0'))histories.push({entries:entries.map(e=>({...e})),op})
}
function collect(history:typeof histories[number],optimized:boolean){
 const {entries,op:cur}=history;const sources:Array<{gesture:string;footprints:unknown[];chunks:unknown[]}>=[];let calls=0,dabCount=0
 const start=optimized?foreignWaterSourceStart(entries,cur.strokeId,cur.layerId):0
 for(let i=start;i<entries.length;i++){
  const e=entries[i],op=e.op
  if(cur.strokeId&&op.type==='stroke'&&op.strokeId===cur.strokeId)break
  if(e.state!=='done')continue
  if(op.type==='paper_dry'||op.type==='layer_clear'&&op.layerId===cur.layerId)sources.length=0
  if(op.type!=='stroke'||op.tool!=='watercolor'||op.layerId!==cur.layerId||op.washId===cur.washId||cur.timestamp-op.timestamp>120000||cur.timestamp<op.timestamp)continue
  // All retained presets are normal well-formed; matches watercolorMixFromPreset.
  if(Number(op.preset.split(':')[1])/100<0.5)continue
  const gesture=op.strokeId??op.id;let source=sources.find(s=>s.gesture===gesture)
  if(!source){source={gesture,footprints:[],chunks:[]};sources.push(source)}
  const dabs=strokeDabs(op);calls++;dabCount+=dabs.length
  source.chunks.push({id:op.id,preset:op.preset,color:op.color,dabs,wet:op.wet,seed:seed(op.strokeId)})
  // Identical footprint arithmetic; scalar multiplier1 held equal in both arms.
  for(const d of dabs)source.footprints.push({x:d.x,y:d.y,radius:d.size*0.5,aspect:Math.max(1,d.aspectRatio),angle:d.angle})
 }
 return{sources,calls,dabCount}
}
let oldCalls=0,newCalls=0,oldDabs=0,newDabs=0
for(const h of histories){const old=collect(h,false),next=collect(h,true);if(JSON.stringify(old.sources)!==JSON.stringify(next.sources))throw Error('source mismatch seq'+h.op.seq);oldCalls+=old.calls;newCalls+=next.calls;oldDabs+=old.dabCount;newDabs+=next.dabCount}
function bench(optimized:boolean){const start=performance.now();for(const h of histories)collect(h,optimized);return performance.now()-start}
for(let i=0;i<3;i++){bench(false);bench(true)}const samples=[];for(let i=0;i<12;i++){const onFirst=i%2===0;const first=bench(onFirst),second=bench(!onFirst);samples.push({old:onFirst?second:first,next:onFirst?first:second})}
const median=(values:number[])=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]
const result={scope:'CPU actual retained47 initial append histories/wet gate/real packed decoder; old forward collector exact vs skip-prefix; no GPU or Room load claim; footprint size multiplier same1; chunks include original deterministic seed arithmetic',histories:histories.length,oldCalls,newCalls,oldDabs,newDabs,exact:true,oldMedian:median(samples.map(s=>s.old)),newMedian:median(samples.map(s=>s.next)),samples}
fs.writeFileSync('temp/foreign-prefix/retained-oracle-report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
