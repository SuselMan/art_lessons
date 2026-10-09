import fs from 'node:fs'
import {CanonicalWatercolorSettlePlan} from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan'
import {traceFixture} from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.fixture'
const rows=[]
for(const half of [false,true])for(const film of [false,true]){
 const f=traceFixture(half,true,film,true,true),entry=f.scratch.peek(f.tile)!
 // Solvent records are real fixture buffers, not inferred eight-copy snapshot.
 entry.solventLoad=f.context.pool().acquire(f.width,f.width);entry.foreignSolventLoad=f.context.pool().acquire(f.width,f.width)
 const plan=new CanonicalWatercolorSettlePlan(f.context);plan.lazyContacts=true
 const job=plan.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0,contentRect:null}],{minX:20,minY:20,maxX:f.width-20,maxY:f.width-20},.2,half?200:8,1,1,1,1,0,undefined,false,undefined,true)!
 const names=new Map(Object.entries(entry).filter(([,v])=>v&&typeof v==='object'&&'id' in v).map(([k,v])=>[(v as any).id,k]))
 const start=f.events.length;job.ops[0]();const capture=f.events.slice(start),sources=new Map<number,{role:string;w:number;h:number}>()
 for(const event of capture){const e=event as any[];const inputs=e[0]==='region'||e[0]==='copy'?[e[1]]:e[0]==='fieldOp'?[e[2],e[3]]:e[0]==='resample'?[e[6]]:[];for(const b of inputs)if(b?.buffer)sources.set(b.buffer,{role:names.get(b.buffer)??'owned-field-or-temporary',w:b.w,h:b.h})}
 rows.push({half,film,op0SourceReadBuffers:[...sources.values()],residentTileReadRoles:[...sources.values()].filter(b=>b.role!=='owned-field-or-temporary').map(b=>b.role),bytesAt1024PerListedResidentRole:1024*1024*4,scope:'actual CPU planner op0 command reads, not GPU pixels/full Engine readset'})
 job.dispose()
}
fs.writeFileSync(new URL('./owned-lazy-readset-summary.json',import.meta.url),JSON.stringify({scope:'CPU-only actual Plan fixture capture; static Engine finish/publication supplements in report',rows},null,2)+'\n')
console.log(JSON.stringify(rows.map(r=>({half:r.half,film:r.film,roles:r.residentTileReadRoles}))))
