import {it,expect,vi} from 'vitest'
const q=vi.hoisted(()=>({raw:null as any,events:[] as string[],active:false,mode:'okay',solver:null as any,coverage:null as any}))
vi.mock('./PagedPuddleSource',()=>({capturePagedPuddleSource:()=>q.raw,restorePagedPuddleWindow(){},createDetachedPagedPuddleWindow(){return {width:1536,height:1536}}}))
vi.mock('./M70WindowGroups',()=>({m70WindowGroups:()=>{q.events.push('halo.plan');return[{field:{x:0,y:0,width:1536,height:1536},cores:[{x:0,y:0,width:1,height:1}]}]}}))
vi.mock('../../buffers/RibbonStrokeScratch',()=>({RibbonStrokeScratch:class{paints=new Set();noteFinish(){}compositeScalars(f:any){return f()}noteDirection(){return[0,0]}destroy(){q.events.push('source.destroy')}}}))
vi.mock('./PuddleTarget',()=>({createNativePuddleTarget(){const state={done:false};return{state,resetFromScratch(){q.events.push('reset:'+q.active);if(q.mode==='resetThrow')throw Error('reset fail')},step(){q.events.push('step:'+q.active);if(q.mode==='stepThrow')throw Error('step fail');if(q.mode==='cancelInside')q.solver.cancel();state.done=true},buffers(){const plane={readPixelsRegion:()=>{q.events.push('read');return new Uint8Array(4)}};return{p:plane,c:plane,coverage:{readPixelsRegion(){throw Error('Redundant coverage GPU read')}}}},destroy(){q.events.push('native.destroy')}}}}))
vi.mock('./PagedContrastPhase',()=>({createPagedContrastPhase:()=>({prepare(){},renderReference(){},destroy(){}})}))
vi.mock('./PagedBackgroundMix',()=>({createPagedBackgroundMix:()=>({reconstructionHalo:0,reconstruct(_rect:any,p:any,c:any,_cov:any,rp:any,rc:any){p.copyTo(rp);c.copyTo(rc)},capture(){},prepareSolved(){},readback(){return{}},destroy(){}})}))
import {createPagedPuddleTarget,type PagedNativeScopeFactory} from './PagedPuddleTarget'
import {MaterialFieldPages} from './MaterialFieldPages'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {MockGL} from '../../../testing/mockGL'
function fixture(mode='okay',enabled=true,disposeThrow=false,foreignSources:unknown=null,diagnostics:Record<string,unknown>={}){q.events=[];q.active=false;q.coverage=null;q.mode=mode;const gl=new MockGL() as unknown as WebGLRenderingContext,raw=new MaterialFieldPages({width:1,height:1});q.raw=Object.fromEntries(['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad','water'].map(k=>[k,raw.snapshot()]));q.raw.materialSupport={width:1,height:1,rect:null,rects:[],noForeignStencil:true};let proof:any;const factory:PagedNativeScopeFactory=(_host,rect,value)=>{q.events.push('factory');proof=value;expect(rect).toEqual({x:0,y:-1535,width:1536,height:1536});expect(value.support).not.toBe(q.raw.materialSupport);if(mode==='undefined')return undefined;return{run(work){q.active=true;try{return work()}finally{q.active=false;q.events.push('leave')}},dispose(){q.events.push('scope.dispose');if(disposeThrow)throw Error('dispose fail')}}};const solver=createPagedPuddleTarget({gl,pool:{},passes:{},settlePlan:{}} as any,{width:1,height:1},(w,h,f)=>new AccumulationBuffer(gl,w,h,f),{solved:(_p,_c,coverage)=>{q.coverage=coverage;q.events.push('published')},detachedWindowSource:true,nativeScope:enabled?factory:undefined,...diagnostics});q.solver=solver;const source={foreignSources,finishContext:{},paints:new Set(),captureFinishMetadata:()=>({foreignSources,wetContacts:[],brushTravel:[]}),compositeScalars:(f:any)=>f(),noteDirection:()=>[0,0]} as any;solver.resetFromScratch(source,{allResident:()=>[]} as any,7);return{solver,gl,source,proof:()=>proof}}
function untilNative(solver:any){for(let i=0;i<8&&!q.events.some(e=>e.startsWith('step:'));i++)solver.step(1)}

