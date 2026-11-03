import {canonicalPrimaryGrainMaterialContext,buildCanonicalPrimaryGrainMaterial} from './canonicalMaterialCodec.js'
import {canonicalStandaloneStrokeSnapshotV8} from './canonicalPrimaryGrainStandalone.js'
import {prepareCanonicalRecordedAttachmentV8,decodeCanonicalRecordedSnapshotFrameV8,decodeCanonicalRecordedSnapshotFrame,type CanonicalRecordedAttachmentV8} from './canonicalRecordedAttachment.js'
import {verifyCanonicalFullHistoryBase} from './canonicalFullHistoryBase.js'
import {verifyCanonicalEmptyHistoryBase} from './canonicalEmptyHistoryBase.js'
import {expect,it,vi} from 'vitest'
import {prepareCanonicalRecordedAttachment,canonicalStrokeSnapshotV3,canonicalStrokeSnapshotV2,CANONICAL_RECORDED_ATTACHMENT_LIMITS,type CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import {sourceAutoGeometry} from './sourceAutoGeometry.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,decodeCanonicalStrokeFrame} from './canonicalStrokeFrame.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2,CanonicalStrokeSnapshotV3} from './canonicalStrokeOperation.js'
function fixture(){
 const curve={text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}
 const primarySource=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'soft',descriptorVersion:1,descriptorSha256:'a'.repeat(64),source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:8,ratio:1,horizontalFade:1,verticalFade:1,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:curve},brushScale:1,brushAngle:0,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),radialCurve:{source:curve,coefficients:[[0,0,-1,1]]}})
 const material={version:2 as const,assets:[],primarySource,budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:'brush:soft@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets:[],materialVersion:2,material}
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:8,ratio:1,spikes:2,scale:1,angle:0},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:primarySource.source,coverageProfile:primarySource.coverageProfile,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:3,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const attachment={version:1 as const,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:3,originalUserId:'author',capability:0}]} satisfies CanonicalRecordedAttachmentV1
 return {attachment,op,expected:{roomId:'room',boardEpoch:2}}
}
it('prepares immutable same-operation atoms and shares one cap for batch frames without retaining dictionary indexes',()=>{
 const f=fixture(),op2={...f.op,id:'op2',seq:4,frame:{...f.op.frame,frameOrdinal:1}}
 const attachment={...f.attachment,bindings:[...f.attachment.bindings,{operationId:'op2',sequence:4,originalUserId:'author',capability:0}]}
 const result=prepareCanonicalRecordedAttachment(attachment,[f.op,op2],f.expected)
 expect(result[0].read?.sequence).toBe(3);expect(result[1].read?.capability).toBe(result[0].read?.capability)
 expect(result[0].operation).not.toBe(f.op);expect(Object.isFrozen(result[0].read?.capability.snapshot.material.primarySource)).toBe(true)
 expect(Object.keys(result[0].read!)).not.toContain('index')
})
it('allows different original authors to reuse stroke IDs and validates mixed legacy atoms',()=>{
 const f=fixture(),op2={...f.op,id:'op2',seq:5,userId:'other'}
 const attachment={...f.attachment,capabilities:[...f.attachment.capabilities,{originalUserId:'other',snapshot:f.attachment.capabilities[0].snapshot}],bindings:[...f.attachment.bindings,{operationId:'op2',sequence:5,originalUserId:'other',capability:1}]}
 const legacy={id:'legacy',userId:'reader',timestamp:0,seq:4,type:'layer_add' as const,layerId:'L2',name:'Layer'}
 const result=prepareCanonicalRecordedAttachment(attachment,[f.op,legacy,op2],f.expected)
 expect(result[1].operation).toBe(legacy);expect(result[1].read).toBeUndefined();expect(result[2].read?.capability.originalUserId).toBe('other')
})
it.each(['missing','extra','duplicate','user','seq','id','unused','sameGesture','layer','SHA','epoch','profile','coverage','radial','unknown'] as const)('rejects %s for the whole delivery',kind=>{
 const f=fixture(),a=structuredClone(f.attachment),s=a.capabilities[0].snapshot
 if(kind==='missing')Object.assign(a,{bindings:[]})
 if(kind==='extra'||kind==='duplicate')Object.assign(a,{bindings:[...a.bindings,a.bindings[0]]})
 if(kind==='user')Object.assign(a.bindings[0],{originalUserId:'other'})
 if(kind==='seq')Object.assign(a.bindings[0],{sequence:99})
 if(kind==='id')Object.assign(a.bindings[0],{operationId:'other'})
 if(kind==='unused')Object.assign(a,{capabilities:[...a.capabilities,{originalUserId:'other',snapshot:s}]})
 if(kind==='sameGesture')Object.assign(a,{capabilities:[...a.capabilities,{...a.capabilities[0],snapshot:{...s,pigmentRgb8:[9,2,3]}}]})
 if(kind==='layer')Object.assign(s,{layerId:'other'})
 if(kind==='SHA')Object.assign(s,{descriptorSha256:'c'.repeat(64)})
 if(kind==='epoch')Object.assign(s,{boardEpoch:3})
 if(kind==='profile')Object.assign(s,{rasterProfile:'foreign'})
 if(kind==='coverage')Object.assign(s.material.primarySource,{coverageProfile:'scalar-f64-fma-v1'})
 if(kind==='radial'&&s.material.primarySource.kind==='softAuto')Object.assign(s.material.primarySource.radialCurve,{coefficients:[]})
 if(kind==='unknown')Object.assign(s,{foo:new Uint8Array(10000)})
 expect(()=>prepareCanonicalRecordedAttachment(a,[f.op],f.expected)).toThrow()
})
it('rejects oversized shapes and unknown data before stringify or clone, and never mutates delivered operations',()=>{
 const f=fixture(),stringify=vi.spyOn(JSON,'stringify'),clone=vi.spyOn(globalThis,'structuredClone')
 try{
  expect(()=>prepareCanonicalRecordedAttachment({...f.attachment,capabilities:Array(CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities+1).fill(null)},[f.op],f.expected)).toThrow()
  expect(()=>prepareCanonicalRecordedAttachment({...f.attachment,foo:[]},[f.op],f.expected)).toThrow()
  expect(stringify).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled()
 }finally{stringify.mockRestore();clone.mockRestore()}
 expect(f.op.seq).toBe(3)
})
it('requires strictly ascending authoritative seqs and first-use closed capability order',()=>{
 const f=fixture();expect(()=>prepareCanonicalRecordedAttachment(f.attachment,[f.op,{...f.op,id:'later',seq:2}],f.expected)).toThrow()
 expect(()=>prepareCanonicalRecordedAttachment(f.attachment,[{...f.op,seq:0}],f.expected)).toThrow()
})
it('enforces real UTF8 per-cap and aggregate byte caps after bounded shared source validation',()=>{
 const f=fixture(),a=structuredClone(f.attachment),pin=a.capabilities[0].snapshot.material.primarySource
 if(pin.kind!=='softAuto')throw Error('Expected soft')
 const curve={...pin.source.softnessCurve,text:'\u2000'.repeat(60000)+'0,1;1,0'}
 Object.assign(pin.source,{softnessCurve:curve});Object.assign(pin.radialCurve,{source:curve})
 expect(()=>prepareCanonicalRecordedAttachment(a,[f.op],f.expected)).toThrow()
 const b=structuredClone(f.attachment),p=b.capabilities[0].snapshot.material.primarySource
 if(p.kind!=='softAuto')throw Error('Expected soft')
 const smaller={...p.source.softnessCurve,text:' '.repeat(40000)+'0,1;1,0'}
 Object.assign(p.source,{softnessCurve:smaller});Object.assign(p.radialCurve,{source:smaller})
 const ops=Array.from({length:64},(_,i)=>({...f.op,id:'op'+i,userId:'author'+i,seq:i+1}))
 const capabilities=ops.map(op=>({originalUserId:op.userId,snapshot:b.capabilities[0].snapshot}))
 const bindings=ops.map((op,i)=>({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:i}))
 expect(prepareCanonicalRecordedAttachment({...b,capabilities:capabilities.slice(0,8),bindings:bindings.slice(0,8)},ops.slice(0,8),f.expected)).toHaveLength(8)
 expect(()=>prepareCanonicalRecordedAttachment({...b,capabilities,bindings},ops,f.expected)).toThrow()
})
it('rejects non-first-use indexes even when every cap is otherwise valid and used',()=>{
 const f=fixture(),other={...f.attachment.capabilities[0],originalUserId:'other'}
 const op2={...f.op,id:'op2',userId:'other',seq:4}
 const value={...f.attachment,capabilities:[other,f.attachment.capabilities[0]],bindings:[{...f.attachment.bindings[0],capability:1},{operationId:'op2',sequence:4,originalUserId:'other',capability:0}]}
 expect(()=>prepareCanonicalRecordedAttachment(value,[f.op,op2],f.expected)).toThrow()
})

