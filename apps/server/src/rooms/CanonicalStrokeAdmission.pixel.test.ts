import{mkdtempSync,rmSync,readFileSync}from'node:fs'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createHash}from'node:crypto'
import{it,expect,vi}from'vitest'
import * as S from '@grafetto/shared'
import{BrushStorage,empty}from'../brushLibrary/storage.js'
import{rooms,type RoomRecord}from'./roomRegistry.js'
import{CanonicalBrushCapabilityResolver}from'./CanonicalBrushCapabilityResolver.js'
import{CanonicalStrokeAdmission,decodeTrustedCanonicalFrame}from'./CanonicalStrokeAdmission.js'
// Keep browser compiler sources outside the server NodeNext production graph.
const {SourceStrokeAuthor}=await import(new URL('../../../web/src/engine/src/presets/sourceStrokeAuthor.ts',import.meta.url).href)
const {SourceStrokeMaterialAdapter}=await import(new URL('../../../web/src/engine/src/presets/sourceStrokeMaterialAdapter.ts',import.meta.url).href)
const {SourceCanonicalFrameEncoder}=await import(new URL('../../../web/src/engine/src/presets/sourceCanonicalFrameEncoder.ts',import.meta.url).href)
const {sourceDynamicAutoAuthorProgram,sourcePixelDualAuthorProgram}=await import(new URL('../../../web/src/engine/src/presets/sourceStrokeAuthorDescriptor.ts',import.meta.url).href)
vi.mock('../db/prisma.js',()=>({prisma:new Proxy({},{get(){throw Error('Admission regression must not access database')}})}))
const B=S.CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,coverage=S.CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE
const budget={workUnits:S.CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:S.CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:S.CANONICAL_MATERIAL_LIMITS.drawPixels}
function board(){
 const record:RoomRecord={room:{id:'pixel-admission',name:'Admission fixture',ownerId:'author',paper:'coarse',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-29T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['layer']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}
 record.participants.set('author',{userId:'author',name:'Author',role:'owner',color:'#000000',frozen:false,boardId:'pixel-admission'});rooms.set('pixel-admission',record)
}
function resolver(storage:BrushStorage,masked=true){return new CanonicalBrushCapabilityResolver({storage,operator:empty,authorRasterProfile:B,allowedRecordedRasterProfiles:[B],alphaDarkenVariants:['hard'],maxGestures:2,primaryImageSource:'single-inverse-gray-v2',imageMaterialSource:'pixel-image-material-v1',authorImageMaterialSource:'pixel-image-material-v1',pixelMaskedSource:masked?'pixel-masked-v1':false,authorPixelMaskedSource:masked?'pixel-masked-v1':false,plainAutoGeometrySource:'dynamic-auto-geometry-v1',authorPlainAutoGeometrySource:'dynamic-auto-geometry-v1',autoSources:{defaultAuto:{coverageProfile:coverage,storedScale:1},gaussianAuto:{coverageProfile:coverage,storedScale:1},softAuto:{coverageProfile:coverage,storedScale:1}}})}
function ownDataEqual(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false
 const keys=Reflect.ownKeys(a);return keys.length===Reflect.ownKeys(b).length&&keys.every(k=>{const x=Object.getOwnPropertyDescriptor(a,k),y=Object.getOwnPropertyDescriptor(b,k);return!!x&&!!y&&Object.hasOwn(x,'value')&&Object.hasOwn(y,'value')&&ownDataEqual(x.value,y.value)})
}
it('admits dynamic Gaussian buildup and original dual primaryLightness through actual server grants',()=>{
 const root=mkdtempSync(join(tmpdir(),'pixel-admission-')),bytes=new Map<string,Buffer>()
 try{
  const original:unknown=JSON.parse(readFileSync(new URL('./fixtures/pixelSourceAdmission.native.json',import.meta.url),'utf8'))
  if(!S.isBrushLibrary(original))throw Error('Invalid retained SOURCE fixture')
  // Authored constant planes retain the native frame geometry and compiled options.
  // This is a mechanism regression; it does not store artwork or assert pixel identity.
  const ids=new Map<string,string>(),assets=original.assets.map((a,index)=>{const value=Buffer.alloc(a.size*a.size,53+index*41),hash=createHash('sha256').update(value).digest('hex');ids.set(a.id,'asset:'+hash);bytes.set(hash,value);return{id:'asset:'+hash,size:a.size,file:hash+'.bin'}})
  const replace=(value:unknown):unknown=>typeof value==='string'?ids.get(value)??value:Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)])):value
  const candidate:unknown={...original,brushes:original.brushes.map(replace),assets}
  if(!S.isBrushLibrary(candidate))throw Error('Invalid authored mechanism fixture')
  const storage=new BrushStorage(root);storage.install('author',candidate,bytes)
  for(const row of candidate.brushes){
   board();const descriptor=row.descriptor,data=descriptor.sourceStamp;if(!data)throw Error('Missing original SOURCE')
   const refs=new Set<string>(S.brushAssetIds(descriptor)),metadata=assets.filter(asset=>refs.has(asset.id)).map(({id,size})=>({id,size}))
   const sha=createHash('sha256').update(S.canonicalBrushDescriptorJSON(descriptor)).digest('hex'),diameter=data.version===2&&data.source.kind!=='image'?data.source.diameter:Math.max(data.brush.width,data.brush.height),scale=24/diameter,options={sourceScale:scale},base={inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'admission-regression',lodScale:1,scale}
   let material:S.CanonicalMaterialContextV2,compiled
   if(descriptor.behavior?.dual){
    const captured=S.extractCanonicalPixelDualSourceData(descriptor,metadata,options,B);if(!captured.supported)throw Error(captured.reasons.join(','))
    const primary=captured.primary.imageSource,mask=captured.mask.imageSource;if(!primary||!mask)throw Error('Expected original paired IMAGE roles')
    const sources=new Map<string,S.CanonicalMaterialAsset>();for(const asset of [...captured.primary.imageAssets??[],...captured.mask.imageAssets??[]]){const prior=sources.get(asset.id);if(prior&&prior.size!==asset.size)throw Error('CAS storage size mismatch');if(!prior)sources.set(asset.id,asset)}
    const context=S.canonicalMaskedSourceMaterialContext({version:2,scaledSource:'source-scale-v1',imageFrameIndices:'source-image-pipe-frame-v1',assets:[...sources.values()],primarySource:primary,maskSource:mask,maskingBlend:captured.blendMode,...S.hasActiveSourceMaterialOptions(captured.primary.data)||S.hasActiveSourceMaterialOptions(captured.mask.data)?{materialParams:'source-material-parameters-v1'}:{},budget})
    const binding=S.canonicalPixelDualSourceBinding(descriptor,sha,context,options,metadata,B)
    material=S.canonicalPixelDualSourceMaterialContext(binding)
    compiled=sourcePixelDualAuthorProgram(descriptor,{...base,assets:metadata,binding,coverageProfile:coverage})
   }else{
    const capability=S.extractCanonicalDynamicAutoGeometryData(descriptor,undefined,metadata,B);if(!capability.supported)throw Error(capability.reasons.join(','))
    const pin=S.canonicalDynamicAutoSourceBinding(descriptor,sha,coverage,B,options,capability.originalAssets)
    material=S.canonicalSourceMaterialContext({version:2,scaledSource:'source-scale-v1',assets:[],primarySource:pin,...S.hasActiveSourceMaterialOptions(capability.data)?{materialParams:'source-material-parameters-v1'}:{},...S.sourceColorRecording(capability.data)?{colorParams:S.sourceColorRecording(capability.data)}:{},budget})
    compiled=sourceDynamicAutoAuthorProgram(descriptor,{...base,rasterProfile:B,descriptorSha256:sha,geometryCapability:capability,coverageProfile:coverage})
   }
   if(!compiled.supported)throw Error(compiled.reasons.join(','))
   const identity={roomId:'pixel-admission',userId:'author'},request={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',pigmentRgb8:[31,79,151] as const,alphaDarken:'hard' as const,outerResourceOpacity:1,sourceScale:scale}
   if(descriptor.behavior?.dual)expect(()=>resolver(storage,false).prepareBeginGesture(identity,request)).toThrow(/Pixel masked source policy disabled/)
   const authority=resolver(storage),ticket=authority.prepareBeginGesture(identity,request),grant=ticket.grant
   expect(ownDataEqual(grant.material,material)).toBe(true);storage.pin(identity.roomId,identity.userId,[request.brush],empty(),material.assets);ticket.commit()
   const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,0)
   const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:B,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:grant.composition,materialVersion:2,material}),admission=new CanonicalStrokeAdmission({resolve:authority.resolve,maxGestures:2,retainedFrames:8})
   let ordinal=0,draws=0,ends=0,steps=0
   const consume=(chunks:readonly{packed:string}[])=>{for(const chunk of chunks){if(ordinal>=128)throw Error('Frame bound');const frame=encoder.encode(chunk.packed).envelope,decoded=decodeTrustedCanonicalFrame(frame,grant,ordinal);draws+=decoded.frame.draws.length;ends+=decoded.frame.fences.filter(f=>f.kind==='gestureEnd').length;if(!descriptor.behavior?.dual)expect(()=>decodeTrustedCanonicalFrame(frame,{...grant,plainAutoGeometry:'plain-auto-tilt-v1'},ordinal)).toThrow(/plain-tilt grant mismatch/);admission.prepare(identity,{type:'canonical_stroke',id:'frame-'+ordinal,layerId:'layer',frame}).commit();admission.prepare(identity,{type:'canonical_stroke_live',layerId:'layer',frame}).commit();ordinal++}}
   for(let index=0;index<3;index++){consume(adapter.beginInput(state));const iterator=author.plan(state,{x:10+index*3.25,y:10+index*1.5,t:index*20,pressure:[.3,.95,0][index],tiltX:30,tiltY:15,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false});while(true){const next=iterator.next();if(next.done){state=next.value;break}if(++steps>10000)throw Error('Author step bound');consume(adapter.accept(next.value))}}
   consume(adapter.finish(state));expect(draws).toBeGreaterThan(0);expect(ends).toBe(1);expect(encoder.ended).toBe(true)
  }
 }finally{rooms.delete('pixel-admission');rmSync(root,{recursive:true,force:true})}
})
