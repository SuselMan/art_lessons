import{it,expect,vi}from'vitest'
import{PencilEngine}from'./index'
import{CanonicalBeginBlocked,canonicalBeginIsStamp,type CanonicalBeginBinding}from'./src/dabs/CanonicalBeginRuntime'
const binding:CanonicalBeginBinding={layerId:'L',userId:'u',strokeId:'A',targetGeneration:1,prefixKey:'p',begin:{kind:'canonical',firstOpId:'first',seq:1}}
it('healing is a stamp capability; layered provider validates the requested152 authority without live-source fallback',()=>{
 const target={},release=vi.fn(),grid=vi.fn(()=>({capability:'cloneHealing152',binding})),host={_gridBinding:grid,_resolveSnapshotHistoryRepairs:vi.fn(),pendingSnapshotHistoryRepairs:()=>[],_beginFirstEntry:()=>({op:{seq:1}}),_log:{entries:[{state:'done',serverSeq:1,op:{seq:1}}]},_checkpoints:{all:()=>[]},_snapshotIO:{requireHistoryProof:vi.fn()},_releaseProjectionScope:release,_historicalProjectionLayer:vi.fn()}
 expect(canonicalBeginIsStamp('cloneHealing152')).toBe(true)
 const r=Reflect.apply(PencilEngine.prototype['_openLayeredCanonicalBegin'],host,[target,binding,[],'cloneHealing152'])
 expect(r.kind).toBe('ready');expect(grid).toHaveBeenCalledWith(target,'u','A','cloneHealing152');expect(r.view.layers).toEqual([]);r.view.assertCurrent();r.view.release();r.view.release();expect(release).toHaveBeenCalledTimes(1);expect(host._historicalProjectionLayer).not.toHaveBeenCalled()
})
it('common blocked catch reports whole-call accepted input prefix rather than the last internal partition',()=>{
 const target={},scratch={brushBehavior:{dabSequence:4}},outcome={kind:'notReady' as const,reason:'resource' as const,retryKey:'busy'},job={fresh:target},host={_beginCapability:()=> 'cloneHealing152',_gridBinding:()=>({capability:'cloneHealing152',binding}),_paintRibbonDabs:()=>{scratch.brushBehavior.dabSequence+=2;throw new CanonicalBeginBlocked(outcome,1)},_rebuildJobs:new Map([['L',job]]),_gridReplayOperation:{id:'op'},_replayRibbonChunks:new Map()}
 const r=Reflect.apply(PencilEngine.prototype['_paintSoak139'],host,[target,[{size:2},{size:2},{size:2}],'u','A','medium-round',[0,0,0],undefined,undefined,scratch])
 expect(r).toEqual({...outcome,acceptedDabs:2});expect(job).toMatchObject({gridProgress:{opId:'op',acceptedDabs:2}})
})
it('live END retains any canonical source until durable tail acceptance including152',()=>{
 const source={capability:'cloneHealing152'},scratch={canonicalSource:source},finish=vi.fn(),host={_flushDeferredSnapshots:vi.fn(),_smudge:{finishSecondary:vi.fn()},_wcAsyncPeerStreams:new Map(),_peerLiveStrokes:new Map([['live',{peerId:'u',strokeId:'A',layerId:'L',paintedTotal:2,committedOffset:0}]]),_replayRibbonChunks:new Map([['A',{scratch}]]),_brush:{finish}}
 Reflect.apply(PencilEngine.prototype.endPeerLiveStroke,host,['u','A']);expect(finish).not.toHaveBeenCalled();expect(scratch.canonicalSource).toBe(source)
})
for(const merged of [false,true])it(`author152 captures ${merged?'frozen ordered projection':'local BEGIN without projection'} before queued input`,async()=>{
 const{filter147}=await import('../../../../packages/shared/src/filterSmudge147.testFixture'),{hasCloneHealing152Scope}=await import('@grafetto/shared'),{installBrushLibrary}=await import('./brushLibrary'),{createTestEngine,paperReady,pointerSample}=await import('./testing/engineTestUtils')
 const brush=filter147();brush.id=merged?'imported-152152152152152152152153':'imported-152152152152152152152152';delete brush.filter;delete brush.mixer;brush.version=152;brush.model='stamp';brush.clone={version:1,moveSourcePoint:true,sourcePolicy:'canonical-begin-v1',healing:'lab-ratio-v1',...(merged?{source:'projectionCanvas' as const}:{})}
 expect(hasCloneHealing152Scope(brush)).toBe(true)
 installBrushLibrary({schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Own152',source:'qa',warnings:[],descriptor:brush}]})
 const{engine}=createTestEngine();try{await paperReady(engine);engine.initLayer('bottom');engine.initLayer('dest');engine.setActiveLayer('dest');engine.setTool('digitalBrush');engine.setPencil(`brush:${brush.id}@152`);engine.setCompositeOrder([{id:'bottom',opacity:.25},{id:'dest',opacity:.75}]);engine['_cloneSource']={x:3,y:4};const captured=engine['_captureAuthorStart'](pointerSample(10,20),0)
 expect(captured?.brushSource?.clone).toEqual({x:3,y:4,offsetX:-7,offsetY:-16});expect(captured?.brushSource?.projection).toEqual(merged?[{id:'bottom',opacity:.25},{id:'dest',opacity:.75}]:undefined);engine.setCompositeOrder([{id:'dest',opacity:1}]);expect(captured?.brushSource?.projection).toEqual(merged?[{id:'bottom',opacity:.25},{id:'dest',opacity:.75}]:undefined)
 }finally{engine.destroy()}
})
