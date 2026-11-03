import {expect,it} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from './canonicalRoomState'
import {prepareCanonicalOriginalAttachment,attachCanonicalRecordedDelivery} from './canonicalRecordedDelivery'
function fixture(browser=false){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:browser?'browser-number-coverage-v1':'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:browser?'eigen-5.0.1-source-functional-f64-v1':'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:browser?B:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0}]},material).packed
 const common={brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:browser?{...common,version:2,rasterProfile:B}:{...common,version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function state(browser=false){
 const f=fixture(browser)
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[f.op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:f.expected,canonicalCapabilities:f.attachment,...browser?{canonicalAuthorRasterProfile:B,canonicalReadScope:{...f.expected,allowedRasterProfiles:[B]},canonicalPlainAutoGeometrySource:'dynamic-auto-geometry-v1',canonicalAuthorPlainAutoGeometrySource:'dynamic-auto-geometry-v1'}:{}}
 return {state,f}
}

function next(f:ReturnType<typeof fixture>){
 const snapshot=f.attachment.capabilities[0].snapshot
 if(snapshot.materialVersion!==2)throw Error('Actual source2 snapshot required')
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{kind:'gestureEnd',at:0}]},snapshot.material).packed
 const operation:CanonicalStrokeOperation={...f.op,id:'op-end',timestamp:1,seq:2,frame:{...f.op.frame,frameOrdinal:1,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={...f.attachment,capabilities:structuredClone(f.attachment.capabilities),bindings:[{operationId:operation.id,sequence:2,originalUserId:operation.userId,capability:0}]}
 return{operation,attachment}
}
it.each([false,true])('shares initial room capability across separately normalized live END (browser=%s) with exact per-frame delivery',browser=>{
 const h=state(browser),p=prepareCanonicalRoomState(h.state,{expectedBoardId:'room',isCurrent:()=>true}),scope=p.canonicalRead.scope
 const first=p.canonicalRead.preparedAtoms[0],n=next(h.f),mutableRGB:[number,number,number]=[1,2,3]
 n.attachment={...n.attachment,capabilities:[{...n.attachment.capabilities[0],snapshot:{...n.attachment.capabilities[0].snapshot,pigmentRgb8:mutableRGB}}]}
 const second=prepareCanonicalOriginalAttachment(n.attachment,[n.operation],scope)[0]
 expect(second.read).not.toBe(first.read);expect(second.operation).not.toBe(first.operation)
 expect(second.read?.capability).toBe(first.read?.capability)
 expect(second.read).toMatchObject({operationId:'op-end',sequence:2})
 expect(first.read).toMatchObject({operationId:'op',sequence:1})
 const input=attachCanonicalRecordedDelivery(second,scope);if(!('delivery'in input))throw Error('Genuine original delivery required')
 expect(input.read).toBe(second.read);input.delivery.assertCurrent(input)
 expect(()=>input.delivery.assertCurrent({...input})).toThrow()
 expect(Object.isFrozen(input.read?.capability.snapshot.material)).toBe(true)
 // Sharing never retains mutable ingress wire metadata.
 mutableRGB[0]=99
 expect(input.read?.capability.snapshot.pigmentRgb8).toEqual([1,2,3])
})
it.each(['pigment','opacity','coefficients','signed-zero'] as const)('rejects changed normalized %s rather than substituting old stroke data',field=>{
 const h=state(),p=prepareCanonicalRoomState(h.state,{expectedBoardId:'room',isCurrent:()=>true}),n=next(h.f);let raw=n.attachment.capabilities[0].snapshot
 if(raw.materialVersion!==2||raw.material.primarySource.kind!=='softAuto')throw Error('Actual Soft context required')
 if(field==='pigment'){raw={...raw,pigmentRgb8:[5,2,3]};n.operation={...n.operation,frame:{...n.operation.frame,pigmentRgb8:raw.pigmentRgb8}}}
 if(field==='opacity'){raw={...raw,composition:{...raw.composition,outerResourceOpacity:.75}};n.operation={...n.operation,frame:{...n.operation.frame,composition:raw.composition}}}
 if(field==='coefficients'||field==='signed-zero'){const source=raw.material.primarySource;if(source.kind!=='softAuto')throw Error('Soft source required');raw={...raw,material:{...raw.material,primarySource:{...source,radialCurve:{...source.radialCurve,coefficients:source.radialCurve.coefficients.map((v,i)=>i===0?[field==='signed-zero'?-0:.125,v[1],v[2],v[3]] as const:v)}}}}}
 n.attachment={...n.attachment,capabilities:[{...n.attachment.capabilities[0],snapshot:raw}]}
 expect(()=>prepareCanonicalOriginalAttachment(n.attachment,[n.operation],p.canonicalRead.scope)).toThrow('Original recorded stroke capability changed')
 expect(p.canonicalRead.preparedAtoms[0].read?.capability.snapshot.pigmentRgb8).toEqual([1,2,3])
})
it('does not share across original lifetime replacement and keeps stale delivery invalid',()=>{
 const h=state();let current=true
 const first=prepareCanonicalRoomState(h.state,{expectedBoardId:'room',isCurrent:()=>current}),second=prepareCanonicalRoomState(structuredClone(h.state),{expectedBoardId:'room',isCurrent:()=>true})
 const a=first.canonicalRead.preparedAtoms[0],b=second.canonicalRead.preparedAtoms[0]
 expect(a.read?.capability).not.toBe(b.read?.capability)
 const n=next(h.f),live=attachCanonicalRecordedDelivery(prepareCanonicalOriginalAttachment(n.attachment,[n.operation],first.canonicalRead.scope)[0],first.canonicalRead.scope)
 if(!('delivery'in live))throw Error('Original delivery required')
 current=false;expect(()=>live.delivery.assertCurrent(live)).toThrow()
 expect(()=>prepareCanonicalOriginalAttachment(n.attachment,[n.operation],first.canonicalRead.scope)).toThrow()
})
it('a bounded weak-index miss keeps original validation and never aliases an unrelated stroke',()=>{
 const h=state(),p=prepareCanonicalRoomState(h.state,{expectedBoardId:'room',isCurrent:()=>true}),first=p.canonicalRead.preparedAtoms[0]
 for(let i=0;i<64;i++){
  const f=fixture(),snapshot=f.attachment.capabilities[0].snapshot,strokeId='other-'+i
  f.attachment={...f.attachment,capabilities:[{...f.attachment.capabilities[0],snapshot:{...snapshot,strokeId}}]};f.op={...f.op,id:'other-op-'+i,seq:i+10,frame:{...f.op.frame,strokeId}}
  f.attachment={...f.attachment,bindings:[{operationId:f.op.id,sequence:i+10,originalUserId:'author',capability:0}]}
  prepareCanonicalOriginalAttachment(f.attachment,[f.op],p.canonicalRead.scope)
 }
 const n=next(h.f),again=prepareCanonicalOriginalAttachment(n.attachment,[n.operation],p.canonicalRead.scope)[0]
 expect(again.read?.capability).not.toBe(first.read?.capability)
 expect(again.read?.capability).toEqual(first.read?.capability)
 expect(again.operation).toMatchObject({id:'op-end',seq:2})
})

it.each(['sparse-array','hidden-record-field','hidden-array-field'] as const)('never launders a deeply frozen malformed %s through a valid shared capability',kind=>{
 const h=state(),p=prepareCanonicalRoomState(h.state,{expectedBoardId:'room',isCurrent:()=>true}),first=p.canonicalRead.preparedAtoms[0]
 if(!first.read)throw Error('Original read required')
 const original=first.read.capability,snapshot=structuredClone(original.snapshot),pigment=[1,2,3]
 if(kind==='sparse-array')pigment.length=4
 if(kind==='hidden-array-field')Object.defineProperty(pigment,'hidden',{value:1,enumerable:false})
 const captured={...snapshot,pigmentRgb8:pigment}
 if(kind==='hidden-record-field')Object.defineProperty(captured,'hidden',{value:1,enumerable:false})
 const capability={originalUserId:original.originalUserId,snapshot:captured}
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){for(const field of Object.values(Object.getOwnPropertyDescriptors(value)))if(Object.hasOwn(field,'value'))freeze(field.value);Object.freeze(value)}}
 freeze(capability)
 const malformed={operation:first.operation,read:{...first.read,capability}}
 const input=attachCanonicalRecordedDelivery(malformed as unknown as typeof first,p.canonicalRead.scope)
 if(!('delivery'in input)||!input.read)throw Error('Exact original delivery wrapper required')
 // It may reach the original downstream validator, but cannot become the
 // previously validated graph or receive shared-body accounting credit.
 expect(input.read.capability).toBe(capability);expect(input.read.capability).not.toBe(original)
 if(kind==='sparse-array')expect(input.read.capability.snapshot.pigmentRgb8.length).toBe(4)
 else expect(Object.hasOwn(kind==='hidden-record-field'?input.read.capability.snapshot:input.read.capability.snapshot.pigmentRgb8,'hidden')).toBe(true)
 expect(first.read.capability).toBe(original)
})
