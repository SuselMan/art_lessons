import texturedAutoMetadata from '../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json' with {type:'json'}
import softNativeMetadata from '../../../../../packages/shared/src/fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json' with {type:'json'}
import{pressureTextureFixture}from'../../pages/Room/net/canonicalPressureTexture.testFixture'
import {beforeEach,expect,it,vi} from 'vitest'
import basic6 from '../../engine/src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import mountains from '../../engine/src/presets/fixtures/sourceImagePipe/mountains.native.json'
import graphite from '../../engine/src/presets/fixtures/sourceImagePipe/pencilRandom.native.json'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_RASTER_PROFILE as profile,isBrushLibrary,type ImportedBrush} from '@grafetto/shared'
import stock from '../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {canonicalToolAvailability,canonicalToolOffered} from './canonicalToolAvailability'
import type {RoomStateLegacyPayload} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../../pages/Room/net/canonicalRoomState'
import {TOOL_SCHEMAS} from './toolSchemas'
import {resetRoomStore,useRoomStore} from '../../stores/roomStore'
function library():ImportedBrush[]{
 const brushes=[4,8].map(index=>{const row=stock.rows.find(r=>r.index===index);if(!row)throw Error('Missing source');return {name:'Native '+index,source:'stock.kpp',descriptor:row.descriptor,warnings:[]}})
 const candidate:unknown={schemaVersion:1,brushes,assets:[],skipped:[]}
 if(!isBrushLibrary(candidate))throw Error('Invalid actual fixture library')
 return candidate.brushes
}
const read={authorRasterProfile:profile,assertCurrent:()=>({roomId:'test',boardEpoch:0,rasterProfile:profile})}
beforeEach(resetRoomStore)
it('leaves legacy schemas and tool policy alone, but does not inherit source eligibility before the original read',()=>{
 expect(canonicalToolAvailability(false,true,read,library())).toBeUndefined()
 const waiting=canonicalToolAvailability(true,true,undefined,library())
 expect(waiting?.status).toBe('restoring');expect(canonicalToolOffered(waiting,'digitalBrush')).toBe(false);expect(canonicalToolOffered(waiting,'hand')).toBe(true)
})
it('late library becomes eligible from actual Basic2/5 data; both surfaces share one honest scoped schema',()=>{
 expect(canonicalToolAvailability(true,true,read,[])?.status).toBe('empty')
 const ready=canonicalToolAvailability(true,true,read,library());expect(ready?.options).toHaveLength(2)
 expect(ready?.schema.brush.valueType).toEqual({kind:'enumOptions',options:library().map(b=>b.descriptor.id)})
 expect(ready?.schema.brush.default).toBe(ready?.options[0].id)
 expect(canonicalToolAvailability(true,true,read,[])?.schema.brush.default).toBe('')
 expect(ready?.schema.size).toBeUndefined();expect(ready?.schema.sizeFromPressure).toBeUndefined();expect(ready?.schema.opacityFromPressure).toBeUndefined()
 expect(TOOL_SCHEMAS.digitalBrush.size).toBeDefined();expect(canonicalToolOffered(ready,'fill')).toBe(false)
})
it('atomically normalizes an unsupported remembered tool, restores source size even for same ID, and retains hand',()=>{
 const ready=canonicalToolAvailability(true,true,read,library());if(!ready)throw Error('Missing availability')
 const store=useRoomStore;store.getState().normalizeCanonicalTool(ready.options)
 expect(store.getState().tool).toBe('digitalBrush');expect(store.getState().toolSettings.digitalBrush.size).toBe(ready.options[0].sizePx)
 store.getState().setToolSetting('digitalBrush','size',999);store.getState().normalizeCanonicalTool(ready.options)
 expect(store.getState().toolSettings.digitalBrush.size).toBe(ready.options[0].sizePx)
 store.getState().setTool('hand');store.getState().normalizeCanonicalTool(ready.options);expect(store.getState().tool).toBe('hand')
 store.getState().normalizeCanonicalTool([]);expect(store.getState().tool).toBe('hand')
})

