import{pressureTextureFixture}from'./canonicalPressureTexture.testFixture'
import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../../lib/api/brushLibrary',()=>({prepareCanonicalImageAssets:vi.fn(async(_room:string,_assets:unknown,assertCurrent:()=>void)=>{assertCurrent()})}))
import {prepareCanonicalImageAssets} from '../../../lib/api/brushLibrary'
import {buildCanonicalMaterial,canonicalPrimaryTextureMaterialContext,canonicalStrokeSnapshotV3,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,type CanonicalStrokeOperation,type CanonicalRecordedAttachmentV1} from '@grafetto/shared'
import {openCanonicalIndexedRoomForSocket} from './canonicalIndexedRead'
import {indexedSocketFixture} from '../../../engine/testing/canonicalIndexedReadFixture'
function imageFixture(count=1){
 const snapshots=Array.from({length:count},(_,i)=>{
  const asset=(n:number)=>({id:('asset:'+n.toString(16).padStart(64,'0'))as `asset:${string}`,size:8,x:0,y:0,width:4,height:4}),tip=asset(i*2+1),pattern=asset(i*2+2)
  const material=canonicalPrimaryTextureMaterialContext({version:3,assets:[tip,pattern],primarySource:{kind:'image',asset:tip.id,brushScale:1,brushAngle:0},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}})
  return canonicalStrokeSnapshotV3({materialVersion:3,material,assets:material.assets,boardEpoch:2,layerId:'layer-1',brush:'brush:test@1',strokeId:'image'+i,descriptorSha256:'a'.repeat(64),rasterProfile:G,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}},2,G)
 })
 const operations:CanonicalStrokeOperation[]=snapshots.map((s,i)=>({id:'image'+i,userId:'actor',timestamp:i,seq:i+1,type:'canonical_stroke',layerId:'layer-1',frame:{version:2,rasterProfile:G,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{kind:'gestureEnd',at:0}]},s.material).packed}}))
 const f=indexedSocketFixture(operations,64);Reflect.set(f.offer.scope,'allowedRasterProfiles',[G]);Reflect.set(f.offer,'authorRasterProfile',G)
 const attachment=(rows:readonly CanonicalStrokeOperation[]):CanonicalRecordedAttachmentV1=>({version:1,roomId:'room',boardEpoch:2,capabilities:rows.map(op=>({originalUserId:op.userId,snapshot:snapshots.find(s=>s.strokeId===op.frame.strokeId)!})),bindings:rows.map((op,i)=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:i}))})
 const next=f.handlers.canonical_history_stream_next
 f.handlers.canonical_history_stream_next=async body=>{const reply=await next(body)as {ok:true;value:{operations:CanonicalStrokeOperation[]}};return{...reply,value:{...reply.value,canonicalCapabilities:attachment(reply.value.operations)}}}
 const evidence=(body:Record<string,unknown>)=>{const root=body.root as {firstSequence:number},op=operations[root.firstSequence-1];return{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:operations.length,root:body.root,rows:[op],canonicalCapabilities:attachment([op]),first:0,terminal:0,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}}
 f.handlers.canonical_history_stream_evidence=body=>({ok:true,value:evidence(body)})
 f.handlers.canonical_history_stream_select=body=>({ok:true,value:{targetOperationId:operations[0].id,evidence:evidence({...body,root:{originalUserId:'actor',strokeId:operations[0].frame.strokeId,layerId:'layer-1',firstOperationId:operations[0].id,firstSequence:1}})}})
 return{...f,operations,snapshots}
}
beforeEach(()=>{vi.mocked(prepareCanonicalImageAssets).mockReset();vi.mocked(prepareCanonicalImageAssets).mockImplementation(async(_room,_assets,assertCurrent)=>{assertCurrent()})})
it('prepares BOTH original CAS roles before page/evidence exposure and keeps SAME minted input alive',async()=>{
 const f=imageFixture(),read=await f.open(),page=await read.nextPage(),input=page.inputs()[0]
 expect(prepareCanonicalImageAssets).toHaveBeenCalledWith('room',f.snapshots[0].assets,expect.any(Function));expect(input.delivery.lifetime).toBe(read.lifetime)
 const proof=await read.rootEvidence(input);expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(2);expect(proof.assertCurrent(proof,input).first.operation.id).toBe(input.operation.id)
 proof.release();page.release();const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel();expect(()=>cut.assertCurrent(cut)).not.toThrow();expect(()=>input.delivery.assertCurrent(input)).not.toThrow()
})
it('serializes a genuine64-capability page into64+64 assets and forbids reentry while availability waits',async()=>{
 const f=imageFixture(64),read=await f.open();let resume!:()=>void
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(error){reject(error)}}}))
 const pending=read.nextPage();await vi.waitFor(()=>expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce())
 await expect(read.nextPage()).rejects.toThrow();expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
 resume();const page=await pending;expect(page.inputs()).toHaveLength(64);expect(vi.mocked(prepareCanonicalImageAssets).mock.calls.map(c=>c[1].length)).toEqual([64,64]);page.release();await read.cancel()
})
it('finite cancellation between asset batches stops next batch without expiring original origin',async()=>{
 const f=imageFixture(64),read=await f.open();vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce(async()=>{await read.cancel()})
 await expect(read.nextPage()).rejects.toThrow();expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce();expect(()=>read.lifetime.assertCurrent()).not.toThrow()
})
it('does not advance a failed FOLLOW and keeps the previously published cut usable for recovery',async()=>{
 const f=imageFixture(),read=await f.open(),page=await read.nextPage();page.release();const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel()
 const snapshot=canonicalStrokeSnapshotV3({...f.snapshots[0],strokeId:'next-image'},2,G);f.snapshots.push(snapshot);f.operations.push({...f.operations[0],id:'next-image',seq:2,frame:{...f.operations[0].frame,strokeId:snapshot.strokeId}})
 const follow=await read.lifetime.follow(cut),fault=Error('actual availability failure');vi.mocked(prepareCanonicalImageAssets).mockRejectedValueOnce(fault)
 await expect(follow.nextPage()).rejects.toBe(fault);expect(()=>cut.assertCurrent(cut)).not.toThrow();await follow.cancel()
 const retry=await read.lifetime.reopen(cut);expect((await retry.nextPage()).afterSeq).toBe(0);await retry.cancel()
})
it('select evidence owns completed A while cancelled unfinished B is current through async asset wait',async()=>{
 const f=imageFixture(),read=await f.open(),page=await read.nextPage();page.release();const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel();const cancelled=await read.lifetime.reopen(cut);await cancelled.cancel();let resume!:()=>void
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(error){reject(error)}}}))
 const selecting=read.lifetime.selectHistory(cut,'undo');await vi.waitFor(()=>expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(2));const requests=f.requests.length
 await expect(read.lifetime.selectHistory(cut,'undo')).rejects.toThrow();await expect(read.lifetime.follow(cut)).rejects.toThrow();await expect(read.lifetime.reopen(cut)).rejects.toThrow();expect(f.requests).toHaveLength(requests)
 resume();const selected=await selecting;expect(selected).not.toBeNull();selected!.assertCurrent(selected!,cut);selected!.release();expect(()=>cut.assertCurrent(cut)).not.toThrow()
})
it('native/empty metadata pages do not invoke the image availability helper',async()=>{
 const f=indexedSocketFixture(),read=await f.open(),page=await read.nextPage(),input=page.inputs()[0],proof=await read.rootEvidence(input);proof.release();page.release();const end=await read.nextPage();read.finish(end);end.release();expect(prepareCanonicalImageAssets).not.toHaveBeenCalled()
})

