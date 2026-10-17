import {expect,it,vi} from 'vitest'
import {SNAPSHOT_SEQ_INTERVAL,type Operation} from '@grafetto/shared'
import {createTestEngine,dab,makeStroke} from '../../engine/testing/engineTestUtils'
import {decodeLayerTiles} from '../../engine/src/oplog/snapshotCodec'
import {restoreRoomState,type RestoreRoomStateDeps} from './restoreRoomState'
import {walkHistoryBackward} from './net/snapshotRestore'
import {createPendingPreviews} from './net/pendingPreviews'
import {createReplayGate} from './replayGate'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
it.fails('cold restore must make the snapshot head stroke itself reachable by own Undo',async()=>{
 const {engine:source}=createTestEngine({userId:'A'}),{engine:reader}=createTestEngine({userId:'A'});source.setBaseLayers(['L']);reader.setBaseLayers(['L'])
 const operations:Operation[]=Array.from({length:20},(_,index)=>({...makeStroke('A','L',[dab(2+index%4,4,{size:2,opacity:.5})]),id:'stroke-'+(index+1),seq:index+1,timestamp:index+1}))
 for(const op of operations)source.appendOperation(op,'remote')
 const snapshot=source.bakeLayerByFullReplay('L');expect(snapshot).not.toBeNull();const tiles=decodeLayerTiles(snapshot!,0).tiles
 const queries:number[]=[];let backfill=Promise.resolve()
 const deps:RestoreRoomStateDeps={boardId:'snapshot-head',restoreFromSnapshot:async(engine)=>{engine.restoreLayerFromSnapshot('L',tiles,20);return'restored'},backfillHistory:(_room,engine,from)=>{backfill=walkHistoryBackward('snapshot-head',from,SNAPSHOT_SEQ_INTERVAL,page=>engine.absorbHistoricalOperations(page),async(_room,before,limit)=>{queries.push(before);return operations.filter(op=>op.seq!<before).slice(-limit)});return backfill},applyRemoteOp:op=>reader.appendOperation(op,'remote'),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:()=>null,latestKnownSeqRef:{current:20},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 try{await restoreRoomState(reader,{latestSnapshotSeq:20,tailOperations:[],participants:[],palette:[],frozen:false},{mode:'join',alreadyHadSeq:0},deps);await backfill
  const ids=reader.getOperations().filter(op=>op.type==='stroke').map(op=>op.id),undo=reader.undo()
  console.log(JSON.stringify({baseline:'cold snapshot last stroke20, real engine, production backfill exclusive cursor',queries,knownStrokes:ids.length,hasHead20:ids.includes('stroke-20'),actualUndoTarget:undo?.id,expectedUndoTarget:'stroke-20'}))
  expect(undo?.id).toBe('stroke-20')
 }finally{source.destroy();reader.destroy()}
})