it('stale original lifetime before a library revision cannot derive eligible source options',()=>{
 let current=true
 const original={authorRasterProfile:profile,assertCurrent(){if(!current)throw Error('Stale original');return{roomId:'test',boardEpoch:0,rasterProfile:profile}}}
 expect(canonicalToolAvailability(true,true,original,library())?.status).toBe('ready')
 current=false
 const updated=canonicalToolAvailability(true,true,original,[...library()])
 expect(updated?.status).toBe('restoring');expect(updated?.options).toHaveLength(0)
})

it('does not grant an unsupported brush or fall back to an older eligible version of the same ID',()=>{
 const [supported]=library()
 const behavior=supported.descriptor.behavior;if(!behavior)throw Error('Native behavior missing')
 const rejected:ImportedBrush={...supported,descriptor:{...supported.descriptor,version:supported.descriptor.version+1,behavior:{...behavior,erase:true}}}
 const result=canonicalToolAvailability(true,true,read,[supported,rejected])
 expect(result?.status).toBe('empty');expect(result?.options).toHaveLength(0)
})

function imageLibrary(){
 const cases=[['Basic6',basic6,7.5],['Mountains',mountains,360],['Graphite',graphite,16]]as const
 const assets=cases.flatMap(([,fixture])=>('asset'in fixture?[fixture.asset]:fixture.assets).map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})))
 const candidate:unknown={schemaVersion:1,brushes:cases.map(([name,fixture])=>({name,descriptor:fixture.descriptor,source:'original-native',warnings:[]})),assets,skipped:[]}
 if(!isBrushLibrary(candidate))throw Error('Invalid original image library')
 return{brushes:candidate.brushes,assets,cases}
}
it('offers actual original DATA1 Basic6 and ordered image pipes at the SAME admitted native sizes',()=>{
 const {brushes,assets}=imageLibrary(),metadata=vi.fn((_preset:string)=>assets),ready=canonicalToolAvailability(true,true,read,brushes,metadata)
 expect(ready?.status).toBe('ready');expect(ready?.options.map(o=>o.sizePx)).toEqual([7.5,360,16]);expect(metadata.mock.calls.map(c=>c[0])).toEqual(brushes.map(b=>'brush:'+b.descriptor.id+'@'+b.descriptor.version));expect(ready?.schema.size).toBeUndefined();expect(ready?.schema.sizeFromPressure).toBeUndefined();expect(TOOL_SCHEMAS.digitalBrush.size).toBeDefined()
 if(!ready)throw Error('Missing ready image eligibility');useRoomStore.getState().normalizeCanonicalTool(ready.options);expect(useRoomStore.getState().toolSettings.digitalBrush.size).toBe(7.5)
})
it('denies image options on missing or ambiguous metadata without procedural fallback',()=>{
 const {brushes,assets}=imageLibrary();expect(canonicalToolAvailability(true,true,read,brushes)?.options).toHaveLength(0)
 expect(canonicalToolAvailability(true,true,read,brushes,()=>[])?.options).toHaveLength(0)
 expect(canonicalToolAvailability(true,true,read,brushes,()=>[...assets,assets[0]])?.options).toHaveLength(0)
})
it('does not read image metadata while restoring, stale or room-disabled',()=>{
 const {brushes,assets}=imageLibrary(),metadata=vi.fn((_preset:string)=>assets),stale={...read,assertCurrent:()=>{throw Error('stale')}}
 for(const result of [canonicalToolAvailability(true,false,read,brushes,metadata),canonicalToolAvailability(true,true,stale,brushes,metadata)]){expect(result?.status).toBe('restoring');expect(result?.options).toHaveLength(0)}
 expect(canonicalToolAvailability(true,true,read,[],metadata)?.status).toBe('empty');expect(metadata).not.toHaveBeenCalled();expect(canonicalToolAvailability(false,true,read,brushes,metadata)).toBeUndefined()
})
it('never falls back to older image version when newest original descriptor is unsupported',()=>{
 const {brushes,assets}=imageLibrary(),supported=brushes[0],behavior=supported.descriptor.behavior;if(!behavior)throw Error('Missing original behavior')
 const latest:ImportedBrush={...supported,descriptor:{...supported.descriptor,version:supported.descriptor.version+1,behavior:{...behavior,erase:true}}}
 expect(canonicalToolAvailability(true,true,read,[supported,latest],()=>assets)?.options).toHaveLength(0)
})

