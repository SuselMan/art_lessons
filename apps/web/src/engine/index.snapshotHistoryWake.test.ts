import{afterEach,expect,it,vi}from'vitest'
import type{Operation,StrokeOperation}from'@grafetto/shared'
import type{SnapshotIO}from'./src/oplog/SnapshotIO'
import type{OperationLog}from'./src/oplog/OperationLog'
import{createTestEngine,dab,makeStroke}from'./testing/engineTestUtils'
type Host={_log:OperationLog;_snapshotIO:SnapshotIO;_rebuildJobs:Map<string,unknown>;_rebuildLayer:(id:string)=>void;_wakeGridResources:()=>void;_resolveSnapshotHistoryRepairs:()=>void;_queueSnapshotHistoryRepair:()=>void;_onSnapshotHistoryRepairNeeded?:()=>void;_contextLost:boolean;_destroyed:boolean}
const engines:Array<ReturnType<typeof createTestEngine>['engine']>=[]
afterEach(()=>{vi.restoreAllMocks();for(const e of engines)e.destroy();engines.length=0})
function setup(){const{engine}=createTestEngine();engines.push(engine);engine.initLayer('IQ');const h=engine as unknown as Host;h._log.onRevision=undefined;engine.restoreLayerFromSnapshot('IQ',[{originX:0,originY:0,width:8,height:8,pixels:new Uint8Array(256).fill(128)}],347);return{engine,h}}
const rename=(seq:number):Operation=>({id:'meta'+seq,seq,type:'layer_rename',userId:'u',timestamp:0,layerId:'IQ',name:'IQ'})
const stroke=(seq:number):StrokeOperation=>makeStroke('u','IQ',[dab(2,2)],{id:'stroke'+seq,seq,tool:'pencil',strokeId:'seed'+seq,strokeEnd:true})
const microtasks=async()=>{await Promise.resolve();await Promise.resolve()}
it('requests missing347 inside awaited dependency restore, completes SAME blocked job, then admits tail361',async()=>{
 const{engine,h}=setup();for(let seq=1;seq<=355;seq++)if(seq!==347){const op=seq===350?stroke(seq):rename(seq);h._log.append(op,{serverSeq:seq})}
 const cp=(h as unknown as{_checkpoints:{all:()=>unknown[]}})._checkpoints.all()[0];h._snapshotIO.requireHistoryProof('IQ',350)
 const job={layerId:'IQ',gridBlocked:{kind:'notReady',reason:'history'},applied:2};vi.spyOn(h,'_rebuildLayer').mockImplementation(id=>{h._rebuildJobs.set(id,job)});vi.spyOn(h,'_wakeGridResources').mockImplementation(()=>{if(!h._snapshotIO.historyRepairPending('IQ'))h._rebuildJobs.delete('IQ')})
 let ordinaryStarted=false;const notify=vi.fn(()=>{expect(ordinaryStarted).toBe(false);void Promise.resolve().then(()=>{expect(h._rebuildJobs.get('IQ')).toBe(job);engine.absorbHistoricalOperations([stroke(347)])})});h._onSnapshotHistoryRepairNeeded=notify
 const restore=engine.restoreHistoricalOperations([stroke(350)]);await restore;ordinaryStarted=true
 expect(notify).toHaveBeenCalledTimes(1);expect(h._snapshotIO.historyRepairPending('IQ')).toBe(false);expect((h as unknown as{_checkpoints:{all:()=>unknown[]}})._checkpoints.all()[0]).toBe(cp)
 for(let seq=356;seq<=361;seq++)h._log.append(rename(seq),{serverSeq:seq});expect(h._log.entries.at(-1)?.serverSeq).toBe(361)
})
it('coalesces repeated/reentrant pending wake, progresses cursors/layers and resets an empty request',async()=>{
 const{h}=setup();let pending=[{layerId:'IQ',beforeSeq:348}];vi.spyOn(h._snapshotIO,'pendingHistoryRepairs').mockImplementation(()=>pending);const notify=vi.fn(()=>h._queueSnapshotHistoryRepair());h._onSnapshotHistoryRepairNeeded=notify
 h._queueSnapshotHistoryRepair();h._queueSnapshotHistoryRepair();await microtasks();expect(notify).toHaveBeenCalledTimes(1);h._queueSnapshotHistoryRepair();await microtasks();expect(notify).toHaveBeenCalledTimes(1)
 pending=[{layerId:'IQ',beforeSeq:327}];h._queueSnapshotHistoryRepair();await microtasks();expect(notify).toHaveBeenCalledTimes(2)
 pending.push({layerId:'other',beforeSeq:20});h._queueSnapshotHistoryRepair();await microtasks();expect(notify).toHaveBeenCalledTimes(3)
 pending=[];h._queueSnapshotHistoryRepair();pending=[{layerId:'IQ',beforeSeq:327}];h._queueSnapshotHistoryRepair();await microtasks();expect(notify).toHaveBeenCalledTimes(4)
})
it('does not notify for no-op/complete proof or a destroyed queued engine',async()=>{
 const{h}=setup();const notify=vi.fn();h._onSnapshotHistoryRepairNeeded=notify;h._resolveSnapshotHistoryRepairs();await microtasks();expect(notify).not.toHaveBeenCalled()
 h._log.append(rename(1),{serverSeq:1});h._snapshotIO.requireHistoryProof('IQ',1);h._resolveSnapshotHistoryRepairs();await microtasks();expect(notify).not.toHaveBeenCalled()
 h._snapshotIO.requireHistoryProof('IQ',347);h._queueSnapshotHistoryRepair();h._destroyed=true;await microtasks();expect(notify).not.toHaveBeenCalled();h._destroyed=false
})
it('proof-only missing history remains pending if notified transport supplies no page',async()=>{
 const{h}=setup();h._snapshotIO.requireHistoryProof('IQ',347);const notify=vi.fn();h._onSnapshotHistoryRepairNeeded=notify;h._resolveSnapshotHistoryRepairs();await microtasks();expect(notify).toHaveBeenCalledTimes(1);expect(h._snapshotIO.historyRepairPending('IQ')).toBe(true);h._resolveSnapshotHistoryRepairs();await microtasks();expect(notify).toHaveBeenCalledTimes(1)
})

it('does not read any log for no pending repair, but pending proof still examines the actual prefix',()=>{
 const{h}=setup();const ctx=(h._snapshotIO as unknown as{ctx:{log:()=>OperationLog}}).ctx
 const read=vi.spyOn(ctx,'log').mockImplementation(()=>{throw Error('Log must not be read on empty repair maps')})
 expect(h._snapshotIO.pendingHistoryRepairs()).toEqual([]);expect(read).not.toHaveBeenCalled()
 h._snapshotIO.requireHistoryProof('IQ',347);expect(()=>h._snapshotIO.pendingHistoryRepairs()).toThrow('Log must not be read')
 read.mockRestore();h._log.append(rename(347),{serverSeq:347});expect(h._snapshotIO.pendingHistoryRepairs()).toEqual([{layerId:'IQ',beforeSeq:347}])
})
