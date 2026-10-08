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
