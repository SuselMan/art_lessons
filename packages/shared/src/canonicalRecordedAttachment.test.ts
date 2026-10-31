import {expect,it,vi} from 'vitest'
import {prepareCanonicalRecordedAttachment,CANONICAL_RECORDED_ATTACHMENT_LIMITS,type CanonicalRecordedAttachmentV1} from './canonicalRecordedAttachment.js'
import {sourceAutoGeometry} from './sourceAutoGeometry.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {buildCanonicalMaterial} from './canonicalMaterialCodec.js'
import {CANONICAL_STROKE_RASTER_PROFILE} from './canonicalStrokeFrame.js'
import type {CanonicalStrokeOperation,CanonicalStrokeSnapshotV2} from './canonicalStrokeOperation.js'
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
