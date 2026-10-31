import {expect,it} from 'vitest'
import {sourceAutoGeometry,canonicalSoftAutoSourcePin,buildCanonicalMaterial,CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,prepareCanonicalRecordedAttachment,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type CanonicalRecordedAttachmentV1} from '@grafetto/shared'
import {OperationLog} from './OperationLog'
function fixture(){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:3,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:3,originalUserId:'author',capability:0}]}
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
function atom() { const f=fixture();return prepareCanonicalRecordedAttachment(f.attachment,[f.op],f.expected)[0] }
it('retains read authority on existing entries using serverSeq independently of local renumbering',()=>{
 const log=new OperationLog(),a=atom(),read=a.read!,op=a.operation as CanonicalStrokeOperation
 log.append(op,{serverSeq:3,canonicalRead:read})
 const second={...op,id:'op2',seq:4,frame:{...op.frame,frameOrdinal:1}}
 log.append(second,{serverSeq:4,canonicalRead:{...read,operationId:'op2',sequence:4}})
 expect(log.entries.map(e=>[e.op.seq,e.serverSeq,e.canonicalRead?.sequence])).toEqual([[0,3,3],[1,4,4]])
 expect(log.entries[1].canonicalRead?.capability).toBe(log.entries[0].canonicalRead?.capability)
 expect(JSON.stringify(log.doneOperations())).not.toContain('canonicalRead')
 const retained=log.entries.map(e=>e.canonicalRead)
 log.applyUndo(op.id,op.userId);expect(log.doneOperations()).toHaveLength(0)
 expect(log.entries.map(e=>e.canonicalRead)).toEqual(retained)
 log.applyRedo(op.id,op.userId);expect(log.doneOperations()).toHaveLength(2)
 expect(log.entries.map(e=>e.canonicalRead)).toEqual(retained)
})
it('rejects mismatched read before revision, state or ordering mutation',()=>{
 const log=new OperationLog(),a=atom(),read=a.read!
 log.append(a.operation,{serverSeq:3,canonicalRead:read})
 const before=JSON.stringify(log.entries),revision=log.revision
 expect(()=>log.append({...a.operation,id:'bad',seq:4},{serverSeq:4,canonicalRead:{...read,operationId:'bad',sequence:4,capability:{...read.capability,snapshot:{...read.capability.snapshot,pigmentRgb8:[4,5,6]}}}})).toThrow()
 expect(log.revision).toBe(revision);expect(JSON.stringify(log.entries)).toBe(before)
})
it('attaches authoritative read during confirmation and rejects a changed duplicate sequence before mutation',()=>{
 const log=new OperationLog(),a=atom(),read=a.read!
 log.append(a.operation,{pending:true});log.confirm(a.operation.id,3,read)
 expect(log.entries[0].canonicalRead?.sequence).toBe(3);expect(log.entries[0].op.seq).toBe(0)
 const revision=log.revision
 expect(()=>log.confirm(a.operation.id,4,{...read,sequence:4})).toThrow()
 expect(log.revision).toBe(revision);expect(log.entries[0].serverSeq).toBe(3)
})
it('prepares a historical batch atomically and interns against existing history without a second registry',()=>{
 const log=new OperationLog(),a=atom(),read=a.read!,op=a.operation as CanonicalStrokeOperation
 const next={...op,id:'op2',seq:4,frame:{...op.frame,frameOrdinal:1}}
 log.append(next,{serverSeq:4,canonicalRead:{...read,operationId:'op2',sequence:4}})
 log.prependHistorical([{op,state:'done',serverSeq:3,canonicalRead:read}])
 expect(log.entries.map(e=>e.serverSeq)).toEqual([3,4]);expect(log.entries[0].canonicalRead?.capability).toBe(log.entries[1].canonicalRead?.capability)
 const revision=log.revision,before=[...log.entries]
 expect(()=>log.prependHistorical([{op:{...op,id:'bad'},state:'done',serverSeq:2,canonicalRead:read}])).toThrow()
 expect(log.revision).toBe(revision);expect(log.entries).toEqual(before)
})
it('refuses reuse across server epochs until authoritative history is replaced',()=>{
 const log=new OperationLog(),a=atom(),read=a.read!,op=a.operation as CanonicalStrokeOperation
 log.append(op,{serverSeq:3,canonicalRead:read})
 const next={...op,id:'op2',seq:4,frame:{...op.frame,frameOrdinal:1}}
 expect(()=>log.append(next,{serverSeq:4,canonicalRead:{...read,operationId:'op2',sequence:4,boardEpoch:3,capability:{...read.capability,snapshot:{...read.capability.snapshot,boardEpoch:3}}}})).toThrow('refresh')
 expect(log.entries).toHaveLength(1)
})

it('retains the explicitly captured V2 raster profile through log revalidation',()=>{
 const f=fixture(),profile=CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
 const snapshot={...f.attachment.capabilities[0].snapshot,rasterProfile:profile}
 const op:CanonicalStrokeOperation={...f.op,frame:{...f.op.frame,version:2,rasterProfile:profile}}
 const attachment={...f.attachment,capabilities:[{originalUserId:op.userId,snapshot}]}
 const prepared=prepareCanonicalRecordedAttachment(attachment,[op],{...f.expected,rasterProfile:profile})[0]
 const log=new OperationLog();log.append(prepared.operation,{serverSeq:3,canonicalRead:prepared.read})
 expect(log.entries[0].canonicalRead?.rasterProfile).toBe(profile)
 expect(log.entries[0].canonicalRead?.capability.snapshot.rasterProfile).toBe(profile)
})
