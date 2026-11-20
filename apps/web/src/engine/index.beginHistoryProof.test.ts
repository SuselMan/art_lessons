import{afterEach,expect,it,vi}from'vitest'
import type{StrokeOperation}from'@grafetto/shared'
import type{ILayerBuffer}from'./src/buffers/ILayerBuffer'
import type{GridWashRuntime,GridWashNotReady}from'./src/dabs/GridWashRuntime'
import type{SnapshotIO}from'./src/oplog/SnapshotIO'
import type{CheckpointStore}from'./src/oplog/checkpointStore'
import type{OperationLog}from'./src/oplog/OperationLog'
import{createTestEngine,dab,makeStroke}from'./testing/engineTestUtils'
type Host={_log:OperationLog;_snapshotIO:SnapshotIO;_checkpoints:CheckpointStore;_layers:Map<string,ILayerBuffer>;_gridBinding:(target:ILayerBuffer,userId:string,strokeId:string)=>GridWashRuntime|GridWashNotReady;_resolveSnapshotHistoryRepairs:()=>void;_rebuildLayerOrDefer:(id:string)=>void;_wakeGridResources:()=>void}
const engines:Array<ReturnType<typeof createTestEngine>['engine']>=[]
afterEach(()=>{vi.restoreAllMocks();for(const e of engines)e.destroy();engines.length=0})
function setup(){const{engine}=createTestEngine();engines.push(engine);engine.initLayer('L');engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:8,height:8,pixels:new Uint8Array(8*8*4).fill(128)}],2);const h=engine as unknown as Host;h._log.onRevision=undefined;const rebuild=vi.spyOn(h,'_rebuildLayerOrDefer').mockImplementation(()=>{}),wake=vi.spyOn(h,'_wakeGridResources').mockImplementation(()=>{});return{h,target:h._layers.get('L')!,rebuild,wake}}
const op=(id:string,seq:number,strokeId=id,layerId='L',size=4):StrokeOperation=>makeStroke('u',layerId,[dab(2,2,{size})],{id,seq,strokeId,strokeEnd:true,tool:'digitalBrush',preset:'brush:own-grid137@137'})
const append=(h:Host,o:StrokeOperation)=>h._log.append(o,{serverSeq:o.seq})
it('fetches proof without discarding CP, then resumes the existing job without a replacement rebuild',()=>{
 const{h,target,rebuild,wake}=setup();const checkpoint=h._checkpoints.all()[0];append(h,op('fresh',3,'A'))
 expect(h._gridBinding(target,'u','A')).toMatchObject({kind:'notReady',reason:'history'})
 expect(h._snapshotIO.pendingHistoryRepairs()).toEqual([{layerId:'L',beforeSeq:3}]);expect(h._snapshotIO.resolveHistoryRepairs()).toEqual([]);expect(h._checkpoints.all()[0]).toBe(checkpoint)
 h._snapshotIO.absorbHistorical([op('p1',1),op('p2',2)]);h._resolveSnapshotHistoryRepairs()
 expect(h._snapshotIO.historyRepairPending('L')).toBe(false);expect(h._checkpoints.all()[0]).toBe(checkpoint);expect(rebuild).not.toHaveBeenCalled();expect(wake).toHaveBeenCalled()
 expect(h._gridBinding(target,'u','A')).toHaveProperty('binding')
 // A second fresh identity is checked independently against the same proved base.
 append(h,op('freshB',4,'B'));expect(h._gridBinding(target,'u','B')).toHaveProperty('binding');expect(h._checkpoints.all()[0]).toBe(checkpoint)
})
it('does not infer freshness from first retained sequence or zero timestamps while a prefix/tail gap remains',()=>{
 const{h,target}=setup();append(h,op('fresh',4,'A'));h._snapshotIO.absorbHistorical([op('p1',1),op('p2',2)])
 expect(h._gridBinding(target,'u','A')).toMatchObject({kind:'notReady',reason:'history'});expect(h._snapshotIO.resolveHistoryProofs()).toEqual([]);expect(h._snapshotIO.pendingHistoryRepairs()).toEqual([{layerId:'L',beforeSeq:4}]);expect(h._checkpoints.all()).toHaveLength(1)
 h._snapshotIO.absorbHistorical([op('gap',3)]);expect(h._snapshotIO.resolveHistoryProofs()).toEqual(['L']);expect(h._gridBinding(target,'u','A')).toHaveProperty('binding')
})
it.each([false,true])('any covered same-identity chunk forces destructive recovery, including an undone cross-layer anchor (undone=%s)',undone=>{
 const{h,target}=setup();append(h,op('continued',3,'A'));expect(h._gridBinding(target,'u','A')).toHaveProperty('kind')
 h._snapshotIO.absorbHistorical([op('old-anchor',1,'A','elsewhere',0),op('p2',2)])
 // Exercise the authority check against an independently retained hidden entry.
 if(undone)h._log.entries.find(e=>e.op.id==='old-anchor')!.state='undone'
 expect(h._snapshotIO.resolveHistoryProofs()).toEqual(['L']);expect(h._gridBinding(target,'u','A')).toMatchObject({kind:'notReady',reason:'history'})
 expect(h._snapshotIO.resolveHistoryRepairs()).toEqual(['L']);expect(h._checkpoints.all()).toHaveLength(0)
})
it('covered undo repair outranks metadata proof; a larger other-layer proof is not lost',()=>{
 const{h}=setup();const io=h._snapshotIO
 io.requireHistoryProof('L',3);io.requireHistoryProof('other',4)
 io.absorbHistorical([op('p1',1),op('p2',2),op('p3',3)])
 io.invalidateCoveredHistory(['L'],'p1')
 expect(io.resolveHistoryProofs()).toEqual([]);expect(io.resolveHistoryRepairs()).toEqual(['L']);expect(h._checkpoints.all()).toHaveLength(0)
 expect(io.resolveHistoryProofs()).toEqual(['L']);expect(io.historyRepairPending('other')).toBe(true)
 expect(io.pendingHistoryRepairs()).toEqual([{layerId:'other',beforeSeq:5}]);io.absorbHistorical([op('p4',4)]);expect(io.resolveHistoryProofs()).toEqual(['other'])
})
