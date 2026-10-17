import {Buffer} from 'node:buffer'
import {it,expect,vi} from 'vitest'
import {capturePagedPuddleSource,capturePagedPuddleSourceSteps} from './PagedPuddleSource'
import {createPagedPuddleTarget} from './PagedPuddleTarget'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import {BufferResidency} from '../../buffers/BufferResidency'
import {MaterialFieldPages} from './MaterialFieldPages'
import {CapturedReadScope} from './CapturedReadScope'
import {MockGL} from '../../../testing/mockGL'
import {createTestEngine,makeLayerAdd,makeStroke,dab,paperReady} from '../../../testing/engineTestUtils'
function fixture(kind='local',width=4,height=4){
 const reads:string[]=[],tiles=[{originX:0,originY:0,buffer:{width,height}},{originX:width,originY:height,buffer:{width,height}}]
 const plane=(name:string,n:number)=>({width,height,contentRevision:0,readPixels(){reads.push(name);return Uint8Array.from({length:width*height*4},(_,i)=>(i*7+n)%256)}})
 const entries=tiles.map((_,i)=>({original:plane('original'+i,1+i),coverage:plane('coverage'+i,2+i),inkLoad:plane('inkLoad'+i,3+i),inkColor:plane('inkColor'+i,4+i),solventLoad:kind==='foreign'?undefined:plane('solventLoad'+i,5+i),foreignSolventLoad:kind==='local'?undefined:plane('foreignSolventLoad'+i,6+i)}))
 const source={gesture:'g',finishContext:{},foreignSources:null,peek:(b:unknown)=>entries.find((_,i)=>tiles[i].buffer===b)},target={allResident:()=>tiles},temporary=plane('combined',7),pool={acquire:vi.fn(()=>temporary),release:vi.fn()},passes={fieldOp:vi.fn()}
 return{source,target,entries,reads,pool,passes,size:{width:width*2-2,height:height*2-1}}
}
for(const kind of ['local','foreign','mixed'])it('sync and row-yielded capture preserve every byte/order/support on clipped tiles '+kind,()=>{
 const f=fixture(kind),baseline=capturePagedPuddleSource(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{reuseSingleWaterRead:true}),order=f.reads.splice(0)
 const capture=capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:1,reuseSingleWaterRead:true}),steps=[];let raw:typeof baseline|undefined
 for(let i=0;i<200;i++){const next=capture.next();if(next.done){raw=next.value;break}steps.push(next.value);expect(next.value.phase==='read'||next.value.rows===1).toBe(true)}
 expect(raw).toBeDefined();expect(f.reads).toEqual(order)
 for(const name of ['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad','water'] as const)expect(raw![name].readRect({x:0,y:0,...f.size})).toEqual(baseline[name].readRect({x:0,y:0,...f.size}))
 expect(raw!.materialSupport).toEqual(baseline.materialSupport)
 expect(steps.filter(s=>s.phase==='read').length).toBe(kind==='mixed'?14:10)
 expect(f.pool.acquire).toHaveBeenCalledTimes(kind==='mixed'?4:0);expect(f.pool.release).toHaveBeenCalledTimes(kind==='mixed'?4:0)
})
for(const mutation of ['revision','identity','tile','tileIdentity','size','context','foreign'])it('rejects a source revision changed across yield '+mutation,()=>{
 const f=fixture(),capture=capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:1})
 expect(capture.next().done).toBe(false);expect(f.reads).toHaveLength(1)
 if(mutation==='revision')f.entries[1].inkColor.contentRevision++
 if(mutation==='identity')f.entries[1].inkColor={...f.entries[1].inkColor}
 if(mutation==='tile')f.target.allResident=()=>[]
 if(mutation==='tileIdentity'){const tiles=f.target.allResident();f.target.allResident=()=>[{...tiles[0],buffer:{width:4,height:4}},tiles[1]]}
 if(mutation==='size')f.size.width++
 if(mutation==='context')f.source.finishContext={}
 if(mutation==='foreign')(f.source as any).foreignSources=[{}]
 expect(()=>capture.next()).toThrow('source changed')
})
it('yields after read before scanning/pages and closes mixed temporary ownership before suspension',()=>{
 const f=fixture('mixed'),capture=capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:1})
 expect(capture.next().value).toMatchObject({phase:'read',plane:'original'});expect(f.reads).toEqual(['original0'])
 let next=capture.next();expect(next.value).toMatchObject({phase:'write',plane:'original',rows:1})
 for(let i=0;i<100;i++){if(next.done)throw Error('Missing combined');if(next.value?.phase==='read'&&next.value.plane==='water')break;next=capture.next()}
 expect(f.pool.release).toHaveBeenCalledTimes(1);capture.return(undefined)
})
it('unknown revision rejects before any read and invalid batches reject explicitly',()=>{
 const f=fixture();(f.entries[0].inkLoad as any).contentRevision=undefined
 expect(()=>capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any).next()).toThrow('stable material revision');expect(f.reads).toHaveLength(0)
 for(const rows of [0,-1,1.5,Infinity])expect(()=>capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:rows}).next()).toThrow('row batch')
})
function realFixture(options:any={}){
 const gl=new MockGL() as unknown as WebGLRenderingContext,cache=new BufferResidency(gl,120*1024*1024),owned:AccumulationBuffer[]=[],make=(w:number,h:number,f:any='nearest')=>{const b=new AccumulationBuffer(gl,w,h,f,cache);owned.push(b);return b}
 const original=make(8,8),entry={original,coverage:make(8,8),inkLoad:make(8,8),inkColor:make(8,8),solventLoad:make(8,8)};original.writePixels(Uint8Array.from({length:256},(_,i)=>i));for(const b of [entry.coverage,entry.inkLoad,entry.inkColor,entry.solventLoad])b.clear()
 const source={gesture:'g',finishContext:{},foreignSources:null,captureFinishMetadata:()=>({foreignSources:null}),peek:()=>entry},target={allResident:()=>[{originX:0,originY:0,buffer:original}]},barrier=vi.fn(()=>({defer:true} as const))
 const solver=createPagedPuddleTarget({gl,pool:{},passes:{}} as any,{width:8,height:8},make,{cooperativeCapture:true,capturedBacking:true,skipEmptyFixedWindows:true,sourceCaptured:barrier,...options})
 return{gl,cache,owned,entry,source,target,solver,barrier,finish(){solver.destroy();for(const b of owned)b.destroy();expect(cache.bufferCount).toBe(0);cache.dispose()}}
}
for(const mode of ['cancel','callbackThrow','readThrow','pageThrow','write','reentrantCancel'])it('partial cooperative capture scope finally '+mode,()=>{
 const f=realFixture(mode==='callbackThrow'?{captureStep:()=>{throw Error('capture callback')}}:{}),dispose=vi.spyOn(CapturedReadScope.prototype,'dispose')
 if(mode==='readThrow')vi.spyOn(f.entry.original,'readPixels').mockImplementationOnce(()=>{throw Error('read fail')})
 const pageWrite=mode==='pageThrow'?vi.spyOn(MaterialFieldPages.prototype,'writeRect').mockImplementationOnce(()=>{throw Error('page write')}):undefined
 if(mode==='reentrantCancel'){const read=f.entry.original.readPixels.bind(f.entry.original);vi.spyOn(f.entry.original,'readPixels').mockImplementation(()=>{expect(f.solver.state.executing).toBe(true);f.solver.cancel();expect(dispose).not.toHaveBeenCalled();return read()})}
 try{
 f.solver.resetFromScratch(f.source as any,f.target as any,1);if(mode==='callbackThrow')expect(()=>f.solver.step(1)).toThrow('capture callback');else if(mode==='readThrow')expect(()=>f.solver.step(1)).toThrow('read fail');else f.solver.step(1)
 if(mode==='pageThrow')expect(()=>f.solver.step(1)).toThrow('page write')
 if(mode==='reentrantCancel'||mode==='callbackThrow'||mode==='readThrow'||mode==='pageThrow'){expect(f.solver.state.done).toBe(true)}
 else{expect(Reflect.get(f.entry.original,'_capturedRead')).toBeDefined();if(mode==='write'){f.entry.inkColor.clear();expect(()=>f.solver.step(1)).toThrow('source changed')}else f.solver.cancel()}
 expect(dispose).toHaveBeenCalledOnce();expect(f.barrier).not.toHaveBeenCalled();for(const b of Object.values(f.entry))expect(Reflect.get(b,'_capturedRead')).toBeUndefined()
 }finally{f.finish();dispose.mockRestore();pageWrite?.mockRestore()}
})
it('actual controller beforePaint closes suspended capture/proofs BEFORE input host/material mutation',async()=>{
 const {engine}=createTestEngine({userId:'observer',paper:'flat',watercolorModel:'m70-r2-v1',pageWidth:1536,pageHeight:512},{width:64,height:64});await paperReady(engine);const e=engine as any;e.gl.colorMask=()=>{};e.diagnosticM70CapturedBacking=true;e.diagnosticM70CooperativeCapture=true
 try{engine.appendOperation(makeLayerAdd('peer','M'),'remote');engine.appendOperation({...makeStroke('peer','M',[dab(20,25,{size:8,opacity:1,t:0})]),id:'capture-owner',tool:'watercolor',preset:'normal:95:34:PB29:round:wc@m70-r2-v1',strokeId:'capture-owner',washId:'capture-owner'},'remote');e._completeSettle()
 const c=e._puddle as any;cancelAnimationFrame(c.raf);c.raf=0;const layer=c.layers.get(e._layers.get('M')),entries=[...layer.scratch._tiles.values()] as any[];c.start(layer);c.solver.step(1)
 expect(Reflect.get(entries[0].original,'_capturedRead')).toBeDefined();expect(e._getFieldPhaseOwner().state.activeLeases).toBe(0);expect(e._fieldPhaseCache.budgetBytes).toBe(224*1024*1024)
 const begin=c.host.beginInput;c.host.beginInput=()=>{for(const entry of entries)for(const key of ['original','coverage','inkLoad','inkColor','solventLoad'])if(entry[key])expect(Reflect.get(entry[key],'_capturedRead')).toBeUndefined();begin?.()}
 c.beforePaint(layer.scratch);expect(c.solver.state.done).toBe(true);entries[0].inkLoad.clear()
 }finally{engine.destroy()}
})