it('keeps image pointer sensor admission strict and rejects asset-side mismatch/accessors',()=>{
 const {brushes,assets}=imageLibrary(),original=brushes[0],stamp=original.descriptor.sourceStamp;if(!stamp)throw Error('Missing original image source')
 const rejected:ImportedBrush={...original,descriptor:{...original.descriptor,sourceStamp:{...stamp,options:stamp.options.map(option=>option.id==='Rotation'?{...option,checked:true,sensors:option.sensors.map(sensor=>({...sensor,id:'tiltDirection' as const}))}:option)}}}
 expect(canonicalToolAvailability(true,true,read,[rejected],()=>assets)?.options).toHaveLength(0)
 const primary=assets.find(a=>a.id===original.descriptor.tip.mask);if(!primary)throw Error('Missing original primary')
 expect(canonicalToolAvailability(true,true,read,[original],()=>[{...primary,size:128}])?.options).toHaveLength(0)
 const invoked=vi.fn(),metadata={get id(){invoked();return primary.id},size:primary.size}
 expect(canonicalToolAvailability(true,true,read,[original],()=>[metadata])?.options).toHaveLength(0);expect(invoked).not.toHaveBeenCalled()
 expect(canonicalToolAvailability(true,true,read,[original],()=>{throw Error('metadata unavailable')})?.options).toHaveLength(0)
})

