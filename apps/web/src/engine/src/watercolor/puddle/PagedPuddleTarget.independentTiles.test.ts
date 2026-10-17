import {it,expect,vi} from 'vitest'
const q=vi.hoisted(()=>({raw:null as any,events:[] as string[],active:false,mode:'okay',solver:null as any,coverage:null as any}))
vi.mock('./PagedPuddleSource',()=>({capturePagedPuddleSource:()=>q.raw,restorePagedPuddleWindow(){},createDetachedPagedPuddleWindow(){return {width:1536,height:1536}}}))
vi.mock('./M70WindowGroups',()=>({m70WindowGroups:()=>{q.events.push('halo.plan');return[{field:{x:0,y:0,width:1536,height:1536},cores:[{x:0,y:0,width:1,height:1}]}]}}))
vi.mock('../../buffers/RibbonStrokeScratch',()=>({RibbonStrokeScratch:class{paints=new Set();noteFinish(){}compositeScalars(f:any){return f()}noteDirection(){return[0,0]}destroy(){q.events.push('source.destroy')}}}))
vi.mock('./PuddleTarget',()=>({createNativePuddleTarget(){const state={done:false};return{state,resetFromScratch(){q.events.push('reset:'+q.active);if(q.mode==='resetThrow')throw Error('reset fail')},step(){q.events.push('step:'+q.active);if(q.mode==='stepThrow')throw Error('step fail');if(q.mode==='cancelInside')q.solver.cancel();state.done=true},buffers(){const plane={readPixelsRegion:()=>{q.events.push('read');return new Uint8Array(4)}};return{p:plane,c:plane,coverage:{readPixelsRegion(){throw Error('Redundant coverage GPU read')}}}},destroy(){q.events.push('native.destroy')}}}}))
vi.mock('./PagedContrastPhase',()=>({createPagedContrastPhase:()=>({prepare(){},renderReference(){},destroy(){}})}))
vi.mock('./PagedBackgroundMix',()=>({createPagedBackgroundMix:()=>({capture(){},prepareSolved(){},readback(){return{}},destroy(){}})}))
import {createPagedPuddleTarget,type PagedNativeScopeFactory} from './PagedPuddleTarget'
import {MaterialFieldPages} from './MaterialFieldPages'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {MockGL} from '../../../testing/mockGL'
function fixture(mode='okay',enabled=true,disposeThrow=false,foreignSources:unknown=null,diagnostics:Record<string,unknown>={}){q.events=[];q.active=false;q.coverage=null;q.mode=mode;const gl=new MockGL() as unknown as WebGLRenderingContext,raw=new MaterialFieldPages({width:1,height:1});q.raw=Object.fromEntries(['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad','water'].map(k=>[k,raw.snapshot()]));q.raw.materialSupport={width:1,height:1,rect:null,rects:[],noForeignStencil:true};let proof:any;const factory:PagedNativeScopeFactory=(_host,rect,value)=>{q.events.push('factory');proof=value;expect(rect).toEqual({x:0,y:-1535,width:1536,height:1536});expect(value.support).not.toBe(q.raw.materialSupport);if(mode==='undefined')return undefined;return{run(work){q.active=true;try{return work()}finally{q.active=false;q.events.push('leave')}},dispose(){q.events.push('scope.dispose');if(disposeThrow)throw Error('dispose fail')}}};const solver=createPagedPuddleTarget({gl,pool:{},passes:{},settlePlan:{}} as any,{width:1,height:1},(w,h,f)=>new AccumulationBuffer(gl,w,h,f),{solved:(_p,_c,coverage)=>{q.coverage=coverage;q.events.push('published')},detachedWindowSource:true,nativeScope:enabled?factory:undefined,...diagnostics});q.solver=solver;const source={foreignSources,finishContext:{},paints:new Set(),captureFinishMetadata:()=>({foreignSources,wetContacts:[],brushTravel:[]}),compositeScalars:(f:any)=>f(),noteDirection:()=>[0,0]} as any;solver.resetFromScratch(source,{allResident:()=>[]} as any,7);return{solver,proof:()=>proof}}
function untilNative(solver:any){for(let i=0;i<8&&!q.events.some(e=>e.startsWith('step:'));i++)solver.step(1)}

it('OFF keeps production planner and adds no performance.now calls',()=>{
 const clock=vi.spyOn(performance,'now');const {solver}=fixture('okay',false)
 try{untilNative(solver);expect(q.events).toContain('halo.plan');expect(clock).not.toHaveBeenCalled()}finally{solver.destroy();clock.mockRestore()}
})
it('ON bypasses halo planner and reports epoch/count/areas/radius plus separate host phases after cleanup',()=>{
 const events:any[]=[],{solver}=fixture('okay',false,false,null,{diagnosticIndependentTiles:true,diagnosticMetrics:(e:any)=>events.push(e)})
 try{untilNative(solver);expect(q.events).not.toContain('halo.plan');for(let i=0;i<5&&!events.some(e=>e.kind==='window');i++)solver.step(1)
  expect(events[0]).toMatchObject({kind:'plan',epoch:7,supportRadius:612,usesProductionWindowPolicy:false,plannedWindows:1,plannedFieldPixels:1536*1536,plannedCorePixels:1})
  const e=events.find(e=>e.kind==='window');expect(e).toMatchObject({epoch:7,kept:true,completed:true,corePixels:1,field:{x:0,y:0,width:1536,height:1536}});expect(e.activeHostMs).toBeGreaterThanOrEqual(0);expect(e.elapsedHostMs).toBeGreaterThanOrEqual(e.activeHostMs);expect(q.events).toContain('native.destroy');expect(q.events).toContain('source.destroy')
 }finally{solver.destroy()}
})
it('throwing window metrics callback runs only after Native/source cleanup and unwinds safely',()=>{
 const {solver}=fixture('okay',false,false,null,{diagnosticIndependentTiles:true,diagnosticMetrics:(e:any)=>{if(e.kind==='window'){expect(q.events.slice(-2)).toEqual(['native.destroy','source.destroy']);throw Error('metrics fault')}}})
 expect(()=>{for(let i=0;i<12;i++)solver.step(1)}).toThrow('metrics fault');expect(q.events.filter(e=>e==='native.destroy')).toHaveLength(1);solver.destroy()
})
it('cancelled window reports incomplete only after owner cleanup, no partial publication',()=>{
 const events:any[]=[],{solver}=fixture('okay',false,false,null,{diagnosticIndependentTiles:true,diagnosticMetrics:(e:any)=>events.push(e)});untilNative(solver);solver.cancel();expect(events.find(e=>e.kind==='window')).toMatchObject({completed:false,epoch:7});expect(q.events.slice(-2)).toEqual(['native.destroy','source.destroy']);expect(q.events).not.toContain('published');solver.destroy()
})
