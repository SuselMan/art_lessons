import{afterEach,expect,it,vi}from'vitest'
import type{StrokeOperation,Operation}from'@grafetto/shared'
import type{ILayerBuffer}from'./src/buffers/ILayerBuffer'
import type{GridWashBinding,GridWashRuntime,GridWashNotReady,GridBeginResult,GridWashOwnerInfo}from'./src/dabs/GridWashRuntime'
import{OperationLog}from'./src/oplog/OperationLog'
import{createTestEngine,dab,makeStroke}from'./testing/engineTestUtils'
type Host={_log:OperationLog;_layers:Map<string,ILayerBuffer>;_gridDirectOperation?:StrokeOperation;_gridReplayOperation?:StrokeOperation;_gridReplayTarget?:{target:ILayerBuffer;layerId:string};_gridBinding:(target:ILayerBuffer,userId:string,strokeId:string)=>GridWashRuntime|GridWashNotReady;_openGridBegin:(target:ILayerBuffer,binding:GridWashBinding)=>GridBeginResult;_smudge:{activeGridOwners:(target?:ILayerBuffer)=>readonly GridWashOwnerInfo[];invalidateGridOwners:(target:ILayerBuffer,reason:string)=>void}}
const engines:Array<ReturnType<typeof createTestEngine>['engine']>=[]
afterEach(()=>{vi.restoreAllMocks();for(const e of engines)e.destroy();engines.length=0})
function setup(){const{engine}=createTestEngine();engines.push(engine);engine.initLayer('L');const h=engine as unknown as Host;h._log.onRevision=undefined;return{h,target:h._layers.get('L')!}}
const op=(id:string,strokeId:string,seq?:number,size=4)=>makeStroke('u','L',[dab(2,2,{size})],{id,strokeId,seq,tool:'digitalBrush',preset:'brush:own-grid137@137'})
it('an optimistic BEGIN keeps its owner through own first publish/chunks/ACK but rejects a true earlier canonical insertion',()=>{
 const{h,target}=setup();const initial=h._gridBinding(target,'u','A');expect('binding'in initial).toBe(true);if(!('binding'in initial))throw Error('not ready')
 let owners:GridWashOwnerInfo[]=[{target,binding:initial.binding,bytes:1,acceptedDabs:1}]
 vi.spyOn(h._smudge,'activeGridOwners').mockImplementation(()=>owners)
 const invalidate=vi.spyOn(h._smudge,'invalidateGridOwners').mockImplementation(()=>{owners=[]})
 h._log.append(op('A1','A'),{pending:true});h._log.append(op('A2','A'),{pending:true})
 expect(h._gridBinding(target,'u','A')).toEqual({binding:initial.binding});expect(invalidate).not.toHaveBeenCalled()
 h._log.confirm('A1',10);expect(h._gridBinding(target,'u','A')).toEqual({binding:initial.binding});expect(invalidate).not.toHaveBeenCalled()
 h._log.append(op('B','B',5),{serverSeq:5});expect(h._gridBinding(target,'u','A')).toMatchObject({kind:'notReady',reason:'prefix'});expect(invalidate).toHaveBeenCalledTimes(1)
})
it('canonical metadata alone cannot bless current post-A/B target pixels as source-before-A',()=>{
 const{h,target}=setup();h._log.append(op('A1','A',1),{serverSeq:1});h._log.append(op('B','B',2),{serverSeq:2})
 const runtime=h._gridBinding(target,'u','A');if(!('binding'in runtime))throw Error('binding lookup unexpectedly blocked')
 expect(h._openGridBegin(target,runtime.binding)).toMatchObject({kind:'notReady',reason:'prefix'})
 h._gridReplayTarget={target,layerId:'L'};h._gridReplayOperation=h._log.entries[0].op as StrokeOperation
 const source=h._openGridBegin(target,runtime.binding);expect(source.kind).toBe('ready');if(source.kind==='ready')source.view.release()
})
it('zero-size metadata before B does not become canonical first renderable BEGIN',()=>{
 const{h,target}=setup();h._log.append(op('emptyA','A',1,0),{serverSeq:1});h._log.append(op('B','B',2),{serverSeq:2});h._log.append(op('positiveA','A',3),{serverSeq:3})
 const runtime=h._gridBinding(target,'u','A');expect('binding'in runtime&&runtime.binding.begin).toEqual({kind:'canonical',firstOpId:'positiveA',seq:3})
})

