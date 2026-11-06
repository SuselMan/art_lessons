import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine,makeStroke,dab,readTilePixels} from '../../engine/testing/engineTestUtils'
import {restoreRoomState,type RestoreRoomStateDeps} from './restoreRoomState'
import {createPendingPreviews} from './net/pendingPreviews'
import {createReplayGate} from './replayGate'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
const engines:ReturnType<typeof createTestEngine>['engine'][]=[]
afterEach(()=>{for(const e of engines.splice(0))e.destroy()})
function setup(){
 const {engine}=createTestEngine({userId:'reader'},{width:8,height:8});engines.push(engine)
 const deps:RestoreRoomStateDeps={boardId:'room',restoreFromSnapshot:vi.fn(),backfillHistory:vi.fn().mockResolvedValue(undefined),applyRemoteOp:vi.fn(),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:()=>null,latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 const run=(seq:number)=>restoreRoomState(engine,{latestSnapshotSeq:seq,tailOperations:[],participants:[],palette:[],frozen:false},{mode:'catchup',alreadyHadSeq:0},deps)
 return {engine,deps,run}
}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
for(const oldFailure of [false,true])it(`retired old ${oldFailure?'failure':'success'} cannot publish effects or open the new gate`,async()=>{
 const {engine,deps,run}=setup(),old=deferred<'restored'>(),next=deferred<'restored'>()
 vi.mocked(deps.restoreFromSnapshot).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
 const first=run(10),second=run(20)
 if(oldFailure)old.reject(Error('late old transfer'));else old.resolve('restored')
 await first
 expect(deps.replayGate.hold('held until NEW restore completes')).toBe(true)
 expect((engine as unknown as {_displaySuspendDepth:number})._displaySuspendDepth).toBe(1)
 expect(deps.setRestoreFailure).not.toHaveBeenCalled();expect(deps.setRoomContentReady).not.toHaveBeenCalled();expect(deps.markJoinRestoreDone).not.toHaveBeenCalled()
 next.resolve('restored');await second
 expect(deps.markJoinRestoreDone).toHaveBeenCalledTimes(1);expect(deps.latestKnownSeqRef.current).toBe(20)
 expect((engine as unknown as {_displaySuspendDepth:number})._displaySuspendDepth).toBe(0)
 expect(deps.replayGate.hold('after')).toBe(false)
})
it('old success after new failure cannot clear failure or announce ready',async()=>{
 const {deps,run}=setup(),old=deferred<'restored'>()
 vi.mocked(deps.restoreFromSnapshot).mockReturnValueOnce(old.promise).mockResolvedValueOnce('failed')
 const first=run(10);await run(20);old.resolve('restored');await first
 expect(deps.setRestoreFailure).toHaveBeenCalledExactlyOnceWith('transfer')
 expect(deps.setRoomContentReady).not.toHaveBeenCalled();expect(deps.markJoinRestoreDone).not.toHaveBeenCalled();expect(deps.latestKnownSeqRef.current).toBe(0)
})
it('different engines restore independently',async()=>{
 const a=setup(),b=setup(),old=deferred<'restored'>()
 vi.mocked(a.deps.restoreFromSnapshot).mockReturnValueOnce(old.promise)
 vi.mocked(b.deps.restoreFromSnapshot).mockResolvedValueOnce('restored')
 const first=a.run(10);await b.run(20);old.resolve('restored');await first
 expect(a.deps.latestKnownSeqRef.current).toBe(10);expect(b.deps.latestKnownSeqRef.current).toBe(20)
 expect(a.deps.setRoomContentReady).toHaveBeenCalledExactlyOnceWith(true);expect(b.deps.setRoomContentReady).toHaveBeenCalledExactlyOnceWith(true)
})
it('destroy cancels pending restore before its continuation can touch the dead engine',async()=>{
 const {engine,deps,run}=setup(),old=deferred<'restored'>()
 vi.mocked(deps.restoreFromSnapshot).mockReturnValueOnce(old.promise)
 const first=run(10);engine.destroy();old.resolve('restored');await first
 expect(deps.setRestoreFailure).not.toHaveBeenCalled();expect(deps.setRoomContentReady).not.toHaveBeenCalled();expect(deps.markJoinRestoreDone).not.toHaveBeenCalled()
 expect(deps.replayGate.hold('after destroy')).toBe(false)
})
it('retired historical image preload cannot start a later rebuild on the new bitmap',async()=>{
 const {engine}=setup(),wait=deferred<void>(),controller=new AbortController()
 engine.setBaseLayers(['L'])
 vi.spyOn(engine,'preloadImages').mockReturnValueOnce(wait.promise)
 const history=engine.restoreHistoricalOperations([{...makeStroke('B','L',[dab(4,4,{size:4,opacity:1})]),seq:1}],false,controller.signal)
 const settled=history.then(()=>null,error=>error as Error)
 controller.abort()
 const pixels=new Uint8Array(256);pixels[0]=200;pixels[3]=255
 engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:8,height:8,pixels}],20)
 const installed=readTilePixels(engine,'L',0,0,8,8)!.slice()
 wait.resolve()
 expect((await settled)?.name).toBe('AbortError')
 expect(readTilePixels(engine,'L',0,0,8,8)).toEqual(installed)
 expect(engine.takeSnapshotRestoreAudit().at(-1)?.tilesUploaded).toBe(1)
})
it('a throwing retired resume is balanced before new generation starts',async()=>{
 const {engine,deps,run}=setup(),old=deferred<'restored'>(),next=deferred<'restored'>()
 vi.mocked(deps.restoreFromSnapshot).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
 const original=engine.resumeDisplay.bind(engine)
 vi.spyOn(engine,'resumeDisplay').mockImplementationOnce(()=>{original();throw Error('old display OOM')})
 const first=run(10),second=run(20)
 expect((engine as unknown as {_displaySuspendDepth:number})._displaySuspendDepth).toBe(1)
 old.resolve('restored');await first
 expect(deps.replayGate.hold('new still held')).toBe(true)
 next.resolve('restored');await second
 expect((engine as unknown as {_displaySuspendDepth:number})._displaySuspendDepth).toBe(0)
 expect(deps.setRestoreFailure).not.toHaveBeenCalled()
})