const expected=['capture-start','capture-done','solve-admitted','reference-done','windows-done','postphase-done','output-ready']
function drain(solver:any){for(let i=0;i<30&&!solver.state.done;i++)solver.step(1);expect(solver.state.done).toBe(true)}
it('reports all stage boundaries in epoch order before done, with unchanged default scheduling',()=>{
 const events:any[]=[],release=vi.fn(),{solver}=fixture('okay',false,false,null,{sourceCaptured:()=>({release}),diagnosticMetrics:(event:any)=>events.push(event)})
 try{drain(solver);const stages=events.filter(e=>e.kind==='stage');expect(stages.map(e=>e.stage)).toEqual(expected);expect(stages.every(e=>e.epoch===7&&Number.isFinite(e.atHostMs))).toBe(true);expect(stages.map(e=>e.atHostMs)).toEqual(stages.map(e=>e.atHostMs).sort((a,b)=>a-b));expect(release).toHaveBeenCalledOnce();expect(events.findIndex(e=>e.kind==='plan')).toBeGreaterThan(events.findIndex(e=>e.stage==='reference-done'));expect(events.findIndex(e=>e.stage==='windows-done')).toBeGreaterThan(events.findIndex(e=>e.kind==='window'))}finally{solver.destroy()}
})
it.each(expected)('throw at stage %s releases admitted lease and cannot leave a suspended job',stage=>{
 const release=vi.fn(),events:string[]=[],{solver}=fixture('okay',false,false,null,{sourceCaptured:()=>({release}),diagnosticMetrics:(event:any)=>{if(event.kind==='stage'){events.push(event.stage);if(event.stage===stage)throw Error('stage observer fault')}}})
 expect(()=>drain(solver)).toThrow('stage observer fault');expect(solver.state.done).toBe(true);expect(events.at(-1)).toBe(stage);expect(release).toHaveBeenCalledTimes(expected.indexOf(stage)>=2?1:0);solver.destroy();expect(release).toHaveBeenCalledTimes(expected.indexOf(stage)>=2?1:0)
 if(expected.indexOf(stage)>=4)expect(q.events.filter(e=>e==='native.destroy')).toHaveLength(1)
})
it('cancel at a yielded window never reports windows/post/output done and releases the lease',()=>{
 const events:any[]=[],release=vi.fn(),{solver}=fixture('okay',false,false,null,{sourceCaptured:()=>({release}),diagnosticMetrics:(event:any)=>events.push(event)})
 untilNative(solver);solver.cancel();expect(events.filter(e=>e.kind==='stage').map(e=>e.stage)).toEqual(expected.slice(0,4));expect(release).toHaveBeenCalledOnce();expect(q.events).toContain('native.destroy');solver.destroy()
})
it('metrics OFF has no timing calls and completes through the existing yield count',()=>{
 const clock=vi.spyOn(performance,'now'),{solver}=fixture('okay',false)
 try{drain(solver);expect(clock).not.toHaveBeenCalled()}finally{solver.destroy();clock.mockRestore()}
})
it('admission deferral captures once and marks admitted only after a lease exists',()=>{
 let attempts=0;const release=vi.fn(),events:any[]=[],{solver}=fixture('okay',false,false,null,{sourceCaptured:()=>++attempts===1?{defer:true}:{release},diagnosticMetrics:(event:any)=>events.push(event)})
 solver.step(1);expect(events.filter(e=>e.kind==='stage').map(e=>e.stage)).toEqual(expected.slice(0,2));expect(solver.state.admissionBlocked).toBe(true);drain(solver);expect(events.filter(e=>e.kind==='stage').map(e=>e.stage)).toEqual(expected);expect(release).toHaveBeenCalledOnce();solver.destroy()
})

it('output-ready observes committed outputs; throwing callback destroys every committed plane',()=>{
 let tile:any;const spies:any[]=[]
 const f=fixture('okay',false,false,null,{diagnosticMetrics:(event:any)=>{if(event.kind==='stage'&&event.stage==='output-ready'){const output=f.solver.buffers(tile);for(const buffer of Object.values(output))spies.push(vi.spyOn(buffer as AccumulationBuffer,'destroy'));throw Error('published observer fault')}}})
 const key=new AccumulationBuffer(f.gl,1,1),p=new AccumulationBuffer(f.gl,1,1),c=new AccumulationBuffer(f.gl,1,1),coverage=new AccumulationBuffer(f.gl,1,1);tile={buffer:key,originX:0,originY:0,contentRect:null};f.source.peek=()=>({inkLoad:p,inkColor:c,coverage})
 try{f.solver.resetFromScratch(f.source,{allResident:()=>[tile]} as any,7);expect(()=>drain(f.solver)).toThrow('published observer fault');expect(spies).toHaveLength(3);for(const spy of spies)expect(spy).toHaveBeenCalledOnce();expect(()=>f.solver.buffers(tile)).toThrow('no completed tile')}
 finally{f.solver.destroy();for(const b of [key,p,c,coverage])b.destroy()}
})
