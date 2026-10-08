import { writeFileSync,mkdirSync } from 'node:fs'
import { CanonicalWatercolorSettlePlan } from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan'
import { TraceBuffer,traceFixture } from '../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.fixture'
const reports=[]
for(const wet of [0,1])for(const travelCount of [0,1,10]){
 const f=traceFixture(false,false,true,false,false),entry=[...f.scratch.tileEntries()][0][1]
 let id=1000
 const make=()=>new TraceBuffer(id++,1024,1024,f.record)
 for(const [key,value] of Object.entries(entry))if(value instanceof TraceBuffer)(entry as any)[key]=make()
 const tile=make();f.scratch.peek=b=>b===tile?entry:null;f.scratch.tileEntries=function*(){yield[tile,entry]}
 f.scratch.brushTravel=Array.from({length:travelCount},(_,i)=>({x:480+i*4,y:500,radius:50,aspect:1,angle:0,dx:4,dy:0,water:1}))
 f.scratch.wetContacts=wet?[{x:500,y:500,radius:50,aspect:1,angle:0}]:[]
 const fieldFor=f.context.fieldFor;f.context.fieldFor=(w,h,c)=>fieldFor(Math.max(1536,Math.ceil(w/256)*256),Math.max(1536,Math.ceil(h/256)*256),c)
 f.context.paperWorldSize=()=>({w:1024,h:1024});f.context.shouldPreview=()=>false
 const plan=new CanonicalWatercolorSettlePlan(f.context),job=plan.prepare(f.scratch,[{buffer:tile,originX:0,originY:0,contentRect:null}],{minX:450,minY:450,maxX:570,maxY:550},.2,50,1,wet,1,wet,0)!
 for(const op of job.ops)op();job.finish();job.dispose();plan.destroyTextures()
 const counts:Record<string,number>={},modes:Record<string,number>={};let dispatchedCells=0,brushDispatched=0,brushScissor=0
 for(const e of f.events){const kind=String(e[0]);counts[kind]=(counts[kind]??0)+1
  if(kind==='fieldOp'){const out=e[1] as any;dispatchedCells+=out.w*out.h;modes[String(e[4])]=(modes[String(e[4])]??0)+1}
  if(kind==='front'||kind==='diffuse'){const field=e[1] as any;dispatchedCells+=field.w*field.h}
  if(kind==='brush'){const field=e[1] as any,scissor=e[9] as number[];brushDispatched+=field.w*field.h;brushScissor+=scissor[2]*scissor[3];dispatchedCells+=field.w*field.h}
 }
 reports.push({wet,travelCount,field:[1536,1536],counts,modes,dispatchedCells,brushDispatched,brushScissor,brushLaunchOverdraw:brushScissor?brushDispatched/brushScissor:null})
}
const report={scope:'CPU command census from actual generic planner, controlled synthetic metadata. NO GPU pixel/timing proof; NOT Samsung UI operation.',source:'5656188c + de586c95',reports}
mkdirSync('temp/native-workload',{recursive:true});writeFileSync('temp/native-workload/count.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