const genericOuterProfile='installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2' as const
it.each(['multiply','lighten','colorDodge','overlay'] as const)('requires captured expected V2 profile for attached %s frames',outerBlend=>{
 const f=fixture(),snapshot={...f.attachment.capabilities[0].snapshot,rasterProfile:genericOuterProfile,composition:{...f.op.frame.composition,outerBlend}}
 const attachment={...f.attachment,capabilities:[{originalUserId:'author',snapshot}]}
 const op={...f.op,frame:{...f.op.frame,version:2 as const,rasterProfile:genericOuterProfile,composition:snapshot.composition}}
 const result=prepareCanonicalRecordedAttachment(attachment,[op],{...f.expected,rasterProfile:genericOuterProfile})
 expect(result[0].read?.capability.snapshot.rasterProfile).toBe(genericOuterProfile)
 expect(result[0].operation).toEqual(op);expect(Object.isFrozen(result[0].read?.capability.snapshot.composition)).toBe(true)
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[op],f.expected)).toThrow()
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[{...op,frame:{...op.frame,version:1 as const,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}}],{...f.expected,rasterProfile:genericOuterProfile})).toThrow()
})
it('rejects unknown/null captured policy before walking attachment data and preserves old default read metadata',()=>{
 const f=fixture(),walk=vi.fn(()=>{throw Error('attachment must not be walked')})
 const attachment={get version(){return walk()}}
 for(const rasterProfile of ['foreign',null])expect(()=>prepareCanonicalRecordedAttachment(attachment,[f.op],{...f.expected,rasterProfile:rasterProfile as never})).toThrow('Invalid canonical recorded capability attachment')
 expect(walk).not.toHaveBeenCalled()
 const result=prepareCanonicalRecordedAttachment(f.attachment,[f.op],f.expected)
 expect(result[0].read?.rasterProfile).toBe(CANONICAL_STROKE_RASTER_PROFILE)
})