it('row batches preserve odd multi-page fields and partial overhang with301x257 physical planes',()=>{
 const f=fixture('mixed',301,257),raw=capturePagedPuddleSource(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any),steps=capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:17})
 let captured:typeof raw|undefined,writes=0
 for(let i=0;i<1000;i++){const step=steps.next();if(step.done){captured=step.value;break}if(step.value.phase==='write'){expect(step.value.rows).toBeLessThanOrEqual(17);writes++}}
 expect(captured).toBeDefined();expect(writes).toBeGreaterThan(50)
 for(const name of ['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad','water'] as const)expect(Buffer.from(captured![name].readRect({x:0,y:0,...f.size})).equals(Buffer.from(raw[name].readRect({x:0,y:0,...f.size})))).toBe(true)
 expect(captured!.materialSupport).toEqual(raw.materialSupport)
})

for(const mutation of ['blankBirth','reorder','newMaterial'])it('material membership ignores unrelated residency changes '+mutation,()=>{
 const f=fixture(),old=f.target.allResident(),capture=capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:1})
 capture.next()
 const blank={originX:999,originY:999,buffer:{width:4,height:4}},peek=f.source.peek
 f.source.peek=(buffer:unknown)=>buffer===blank.buffer?(mutation==='newMaterial'?f.entries[0]:undefined):peek(buffer)
 f.target.allResident=()=>mutation==='reorder'?[old[1],old[0]]:[...old,blank]
 if(mutation==='newMaterial')expect(()=>capture.next()).toThrow('changed during capture')
 else{let next=capture.next();while(!next.done)next=capture.next();expect(next.value).toBeDefined()}
 capture.return(undefined)
})
it('initial blank tiles before and between material tiles preserve capture bytes and membership',()=>{
 const f=fixture(),baseline=capturePagedPuddleSource(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any),old=f.target.allResident()
 const blanks=[{originX:300,originY:300,buffer:{width:4,height:4}},{originX:400,originY:400,buffer:{width:4,height:4}}]
 f.target.allResident=()=>[blanks[0],old[0],blanks[1],old[1]]
 const capture=capturePagedPuddleSourceSteps(f.source as any,f.target as any,f.size,f.pool as any,f.passes as any,{rowBatchHeight:1}),steps=[]
 let next=capture.next();while(!next.done){steps.push(next.value);next=capture.next()}
 expect(steps.filter(step=>step.phase==='write').length).toBeGreaterThan(0)
 for(const name of ['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad','water'] as const)expect(Buffer.from(next.value![name].readRect({x:0,y:0,...f.size})).equals(Buffer.from(baseline[name].readRect({x:0,y:0,...f.size})))).toBe(true)
 expect(next.value!.materialSupport).toEqual(baseline.materialSupport)
})