it('uses SAME normalized original author policy for textured tools; OFF/read3 compatibility and stale are not grants',()=>{
 const descriptor=structuredClone(basic6.descriptor),pattern={id:'asset:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const,size:8}
 descriptor.sourceStamp.flags.textureEnabled=true
 Object.assign(descriptor.sourceStamp.settings,{'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true','Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})
 Reflect.set(descriptor,'texture',{id:pattern.id,strength:1,periodPx:4,patternSize:{width:4,height:4},application:{mode:'subtract',soft:false},offset:{x:0,y:0,randomX:false,randomY:false}})
 const candidate:unknown={schemaVersion:1,brushes:[{descriptor,name:'Self-authored texture',source:'test',warnings:[]}],assets:[{id:basic6.asset.id,size:basic6.asset.size},pattern].map(a=>({...a,file:a.id.slice(6)+'.bin'})),skipped:[]}
 if(!isBrushLibrary(candidate))throw Error('Invalid self-authored library')
 let current=true
 const wire:RoomStateLegacyPayload={room:{id:'test',name:'Test',ownerId:'U',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'test',boardEpoch:2,allowedRasterProfiles:[G]},canonicalAuthorRasterProfile:G,canonicalAuthorPrimaryTextureSource:'pressure-identity-subtract-v3'}
 const original=prepareCanonicalRoomState(wire,{expectedBoardId:'test',isCurrent:()=>current}).canonicalRead
 const metadata=()=>candidate.assets
 expect(canonicalToolAvailability(true,true,original,candidate.brushes,metadata)?.options).toEqual([{id:descriptor.id,sizePx:7.5}])
 expect(canonicalToolAvailability(true,true,original,candidate.brushes,()=>[candidate.assets[0]])?.options).toEqual([])
 expect(canonicalToolAvailability(true,false,original,candidate.brushes,metadata)?.status).toBe('restoring')
 const {canonicalAuthorPrimaryTextureSource:_,...offWire}=wire
 const off=prepareCanonicalRoomState(offWire,{expectedBoardId:'test',isCurrent:()=>true}).canonicalRead
 expect(canonicalToolAvailability(true,true,off,candidate.brushes,metadata)?.options).toEqual([])
 current=false;expect(canonicalToolAvailability(true,true,original,candidate.brushes,metadata)?.status).toBe('restoring')
})


it('offers genuine37 only from current original author5; old4 alone/read5 snapshot cannot grant it',()=>{
 const f=pressureTextureFixture(),candidate:unknown={schemaVersion:1,brushes:[{descriptor:f.descriptor,name:'Genuine metadata37',source:'fixture',warnings:[]}],assets:[{id:f.snapshot.assets[0].id,size:256,file:f.snapshot.assets[0].id.slice(6)+'.bin'}],skipped:[]};if(!isBrushLibrary(candidate))throw Error('Actual normal fixture schema');let current=true
 const wire:RoomStateLegacyPayload={room:{id:'test',name:'Test',ownerId:'U',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'test',boardEpoch:2,allowedRasterProfiles:[G]},canonicalAuthorRasterProfile:G,canonicalAuthorTexturedSource:'fixed-default-auto-texture-v4'}
 const off=prepareCanonicalRoomState(wire,{expectedBoardId:'test',isCurrent:()=>true}).canonicalRead;expect(canonicalToolAvailability(true,true,off,candidate.brushes,()=>candidate.assets)?.options).toEqual([])
 const on=prepareCanonicalRoomState({...wire,canonicalAuthorPressureTexturedSource:'pressure-default-auto-texture-v5'},{expectedBoardId:'test',isCurrent:()=>current}).canonicalRead;const available=canonicalToolAvailability(true,true,on,candidate.brushes,()=>candidate.assets);expect(available?.options.map(o=>o.id)).toEqual([f.descriptor.id]);expect(available!.options[0].sizePx).toBeGreaterThan(0);expect(canonicalToolAvailability(true,true,on,candidate.brushes,()=>[])?.options).toEqual([]);current=false;expect(canonicalToolAvailability(true,true,on,candidate.brushes,()=>candidate.assets)?.status).toBe('restoring')
})

it('offers genuine Soft native-default only from current original author6; old4 alone/read5 snapshot cannot grant it',()=>{
 const descriptor=softNativeMetadata.descriptor,pattern=softNativeMetadata.patternAsset,lookup=descriptor.tip.profile.lookup,candidate:unknown={schemaVersion:1,brushes:[{descriptor,name:'Genuine native-default metadata31',source:'fixture',warnings:[]}],assets:[{id:pattern.id,size:pattern.size,file:pattern.id.slice(6)+'.bin'},{id:lookup,size:32,file:lookup.slice(6)+'.bin'}],skipped:[]};if(!isBrushLibrary(candidate))throw Error('Actual normal fixture schema');let current=true
 const wire:RoomStateLegacyPayload={room:{id:'test',name:'Test',ownerId:'U',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'L',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'test',boardEpoch:2,allowedRasterProfiles:[G]},canonicalAuthorRasterProfile:G,canonicalAuthorTexturedSource:'fixed-default-auto-texture-v4'}
 const off=prepareCanonicalRoomState(wire,{expectedBoardId:'test',isCurrent:()=>true}).canonicalRead;expect(canonicalToolAvailability(true,true,off,candidate.brushes,()=>candidate.assets)?.options).toEqual([])
 const on=prepareCanonicalRoomState({...wire,canonicalAuthorSoftPressureTexturedSource:'pressure-soft-auto-texture-v6'},{expectedBoardId:'test',isCurrent:()=>current}).canonicalRead;const available=canonicalToolAvailability(true,true,on,candidate.brushes,()=>candidate.assets);expect(available?.options.map(o=>o.id)).toEqual([descriptor.id]);expect(available!.options[0].sizePx).toBeGreaterThan(0);expect(canonicalToolAvailability(true,true,on,candidate.brushes,()=>[])?.options).toEqual([]);current=false;expect(canonicalToolAvailability(true,true,on,candidate.brushes,()=>candidate.assets)?.status).toBe('restoring')
})


it('offers genuine generic textured Auto7 only from current original7 permission independently of5/6',()=>{
 const descriptor=texturedAutoMetadata.descriptor,pattern=texturedAutoMetadata.patternAsset
 const candidate:unknown={schemaVersion:1,brushes:[{descriptor,name:'Genuine Reptile37 metadata',source:'fixture',warnings:[]}],assets:[{id:pattern.id,size:pattern.size,file:pattern.id.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(candidate))throw Error('Actual genuine metadata schema')
 let current=true
 const original={authorRasterProfile:G,authorTexturedAutoSource:'textured-auto-material-v7' as const,assertCurrent(){if(!current)throw Error('Stale');return{roomId:'room',boardEpoch:2,allowedRasterProfiles:[G]}}}
 const metadata=()=>candidate.assets
 expect(canonicalToolAvailability(true,true,{...original,authorTexturedAutoSource:undefined},candidate.brushes,metadata)?.options).toHaveLength(0)
 expect(canonicalToolAvailability(true,true,original,candidate.brushes,metadata)?.options.map(v=>v.id)).toEqual([descriptor.id])
 current=false
 expect(canonicalToolAvailability(true,true,original,candidate.brushes,metadata)?.status).toBe('restoring')
})
