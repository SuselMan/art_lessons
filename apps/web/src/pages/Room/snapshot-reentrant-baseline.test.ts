import {afterEach,expect,it,vi} from 'vitest'
import type {LayerState} from '@grafetto/shared'
import {createTestEngine} from '../../engine/testing/engineTestUtils'
import {compressLayerTiles,encodeLayerTiles} from '../../engine/src/oplog/snapshotCodec'
import {restoreLatestSnapshot} from './net/snapshotRestore'
import {restoreRoomState,type RestoreRoomStateDeps} from './restoreRoomState'
import {createPendingPreviews} from './net/pendingPreviews'
import {createReplayGate} from './replayGate'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
const fetchBefore=global.fetch
afterEach(()=>{global.fetch=fetchBefore})
const layers:LayerState={items:{L:{kind:'layer',id:'L',name:'L',opacity:1,visible:true}},rootOrder:['L'],activeId:'L',selectedIds:[]}
it('a late old snapshot must not overwrite the newer completed public room restore',async()=>{
 const {engine}=createTestEngine({userId:'reader'},{width:8,height:8});engine.setBaseLayers(['L'])
 const image=(red:number)=>{const pixels=new Uint8Array(8*8*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=red;pixels[i+3]=255}return pixels}
 const oldPixels=image(41),newPixels=image(202)
 const oldBlob=await compressLayerTiles(encodeLayerTiles([{originX:0,originY:0,width:8,height:8,pixels:oldPixels}]))
 const newBlob=await compressLayerTiles(encodeLayerTiles([{originX:0,originY:0,width:8,height:8,pixels:newPixels}]))
 let indexRequests=0,releaseOld!:()=>void,oldRequested!:()=>void
 const requested=new Promise<void>(resolve=>{oldRequested=resolve}),blocked=new Promise<void>(resolve=>{releaseOld=resolve})
 global.fetch=vi.fn(async(input:string|URL|Request)=>{const url=String(input);if(url.endsWith('/snapshots/index')){const seq=++indexRequests===1?10:20;return{status:200,ok:true,json:async()=>({seq,layerState:layers,layers:[{layerId:'L',seq}]})}}
  if(url.endsWith('/snapshots/L/10')){oldRequested();await blocked;return{status:200,ok:true,arrayBuffer:async()=>oldBlob.slice().buffer}}
  if(url.endsWith('/snapshots/L/20'))return{status:200,ok:true,arrayBuffer:async()=>newBlob.slice().buffer}
  throw Error('Unexpected test request '+url)
 }) as unknown as typeof fetch
 let installedRGBA=new Uint8Array();const installs:number[]=[]
 const deps:RestoreRoomStateDeps={boardId:'same-room',restoreFromSnapshot:async(e,id,signal)=>{const result=await restoreLatestSnapshot(id,{beginLayers:()=>e.setBaseLayers(['L']),applyLayer:(layer,tiles,seq)=>{e.restoreLayerFromSnapshot(layer,tiles,seq);installedRGBA=tiles[0].pixels.slice();installs.push(seq)}},{signal});return result.status},backfillHistory:vi.fn().mockResolvedValue(undefined),applyRemoteOp:op=>engine.appendOperation(op,'remote'),syncFromLogNow:vi.fn(),markJoinRestoreDone:vi.fn(),dispatchParticipants:vi.fn(),setRestoreFailure:vi.fn(),setRoomContentReady:vi.fn(),finishOpenTimer:vi.fn(),notifyReplayIncomplete:vi.fn(),getSnapshotUploader:()=>null,latestKnownSeqRef:{current:0},replayIncompleteRef:{current:false},pendingPreviewsRef:{current:createPendingPreviews()},openTimerRef:{current:null},replayGate:createReplayGate()}
 const state=(seq:number)=>({latestSnapshotSeq:seq,tailOperations:[],participants:[],palette:[],frozen:false})
 try{const old=restoreRoomState(engine,state(10),{mode:'catchup',alreadyHadSeq:0},deps);await requested
  await restoreRoomState(engine,state(20),{mode:'catchup',alreadyHadSeq:0},deps)
  expect(installedRGBA).toEqual(newPixels)
  releaseOld();await old
  const final=installedRGBA;console.log(JSON.stringify({baseline:'reentrant real gzip+real engine snapshot upload',installedSeqs:installs,newRed:202,finalRed:final?.[0],latestKnownSeq:deps.latestKnownSeqRef.current,restoreFailures:vi.mocked(deps.setRestoreFailure).mock.calls.length}))
  expect(final).toEqual(newPixels)
  expect(installs).toEqual([20])
  expect(deps.setRestoreFailure).not.toHaveBeenCalled()
  expect(deps.markJoinRestoreDone).toHaveBeenCalledTimes(1)
  expect(deps.setRoomContentReady).toHaveBeenCalledTimes(1)
 }finally{releaseOld();engine.destroy()}
})