it('accepts mixed old/new gestures only from the explicit bounded captured allow-set',()=>{
 const f=fixture(),original=f.attachment.capabilities[0],newSnapshot={...original.snapshot,strokeId:'new',rasterProfile:genericOuterProfile,composition:{...original.snapshot.composition,outerBlend:'multiply' as const}}
 const newOp={...f.op,id:'new',seq:4,frame:{...f.op.frame,version:2 as const,strokeId:'new',rasterProfile:genericOuterProfile,composition:newSnapshot.composition}}
 const attachment={...f.attachment,capabilities:[original,{...original,snapshot:newSnapshot}],bindings:[...f.attachment.bindings,{operationId:'new',sequence:4,originalUserId:'author',capability:1}]}
 const profiles=[CANONICAL_STROKE_RASTER_PROFILE,genericOuterProfile]
 const result=prepareCanonicalRecordedAttachment(attachment,[f.op,newOp],{...f.expected,allowedRasterProfiles:profiles})
 expect(result.map(r=>r.read?.rasterProfile)).toEqual(profiles)
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[f.op,newOp],f.expected)).toThrow()
 const sameGesture={...newSnapshot,strokeId:'S'}
 expect(()=>prepareCanonicalRecordedAttachment({...attachment,capabilities:[original,{...original,snapshot:sameGesture}]},[f.op,newOp],{...f.expected,allowedRasterProfiles:profiles})).toThrow()
 for(const allowedRasterProfiles of [[],[genericOuterProfile,genericOuterProfile],['foreign'],[...profiles,genericOuterProfile],null]){
  expect(()=>Reflect.apply(prepareCanonicalRecordedAttachment,null,[attachment,[f.op,newOp],{...f.expected,allowedRasterProfiles}])).toThrow()
 }
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[f.op,newOp],{...f.expected,rasterProfile:genericOuterProfile,allowedRasterProfiles:profiles})).toThrow()
})
it('captures original ordered image frames with exact outer/inner assets and rejects mismatched or forged lists',()=>{
 const f=fixture(),id='asset:'+'c'.repeat(64),other='asset:'+'d'.repeat(64),assets=[{id,size:8,x:0,y:0,width:8,height:8},{id:other,size:8,x:0,y:0,width:8,height:8}],frames=[id,other,id]
 const material={version:2 as const,assets,primarySource:{kind:'image' as const,asset:id,brushScale:1,brushAngle:0,frames},budget:{workUnits:10000,outputBytes:40000,drawPixels:10000}}
 const snapshot:CanonicalStrokeSnapshotV2={...f.attachment.capabilities[0].snapshot,brush:'brush:pipe@1',assets,material}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed
 const op={...f.op,frame:{...f.op.frame,brush:snapshot.brush,materialPacked:packed}}
 const attachment={...f.attachment,capabilities:[{originalUserId:'author',snapshot}]}
 const accepted=prepareCanonicalRecordedAttachment(attachment,[op],f.expected)[0]
 expect(accepted.read?.capability.snapshot.material.primarySource).toEqual(material.primarySource)
 frames[1]=id
 expect(accepted.read?.capability.snapshot.material.primarySource).toEqual({...material.primarySource,frames:[id,other,id]})
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[op],f.expected)).toThrow() // unique metadata no longer exactly matches role list
 const restored={...snapshot,material:{...material,primarySource:{...material.primarySource,frames:[id,other,id]}}}
 expect(()=>prepareCanonicalRecordedAttachment({...attachment,capabilities:[{originalUserId:'author',snapshot:{...restored,assets:[assets[0],{...assets[1],x:1,width:7}]}}]},[op],f.expected)).toThrow()
})


