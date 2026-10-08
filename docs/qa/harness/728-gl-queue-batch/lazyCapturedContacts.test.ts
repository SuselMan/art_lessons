import {expect,it} from 'vitest'
import {CanonicalWatercolorSettlePlan as Baseline} from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan'
import {CanonicalWatercolorSettlePlan as Candidate} from '../../../../temp/device-runs/CanonicalLazyContacts'
import {traceFixture} from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.fixture'
function run(on:boolean, mutate=false, metadataProvided=true, half=false, mixed=true, film=true){
 const f=traceFixture(half,mixed,film,true,true),p=on?new Candidate(f.context):new Baseline(f.context)
 const flow=f.context.uploads.uploadFlow,foreign=f.context.uploads.uploadForeign
 f.context.uploads.uploadFlow=(t,...args)=>{f.record('textureRole',['flow',t?.id]);flow(t,...args)}
 f.context.uploads.uploadForeign=(t,...args)=>{f.record('textureRole',['foreign',t?.id]);foreign(t,...args)}
 if(on)(p as Candidate<typeof f.tile,{id:number}>).diagnosticLazyCapturedContacts=true
 const metadata={...f.scratch,brushTravel:f.scratch.brushTravel.map(d=>({...d}))}
 const job=p.prepare(f.scratch,[{buffer:f.tile,originX:0,originY:0}],{minX:0,minY:0,maxX:f.width,maxY:f.width},.6,half?200:8,1,.8,1,.8,0,undefined,false,metadataProvided?metadata:undefined,false)!
 if(mutate)for(const d of metadata.brushTravel){d.dx=999;d.water=0;d.x=-999}
 for(let i=0;i<job.ops.length;i++)job.ops[i]()
 job.finish();job.dispose();p.destroyTextures()
 expect(f.events.some(e=>e[0]==='brush')).toBe(true)
 return f.events
}
function consumed(events:unknown[][]){
 const aliases=new Map(events.filter(e=>e[0]==='textureRole').map(e=>[e[2],e[1]]))
 const normalize=(v:unknown):unknown=>{if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if(Object.keys(o).length===1&&'id'in o)return{textureRole:aliases.get(o.id)??'UNBOUND'};return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,normalize(v)]))}return v}
 const physical=new Set(['front','fieldOp','brush','pigmentColor','diffuse','resample','region','clear','copy','uploadForeign'])
 const out:unknown[][]=[];let latestFlow:unknown[]|null=null
 for(const e of events){if(e[0]==='uploadFlow'||e[0]==='updateFlow')latestFlow=e.slice(1);if(physical.has(String(e[0]))){if(e[0]==='brush')out.push(['consumedFlow',latestFlow]);out.push(normalize(e) as unknown[])}}return out
}
it.each([[false,false,false],[false,true,true],[true,false,true],[true,true,false]])('cloned lazy CPU fields preserve consumed Q8 bytes/physical args half=%s mixed=%s film=%s',(half,mixed,film)=>{expect(consumed(run(true,false,true,half,mixed,film))).toEqual(consumed(run(false,false,true,half,mixed,film)))})
it('later mutations of caller travel cannot change consumed lazy fields',()=>{expect(consumed(run(true,true))).toEqual(consumed(run(false)))})
it('missing captured metadata keeps legacy path including eager upload chronology',()=>{expect(run(true,false,false)).toEqual(run(false,false,false))})
