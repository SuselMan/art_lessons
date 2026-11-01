import {sourceAutoGeometry,type CanonicalStrokeSnapshotV4} from '@grafetto/shared'
import {createHash} from 'node:crypto'
import {prepareCanonicalRecordedAttachment,type CanonicalStrokeSnapshotV3,parseCanonicalStrokeCloseOperation} from '@grafetto/shared'
import {freezeCanonicalSeededDefaultAutoPolicies,freezeCanonicalTexturedPolicies,freezeCanonicalAuthorPrimaryTexturePolicy,freezeCanonicalPrimaryTexturePolicy} from './canonicalExecutionPolicy.js'
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,sourcePngMaskExtent,buildCanonicalMaterial,type BrushDescriptor,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type CanonicalStrokeFrameEnvelope} from '@grafetto/shared'
import {inflateSync} from 'node:zlib'
import {BrushStorage,empty,setBrushStorage} from '../brushLibrary/storage.js'
import {rooms,flushRoomWrites,type RoomRecord} from './roomRegistry.js'
import {CanonicalBrushCapabilityResolver} from './CanonicalBrushCapabilityResolver.js'
import {CanonicalRoomTransport} from './CanonicalRoomTransport.js'
const db=vi.hoisted(()=>({operation:{count:vi.fn(),findMany:vi.fn(),findUnique:vi.fn(),create:vi.fn()},room:{update:vi.fn()}}))
vi.mock('../db/prisma.js',()=>({prisma:db}))
vi.mock('./snapshotStore.js',async original=>({...await original<typeof import('./snapshotStore.js')>(),getCanonicalGesturePrefixWithRows:vi.fn(async()=>({operations:[],canonicalRows:[]}))}))
const dirs:string[]=[]
beforeEach(()=>{db.operation.count.mockResolvedValue(0);db.operation.findUnique.mockResolvedValue(null);db.operation.create.mockResolvedValue({})})
afterEach(async()=>{for(const id of rooms.keys())await flushRoomWrites(id);rooms.clear();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});vi.restoreAllMocks();vi.clearAllMocks()})
function resident():RoomRecord{
 const record:RoomRecord={room:{id:'board',name:'Board',ownerId:'author',paper:'coarse',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-29T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['layer']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}
 record.participants.set('author',{userId:'author',name:'A',role:'owner',color:'#000000',frozen:false,boardId:'board'});rooms.set('board',record);return record
}
const fixture=JSON.parse(readFileSync(new URL('../../../web/src/engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json',import.meta.url),'utf8'))
function setup(descriptor:BrushDescriptor=fixture.descriptor,pattern?:{id:string;size:number;bytes:Buffer}){
 const dir=mkdtempSync(join(tmpdir(),'server-auto-v2-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Actual auto',source:'fixture.kpp',warnings:[],descriptor}],assets:[{id:fixture.asset.id,size:fixture.asset.size,file:fixture.asset.id.slice(6)+'.bin'},...pattern?[{id:pattern.id,size:pattern.size,file:pattern.id.slice(6)+'.bin'}]:[]],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid real descriptor fixture')
 storage.install('author',library,new Map([[fixture.asset.id.slice(6),inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536})],...pattern?[[pattern.id.slice(6),pattern.bytes]as [string,Buffer]]:[]]));setBrushStorage(storage,empty());const board=resident()
 const input={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'gesture',pigmentRgb8:[183,47,211] as [number,number,number],outerResourceOpacity:.73,alphaDarken:'creamy' as const}
 return{storage,library,board,input,descriptor,dir}
}
function snapshot(result:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV2{if(!result.ok||!('materialVersion'in result.snapshot)||result.snapshot.materialVersion!==2)throw Error(JSON.stringify(result));return result.snapshot}


const identity={roomId:'board',userId:'author'}
const policy={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'] as const,primaryImageSource:'single-inverse-gray-v2' as const}
it('binds actual ROOM Basic6 original150/crop/scale.05 to V2, durably records and cold-reads the same indexed source without granting append',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy)
 const s=snapshot(await transport.begin(identity,f.input,()=>true)),p=s.material.primarySource
 expect(p).toMatchObject({kind:'image',asset:fixture.asset.id,brushScale:.05})
 expect(s.assets).toEqual([{id:fixture.asset.id,size:256,x:53,y:53,width:150,height:150}])
 const shape=sourcePngMaskExtent({width:150,height:150,scale:.05,angle:0},{scale:.5,ratio:1,rotation:.3},0,0)
 const recipe={kind:'image' as const,asset:fixture.asset.id,brushScale:.05,brushAngle:0,scale:.5,ratio:1,rotation:.3,subX:0,subY:0,width:shape[0],height:shape[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:.7,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},s.material).packed
 const frame:CanonicalStrokeFrameEnvelope={version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}
 const operation:CanonicalStrokeOperation={id:'image-op',userId:'author',timestamp:1,type:'canonical_stroke',layerId:'layer',frame}
 const saved=await transport.recorded(identity,operation,()=>true)
 expect(saved.result).toMatchObject({ok:true,seq:1});expect(saved.canonicalCapabilities).toBeDefined()
 const row=db.operation.create.mock.calls[0][0].data,accepted=saved.accepted!
 const cold=new CanonicalBrushCapabilityResolver({...policy,storage:f.storage,operator:()=>empty(),maxGestures:8})
 const read=cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation:accepted,row})
 expect(read.material).toEqual(s.material);expect(cold.resolve(identity,{strokeId:s.strokeId,brush:s.brush,layerId:'layer'})).toBeUndefined()
 expect(cold.readRecordedPrefix({roomId:'board',boardEpoch:s.boardEpoch,anchor:accepted,row,operations:[accepted],rows:[row],purpose:'read'}).ended).toBe(true)
})
it('keeps default image BEGIN in its historical V1 lane without V2 delivery',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy']})
 const result=await transport.begin(identity,f.input,()=>true)
 expect(result.ok).toBe(true);if(result.ok)expect('materialVersion'in result.snapshot).toBe(false)
 const enabled=new CanonicalRoomTransport(policy),s=snapshot(await enabled.begin(identity,f.input,()=>true))
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},s.material).packed
 const operation:CanonicalStrokeOperation={id:'new-v2',userId:'author',timestamp:0,type:'canonical_stroke',layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
 expect((await transport.recorded(identity,operation,()=>true)).result.ok).toBe(false)
 expect(f.board.operations).toEqual([]);expect(db.operation.create).not.toHaveBeenCalled()
})