it('does not publish root witnesses after finite evidence cancellation during asset preparation',async()=>{
 const f=imageFixture(),read=await f.open(),page=await read.nextPage(),input=page.inputs()[0];page.release();let resume!:()=>void
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(error){reject(error)}}}))
 const evidence=read.rootEvidence(input);await vi.waitFor(()=>expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(2));await read.cancel();resume()
 await expect(evidence).rejects.toThrow();expect(()=>input.delivery.assertCurrent(input)).not.toThrow();expect(()=>read.lifetime.assertCurrent()).not.toThrow()
})

it('rechecks finite ownership after original current callbacks before asset launch',async()=>{
 const f=imageFixture();let cancel:(()=>void)|undefined,armed=false
 const read=await openCanonicalIndexedRoomForSocket(f.socket,f.offer,{expectedBoardId:'room',isCurrent:()=>{if(armed){armed=false;cancel?.()}return true}})
 cancel=()=>{void read.cancel()}
 // The loader delegates its existing current check; cancellation reenters from
 // the original parent callback while that check is executing.
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce(async(_room,_assets,assertCurrent)=>{armed=true;assertCurrent();throw Error('loader continued after cancellation')})
 await expect(read.nextPage()).rejects.not.toThrow('loader continued after cancellation')
 expect(armed).toBe(false);expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce();expect(()=>read.lifetime.assertCurrent()).not.toThrow()
})

