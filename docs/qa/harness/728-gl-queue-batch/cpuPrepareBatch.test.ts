import {afterEach,expect,it,vi} from 'vitest'
import type {RibbonStrokeScratch} from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import {WatercolorSettleQueue,cpuPrepareOp,contactPulseOp,inheritSettleOpTags,diagnosticSettleOpTag} from '../../../../temp/device-runs/CpuPrepareSettleQueue'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
function fixture(){let drawing=false,now=1;const frames=new Map<number,FrameRequestCallback>();let id=0
 vi.spyOn(performance,'now').mockImplementation(()=>now)
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id))
 const sync=vi.fn(),q=new WatercolorSettleQueue({beforeStart(){},perf:()=>({settleStart:0,settleOps:0,settleMs:0}),isDrawing:()=>drawing,backlogSize:()=>0,backlogMax:()=>1,syncGpu:sync,noteActivity(){},scheduleFieldRelease(){}})
 q.diagnosticCpuPrepareBatchEnabled=true
 return{q,sync,scratch:{live:true} as RibbonStrokeScratch,advance:(ms:number)=>now+=ms,drawing:(v:boolean)=>drawing=v,frame(){const [id,fn]=[...frames][0];frames.delete(id);fn(now)}}
}
it('CPU units batch only up to four and stop before actual upload/contact',()=>{const f=fixture(),events:string[]=[];const cpu=()=>cpuPrepareOp(()=>{events.push('cpu');f.advance(2)})
 f.q.start(f.scratch,[()=>{},cpu(),cpu(),cpu(),cpu(),()=>events.push('upload'),contactPulseOp(()=>events.push('contact'))],()=>events.push('finish'))
 f.frame();expect(events).toEqual(['cpu','cpu','cpu','cpu']);expect(f.q.diagnosticCpuPrepareCounts.units).toBe(4);expect(f.sync).not.toHaveBeenCalled()
 f.frame();expect(events.at(-1)).toBe('upload');f.frame();expect(events.slice(-2)).toEqual(['contact','finish'])
})
it('active pen stops CPU admission without pretending to be a GPU pulse',()=>{const f=fixture(),events:string[]=[]
 f.q.start(f.scratch,[()=>{},cpuPrepareOp(()=>{events.push('a');f.drawing(true)}),cpuPrepareOp(()=>events.push('b'))],()=>{})
 f.frame();expect(events).toEqual(['a']);expect(f.sync).not.toHaveBeenCalled();f.q.cancel()
})
it('wrapper preserves CPU class and cancellation preserves owner lifecycle',()=>{const f=fixture(),abort=vi.fn(),finish=vi.fn(),op=cpuPrepareOp(()=>{})
 const wrapped=()=>op();inheritSettleOpTags(op,wrapped);expect(diagnosticSettleOpTag(wrapped)).toBe('cpu-prepare')
 f.q.start(f.scratch,[()=>{},wrapped],finish,{isAlive:()=>true,abort});f.q.cancel();expect(abort).toHaveBeenCalledTimes(1);expect(finish).not.toHaveBeenCalled()
})
it('OFF diagnostic still admits one CPU unit per frame',()=>{const f=fixture(),seen:string[]=[];f.q.diagnosticCpuPrepareBatchEnabled=false
 f.q.start(f.scratch,[()=>{},cpuPrepareOp(()=>seen.push('a')),cpuPrepareOp(()=>seen.push('b'))],()=>{})
 f.frame();expect(seen).toEqual(['a']);expect(f.q.diagnosticCpuPrepareCounts.units).toBe(0);f.q.cancel()
})
it('late and drawing ticks retain the original single unit policy',()=>{const f=fixture(),seen:number[]=[]
 f.q.start(f.scratch,[()=>{},()=>{},...Array.from({length:5},(_,i)=>cpuPrepareOp(()=>seen.push(i)))],()=>{})
 f.frame();f.advance(21);f.frame();expect(seen).toEqual([0]);f.drawing(true);f.frame();expect(seen).toEqual([0,1]);f.q.cancel()
})
it('actual generated plan uses the installed queue module CPU tag and no physical calls in its CPU step',async()=>{
 const {traceFixture}=await import('../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.fixture');
 const {CanonicalWatercolorSettlePlan:Original}=await import('../../../../apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan');
 const {installCpuPrepareCandidate}=await import('./installCpuPrepareCandidate.mjs');
 const f=fixture(),p=traceFixture(true,true,true,true,true),engine={_settleQueue:f.q,_settlePlan:new Original(p.context)};
 await installCpuPrepareCandidate(engine,true,process.cwd()+'/temp/device-runs');
 const plan=engine._settlePlan;const metadata={...p.scratch,brushTravel:p.scratch.brushTravel.map(d=>({...d}))};
 const job=plan.prepare(p.scratch,[{buffer:p.tile,originX:0,originY:0}],{minX:0,minY:0,maxX:p.width,maxY:p.width},.6,200,1,.8,1,.8,0,undefined,false,metadata,false)!;
 const cpu=job.ops.find(op=>diagnosticSettleOpTag(op)==='cpu-prepare');expect(cpu).toBeDefined();
 const previous=p.events.length;cpu!();expect(p.events.slice(previous)).toEqual([]);
 expect(engine._settleQueue.diagnosticCpuPrepareBatchEnabled).toBe(true);job.dispose();plan.destroyTextures();
})