it.each(['corrupt','missing'] as const)('refuses %s original CAS before V2 BEGIN publishes a grant',async kind=>{
 const f=setup(),path=join(f.dir,'assets',fixture.asset.id.slice(6)+'.bin')
 if(kind==='missing')rmSync(path);else writeFileSync(path,Buffer.alloc(65536))
 const transport=new CanonicalRoomTransport(policy)
 expect((await transport.begin(identity,f.input,()=>true)).ok).toBe(false)
 expect(f.board.operations).toEqual([]);expect(db.operation.create).not.toHaveBeenCalled()
})
it('cannot cold-read V2 image via policy-off or a tampered indexed row, and does not pin personal-only sources',async()=>{
 const f=setup(),transport=new CanonicalRoomTransport(policy),s=snapshot(await transport.begin(identity,f.input,()=>true))
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},s.material).packed
 const operation:CanonicalStrokeOperation={id:'end',seq:1,userId:'author',timestamp:0,type:'canonical_stroke',layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
 const row={id:operation.id,seq:1,roomId:'board',userId:'author',type:operation.type,layerId:'layer',tool:null,data:operation}
 const cold=new CanonicalBrushCapabilityResolver({...policy,storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation,row:{...row,userId:'reader'}})).toThrow()
 const closed=new CanonicalBrushCapabilityResolver({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'],storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>closed.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation,row})).toThrow()
 const personal=setup(),before=personal.storage.library('rooms','board')
 const unpinned=new CanonicalBrushCapabilityResolver({...policy,storage:personal.storage,operator:()=>personal.library,maxGestures:8})
 expect(()=>unpinned.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation,row})).toThrow()
 expect(personal.storage.library('rooms','board')).toEqual(before)
})
it('requires explicit V2 base and author pipe roles to be a subset of immutable recorded roles',()=>{
 const base={rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'] as const}
 const recorded=['incremental-inverse-gray-v2'] as const,author=['random-inverse-gray-v2'] as const
 expect(()=>new CanonicalRoomTransport({...base,...{allowedRecordedImagePipeSources:recorded}})).toThrow()
 expect(()=>new CanonicalRoomTransport({...base,primaryImageSource:'single-inverse-gray-v2',...{allowedRecordedImagePipeSources:recorded,authorImagePipeSources:author}})).toThrow()
 const mutable:import('./canonicalExecutionPolicy.js').CanonicalImagePipeSource[]=['incremental-inverse-gray-v2'],transport=new CanonicalRoomTransport({...base,primaryImageSource:'single-inverse-gray-v2',...{allowedRecordedImagePipeSources:mutable}})
 mutable[0]='random-inverse-gray-v2'
 expect(transport['policy'].allowedRecordedImagePipeSources).toEqual(['incremental-inverse-gray-v2'])
 expect(Object.isFrozen(transport['policy'].allowedRecordedImagePipeSources)).toBe(true)
})

async function pipeSetup(name:'mountains'|'pencilRandom'){
 const data=JSON.parse(readFileSync(new URL(`../../../web/src/engine/src/presets/fixtures/sourceImagePipe/${name}.native.json`,import.meta.url),'utf8'))
 const library:unknown={schemaVersion:1,brushes:[{name,source:'original.kpp',warnings:[],descriptor:data.descriptor}],assets:data.assets.map((a:{id:string;size:number})=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid original GIH fixture')
 const dir=mkdtempSync(join(tmpdir(),'server-pipe-v2-'));dirs.push(dir);const storage=new BrushStorage(dir),pixels=new Map<string,Buffer>()
 for(const asset of data.assets)pixels.set(asset.id.slice(6),inflateSync(Buffer.from(asset.deflateBase64,'base64'),{maxOutputLength:asset.size*asset.size}))
 storage.install('author',library,pixels);setBrushStorage(storage,empty());const board=resident(),descriptor=library.brushes[0].descriptor
 const input={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'pipe',pigmentRgb8:[0,0,0] as [number,number,number],outerResourceOpacity:1,alphaDarken:'creamy' as const}
 return{storage,library,descriptor,board,input,dir}
}

function basicPackets(){
 const f32=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0],m=fixture.mapping
 return fixture.packets.slice(0,-1).map(([xb,yb,t,pb]:number[])=>({x:m.a*f32(xb)+m.c*f32(yb)+m.tx,y:m.b*f32(xb)+m.d*f32(yb)+m.ty,t,pressure:f32(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))
}
async function actualFrames(descriptor:BrushDescriptor,assets:readonly {id:string;size:number}[],s:CanonicalStrokeSnapshotV2,distance=240,originalPackets?:readonly unknown[]){
 const folder=new URL('../../../web/src/engine/src/presets/',import.meta.url).pathname
 const [{sourceStrokeAuthorDescriptor},{SourceStrokeAuthor},{SourceStrokeMaterialAdapter},{SourceCanonicalFrameEncoder}]=await Promise.all([import(folder+'sourceStrokeAuthorDescriptor.ts'),import(folder+'sourceStrokeAuthor.ts'),import(folder+'sourceStrokeMaterialAdapter.ts'),import(folder+'sourceCanonicalFrameEncoder.ts')])
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{assets,...(s.material.primarySource.kind==='image'&&!descriptor.tip.animation?{asset:assets.find(a=>a.id===descriptor.tip.mask)}:{}),colorIdentity:'black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1',...(s.material.primarySource.kind==='image'?{}:{coverageProfile:s.material.primarySource.coverageProfile})})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let state=originalPackets?author.createState(4321,7654,.3):author.createState(1,2,0)
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,s.material,state),encoder=new SourceCanonicalFrameEncoder({rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,pigmentRgb8:s.pigmentRgb8,composition:s.composition,material:s.material})
 const frames:CanonicalStrokeFrameEnvelope[]=[],selected=new Set<string>();let draws=0,empty=0
 const accept=(chunks:readonly {packed:string}[])=>{for(const c of chunks){const encoded=encoder.encode(c.packed);frames.push(encoded.envelope);draws+=encoded.frame.draws.length;if(!encoded.frame.draws.length)empty++;for(const recipe of encoded.frame.definitions)if('asset'in recipe)selected.add(recipe.asset)}}
 const consume=(iterator:Generator<unknown,unknown>)=>{while(true){const next=iterator.next();if(next.done){state=next.value;return}accept(adapter.accept(next.value));const chunk=adapter.flush();if(chunk)accept([chunk])}}
 const packet=(x:number,t:number)=>({x,y:80,t,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
 const packets=originalPackets??[packet(40,0),packet(distance,1000)]
 for(const p of packets){accept(adapter.beginInput(state));if(p===packets[0]){const cut=adapter.flush();if(cut)accept([cut])}consume(author.plan(state,p))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect(encoder.ended).toBe(true);expect(draws).toBeGreaterThan(0);expect(empty).toBeGreaterThan(0)
 return{frames,selected,draws}
}
it.each([['mountains',CANONICAL_STROKE_RASTER_PROFILE],['pencilRandom',CANONICAL_STROKE_RASTER_PROFILE],['mountains',G],['pencilRandom',G]] as const)('actual %s source author emits V2 selected frames under %s through server grant and original recorded attachment',async(name,profile)=>{
 const f=await pipeSetup(name),source=name==='mountains'?'incremental-inverse-gray-v2' as const:'random-inverse-gray-v2' as const
 const config={...policy,rasterProfile:profile,fullHistoryFormat:'mixed-v2' as const,allowedRecordedImagePipeSources:[source],authorImagePipeSources:[source]},transport=new CanonicalRoomTransport(config)
 const s=snapshot(await transport.begin(identity,f.input,()=>true))
 expect(s.material.primarySource.kind).toBe('image');if(s.material.primarySource.kind!=='image')throw Error('Expected pipe image')
 expect(s.material.primarySource.frames).toEqual(f.descriptor.tip.animation?.frames)
 const {frames,selected}=await actualFrames(f.descriptor,f.library.assets,s,name==='mountains'?2040:240)
 if(profile===G){
  const native=snapshot(await new CanonicalRoomTransport({...config,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}).begin(identity,{...f.input,strokeId:'native-byte-reference'},()=>true))
  expect(native.material).toEqual(s.material);expect(native.descriptorSha256).toBe(s.descriptorSha256)
  const reference=await actualFrames(f.descriptor,f.library.assets,native,name==='mountains'?2040:240)
  expect(frames.map(f=>f.materialPacked)).toEqual(reference.frames.map(f=>f.materialPacked))
 }
 expect(selected.size).toBeGreaterThan(1)
 for(const [index,frame] of frames.entries()){
  expect(frame.materialPacked.startsWith('2|')).toBe(true)
  expect(frame.rasterProfile).toBe(profile);expect(frame.version).toBe(profile===G?2:1)
  expect(transport.live(identity,{layerId:'layer',frame}).result.ok).toBe(true)
  const saved=await transport.recorded(identity,{type:'canonical_stroke',id:`${name}-${index}`,userId:'author',timestamp:index,layerId:'layer',frame},()=>true)
  expect(saved.result.ok).toBe(true)
 }
 const cold=new CanonicalBrushCapabilityResolver({...config,authorImagePipeSources:[],storage:f.storage,operator:()=>empty(),maxGestures:8})
 const rows=db.operation.create.mock.calls.map(call=>call[0].data),ops=f.board.operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke')
 const attachment=cold.prepareRecordedAttachment({roomId:'board',boardEpoch:s.boardEpoch,operations:ops,rows})
 const shared=await import('@grafetto/shared'),prepared=shared.prepareCanonicalRecordedAttachment(attachment,ops,{roomId:'board',boardEpoch:s.boardEpoch,allowedRasterProfiles:[profile]})
 expect(prepared.map(p=>p.operation)).toEqual(ops);expect(attachment.capabilities[0].snapshot.material.primarySource).toEqual(s.material.primarySource)
 expect(()=>cold.beginGesture(identity,{...f.input,strokeId:'no-author'})).toThrow('author policy')
 expect(cold.size).toBe(0)
 expect(()=>cold.prepareResumeGesture(identity,f.input,{operations:ops,rows})).toThrow('author policy')
 expect(cold.size).toBe(0)
 let operator=f.library
 f.storage.atomic(f.storage.path('owners','author'),empty())
 const cached=new CanonicalBrushCapabilityResolver({...config,storage:f.storage,operator:()=>operator,maxGestures:8}),originalGrant=cached.beginGesture(identity,f.input)
 operator=empty();expect(cached.prepareResumeGesture(identity,f.input,{operations:ops,rows}).grant).toBe(originalGrant)
 operator={...f.library,brushes:f.library.brushes.map(b=>({...b,descriptor:{...b.descriptor,flow:.125}}))}
 expect(cached.prepareResumeGesture(identity,f.input,{operations:ops,rows}).grant).toBe(originalGrant)

})
it('checks every unique pipe CAS before author publication and preserves the default closed role policy',async()=>{
 const f=await pipeSetup('mountains'),disabled=new CanonicalRoomTransport(policy)
 expect((await disabled.begin(identity,f.input,()=>true)).ok).toBe(false)
 const config={...policy,allowedRecordedImagePipeSources:['incremental-inverse-gray-v2'] as const,authorImagePipeSources:['incremental-inverse-gray-v2'] as const}
 const last=f.library.assets.at(-1)!;rmSync(join(f.dir,'assets',last.id.slice(6)+'.bin'))
 const checked=vi.spyOn(f.storage,'asset'),transport=new CanonicalRoomTransport(config)
 expect((await transport.begin(identity,f.input,()=>true)).ok).toBe(false)
 expect(checked).toHaveBeenCalledWith(last.id.slice(6),last.size)
 expect(f.board.operations).toEqual([]);expect(db.operation.create).not.toHaveBeenCalled()
})

it('admits explicit GenericSC image V2 Basic6 while keeping V1 and Browser profile closed',async()=>{
 const f=setup(),asset=vi.spyOn(f.storage,'asset')
 expect(await new CanonicalRoomTransport({...policy,rasterProfile:G}).begin(identity,f.input,()=>true)).toMatchObject({ok:true});asset.mockClear()
 expect(await new CanonicalRoomTransport({rasterProfile:G,alphaDarkenVariants:['creamy']}).begin(identity,{...f.input,strokeId:'no-v2'},()=>true)).toMatchObject({ok:false})
 expect(await new CanonicalRoomTransport({...policy,rasterProfile:B}).begin(identity,{...f.input,strokeId:'browser'},()=>true)).toMatchObject({ok:false})
 expect(asset).not.toHaveBeenCalled();expect(f.board.operations).toEqual([]);expect(db.operation.create).not.toHaveBeenCalled()
})
it.each(['basic6','mountains','pencilRandom'] as const)('keeps actual %s and Marker original receipts in one GenericSC full prefix',async name=>{
 const f=name==='basic6'?setup():await pipeSetup(name)
 const marker=JSON.parse(readFileSync(new URL('../../../web/src/engine/src/presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json',import.meta.url),'utf8'))
 const combined:unknown={...f.library,brushes:[...f.library.brushes,marker.imported]};if(!isBrushLibrary(combined))throw Error('Invalid combined original sources')
 f.storage.install('author',combined,new Map())
 const pipe=name==='mountains'?'incremental-inverse-gray-v2' as const:name==='pencilRandom'?'random-inverse-gray-v2' as const:undefined
 const config={...policy,rasterProfile:G,allowedRecordedRasterProfiles:[G],fullHistoryFormat:'mixed-v2' as const,allowedRecordedImagePipeSources:pipe?[pipe]:[],authorImagePipeSources:pipe?[pipe]:[],seededDefaultAuto:{coverageProfile:D,storedScale:1 as const},recordedSeededDefaultAutoProfile:D}
 const transport=new CanonicalRoomTransport(config),s=snapshot(await transport.begin(identity,f.input,()=>true))
 expect(s.rasterProfile).toBe(G);expect(s.material.primarySource.kind).toBe('image')
 const image=await actualFrames(f.descriptor,f.library.assets,s,name==='mountains'?2040:240,name==='basic6'?basicPackets():undefined)
 if(name==='basic6'){
  const native=snapshot(await new CanonicalRoomTransport({...config,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,allowedRecordedRasterProfiles:[CANONICAL_STROKE_RASTER_PROFILE],seededDefaultAuto:false,recordedSeededDefaultAutoProfile:false}).begin(identity,{...f.input,strokeId:'native-reference'},()=>true))
  expect(native.material).toEqual(s.material)
  const reference=await actualFrames(f.descriptor,f.library.assets,native,240,basicPackets())
  expect(image.frames.map(f=>f.materialPacked)).toEqual(reference.frames.map(f=>f.materialPacked))
 }
 const md=combined.brushes.at(-1)!.descriptor,ms=snapshot(await transport.begin(identity,{...f.input,brush:`brush:${md.id}@${md.version}`,strokeId:'marker-same-profile'},()=>true))
 expect(ms.descriptorSha256).toBe(marker.canonicalDescriptorSHA256);expect(canonicalBrushDescriptorJSON(md)).toBeTypeOf('string')
 const density=await actualFrames(md,[],ms,240,marker.packets)
 expect(density.draws).toBe(17)
 for(const [kind,frames] of [['image',image.frames],['marker',density.frames]] as const)for(const [i,frame]of frames.entries()){
  expect(frame.version).toBe(2);expect(frame.rasterProfile).toBe(G)
  expect(transport.live(identity,{layerId:'layer',frame}).result.ok).toBe(true)
  const saved=await transport.recorded(identity,{type:'canonical_stroke',id:kind+'-'+i,userId:'author',timestamp:i,layerId:'layer',frame},()=>true)
  expect(saved.result.ok).toBe(true)
 }
 await flushRoomWrites('board')
 const rows=db.operation.create.mock.calls.map(([request])=>request.data),ops=f.board.operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke'),cold=new CanonicalBrushCapabilityResolver({...config,seededDefaultAuto:false,authorImagePipeSources:[],storage:f.storage,operator:empty,maxGestures:8})
 const attachment=cold.prepareMixedRecordedAttachment({roomId:'board',boardEpoch:s.boardEpoch,operations:ops,rows}),shared=await import('@grafetto/shared'),scope={roomId:'board',boardEpoch:s.boardEpoch,allowedRasterProfiles:[G]}
 const prepared=shared.prepareCanonicalRecordedAttachment(attachment,ops,scope)
 expect(prepared.map(p=>p.operation)).toEqual(ops);expect(attachment.capabilities).toHaveLength(2)
 shared.verifyCanonicalFullHistoryBase({kind:'full-room-prefix-v2',roomId:scope.roomId,boardEpoch:scope.boardEpoch,throughSeq:ops.length,operationCount:ops.length},prepared,scope)
 expect(attachment.capabilities.map(c=>c.snapshot.rasterProfile)).toEqual([G,G]);expect(cold.size).toBe(0)
})

it('keeps the shared base-V2 gate mandatory for GenericSC pipe read and author roles',()=>{
 for(const primaryImageSource of [undefined,false] as const)for(const source of ['incremental-inverse-gray-v2','random-inverse-gray-v2'] as const){
  expect(()=>new CanonicalRoomTransport({rasterProfile:G,alphaDarkenVariants:['creamy'],primaryImageSource,allowedRecordedImagePipeSources:[source]})).toThrow('invalid explicit image pipe policy')
  expect(()=>new CanonicalRoomTransport({rasterProfile:G,alphaDarkenVariants:['creamy'],primaryImageSource,allowedRecordedImagePipeSources:[source],authorImagePipeSources:[source]})).toThrow('invalid explicit image pipe policy')
 }
})

// Self-authored structural source program on an existing valid image fixture.
// This is not an assertion that Basic6 or the stock Chalk preset has these fields.
function textureSetup(){
 const d=structuredClone(fixture.descriptor)as BrushDescriptor,bytes=Buffer.from(Array.from({length:64},(_,i)=>i*3)),id='asset:'+createHash('sha256').update(bytes).digest('hex')
 if(!d.sourceStamp)throw Error('source fixture')
 Object.assign(d.sourceStamp.flags,{textureEnabled:true})
 Object.assign(d.sourceStamp.settings,{'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true','Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0','Texture/Strength/Sensor':'<!DOCTYPE params> <params id="pressure"><curve>0,0;1,1;</curve></params>'})
 d.texture={id:id as `asset:${string}`,strength:1,periodPx:4,patternSize:{width:4,height:4},application:{mode:'subtract',soft:false},offset:{x:0,y:0,randomX:false,randomY:false}}
 return{...setup(d,{id,size:8,bytes}),pattern:{id,size:8,bytes}}
}
const texturePolicy={rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy']as const,primaryImageSource:'single-inverse-gray-v2'as const,primaryTextureSource:'pressure-identity-subtract-v3'as const,authorPrimaryTextureSource:'pressure-identity-subtract-v3'as const}
function textureSnapshot(result:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV3{
 if(!result.ok||!('materialVersion'in result.snapshot)||result.snapshot.materialVersion!==3)throw Error(JSON.stringify(result))
 return result.snapshot
}
function textureOperation(s:CanonicalStrokeSnapshotV3,end=true):CanonicalStrokeOperation {
 const p=s.material.primarySource,a=s.assets[0],extent=sourcePngMaskExtent({width:a.width,height:a.height,scale:p.brushScale,angle:p.brushAngle},{scale:1,ratio:1,rotation:0},0,0)
 const recipe={kind:'image'as const,asset:a.id,brushScale:p.brushScale,brushAngle:p.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:extent[0],height:extent[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:.7,flow:1,grainDepth:.5}],fences:[{at:0,kind:'segmentBegin',group:0},...end?[{at:1,kind:'primaryEnd'as const,group:0},{at:1,kind:'segmentEnd'as const,group:0},{at:1,kind:'gestureEnd'as const}]:[]]},s.material).packed
 return{id:'texture-op',userId:'author',timestamp:1,type:'canonical_stroke',layerId:'layer',frame:{version:2,rasterProfile:G,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
}
it('keeps primary texture policy default OFF and refuses unsupported policy pairings',async()=>{
 const f=textureSetup(),closed=new CanonicalRoomTransport({...texturePolicy,primaryTextureSource:false,authorPrimaryTextureSource:false})
 expect((await closed.begin(identity,f.input,()=>true)).ok).toBe(false);expect(db.operation.create).not.toHaveBeenCalled()
 expect(freezeCanonicalPrimaryTexturePolicy({})).toBe(false);expect(closed.requiresPrimaryTextureProtocol).toBe(false)
 const mutable={...texturePolicy},enabled=new CanonicalRoomTransport(mutable);Reflect.set(mutable,'primaryTextureSource',false);Reflect.set(mutable,'authorPrimaryTextureSource',false);expect(enabled.requiresPrimaryTextureProtocol).toBe(true)
 expect(freezeCanonicalAuthorPrimaryTexturePolicy({})).toBe(false)
 expect(()=>new CanonicalRoomTransport({...texturePolicy,primaryTextureSource:false})).toThrow()
 const readerOnly=new CanonicalRoomTransport({...texturePolicy,authorPrimaryTextureSource:false})
 expect(readerOnly.requiresPrimaryTextureProtocol).toBe(true);expect((await readerOnly.begin(identity,f.input,()=>true)).ok).toBe(false)
 for(const p of [{...texturePolicy,primaryImageSource:false},{...texturePolicy,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE}])expect(()=>Reflect.apply(freezeCanonicalPrimaryTexturePolicy,null,[p])).toThrow()
})
it('binds BOTH actual CAS assets and original SHA, emits explicit BEGIN3 and durable attachment1 snapshot3',async()=>{
 const f=textureSetup(),before=canonicalBrushDescriptorJSON(f.descriptor),transport=new CanonicalRoomTransport(texturePolicy)
 const preflight=new CanonicalBrushCapabilityResolver({...texturePolicy,storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>preflight.prepareBeginGesture(identity,f.input)).not.toThrow()
 const s=textureSnapshot(await transport.begin(identity,f.input,()=>true))
 expect(s.materialVersion).toBe(3);expect(s.assets).toHaveLength(2);expect(s.material.primaryTexture.asset).toBe(f.pattern.id)
 expect(s.descriptorSha256).toBe(createHash('sha256').update(before).digest('hex'));expect(canonicalBrushDescriptorJSON(f.descriptor)).toBe(before)
 expect(textureSnapshot(await transport.begin(identity,f.input,()=>true))).toEqual(s)
 const op=textureOperation(s),live=transport.live(identity,{layerId:'layer',frame:op.frame})
 expect(live.result).toEqual({ok:true,duplicate:false});expect(db.operation.create).not.toHaveBeenCalled()
 const saved=await transport.recorded(identity,op,()=>true)
 expect(saved.result).toMatchObject({ok:true,seq:1});expect(saved.canonicalCapabilities!.version).toBe(1)
 expect(saved.canonicalCapabilities!.capabilities[0].snapshot.materialVersion).toBe(3)
 const atoms=prepareCanonicalRecordedAttachment(saved.canonicalCapabilities,[saved.accepted!],{roomId:'board',boardEpoch:s.boardEpoch,allowedRasterProfiles:[G]})
 expect(atoms[0].read!.capability.snapshot.materialVersion).toBe(3)
 const repeated=await transport.recorded(identity,op,()=>true);expect(repeated.result).toMatchObject({ok:true,seq:1,duplicate:true});expect(db.operation.create).toHaveBeenCalledTimes(1)
 const row=db.operation.create.mock.calls[0][0].data,cold=new CanonicalBrushCapabilityResolver({...texturePolicy,authorPrimaryTextureSource:false,storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>cold.prepareBeginGesture(identity,f.input)).toThrow('author policy disabled')
 const read=cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation:saved.accepted!,row})
 expect(read.material).toEqual(s.material);expect(cold.size).toBe(0)
 const attachment=cold.prepareRecordedAttachment({roomId:'board',boardEpoch:s.boardEpoch,operations:[saved.accepted!],rows:[row]})
 expect(attachment.capabilities[0].snapshot.materialVersion).toBe(3)
})
it.each(['missing','corrupt']as const)('refuses %s PATTERN CAS before BEGIN3 grant',async mode=>{
 const f=textureSetup(),path=join(f.dir,'assets',f.pattern.id.slice(6)+'.bin')
 if(mode==='missing')rmSync(path);else writeFileSync(path,Buffer.alloc(64))
 const transport=new CanonicalRoomTransport(texturePolicy);expect((await transport.begin(identity,f.input,()=>true)).ok).toBe(false)
 expect(f.board.operations).toHaveLength(0);expect(db.operation.create).not.toHaveBeenCalled()
})
it('folds a genuine durable3 OPEN root and original indexed typed close without creating a new author grant',async()=>{
 const f=textureSetup(),transport=new CanonicalRoomTransport(texturePolicy),s=textureSnapshot(await transport.begin(identity,f.input,()=>true))
 const saved=await transport.recorded(identity,textureOperation(s,false),()=>true);expect(saved.result.ok).toBe(true)
 const first=saved.accepted!,row=db.operation.create.mock.calls[0][0].data
 const binder=new CanonicalBrushCapabilityResolver({...texturePolicy,storage:f.storage,operator:()=>empty(),maxGestures:8}),fold=binder.createIndexedRecordedPrefixFold({roomId:'board',boardEpoch:s.boardEpoch,anchor:first,row,purpose:'undo-redo'})
 fold.accept(first,row)
 const close=parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'texture-close',userId:'author',timestamp:2,seq:2,layerId:'layer',targetUserId:'author',strokeId:s.strokeId,disposition:'commitPartial',recordedNext:1,firstFrameOpId:first.id,lastFrameOpId:first.id})
 fold.accept(close,{id:close.id,roomId:'board',userId:'author',seq:2,type:close.type,layerId:'layer',tool:null,data:close})
 expect(fold.finish()).toMatchObject({recordedNext:1,ended:false,closeSeal:{kind:'commitPartial',closeOperationId:close.id}});expect(binder.size).toBe(0)
})

const actualRegular=JSON.parse(readFileSync(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json',import.meta.url),'utf8'))

/** Self-authored resource identity, not genuine vendor-pattern equivalence. */
function fixedAuto4Setup(){
 const descriptor=structuredClone(actualRegular.descriptor) as unknown as BrushDescriptor
 const bytes=Buffer.from(Array.from({length:256},(_,i)=>(i*37+11)%256)),id='asset:'+createHash('sha256').update(bytes).digest('hex')
 descriptor.id='imported-'+createHash('sha256').update('self-authored-material4-pattern-mechanism').digest('hex').slice(0,24);descriptor.version=1
 if(!descriptor.texture)throw Error('fixture texture');descriptor.texture.id=id as `asset:${string}`
 const dir=mkdtempSync(join(tmpdir(),'server-fixed4-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Self-authored pattern mechanism',source:'self-authored-test',warnings:[],descriptor}],assets:[{id,size:16,file:id.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid fixed4 fixture')
 storage.install('author',library,new Map([[id.slice(6),bytes]]));setBrushStorage(storage,empty());const board=resident()
 const input={layerId:'layer',brush:`brush:${descriptor.id}@1`,strokeId:'fixed4',pigmentRgb8:[11,22,33]as[number,number,number],outerResourceOpacity:1,alphaDarken:'creamy'as const}
 return{descriptor,storage,dir,board,input,pattern:{id,size:16}}
}
const fixed4Policy={rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy']as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1'as const,storedScale:1 as const}},texturedSource:'fixed-default-auto-texture-v4'as const,authorTexturedSource:'fixed-default-auto-texture-v4'as const}
function fixed4Snapshot(r:CanonicalStrokeBeginResult):CanonicalStrokeSnapshotV4{if(!r.ok||!('materialVersion'in r.snapshot)||r.snapshot.materialVersion!==4)throw Error(JSON.stringify(r));return r.snapshot}
function fixed4Operation(s:CanonicalStrokeSnapshotV4,end=true):CanonicalStrokeOperation{
 const p=s.material.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:p.source.diameter,ratio:p.source.ratio,spikes:2,scale:p.brushScale,angle:p.brushAngle},{scale:1,ratio:1,rotation:0})
 const recipe={kind:'defaultAuto'as const,source:p.source,coverageProfile:p.coverageProfile,brushScale:p.brushScale,brushAngle:p.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:1,y:2,opacity:1,flow:1,grainDepth:1}],fences:[{at:0,kind:'segmentBegin',group:0},...end?[{at:1,kind:'primaryEnd'as const,group:0},{at:1,kind:'segmentEnd'as const,group:0},{at:1,kind:'gestureEnd'as const}]:[]]},s.material).packed
 return{id:'fixed4-op',userId:'author',timestamp:1,type:'canonical_stroke',layerId:'layer',frame:{version:2,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
}
it('separates fixed4 read/author and old3 protocol policy; author requires consumer',async()=>{
 const f=fixedAuto4Setup(),reader=new CanonicalRoomTransport({...fixed4Policy,authorTexturedSource:false})
 expect(reader.requiredDrawingProtocol).toBe('4');expect((await reader.begin(identity,f.input,()=>true)).ok).toBe(false)
 expect(()=>new CanonicalRoomTransport({...fixed4Policy,texturedSource:false})).toThrow()
 expect(freezeCanonicalTexturedPolicies({...fixed4Policy,texturedSource:false,authorTexturedSource:false})).toEqual({texturedSource:false,authorTexturedSource:false})
 let calls=0;const p={...fixed4Policy};Object.defineProperty(p,'texturedSource',{get(){calls++;return fixed4Policy.texturedSource}});expect(()=>new CanonicalRoomTransport(p)).toThrow();expect(calls).toBe(0)
 expect(new CanonicalRoomTransport(texturePolicy).requiredDrawingProtocol).toBe('3');expect(new CanonicalRoomTransport(policy).requiredDrawingProtocol).toBeUndefined()
})
it('accepts actual BEGIN4/live/typedEND/durable ACK and read4 cold while author4OFF, with pattern-only ledger',async()=>{
 const f=fixedAuto4Setup(),before=canonicalBrushDescriptorJSON(f.descriptor),t=new CanonicalRoomTransport(fixed4Policy),s=fixed4Snapshot(await t.begin(identity,f.input,()=>true))
 expect(s.assets).toHaveLength(1);expect(s.assets[0].id).toBe(f.pattern.id);expect(s.material.primarySource.kind).toBe('defaultAuto')
 expect(s.descriptorSha256).toBe(createHash('sha256').update(before).digest('hex'));expect(canonicalBrushDescriptorJSON(f.descriptor)).toBe(before)
 const op=fixed4Operation(s);expect(t.live(identity,{layerId:'layer',frame:op.frame}).result).toEqual({ok:true,duplicate:false})
 const saved=await t.recorded(identity,op,()=>true);expect(saved.result).toMatchObject({ok:true,seq:1});expect(db.operation.create).toHaveBeenCalledTimes(1)
 const atoms=prepareCanonicalRecordedAttachment(saved.canonicalCapabilities,[saved.accepted!],{roomId:'board',boardEpoch:s.boardEpoch,allowedRasterProfiles:[G]});expect(atoms[0].read!.capability.snapshot.materialVersion).toBe(4)
 const cold=new CanonicalBrushCapabilityResolver({...fixed4Policy,authorTexturedSource:false,storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>cold.prepareBeginGesture(identity,f.input)).toThrow('author policy disabled')
 const row=db.operation.create.mock.calls[0][0].data,read=cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation:saved.accepted!,row});expect(read.material).toEqual(s.material);expect(cold.size).toBe(0)
 const repeated=await t.recorded(identity,op,()=>true);expect(repeated.result).toMatchObject({ok:true,seq:1,duplicate:true});expect(db.operation.create).toHaveBeenCalledTimes(1)
})
it.each(['missing','corrupt']as const)('refuses %s actual self-authored pattern CAS BEFORE BEGIN4 grant',async kind=>{
 const f=fixedAuto4Setup(),path=join(f.dir,'assets',f.pattern.id.slice(6)+'.bin');if(kind==='missing')rmSync(path);else writeFileSync(path,Buffer.alloc(256))
 expect((await new CanonicalRoomTransport(fixed4Policy).begin(identity,f.input,()=>true)).ok).toBe(false);expect(db.operation.create).not.toHaveBeenCalled()
})

it('folds durable4 OPEN prefix and original typed close with read4/author4OFF using SAME bounded verifier',async()=>{
 const f=fixedAuto4Setup(),transport=new CanonicalRoomTransport(fixed4Policy),s=fixed4Snapshot(await transport.begin(identity,f.input,()=>true))
 const saved=await transport.recorded(identity,fixed4Operation(s,false),()=>true);expect(saved.result.ok).toBe(true)
 const first=saved.accepted!,row=db.operation.create.mock.calls[0][0].data
 const binder=new CanonicalBrushCapabilityResolver({...fixed4Policy,authorTexturedSource:false,storage:f.storage,operator:()=>empty(),maxGestures:8}),fold=binder.createIndexedRecordedPrefixFold({roomId:'board',boardEpoch:s.boardEpoch,anchor:first,row,purpose:'undo-redo'})
 fold.accept(first,row)
 const close=parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'fixed4-close',userId:'author',timestamp:2,seq:2,layerId:'layer',targetUserId:'author',strokeId:s.strokeId,disposition:'commitPartial',recordedNext:1,firstFrameOpId:first.id,lastFrameOpId:first.id})
 fold.accept(close,{id:close.id,roomId:'board',userId:'author',seq:2,type:close.type,layerId:'layer',tool:null,data:close})
 expect(fold.finish()).toMatchObject({recordedNext:1,ended:false,closeSeal:{kind:'commitPartial',closeOperationId:close.id}});expect(binder.size).toBe(0)
})

it('keeps recorded seeded policy DATA-only without leaking the imported raster-contract function',()=>{
 const p=freezeCanonicalSeededDefaultAutoPolicies({recordedSeededDefaultAutoProfile:D,fullHistoryFormat:'mixed-indexed-v1',allowedRecordedRasterProfiles:[G]})
 expect(Reflect.ownKeys(p)).toEqual(['recordedSeededDefaultAutoProfile']);expect(p).toEqual({recordedSeededDefaultAutoProfile:D})
})

/** Genuine nonlinear37 metadata + explicit self-authored pattern CAS mechanism.
 * This exercises server authority, not vendor pattern/pixel equivalence. */
const actualPressure37=JSON.parse(readFileSync(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json',import.meta.url),'utf8'))
function pressureAuto5Setup(){
 const descriptor=structuredClone(actualPressure37.descriptor) as unknown as BrushDescriptor
 const bytes=Buffer.from(Array.from({length:256*256},(_,i)=>(i*43+17)%256)),id='asset:'+createHash('sha256').update(bytes).digest('hex')
 descriptor.id='imported-'+createHash('sha256').update('self-authored-pressure5-pattern-authority').digest('hex').slice(0,24)
 if(!descriptor.texture)throw Error('fixture texture');descriptor.texture.id=id as `asset:${string}`
 const dir=mkdtempSync(join(tmpdir(),'server-pressure5-'));dirs.push(dir);const storage=new BrushStorage(dir)
 const library={schemaVersion:1,brushes:[{name:'Self-authored pattern authority37',source:'self-authored-test',warnings:[],descriptor}],assets:[{id,size:256,file:id.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid pressure5 fixture')
 storage.install('author',library,new Map([[id.slice(6),bytes]]));setBrushStorage(storage,empty());const board=resident()
 return{descriptor,storage,dir,board,pattern:{id,size:256},input:{layerId:'layer',brush:`brush:${descriptor.id}@37`,strokeId:'pressure5',pigmentRgb8:[11,22,33]as[number,number,number],outerResourceOpacity:1,alphaDarken:'creamy'as const}}
}
const pressure5Policy={rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy']as const,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1'as const,storedScale:1 as const}},pressureTexturedSource:'pressure-default-auto-texture-v5'as const,authorPressureTexturedSource:'pressure-default-auto-texture-v5'as const}
function pressure5Snapshot(r:CanonicalStrokeBeginResult):import('@grafetto/shared').CanonicalStrokeSnapshotV5{if(!r.ok||!('materialVersion'in r.snapshot)||r.snapshot.materialVersion!==5)throw Error(JSON.stringify(r));return r.snapshot}
function pressure5Operation(s:import('@grafetto/shared').CanonicalStrokeSnapshotV5,end=true):CanonicalStrokeOperation{
 const p=s.material.primarySource,g=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:p.source.diameter,ratio:p.source.ratio,spikes:2,scale:p.brushScale,angle:p.brushAngle},{scale:.1,ratio:1,rotation:0})
 const recipe={kind:'defaultAuto'as const,source:p.source,coverageProfile:p.coverageProfile,brushScale:p.brushScale,brushAngle:p.brushAngle,scale:.1,ratio:1,rotation:0,subX:0,subY:0,width:g.maskSize[0],height:g.maskSize[1],mirrorH:false,mirrorV:false}
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[0,.5,1].map((grainDepth,x)=>({recipe,role:'primary'as const,x,y:2,opacity:1,flow:1,grainDepth})),fences:[{at:0,kind:'segmentBegin',group:0},...end?[{at:3,kind:'primaryEnd'as const,group:0},{at:3,kind:'segmentEnd'as const,group:0},{at:3,kind:'gestureEnd'as const}]:[]]},s.material).packed
 return{id:'pressure5-op',userId:'author',timestamp:1,type:'canonical_stroke',layerId:'layer',frame:{version:2,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
}
it('keeps independent5 flags defaultOFF/required5 and denies wrong fields without invoking getters',async()=>{
 const f=pressureAuto5Setup();expect((await new CanonicalRoomTransport(fixed4Policy).begin(identity,f.input,()=>true)).ok).toBe(false)
 const reader=new CanonicalRoomTransport({...pressure5Policy,authorPressureTexturedSource:false});expect(reader.requiredDrawingProtocol).toBe('5');expect((await reader.begin(identity,f.input,()=>true)).ok).toBe(false)
 expect(()=>new CanonicalRoomTransport({...pressure5Policy,pressureTexturedSource:false})).toThrow()
 let calls=0;const getter={...pressure5Policy};Object.defineProperty(getter,'pressureTexturedSource',{get(){calls++;return pressure5Policy.pressureTexturedSource}});expect(()=>new CanonicalRoomTransport(getter)).toThrow();expect(calls).toBe(0)
 const old=fixedAuto4Setup();expect((await new CanonicalRoomTransport(pressure5Policy).begin(identity,old.input,()=>true)).ok).toBe(false)
 expect((await new CanonicalRoomTransport({...pressure5Policy,...fixed4Policy}).begin(identity,old.input,()=>true)).ok).toBe(true)
})
it('pins BEGIN5/live/durable typedEND/read5authorOFF and exact retry without coefficients on wire',async()=>{
 const f=pressureAuto5Setup(),before=canonicalBrushDescriptorJSON(f.descriptor),t=new CanonicalRoomTransport(pressure5Policy),s=pressure5Snapshot(await t.begin(identity,f.input,()=>true))
 expect(s.descriptorSha256).toBe(createHash('sha256').update(before).digest('hex'));expect(s.assets).toHaveLength(1);expect(s.assets[0].id).toBe(f.pattern.id);expect(s.material.primaryTexture.strength).toBe('source-pressure-curve-v1');expect(JSON.stringify(s)).not.toContain('coefficients');expect(s.material).not.toHaveProperty('materialCpuBudgetBytes')
 const op=pressure5Operation(s);expect(t.live(identity,{layerId:'layer',frame:op.frame}).result).toEqual({ok:true,duplicate:false})
 const saved=await t.recorded(identity,op,()=>true);expect(saved.result).toMatchObject({ok:true,seq:1});expect(db.operation.create).toHaveBeenCalledTimes(1)
 const atoms=prepareCanonicalRecordedAttachment(saved.canonicalCapabilities,[saved.accepted!],{roomId:'board',boardEpoch:s.boardEpoch,allowedRasterProfiles:[G]});expect(atoms[0].read!.capability.snapshot.materialVersion).toBe(5)
 const cold=new CanonicalBrushCapabilityResolver({...pressure5Policy,authorPressureTexturedSource:false,storage:f.storage,operator:()=>empty(),maxGestures:8})
 expect(()=>cold.prepareBeginGesture(identity,f.input)).toThrow('author policy disabled')
 const row=db.operation.create.mock.calls[0][0].data;expect(cold.readRecordedCapability({roomId:'board',boardEpoch:s.boardEpoch,operation:saved.accepted!,row}).material).toEqual(s.material);expect(cold.size).toBe(0)
 const repeated=await t.recorded(identity,op,()=>true);expect(repeated.result).toMatchObject({ok:true,seq:1,duplicate:true});expect(db.operation.create).toHaveBeenCalledTimes(1);expect(canonicalBrushDescriptorJSON(f.descriptor)).toBe(before)
})
it('folds durable5 OPEN and original recorded-close with read5authorOFF through same verifier',async()=>{
 const f=pressureAuto5Setup(),t=new CanonicalRoomTransport(pressure5Policy),s=pressure5Snapshot(await t.begin(identity,f.input,()=>true));const saved=await t.recorded(identity,pressure5Operation(s,false),()=>true);expect(saved.result.ok).toBe(true)
 const first=saved.accepted!,row=db.operation.create.mock.calls[0][0].data,binder=new CanonicalBrushCapabilityResolver({...pressure5Policy,authorPressureTexturedSource:false,storage:f.storage,operator:()=>empty(),maxGestures:8}),fold=binder.createIndexedRecordedPrefixFold({roomId:'board',boardEpoch:s.boardEpoch,anchor:first,row,purpose:'undo-redo'})
 fold.accept(first,row);const close=parseCanonicalStrokeCloseOperation({type:'canonical_stroke_close',id:'pressure5-close',userId:'author',timestamp:2,seq:2,layerId:'layer',targetUserId:'author',strokeId:s.strokeId,disposition:'commitPartial',recordedNext:1,firstFrameOpId:first.id,lastFrameOpId:first.id});fold.accept(close,{id:close.id,roomId:'board',userId:'author',seq:2,type:close.type,layerId:'layer',tool:null,data:close})
 expect(fold.finish()).toMatchObject({recordedNext:1,ended:false,closeSeal:{kind:'commitPartial',closeOperationId:close.id}});expect(binder.size).toBe(0)
})
it.each(['missing','corrupt']as const)('rejects actual %s pattern CAS before BEGIN5 and writes nothing',async kind=>{const f=pressureAuto5Setup(),file=join(f.dir,'assets',f.pattern.id.slice(6)+'.bin');if(kind==='missing')rmSync(file);else writeFileSync(file,Buffer.alloc(256));expect((await new CanonicalRoomTransport(pressure5Policy).begin(identity,f.input,()=>true)).ok).toBe(false);expect(db.operation.create).not.toHaveBeenCalled()})