it.each(['page','evidence','select'] as const)('keeps the inner %s latch when original current callbacks reenter before outer claim',async mode=>{
 const f=imageFixture();let reenter:(()=>void)|undefined
 const read=await openCanonicalIndexedRoomForSocket(f.socket,f.offer,{expectedBoardId:'room',isCurrent:()=>{const callback=reenter;reenter=undefined;callback?.();return true}})
 let invoke:()=>Promise<unknown>
 if(mode==='page')invoke=()=>read.nextPage()
 else{
  const page=await read.nextPage(),input=page.inputs()[0];page.release()
  if(mode==='evidence')invoke=()=>read.rootEvidence(input)
  else{const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel();invoke=()=>read.lifetime.selectHistory(cut,'undo')}
 }
 let resume!:()=>void,inner!:Promise<unknown>
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(error){reject(error)}}}))
 reenter=()=>{inner=invoke()}
 await expect(invoke()).rejects.toThrow()
 await vi.waitFor(()=>expect(resume).toBeTypeOf('function'))
 const requests=f.requests.length
 await expect(invoke()).rejects.toThrow();expect(f.requests).toHaveLength(requests)
 resume();const value=await inner;expect(value).toBeDefined();expect(()=>read.lifetime.assertCurrent()).not.toThrow();await read.cancel()
})
it.each(['follow','reopen'] as const)('does not send %s when a cut callback starts an inner select',async mode=>{
 const f=imageFixture();let reenter:(()=>void)|undefined
 const read=await openCanonicalIndexedRoomForSocket(f.socket,f.offer,{expectedBoardId:'room',isCurrent:()=>{const callback=reenter;reenter=undefined;callback?.();return true}})
 const page=await read.nextPage();page.release();const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel()
 let resume!:()=>void,inner!:ReturnType<typeof read.lifetime.selectHistory>
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(error){reject(error)}}}))
 const before=f.requests.length;reenter=()=>{inner=read.lifetime.selectHistory(cut,'undo')}
 await expect(read.lifetime[mode](cut)).rejects.toThrow()
 await vi.waitFor(()=>expect(resume).toBeTypeOf('function'));expect(f.requests.slice(before).map(r=>r.event)).toEqual(['canonical_history_stream_select'])
 await expect(read.lifetime[mode](cut)).rejects.toThrow();expect(f.requests.length).toBe(before+1)
 resume();const selected=await inner;expect(selected).not.toBeNull();selected!.release();expect(()=>cut.assertCurrent(cut)).not.toThrow()
})


function pressureResourceFixture(){
 const data=pressureTextureFixture(),f=indexedSocketFixture([data.operation]);Reflect.set(f.offer.scope,'allowedRasterProfiles',[G]);Reflect.set(f.offer,'authorRasterProfile',G);const old=f.handlers.canonical_history_stream_next;f.handlers.canonical_history_stream_next=async body=>{const reply=await old(body)as{ok:true;value:{operations:CanonicalStrokeOperation[]}};return{...reply,value:{...reply.value,canonicalCapabilities:reply.value.operations.length?data.attachment:{...data.attachment,capabilities:[],bindings:[]}}}};const evidence=(body:Record<string,unknown>)=>({kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:1,root:body.root,rows:[data.operation],canonicalCapabilities:data.attachment,first:0,terminal:0,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null});f.handlers.canonical_history_stream_evidence=body=>({ok:true,value:evidence(body)});f.handlers.canonical_history_stream_select=body=>({ok:true,value:{targetOperationId:data.operation.id,evidence:evidence({...body,root:{originalUserId:'actor',strokeId:data.snapshot.strokeId,layerId:'L',firstOperationId:data.operation.id,firstSequence:1}})}})
 return{f,data}
}
it('prepares ONLY original5 pattern before actual page/evidence/select and never invents an image tip',async()=>{
 const{f,data}=pressureResourceFixture();
 const read=await f.open();let resume!:()=>void;vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(e){reject(e)}}}));let exposed=false;const pending=read.nextPage().then(v=>{exposed=true;return v});await vi.waitFor(()=>expect(resume).toBeTypeOf('function'));expect(exposed).toBe(false);expect(prepareCanonicalImageAssets).toHaveBeenCalledWith('room',data.snapshot.assets,expect.any(Function));resume();const page=await pending,input=page.inputs()[0],proof=await read.rootEvidence(input);proof.release();page.release();const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel();const selected=await read.lifetime.selectHistory(cut,'undo');expect(selected).not.toBeNull();expect(vi.mocked(prepareCanonicalImageAssets).mock.calls).toHaveLength(3);expect(vi.mocked(prepareCanonicalImageAssets).mock.calls.every(c=>c[1].length===1&&c[1][0].id===data.snapshot.assets[0].id)).toBe(true);expect(()=>cut.assertCurrent(cut)).not.toThrow();await read.cancel()
})

it.each(['failure','cancel']as const)('does not expose/advance original5 page on resource %s, preserving original lifetime',async mode=>{const{f}=pressureResourceFixture(),read=await f.open();if(mode==='failure'){vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce(async()=>{throw Error('controlled CAS failure')});await expect(read.nextPage()).rejects.toThrow('CAS');const page=await read.nextPage();expect(page.inputs()[0].operation.seq).toBe(1);page.release();const requests=f.requests.filter(r=>r.event==='canonical_history_stream_next');expect(requests).toHaveLength(2);expect(requests.every(r=>r.body.afterSeq===0)).toBe(true)}else{let resume!:()=>void;vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_room,_assets,assertCurrent)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{assertCurrent();resolve()}catch(e){reject(e)}}}));const outcome=read.nextPage().then(value=>({value,error:undefined}),error=>({value:undefined,error}));await vi.waitFor(()=>expect(resume).toBeTypeOf('function'));await read.cancel();resume();expect((await outcome).error).toBeInstanceOf(Error);expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce();expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)}expect(()=>read.lifetime.assertCurrent()).not.toThrow();await read.cancel()})