it('resource pending is not history repair, and clear/delete remain read-independent recovery controls',()=>{
 const{h,target}=setup()
 type RecoveryHost=Host&{_rebuildJobs:Map<string,{gridBlocked:GridWashNotReady;chunks:Map<string,never>;fresh:ILayerBuffer}>;_cancelRebuildJob:(id:string)=>void;isSnapshotHistoryRepairPending:(id:string)=>boolean;gridReadiness:(id:string)=>{layer:GridWashNotReady|null};appendOperation:(op:Operation,source:'remote')=>void}
 const r=h as RecoveryHost
 const blocked:GridWashNotReady={kind:'notReady',reason:'resource',retryKey:'busy'}
 r._rebuildJobs.set('L',{gridBlocked:blocked,chunks:new Map<string,never>(),fresh:target})
 expect(r.isSnapshotHistoryRepairPending('L')).toBe(false)
 expect(r.gridReadiness('L').layer).toEqual(blocked)
 const cancel=vi.spyOn(r,'_cancelRebuildJob').mockImplementation(id=>{r._rebuildJobs.delete(id)})
 const clear=vi.spyOn(target,'clear')
 r.appendOperation({id:'clear-recovery',type:'layer_clear',userId:'u',timestamp:0,layerId:'L',seq:1},'remote')
 expect(cancel).toHaveBeenCalledWith('L');expect(clear).toHaveBeenCalled()
 expect(r.gridReadiness('L').layer).toBe(null)
 r._rebuildJobs.set('L',{gridBlocked:blocked,chunks:new Map<string,never>(),fresh:target})
 r.appendOperation({id:'delete-recovery',type:'layer_delete',userId:'u',timestamp:0,layerIds:['L'],seq:2},'remote')
 expect(r._layers.has('L')).toBe(false)
})

it('resource readiness follows the existing three-hop source graph without becoming history repair',()=>{
 const{h,target}=setup()
 type Dependencies=Host&{_rebuildJobs:Map<string,{gridBlocked:GridWashNotReady;chunks:Map<string,never>;fresh:ILayerBuffer}>;_snapshotDependentLayers:Map<string,Set<string>>;gridReadiness:(id:string)=>{layer:GridWashNotReady|null};isSnapshotHistoryRepairPending:(id:string)=>boolean}
 const d=h as Dependencies
 d._rebuildJobs.set('A',{gridBlocked:{kind:'notReady',reason:'resource',retryKey:'busy:A'},chunks:new Map<string,never>(),fresh:target})
 d._snapshotDependentLayers.set('B',new Set(['A']));d._snapshotDependentLayers.set('C',new Set(['B']));d._snapshotDependentLayers.set('D',new Set(['C']))
 expect(d.gridReadiness('D').layer).toMatchObject({reason:'resource'})
 expect(d.isSnapshotHistoryRepairPending('D')).toBe(false)
 d._rebuildJobs.delete('A');expect(d.gridReadiness('D').layer).toBe(null)
})

it('a confirmed pre-BEGIN insertion invalidates an optimistic owner BEFORE its first own ACK',()=>{
 const{h,target}=setup();const initial=h._gridBinding(target,'u','A');if(!('binding'in initial))throw Error('initial not ready')
 let owners:GridWashOwnerInfo[]=[{target,binding:initial.binding,bytes:1,acceptedDabs:1}]
 vi.spyOn(h._smudge,'activeGridOwners').mockImplementation(()=>owners)
 const invalidate=vi.spyOn(h._smudge,'invalidateGridOwners').mockImplementation(()=>{owners=[]})
 h._log.append(op('pendingA1','A'),{pending:true});h._log.append(op('pendingA2','A'),{pending:true})
 expect(h._gridBinding(target,'u','A')).toEqual({binding:initial.binding});expect(invalidate).not.toHaveBeenCalled()
 h._log.append(op('canonicalB-beforeACK','B',5),{serverSeq:5})
 expect(h._log.entries.find(e=>e.op.id==='pendingA1')?.pending).toBe(true)
 expect(h._gridBinding(target,'u','A')).toMatchObject({kind:'notReady',reason:'prefix'});expect(invalidate).toHaveBeenCalledTimes(1)
})
