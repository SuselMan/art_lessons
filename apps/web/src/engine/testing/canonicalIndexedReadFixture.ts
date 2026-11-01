/** HOST test fixture: actual network ingress owns all input/cut proofs. The
 * socket response source is controlled here; product code exposes no factory. */
import type {Socket} from 'socket.io-client'
import {canonicalDefaultAutoSourceBinding,buildCanonicalMaterial,decodeCanonicalStrokeFrame,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalIndexedOperation,type CanonicalRecordedAttachmentV1,type CanonicalStrokeSnapshotV2,type ClientToServerEvents,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {openCanonicalIndexedRoomForSocket} from '../../pages/Room/net/canonicalIndexedRead'
const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
export const indexedSnapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'stroke',boardEpoch:2,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
export function indexedFrame(seq=1,strokeId='stroke',ended=true,ordinal=0):CanonicalIndexedOperation{
 return {id:'frame'+seq,userId:'actor',timestamp:0,seq,type:'canonical_stroke',layerId:'layer-1',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:indexedSnapshot.brush,strokeId,frameOrdinal:ordinal,pigmentRgb8:indexedSnapshot.pigmentRgb8,composition:indexedSnapshot.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:ended?[{kind:'gestureEnd',at:0}]:[]},material).packed}}
}
export function indexedAttachment(operations:readonly CanonicalIndexedOperation[]):CanonicalRecordedAttachmentV1{
 const capabilities:CanonicalRecordedAttachmentV1['capabilities'][number][]=[],bindings:CanonicalRecordedAttachmentV1['bindings'][number][]=[]
 for(const op of operations){if(op.type!=='canonical_stroke')continue
  let index=capabilities.findIndex(cap=>cap.originalUserId===op.userId&&cap.snapshot.strokeId===op.frame.strokeId)
  if(index<0){index=capabilities.length;capabilities.push({originalUserId:op.userId,snapshot:{...indexedSnapshot,strokeId:op.frame.strokeId}})}
  bindings.push({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:index})
 }
 return {version:1,roomId:'room',boardEpoch:2,capabilities,bindings}
}
export function indexedSocketFixture(operations:readonly CanonicalIndexedOperation[]=[indexedFrame()],pageSize=1){
 const scope={roomId:'room',boardEpoch:2,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE]}
 const offer={kind:'canonical-indexed-history-offer-v1',offerId:'offer',scope,roomGeometry:{width:8,height:8,infinite:false},authorRasterProfile:CANONICAL_STROKE_RASTER_PROFILE}
 let current=true,stream=0,floor=0,through=operations.length,follow=false,parentStreamId='',completed:number|undefined,completedStreamId=''
 const requests:{event:string;body:Record<string,unknown>}[]=[]
 const begin=()=>({kind:'canonical-indexed-history-begin-v1',streamId:'read'+stream,offerId:offer.offerId,scope,roomGeometry:offer.roomGeometry,authorRasterProfile:offer.authorRasterProfile,floor:0,throughSeq:through,operationCount:through})
 const handlers:Record<string,(body:Record<string,unknown>)=>unknown|Promise<unknown>>={
  canonical_history_stream_open:()=>({ok:true,value:begin()}),
  canonical_history_stream_reopen:body=>{
   if(body.mode==='follow'){
    if(completed!==body.afterSeq||completedStreamId!==body.streamId)throw Error('No actual completed parent range')
    parentStreamId=completedStreamId;stream++
    floor=Number(body.afterSeq);through=Math.min(operations.length,floor+64);follow=true
    return {ok:true,value:{kind:'canonical-indexed-history-follow-v1',streamId:'read'+stream,parentStreamId,scope,roomGeometry:offer.roomGeometry,authorRasterProfile:offer.authorRasterProfile,floor,throughSeq:through,operationCount:through-floor,latestObservedSeq:operations.length}}
   }
   stream++;floor=0;through=Number(body.throughSeq);follow=false
   return {ok:true,value:begin()}
  },
  canonical_history_stream_next:body=>{
   const after=Number(body.afterSeq),rows=operations.slice(after,Math.min(through,after+pageSize)),terminal=rows.length===0
   if(terminal){completed=through;completedStreamId='read'+stream}
   return {ok:true,value:{kind:'canonical-indexed-history-page-v1',streamId:'read'+stream,throughSeq:through,afterSeq:after,nextAfterSeq:after+rows.length,operations:rows,canonicalCapabilities:indexedAttachment(rows),terminal,...terminal?{finish:{kind:follow?'canonical-indexed-history-follow-finish-v1':'canonical-indexed-history-finish-v1',streamId:'read'+stream,throughSeq:through,operationCount:through-floor,lastSeq:through,...follow?{floor}:{}}}:{}}}
  },
  canonical_history_stream_evidence:body=>{
   const root=body.root as {firstSequence:number;strokeId:string}
   const first=operations[root.firstSequence-1],group=operations.filter(op=>op.type==='canonical_stroke'&&op.frame.strokeId===root.strokeId&&op.seq!<=through)
   const last=group.findLast(op=>op.type==='canonical_stroke'&&decodeCanonicalStrokeFrame(op.frame,{...indexedSnapshot,strokeId:op.frame.strokeId,frameOrdinal:op.frame.frameOrdinal}).frame.fences.some(f=>f.kind==='gestureEnd'))
   const rows=!last||first===last?[first]:[first,last]
   return {ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:'read'+stream,throughSeq:through,root,rows,canonicalCapabilities:indexedAttachment(rows),first:0,terminal:last?rows.length-1:null,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}}
  },
  canonical_history_stream_select:()=>({ok:true,value:null}),
  canonical_history_stream_cancel:body=>({ok:true,value:{streamId:body.streamId,requestId:body.requestId}}),
 }
 const fake={connected:true,timeout:()=>fake,async emitWithAck(event:string,body:Record<string,unknown>){requests.push({event,body});return handlers[event](body)}}
 const socket=fake as unknown as Socket<ServerToClientEvents,ClientToServerEvents>
 return {offer,socket,requests,handlers,setCurrent(value:boolean){current=value},open:()=>openCanonicalIndexedRoomForSocket(socket,offer,{expectedBoardId:'room',isCurrent:()=>current})}
}
