import {createHash} from 'node:crypto'
import {inflateSync} from 'node:zlib'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {buildCanonicalMaterial,canonicalImageSourceBinding,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type BrushLibrary,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import fixture from '../../engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {prepareCanonicalRoomState} from '../../pages/Room/net/canonicalRoomState'
vi.mock('@sentry/react',()=>({captureException:vi.fn()}))
const {request,cached}=vi.hoisted(()=>({request:vi.fn(),cached:vi.fn()}))
vi.mock('./api',()=>({apiResponse:async(...args:unknown[])=>Response.json(await request(...args)),apiPath:(_key:string,o:{params:{hash:string};query:{roomId:string}})=>`/assets/${o.params.hash}?roomId=${o.query.roomId}`}))
vi.mock('./brushAssetCache',()=>({cachedBrushAsset:cached,cacheBrushAsset:vi.fn(async()=>{})}))
const bytes=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const binding=canonicalImageSourceBinding(descriptor,fixture.asset),asset=binding.assets[0]
function manifest(size=asset.size):BrushLibrary{return{schemaVersion:1,brushes:[],assets:[{id:asset.id as `asset:${string}`,size,file:asset.id.slice(6)+'.bin'}],skipped:[]}}
function original(){
 let current=true
 const material={version:2 as const,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'L',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'S',boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},material).packed
 const op:CanonicalStrokeOperation={id:'op',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'S',frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[op],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:'op',sequence:1,originalUserId:'author',capability:0}]}}
 const read=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>current}).canonicalRead,scope=read.scope
 return{assets:read.preparedAtoms[0].read!.capability.snapshot.assets,assert:()=>{if(read.assertCurrent()!==scope)throw Error('Wrong original scope')},stale:()=>{current=false}}
}
beforeEach(()=>{vi.resetModules();request.mockReset().mockResolvedValue(manifest());cached.mockReset().mockResolvedValue(null);vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes.slice())))})
afterEach(()=>vi.unstubAllGlobals())
async function setup(){const api=await import('./brushLibrary');api.setBrushRoomScope('room');return{api,resources:await import('../../engine/brushLibrary'),owner:original()}}
it('loads actual Basic6 CAS by original image capability without selecting any catalog descriptor',async()=>{
 expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(asset.id)
 const {api,resources,owner}=await setup()
 await api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)
 expect(resources.importedBrushes()).toHaveLength(0);expect(resources.isBrushAssetReady(asset.id,256)).toBe(true)
 expect(fetch).toHaveBeenCalledWith(`/assets/${asset.id.slice(6)}?roomId=room`,expect.objectContaining({credentials:'include'}))
 await api.prepareCanonicalImageAssets('room',owner.assets,owner.assert);expect(fetch).toHaveBeenCalledTimes(1)
})
it('shares the existing resource pending work and verifies cached bytes before using them',async()=>{
 const {api,owner}=await setup();cached.mockResolvedValue(bytes.slice())
 await Promise.all([api.prepareCanonicalImageAssets('room',owner.assets,owner.assert),api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)])
 expect(request).toHaveBeenCalledTimes(1);expect(cached).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled()
})
it('joins old metadata then refreshes once when the resource was pinned after that request',async()=>{
 const {api,owner}=await setup();let finish!:(m:BrushLibrary)=>void
 request.mockReturnValueOnce(new Promise<BrushLibrary>(r=>{finish=r})).mockResolvedValue(manifest())
 const prior=api.loadBrushLibrary(),work=api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)
 finish({schemaVersion:1,brushes:[],assets:[],skipped:[]});await prior;await work
 expect(request).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledTimes(1)
})
it.each(['missing','side'] as const)('rejects %s availability without fetching or inventing a descriptor',async kind=>{
 const {api,owner}=await setup();request.mockResolvedValue(kind==='side'?manifest(128):{schemaVersion:1,brushes:[],assets:[],skipped:[]})
 await expect(api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)).rejects.toThrow();expect(fetch).not.toHaveBeenCalled()
})
it.each(['checksum','truncated','inaccessible'] as const)('rejects %s CAS and keeps readiness false',async kind=>{
 const {api,resources,owner}=await setup()
 vi.stubGlobal('fetch',vi.fn(async()=>kind==='inaccessible'?new Response('',{status:403}):new Response(kind==='truncated'?bytes.slice(1):new Uint8Array(bytes.length))))
 await expect(api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)).rejects.toThrow();expect(resources.isBrushAssetReady(asset.id)).toBe(false)
})
it.each(['metadata','cache','download'] as const)('rejects expired original read after %s await',async stage=>{
 const {api,owner}=await setup();let finish!:()=>void
 if(stage==='metadata')request.mockImplementation(()=>new Promise<BrushLibrary>(r=>{finish=()=>r(manifest())}))
 if(stage==='cache')cached.mockImplementation(()=>new Promise<Uint8Array|null>(r=>{finish=()=>r(bytes.slice())}))
 if(stage==='download')vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{finish=()=>r(new Response(bytes.slice()))})))
 const work=api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));owner.stale();finish()
 await expect(work).rejects.toThrow()
})
it('rejects scope switches and reentrant owner callbacks before effects',async()=>{
 const {api,owner}=await setup()
 await expect(api.prepareCanonicalImageAssets('room',owner.assets,()=>{owner.assert();api.setBrushRoomScope('other')})).rejects.toThrow()
 expect(request).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
})
it('does not confuse a completed stale download with successful current resource preparation',async()=>{
 const {api,owner,resources}=await setup();let finish!:(r:Response)=>void
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{finish=r})))
 const work=api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));api.setBrushRoomScope('other');finish(new Response(bytes.slice()))
 await expect(work).rejects.toThrow();expect(resources.isBrushAssetReady(asset.id)).toBe(false)
})
it('rejects wrong-size bytes at the declared metadata installation boundary',async()=>{
 const {api,resources}=await setup();await api.loadBrushLibrary()
 expect(()=>resources.installBrushPixels(asset.id,new Uint8Array(4))).toThrow(/size/)
 expect(fetch).not.toHaveBeenCalled();expect(resources.isBrushAssetReady(asset.id)).toBe(false)
})
it('rejects a manifest conflicting with previously installed pixel-only bytes before metadata publication',async()=>{
 const {api,resources}=await setup();resources.installBrushPixels(asset.id,new Uint8Array(4))
 await expect(api.loadBrushLibrary()).rejects.toThrow(/size/);expect(fetch).not.toHaveBeenCalled()
 expect(resources.isBrushAssetReady(asset.id,2)).toBe(true);expect(resources.isBrushAssetReady(asset.id,256)).toBe(false)
})
it('captures bounded own data selectors before callbacks/network and rejects conflicting sides',async()=>{
 const {api}=await setup(),get=vi.fn(()=>asset.id),owner=vi.fn()
 const accessor=Object.defineProperty({id:asset.id,size:256},'id',{get})
 for(const assets of [[accessor],[{id:asset.id,size:256},{id:asset.id,size:128}],Array(65).fill(asset),[{id:'bad',size:256}],[{id:asset.id,size:3}]]){
  await expect(api.prepareCanonicalImageAssets('room',assets,owner)).rejects.toThrow()
 }
 expect(get).not.toHaveBeenCalled();expect(owner).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
})
it('captures selectors before an await, so caller mutation cannot redirect the asset request',async()=>{
 const {api,owner}=await setup();let finish!:(m:BrushLibrary)=>void
 request.mockImplementation(()=>new Promise<BrushLibrary>(r=>{finish=r}))
 const selectors=[{id:asset.id,size:256}],work=api.prepareCanonicalImageAssets('room',selectors,owner.assert)
 selectors[0].id='asset:'+'0'.repeat(64);selectors[0].size=2
 finish(manifest());await work
 expect(fetch).toHaveBeenCalledWith(`/assets/${asset.id.slice(6)}?roomId=room`,expect.anything())
})
it('keeps a current consumer valid when an older original read expires during the same shared download',async()=>{
 const {api,owner}=await setup(),next=original();let finish!:(r:Response)=>void
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{finish=r})))
 const stale=api.prepareCanonicalImageAssets('room',owner.assets,owner.assert),current=api.prepareCanonicalImageAssets('room',next.assets,next.assert)
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));owner.stale();finish(new Response(bytes.slice()))
 await expect(stale).rejects.toThrow();await current;expect(fetch).toHaveBeenCalledTimes(1)
})
it('falls back from invalid cached CAS to verified bytes instead of installing the corrupt cache',async()=>{
 const {api,owner,resources}=await setup();cached.mockResolvedValue(new Uint8Array(bytes.length))
 await api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)
 expect(fetch).toHaveBeenCalledTimes(1);expect(resources.isBrushAssetReady(asset.id,256)).toBe(true)
})
it('checks original lifetime even for no assets and rejects array accessors without invocation',async()=>{
 const {api,owner}=await setup();owner.stale()
 await expect(api.prepareCanonicalImageAssets('room',[],owner.assert)).rejects.toThrow()
 const get=vi.fn(()=>asset),selectors=[asset];Object.defineProperty(selectors,'0',{get})
 await expect(api.prepareCanonicalImageAssets('room',selectors,vi.fn())).rejects.toThrow()
 expect(get).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled()
})
it('does not accept inherited selectors or a stale original read merely because another same-room read is current',async()=>{
 const {api,owner}=await setup(),next=original();next.assert();owner.stale()
 await expect(api.prepareCanonicalImageAssets('room',owner.assets,owner.assert)).rejects.toThrow()
 await expect(api.prepareCanonicalImageAssets('room',[Object.create(asset)],next.assert)).rejects.toThrow()
 expect(request).not.toHaveBeenCalled()
})
it('rechecks readiness after the final callback-capable lifetime assertion',async()=>{
 const {api,owner,resources}=await setup();let readyAssertions=0
 const assert=()=>{owner.assert();if(resources.isBrushAssetReady(asset.id)&&++readyAssertions===2)resources.clearImportedBrushPixels()}
 await expect(api.prepareCanonicalImageAssets('room',owner.assets,assert)).rejects.toThrow()
 expect(readyAssertions).toBe(2);expect(resources.isBrushAssetReady(asset.id)).toBe(false)
})
