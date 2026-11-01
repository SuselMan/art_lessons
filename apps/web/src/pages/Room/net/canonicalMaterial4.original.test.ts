/// <reference types="node" />
import {createHash} from 'node:crypto'
import {beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../../lib/api/brushLibrary',()=>({prepareCanonicalImageAssets:vi.fn(async(_room:string,_assets:unknown,current:()=>void)=>{current()})}))
import {prepareCanonicalImageAssets} from '../../../lib/api/brushLibrary'
import actual from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json' with {type:'json'}
import {canonicalBrushDescriptorJSON,canonicalDefaultAutoFixedTextureSourceBinding,extractCanonicalDefaultAutoFixedTextureCapability,canonicalTexturedSourceMaterialContext,canonicalStrokeSnapshotV4,sourceAutoGeometry,buildCanonicalMaterial,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,type BrushDescriptor,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV4,type CanonicalRecordedAttachmentV1,type RoomStateLegacyPayload,type CanonicalStrokeBeginResult} from '@grafetto/shared'
import {prepareCanonicalRoomState} from './canonicalRoomState'
import {sendCanonicalStrokeBegin,type CanonicalBeginEmitter} from './sendCanonicalStrokeBegin'
import {prepareCanonicalRecordedImageResources} from './canonicalRecordedDelivery'
import {createCanonicalRoomAuthor} from '../canonicalRoomController'
import {canonicalToolAvailability} from '../../../lib/tools/canonicalToolAvailability'
import {indexedSocketFixture} from '../../../engine/testing/canonicalIndexedReadFixture'
const token='fixed-default-auto-texture-v4' as const
function fixed(){
 const descriptor=structuredClone(actual.descriptor) as unknown as BrushDescriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 const cap=extractCanonicalDefaultAutoFixedTextureCapability(descriptor,{pattern:actual.patternAsset});if(!cap.supported)throw Error(cap.reasons.join(','))
 const pin=canonicalDefaultAutoFixedTextureSourceBinding(descriptor,sha,'neon64-f32-fma-v1',actual.patternAsset,G)
 const material=canonicalTexturedSourceMaterialContext({version:4,assets:[cap.capability.patternAsset],primarySource:pin,primaryTexture:cap.capability.primaryTexture,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const composition={mode:cap.capability.mode,outerBlend:'over' as const,alphaDarken:'hard' as const,outerResourceOpacity:1},brush=`brush:${descriptor.id}@${descriptor.version}`
 const snapshot=canonicalStrokeSnapshotV4({layerId:'layer-1',brush,strokeId:'fixed0',boardEpoch:2,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[1,2,3],composition,assets:material.assets,materialVersion:4,material},2,G)
 return{descriptor,sha,material,snapshot}
}
function operation(s:CanonicalStrokeSnapshotV4,seq=1):CanonicalStrokeOperation{
 const p=s.material.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:p.source.diameter,ratio:p.source.ratio,spikes:2,scale:p.brushScale,angle:p.brushAngle},{scale:1,ratio:1,rotation:0})
 const recipe={kind:'defaultAuto' as const,source:p.source,coverageProfile:p.coverageProfile,brushScale:p.brushScale,brushAngle:p.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1,grainDepth:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},s.material).packed
 return{id:'fixed'+seq,userId:'actor',timestamp:seq,seq,type:'canonical_stroke',layerId:'layer-1',frame:{version:2,rasterProfile:G,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
}
function attachment(rows:readonly CanonicalStrokeOperation[],snapshots:readonly CanonicalStrokeSnapshotV4[]):CanonicalRecordedAttachmentV1{
 const selected=rows.map(op=>{const s=snapshots.find(s=>s.strokeId===op.frame.strokeId);if(!s)throw Error('Original snapshot missing');return s})
 return{version:1,roomId:'room',boardEpoch:2,capabilities:selected.map(snapshot=>({originalUserId:'actor',snapshot})),bindings:rows.map((op,i)=>({operationId:op.id,sequence:op.seq!,originalUserId:'actor',capability:i}))}
}
function full(author=true){
 const x=fixed(),op=operation(x.snapshot)
 const wire:RoomStateLegacyPayload={room:{id:'room',name:'Test',ownerId:'actor',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-11-01T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[G]},canonicalAuthorRasterProfile:G,canonicalCapabilities:attachment([op],[x.snapshot]),...(author?{canonicalAuthorTexturedSource:token}:{})}
 let current=true;const prepare=()=>prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>current})
 return{...x,wire,prepare,setCurrent(v:boolean){current=v}}
}
function socket(){
 let respond!:(r:CanonicalStrokeBeginResult)=>void;const listeners=new Set<()=>void>(),sent:unknown[]=[]
 const emitter:CanonicalBeginEmitter={emit:(_e,request,ack)=>{sent.push(request);respond=ack},on:(_e,l)=>{listeners.add(l)},off:(_e,l)=>{listeners.delete(l)}}
 return{emitter,sent,listeners,ack:(s:CanonicalStrokeSnapshotV4)=>respond({ok:true,snapshot:s,recordedNext:0,liveNext:0,ended:false})}
}
function request(s:CanonicalStrokeSnapshotV4){return{layerId:s.layerId,brush:s.brush,strokeId:s.strokeId,pigmentRgb8:s.pigmentRgb8,outerResourceOpacity:s.composition.outerResourceOpacity,alphaDarken:s.composition.alphaDarken}}
function indexed(count=1,author=true){
 const x=fixed(),snapshots=Array.from({length:count},(_,i)=>canonicalStrokeSnapshotV4({...x.snapshot,strokeId:'fixed'+i},2,G)),operations=snapshots.map((s,i)=>operation(s,i+1)),f=indexedSocketFixture(operations,64)
 Reflect.set(f.offer.scope,'allowedRasterProfiles',[G]);Reflect.set(f.offer,'authorRasterProfile',G);if(author)Reflect.set(f.offer,'authorTexturedSource',token)
 let replyPolicy:typeof token|undefined=author?token:undefined
 for(const event of ['canonical_history_stream_open','canonical_history_stream_reopen']){const previous=f.handlers[event];f.handlers[event]=async body=>{const r=await previous(body) as {ok:true;value:Record<string,unknown>};return{...r,value:{...r.value,...replyPolicy?{authorTexturedSource:replyPolicy}:{}}}}}
 const next=f.handlers.canonical_history_stream_next;f.handlers.canonical_history_stream_next=async body=>{const r=await next(body) as {ok:true;value:{operations:CanonicalStrokeOperation[]}};return{...r,value:{...r.value,canonicalCapabilities:attachment(r.value.operations,snapshots)}}}
 const evidence=(body:Record<string,unknown>)=>{const root=body.root as {firstSequence:number},op=operations[root.firstSequence-1];return{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:operations.length,root:body.root,rows:[op],canonicalCapabilities:attachment([op],snapshots),first:0,terminal:0,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}}
 f.handlers.canonical_history_stream_evidence=body=>({ok:true,value:evidence(body)})
 return{...f,...x,snapshots,operations,setReplyPolicy(value:typeof token|undefined){replyPolicy=value}}
}
beforeEach(()=>{vi.mocked(prepareCanonicalImageAssets).mockReset();vi.mocked(prepareCanonicalImageAssets).mockImplementation(async(_r,_a,c)=>{c()})})
it('reads original4 with AUTHOR OFF; ON captures optional metadata once and reconnect OFF never refreshes old origin',async()=>{
 const f=full(),prepared=f.prepare(),read=prepared.canonicalRead;expect(read.authorTexturedSource).toBe(token)
 Reflect.deleteProperty(f.wire,'canonicalAuthorTexturedSource');expect(read.authorTexturedSource).toBe(token);f.setCurrent(false);expect(()=>read.assertCurrent()).toThrow()
 const off=full(false),received=off.prepare();expect(received.canonicalRead.authorTexturedSource).toBeUndefined();expect(received.canonicalRead.preparedAtoms[0].read!.capability.snapshot.materialVersion).toBe(4)
 await prepareCanonicalRecordedImageResources(received.canonicalRead.preparedAtoms,received.canonicalRead.scope)
 expect(prepareCanonicalImageAssets).toHaveBeenCalledWith('room',off.snapshot.assets,expect.any(Function))
 let called=0;const invalid=full(false);Object.defineProperty(invalid.wire,'canonicalAuthorTexturedSource',{get(){called++;return token}});expect(()=>invalid.prepare()).toThrow();expect(called).toBe(0)
})
it('requires captured original author4 and original descriptorSHA before BEGIN4, immutable across async wait',async()=>{
 const f=full(),s=socket(),lifetime={boardEpoch:2,authorRasterProfile:G,authorTexturedSource:token,expectedDescriptorSha256:f.sha,isCurrent:()=>true}
 const pending=sendCanonicalStrokeBegin(s.emitter,request(f.snapshot),lifetime);Reflect.set(lifetime,'authorTexturedSource',undefined);lifetime.expectedDescriptorSha256='b'.repeat(64);s.ack(f.snapshot)
 const result=await pending;expect(result.ok).toBe(true);if(!result.ok||result.snapshot.materialVersion!==4)throw Error('Expected admitted4')
 expect(result.snapshot.assets).toHaveLength(1);expect(result.snapshot.descriptorSha256).toBe(f.sha);expect(Object.isFrozen(result.snapshot.material.primarySource.source)).toBe(true);expect(s.listeners.size).toBe(0)
})
it.each(['policyOFF','missingSHA','wrongSHA','asset','selectorGetter'] as const)('refuses BEGIN4 %s without fallback/leaked listeners',async mode=>{
 const f=full(),s=socket(),value=structuredClone(f.snapshot),lifetime={boardEpoch:2,authorRasterProfile:G,isCurrent:()=>true,...mode==='policyOFF'?{}:{authorTexturedSource:token},...mode==='missingSHA'?{}:{expectedDescriptorSha256:mode==='wrongSHA'?'b'.repeat(64):f.sha}}
 if(mode==='asset')Reflect.set(value.material.assets[0],'width',1)
 let calls=0;if(mode==='selectorGetter')Object.defineProperty(value,'materialVersion',{get(){calls++;return 4},enumerable:true})
 const promise=sendCanonicalStrokeBegin(s.emitter,request(f.snapshot),lifetime),rejected=expect(promise).rejects.toThrow();s.ack(value);await rejected;expect(calls).toBe(0);expect(s.listeners.size).toBe(0)
})
it('controller forwards ONLY actual original policy into service/BEGIN; stale read cannot emit',async()=>{
 const f=full(),s=socket(),read=f.prepare().canonicalRead,service=createCanonicalRoomAuthor(read,s.emitter,()=>s.emitter,()=>true)
 expect(service).toHaveProperty('texturedSource',token);Reflect.deleteProperty(f.wire,'canonicalAuthorTexturedSource')
 const pending=service.begin(request(f.snapshot),{signal:new AbortController().signal,isCurrent:()=>true,expectedDescriptorSha256:f.sha});s.ack(f.snapshot);expect((await pending).ok).toBe(true)
 f.setCurrent(false);await expect(service.begin(request(f.snapshot),{signal:new AbortController().signal,isCurrent:()=>true,expectedDescriptorSha256:f.sha})).rejects.toThrow();expect(s.sent).toHaveLength(1)
 const off=full(false);expect(createCanonicalRoomAuthor(off.prepare().canonicalRead,s.emitter,()=>s.emitter,()=>true)).not.toHaveProperty('texturedSource')
})
it('offers the genuine retained Regular only with the SAME captured original author4 flag',()=>{
 const f=full(),brush={name:actual.name,source:'original normal import metadata',descriptor:f.descriptor,warnings:[]},metadata=()=>[actual.patternAsset]
 const on=canonicalToolAvailability(true,true,f.prepare().canonicalRead,[brush],metadata);expect(on?.options).toEqual([{id:f.descriptor.id,sizePx:40}])
 const off=full(false);expect(canonicalToolAvailability(true,true,off.prepare().canonicalRead,[brush],metadata)?.options).toEqual([])
 const read=f.prepare().canonicalRead;f.setCurrent(false);expect(canonicalToolAvailability(true,true,read,[brush],metadata)?.status).toBe('restoring')
})
it('captures actual indexed OPEN policy and rejects mismatch before mint; finite cancel never refreshes parent',async()=>{
 const f=indexed(),read=await f.open();expect(read.lifetime.authorTexturedSource).toBe(token)
 const page=await read.nextPage(),input=page.inputs()[0];expect(prepareCanonicalImageAssets).toHaveBeenCalledWith('room',f.snapshot.assets,expect.any(Function));page.release()
 const end=await read.nextPage(),cut=read.finish(end);end.release();await read.cancel();expect(()=>cut.assertCurrent(cut)).not.toThrow();expect(()=>input.delivery.assertCurrent(input)).not.toThrow()
 f.setReplyPolicy(undefined);await expect(read.lifetime.follow(cut)).rejects.toThrow();expect(read.lifetime.authorTexturedSource).toBe(token)
 const mismatch=indexed();mismatch.setReplyPolicy(undefined);await expect(mismatch.open()).rejects.toThrow()
 const off=indexed(0,false);expect((await off.open()).lifetime.authorTexturedSource).toBeUndefined()
})
it('dedupes a real64-capability pattern-only4 page and forbids reentry/cut advancement during finite asset wait',async()=>{
 const f=indexed(64),read=await f.open();let resume!:()=>void
 vi.mocked(prepareCanonicalImageAssets).mockImplementationOnce((_r,_a,current)=>new Promise<void>((resolve,reject)=>{resume=()=>{try{current();resolve()}catch(e){reject(e)}}}))
 const pending=read.nextPage();await vi.waitFor(()=>expect(resume).toBeTypeOf('function'));await expect(read.nextPage()).rejects.toThrow();expect(f.requests.filter(r=>r.event==='canonical_history_stream_next')).toHaveLength(1)
 await read.cancel();resume();await expect(pending).rejects.toThrow();expect(prepareCanonicalImageAssets).toHaveBeenCalledOnce();expect(vi.mocked(prepareCanonicalImageAssets).mock.calls[0][1]).toHaveLength(1);expect(()=>read.lifetime.assertCurrent()).not.toThrow()
})
it('loads original4 root evidence through the SAME asset helper, never NativeImage/direct append',async()=>{
 const f=indexed(),read=await f.open(),page=await read.nextPage(),input=page.inputs()[0];page.release()
 const proof=await read.rootEvidence(input);expect(proof.assertCurrent(proof,input).first.operation.id).toBe(input.operation.id);expect(prepareCanonicalImageAssets).toHaveBeenCalledTimes(2);proof.release();await read.cancel()
})
