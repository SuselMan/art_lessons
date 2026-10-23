import {it,expect,vi} from 'vitest'
import fs from 'node:fs'
import {createTestEngine,paperReady} from '../../apps/web/src/engine/testing/engineTestUtils'
it('describes actual retained heavy wash Plan, without GPU',async()=>{
 const {engine}=createTestEngine({paper:'medium',pageWidth:3508,pageHeight:2480}, {width:3508,height:2480});const e=engine as any
 await paperReady(engine);vi.spyOn(e.gl,"drawArrays").mockImplementation(()=>{})
 const all=JSON.parse(fs.readFileSync('/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json','utf8'))
 const jobs:any[]=[];const original=e._settlePlan.prepare.bind(e._settlePlan)
 vi.spyOn(e._settlePlan,'prepare').mockImplementation((...args:any[])=>{const job=original(...args);if(job)jobs.push({bounds:args[2],field:e._fieldCache.map((f:any)=>({w:f.w,h:f.h})),count:job.ops.length,ops:job.ops.map((op:any,i:number)=>({i,source:String(op)}))});return job})
 const layer=all.at(-1).layerId;engine.appendOperation({type:'layer_add',id:'descriptor-layer',userId:'cpu',timestamp:0,layerId:layer,name:'CPU retained',opacity:1,blendMode:'normal'})
 engine.suspendDisplay();for(const raw of all.filter((o:any)=>o.seq>=45)){const o=structuredClone(raw);delete o.seq;engine.appendOperation(o);e._completeSettle();e._flushOpQueue()}
 fs.writeFileSync('/home/suselman/projects/pencil-agents/728-firstload-sync/temp/surface-unit/heavy-descriptors.json',JSON.stringify({scope:'MockGL operator descriptor only; not pixels or GPU',jobs},null,2));expect(jobs.length).toBeGreaterThan(0);engine.destroy()
},30000)