type MutableTexture<T> = T extends readonly (infer U)[] ? MutableTexture<U>[] : T extends object ? {-readonly [K in keyof T]:MutableTexture<T[K]>} : T
function textureSnapshot():MutableTexture<CanonicalStrokeSnapshotV3>{
 const primary='asset:'+'1'.repeat(64),pattern='asset:'+'2'.repeat(64),assets=[{id:primary,size:8,x:0,y:0,width:8,height:8},{id:pattern,size:256,x:0,y:0,width:252,height:252}]
 return{layerId:'L',brush:'brush:chalk@1',strokeId:'S',boardEpoch:2,descriptorSha256:'a'.repeat(64),rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'},assets,materialVersion:3,
 material:{version:3,assets,primarySource:{kind:'image',asset:primary,brushScale:1,brushAngle:0},primaryTexture:{kind:'canvasTexture',asset:pattern,law:'subtract-u8-v1',width:252,height:252,periodX:252,periodY:252,offsetX:0,offsetY:0,strength:'pressure-identity-v1'},budget:{workUnits:100000,outputBytes:100000,drawPixels:100000}}}
}
it('normalizes standalone3 with exact pattern role, frozen independent captures and an actual aware empty probe',()=>{
 const input=textureSnapshot(),s=canonicalStrokeSnapshotV3(input,2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
 expect(s).toEqual(input);expect(s).not.toBe(input);expect(s.material.primaryTexture).not.toBe(input.material.primaryTexture);expect(s.assets).toBe(s.material.assets)
 for(const object of [s,s.material,s.assets,...s.assets,s.material.primarySource,s.material.primaryTexture,s.material.budget,s.pigmentRgb8,s.composition])expect(Object.isFrozen(object)).toBe(true)
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[{recipe:{kind:'image',asset:s.assets[0].id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false},role:'primary',x:1,y:2,opacity:1,flow:1,grainDepth:.5}],fences:[]},s.material).packed
 const trusted={materialVersion:3 as const,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:s.material}
 const decoded=decodeCanonicalStrokeFrame({version:2,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked:packed},trusted)
 expect(decoded.frame.draws[0].grainDepth).toBe(.5);expect(s.assets[1].width).toBe(252);expect(s.assets[1].size).toBe(256)
 expect(()=>canonicalStrokeSnapshotV2(input,2,s.rasterProfile)).toThrow()
 const f=fixture(),attachment={...f.attachment,capabilities:[{originalUserId:'author',snapshot:input}]}
 expect(()=>prepareCanonicalRecordedAttachment(attachment,[f.op],{...f.expected,allowedRasterProfiles:[s.rasterProfile]})).toThrow()
})
it('refuses V3 snapshot version/profile/epoch, extra fields, budget, roles/order and metadata mismatches',()=>{
 const changes:((s:MutableTexture<CanonicalStrokeSnapshotV3>)=>void)[]=[s=>{Reflect.set(s,'materialVersion',2)},s=>{Reflect.set(s.material,'version',2)},s=>{s.boardEpoch=3},s=>{Reflect.set(s,'extra',1)},s=>{Reflect.set(s.material,'extra',1)},s=>{s.material.budget.workUnits=-1},s=>{s.material.budget.drawPixels=Infinity},s=>{Reflect.set(s.material.primarySource,'frames',[s.assets[0].id])},s=>{s.material.primaryTexture.asset=s.assets[0].id},s=>{s.material.assets=[...s.material.assets].reverse()},s=>{s.assets=[{...s.assets[0]},{...s.assets[1],size:512}]},s=>{s.material.assets=[{...s.assets[0]},{...s.assets[1],x:1}]},s=>{s.assets=[{...s.assets[0]},{...s.assets[1],width:256}]},s=>{s.material.primaryTexture.periodX=256},s=>{s.descriptorSha256='bad'},s=>{s.brush='brush:chalk@0'}]
 for(const change of changes){const s=textureSnapshot();change(s);expect(()=>canonicalStrokeSnapshotV3(s,2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()}
 expect(()=>canonicalStrokeSnapshotV3(textureSnapshot(),2,CANONICAL_STROKE_RASTER_PROFILE)).toThrow()
})
it('rejects nested snapshot getters, symbols, prototype and sparse metadata without executing getter code',()=>{
 let calls=0
 const selects:((s:MutableTexture<CanonicalStrokeSnapshotV3>)=>[object,string])[]=[s=>[s,'materialVersion'],s=>[s,'material'],s=>[s.material,'version'],s=>[s.material.primaryTexture,'asset'],s=>[s.material.primarySource,'asset'],s=>[s.material.budget,'workUnits'],s=>[s.assets[1],'size'],s=>[s.pigmentRgb8,'0']]
 for(const select of selects){const s=textureSnapshot(),[object,key]=select(s),value=Reflect.get(object,key);Object.defineProperty(object,key,{get(){calls++;return value}});expect(()=>canonicalStrokeSnapshotV3(s,2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()}
 const custom=Object.assign(Object.create({}),textureSnapshot());expect(()=>canonicalStrokeSnapshotV3(custom,2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()
 const symbol=textureSnapshot();Reflect.set(symbol,Symbol('extra'),0);expect(()=>canonicalStrokeSnapshotV3(symbol,2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow()
 const sparse=textureSnapshot();Reflect.deleteProperty(sparse.assets,'1');expect(()=>canonicalStrokeSnapshotV3(sparse,2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow();expect(calls).toBe(0)
})

function textureDelivery(){
 const snapshot=canonicalStrokeSnapshotV3(textureSnapshot(),2,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE),scope={roomId:'texture-room',boardEpoch:2,allowedRasterProfiles:[CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE]}
 const recipe={kind:'image' as const,asset:snapshot.assets[0].id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false}
 const first=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:1,flow:1,grainDepth:-0}],fences:[{at:0,kind:'segmentBegin',group:0}]},snapshot.material).packed
 const last=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[],fences:[{at:0,kind:'primaryEnd',group:0},{at:0,kind:'segmentEnd',group:0},{at:0,kind:'gestureEnd'}]},snapshot.material).packed
 const operations:CanonicalStrokeOperation[]=[first,last].map((materialPacked,i)=>({id:'texture-'+i,userId:'author',timestamp:i,seq:i+1,type:'canonical_stroke',layerId:snapshot.layerId,frame:{version:2,rasterProfile:snapshot.rasterProfile,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:i,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked}}))
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:scope.roomId,boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:operations.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}
 return{snapshot,scope,operations,attachment}
}
it('delivers actual explicit3 through unchanged attachment1 tables and empty/full original bases',()=>{
 const f=textureDelivery(),atoms=prepareCanonicalRecordedAttachment(JSON.parse(JSON.stringify(f.attachment)),f.operations,f.scope)
 expect(atoms[0].read!.capability.snapshot.materialVersion).toBe(3);expect(atoms[1].read!.capability).toBe(atoms[0].read!.capability)
 const common={roomId:f.scope.roomId,boardEpoch:2,throughSeq:2,operationCount:2}
 expect(verifyCanonicalEmptyHistoryBase({kind:'empty-room-prefix-v1',...common},atoms,f.scope).throughSeq).toBe(2)
 const full=verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',...common},atoms,f.scope)
 expect(full.gestures[0]).toMatchObject({ended:true,visible:true})
 const undo={id:'texture-undo',userId:'author',timestamp:2,seq:3,type:'operation_undo' as const,targetOpId:f.operations[0].id}
 const all=prepareCanonicalRecordedAttachment(f.attachment,[...f.operations,undo],f.scope)
 expect(verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',...common,throughSeq:3,operationCount:3},all,f.scope).gestures[0].visible).toBe(false)
})
it('rejects changed3 selector/role/epoch/budget and old packed bytes without a downgrade fallback',()=>{
 const f=textureDelivery()
 for(const edit of [(s:CanonicalStrokeSnapshotV3)=>{Reflect.set(s,'materialVersion',2)},(s:CanonicalStrokeSnapshotV3)=>{Reflect.set(s.assets[1],'id',s.assets[0].id)},(s:CanonicalStrokeSnapshotV3)=>{Reflect.set(s,'boardEpoch',3)},(s:CanonicalStrokeSnapshotV3)=>{Reflect.set(s.material.budget,'workUnits',0)}]){
  const a=structuredClone(f.attachment);const selected=a.capabilities[0].snapshot;if(selected.materialVersion!==3)throw Error('fixture3');edit(selected)
  expect(()=>prepareCanonicalRecordedAttachment(a,f.operations,f.scope)).toThrow()
 }
 const old=fixture();expect(()=>prepareCanonicalRecordedAttachment(f.attachment,[{...f.operations[0],frame:{...f.operations[0].frame,materialPacked:old.op.frame.materialPacked}}],f.scope)).toThrow()
 let called=0;const a=structuredClone(f.attachment);Object.defineProperty(a.capabilities[0].snapshot,'materialVersion',{get(){called++;return 3}})
 expect(()=>prepareCanonicalRecordedAttachment(a,f.operations,f.scope)).toThrow();expect(called).toBe(0)
})

it('rejects explicit3 raster profile accessors before invoking snapshot user code',()=>{
 const f=textureDelivery(),a=structuredClone(f.attachment);let calls=0
 Object.defineProperty(a.capabilities[0].snapshot,'rasterProfile',{get(){calls++;return f.snapshot.rasterProfile}})
 expect(()=>prepareCanonicalRecordedAttachment(a,f.operations,f.scope)).toThrow()
 expect(calls).toBe(0)
})

function mixedGrain8Fixture(){
 const legacy=fixture(),G=CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
 const primary={id:'asset:'+'11'.repeat(32),size:8,x:0,y:0,width:8,height:8},pattern={id:'asset:'+'22'.repeat(32),size:512,x:0,y:0,width:307,height:307}
 const material=canonicalPrimaryGrainMaterialContext({version:8,assets:[primary,pattern],primarySource:{kind:'image',asset:primary.id,brushScale:1,brushAngle:0,descriptorId:'structural-image',descriptorVersion:1,descriptorSha256:'d'.repeat(64)},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'hard-multiply-u8-native-v1',width:307,height:307,periodX:307,periodY:307,phase:{kind:'resolved-stroke-phase-v1',x:306,y:1},strength:'recorded-grain-v1'},budget:{workUnits:64000000,outputBytes:16000000,drawPixels:16000000}})
 const snapshot=canonicalStandaloneStrokeSnapshotV8({layerId:'L',brush:'brush:structural-image@1',strokeId:'image-stroke',boardEpoch:2,descriptorSha256:'d'.repeat(64),rasterProfile:G,pigmentRgb8:[9,8,7],composition:{mode:'buildup',alphaDarken:'hard',outerResourceOpacity:.375,outerBlend:'over'},assets:[primary,pattern],materialVersion:8,material},2,G)
 const recipe={kind:'image' as const,asset:primary.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false}
 const built=buildCanonicalPrimaryGrainMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:.75,flow:.7,grainStrengthU8:77}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material)
 const op:CanonicalStrokeOperation&{readonly seq:number}={id:'image-op',userId:'image-author',timestamp:1,seq:4,type:'canonical_stroke',layerId:'L',frame:{version:2,rasterProfile:G,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:built.packed,texturePhase:material.primaryTexture.phase}}
 const attachment:CanonicalRecordedAttachmentV8={...legacy.attachment,capabilities:[...legacy.attachment.capabilities,{originalUserId:op.userId,snapshot}],bindings:[...legacy.attachment.bindings,{operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:1}]}
 return{legacy,attachment,op,snapshot,operations:[legacy.op,op],expected:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE,G]}}
}
it('named8 prepares mixed legacy2 and original image8 within SAME version1 batch, preserving normalized identity and byte S',()=>{
 const f=mixedGrain8Fixture(),before=JSON.stringify(f.attachment),result=prepareCanonicalRecordedAttachmentV8(f.attachment,f.operations,f.expected)
 expect(result).toHaveLength(2);expect(result[0].read?.capability.snapshot.materialVersion).toBe(2);const cap=result[1].read?.capability
 expect(cap?.snapshot.materialVersion).toBe(8);expect(cap?.originalUserId).toBe('image-author');expect(result[1].read?.operationId).toBe('image-op');expect(Object.isFrozen(cap?.snapshot)).toBe(true)
 const decoded=decodeCanonicalRecordedSnapshotFrameV8(f.op.frame,f.snapshot,0)
 if(decoded.frame.profile!=='canonical-primary-grain-material-v8')throw Error('wrong frame')
 expect(decoded.frame.draws[0].grainStrengthU8).toBe(77);expect(decoded.envelope.composition.outerResourceOpacity).toBe(.375)
 expect(JSON.stringify(f.attachment)).toBe(before);expect(f.attachment.version).toBe(1)
})
it('legacy preparation and decoder remain closed to8 while named8 preserves all-legacy output',()=>{
 const f=mixedGrain8Fixture();expect(()=>prepareCanonicalRecordedAttachment(f.attachment,f.operations,f.expected)).toThrow()
 expect(()=>Reflect.apply(decodeCanonicalRecordedSnapshotFrame,null,[f.op.frame,f.snapshot,0])).toThrow()
 expect(prepareCanonicalRecordedAttachmentV8(f.legacy.attachment,[f.legacy.op],f.legacy.expected)).toEqual(prepareCanonicalRecordedAttachment(f.legacy.attachment,[f.legacy.op],f.legacy.expected))
})
it.each(['phase','sourceSHA','assetsOrder','crop','user','layer','bindingSeq','duplicateBinding','unused','firstUse','descending','materialBudget']as const)('named8 atomically rejects mixed-batch %s',kind=>{
 const f=mixedGrain8Fixture(),a=structuredClone(f.attachment),ops=structuredClone(f.operations),s=a.capabilities[1].snapshot
 if(s.materialVersion!==8)throw Error('fixture')
 if(kind==='phase')Object.assign(ops[1].frame,{texturePhase:{kind:'resolved-stroke-phase-v1',x:0,y:1}})
 if(kind==='sourceSHA')Object.assign(s,{descriptorSha256:'e'.repeat(64)})
 if(kind==='assetsOrder')Object.assign(s,{assets:[s.assets[1],s.assets[0]]})
 if(kind==='crop')Object.assign(s.assets[1],{width:512})
 if(kind==='user')Object.assign(a.bindings[1],{originalUserId:'wrong'})
 if(kind==='layer')Object.assign(ops[1],{layerId:'wrong'})
 if(kind==='bindingSeq')Object.assign(a.bindings[1],{sequence:99})
 if(kind==='duplicateBinding')Object.assign(a,{bindings:[...a.bindings,a.bindings[1]]})
 if(kind==='unused')Object.assign(a,{capabilities:[...a.capabilities,{originalUserId:'unused',snapshot:{...s,strokeId:'unused'}}]})
 if(kind==='firstUse')Object.assign(a,{capabilities:[a.capabilities[1],a.capabilities[0]],bindings:a.bindings.map((b,i)=>({...b,capability:1-i}))})
 if(kind==='descending')ops.reverse()
 if(kind==='materialBudget')Object.assign(s.material,{budget:{...s.material.budget,workUnits:0}})
 expect(()=>prepareCanonicalRecordedAttachmentV8(a,ops,f.expected)).toThrow()
})
it('named8 refuses duplicate gesture capabilities and malformed/accessor source/phase before invoking getters',()=>{
 const f=mixedGrain8Fixture(),getter=vi.fn(()=>306)
 const a=structuredClone(f.attachment),s=a.capabilities[1].snapshot;if(s.materialVersion!==8)throw Error('fixture')
 Object.defineProperty(s.material.primaryTexture.phase,'x',{get:getter})
 expect(()=>prepareCanonicalRecordedAttachmentV8(a,f.operations,f.expected)).toThrow();expect(getter).not.toHaveBeenCalled()
 const duplicate={...f.attachment,capabilities:[...f.attachment.capabilities,f.attachment.capabilities[1]]}
 expect(()=>prepareCanonicalRecordedAttachmentV8(duplicate,f.operations,f.expected)).toThrow()
 const raw=structuredClone(f.attachment);Object.defineProperty(raw.capabilities[1].snapshot,'materialVersion',{get:getter})
 expect(()=>prepareCanonicalRecordedAttachmentV8(raw,f.operations,f.expected)).toThrow();expect(getter).not.toHaveBeenCalled()
})
it('named8 retains existing receiver profile/count limits without walking unknown oversize data',()=>{
 const f=mixedGrain8Fixture()
 expect(()=>prepareCanonicalRecordedAttachmentV8(f.attachment,f.operations,f.legacy.expected)).toThrow()
 expect(()=>prepareCanonicalRecordedAttachmentV8({...f.attachment,capabilities:Array(CANONICAL_RECORDED_ATTACHMENT_LIMITS.capabilities+1).fill(null)},f.operations,f.expected)).toThrow()
 expect(()=>prepareCanonicalRecordedAttachmentV8({...f.attachment,bindings:Array(CANONICAL_RECORDED_ATTACHMENT_LIMITS.bindings+1).fill(null)},f.operations,f.expected)).toThrow()
 expect(()=>prepareCanonicalRecordedAttachmentV8({...f.attachment,extra:[]},f.operations,f.expected)).toThrow()
})
