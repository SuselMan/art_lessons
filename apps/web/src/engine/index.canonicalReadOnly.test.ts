import {afterEach,expect,it,vi} from 'vitest'
import {INITIAL_LAYER_ID,IMPLICIT_LAYER_IDS,STRAIGHT_ROOM_RASTER_VERSION,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine,dab,makeStroke,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd,simulatePredictedSamples} from './testing/engineTestUtils'
import {rectangleSelection} from './src/raster/selectionMask'

afterEach(()=>vi.restoreAllMocks())
async function fixture(){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:STRAIGHT_ROOM_RASTER_VERSION},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:0,operationCount:0}}
 const prepared=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true}),local=vi.fn(),preview=vi.fn()
 const {engine}=createTestEngine({userId:'reader',paper:'flat',pageWidth:8,pageHeight:8,rasterVersion:STRAIGHT_ROOM_RASTER_VERSION,canonicalEmptyRoom:{read:prepared.canonicalRead,tail:prepared.tailOperations},predictPointer:true,onLocalOperation:local,onPreviewApplied:preview})
 await engine.paperReady()
 for(const id of IMPLICIT_LAYER_IDS)engine.initLayer(id)
 engine.setActiveLayer(INITIAL_LAYER_ID)
 const gl=engine['gl'],draw=vi.spyOn(gl,'drawArrays'),textures=vi.spyOn(gl,'createTexture'),revision=engine['_log'].revision,enqueue=vi.spyOn(engine['_authorInput'],'enqueue')
 const stroke=makeStroke('peer',INITIAL_LAYER_ID,[dab(3,3)])
 const unchanged=()=>{
  expect(engine['_log'].revision).toBe(revision);expect(engine.getOperations()).toEqual([])
  expect(draw).not.toHaveBeenCalled();expect(textures).not.toHaveBeenCalled();expect(local).not.toHaveBeenCalled();expect(preview).not.toHaveBeenCalled()
  expect(enqueue).not.toHaveBeenCalled();expect(engine['_authorInput'].pending).toBe(false);expect(engine['_opQueue']).toHaveLength(0)
  expect(engine['_peerLiveStrokes'].size).toBe(0);expect(engine['_peerPreviews'].size).toBe(0)
 }
 const resetObservations=()=>{draw.mockClear();textures.mockClear();local.mockClear();preview.mockClear();enqueue.mockClear()}
 return{engine,stroke,unchanged,preview,resetObservations}
}
it('permits implicit initial layers only before any arbitrary allocation',async()=>{
 const f=await fixture()
 try{expect(()=>f.engine.initLayer('arbitrary')).toThrow();expect(f.engine.liveLayerIds().sort()).toEqual([...IMPLICIT_LAYER_IDS].sort());f.unchanged()}finally{f.engine.destroy()}
})
it('setLocked(false) never admits ready pointer writing',async()=>{
 const f=await fixture()
 try{
  await f.engine.paperReady();f.resetObservations()
  f.engine.setLocked(false)
  simulateStrokeStart(f.engine,2,2);simulateStrokeMove(f.engine,4,4);simulatePredictedSamples(f.engine,[{x:5,y:5}]);simulateStrokeEnd(f.engine,4,4)
  f.unchanged()
 }finally{f.engine.destroy()}
})
it('rejects direct ordinary journal writers before their log or wet-state effects',async()=>{
 const f=await fixture(),wet=vi.spyOn(f.engine['_paperWet'],'forgetLayer')
 try{
  for(const action of [()=>f.engine.appendOperation(f.stroke),()=>f.engine.undo(),()=>f.engine.redo(),()=>f.engine.clear(),()=>f.engine.confirmOperation('missing',1),()=>f.engine.discardOperation('missing'),()=>f.engine.setBaseLayers(IMPLICIT_LAYER_IDS),()=>f.engine.watercolorDryWash(),()=>f.engine.watercolorDryAll()])expect(action).toThrow()
  expect(wet).not.toHaveBeenCalled();f.unchanged()
 }finally{f.engine.destroy()}
})
it('rejects peer live bypass and lost-context preview callback before allocations or callbacks',async()=>{
 const f=await fixture()
 try{
  const packet={strokeId:'s',layerId:INITIAL_LAYER_ID,tool:f.stroke.tool,preset:f.stroke.preset,color:f.stroke.color,packetSeq:0,dabs:[dab(3,3)]}
  expect(()=>f.engine.appendPeerLiveDabs('peer',packet,true)).toThrow()
  vi.spyOn(f.engine['gl'],'isContextLost').mockReturnValue(true)
  expect(()=>f.engine.previewOperation(f.stroke)).toThrow();f.unchanged()
 }finally{vi.restoreAllMocks();f.engine.destroy()}
})
it('rejects valid area, shape, filter previews before delegates run',async()=>{
 const f=await fixture(),area=vi.spyOn(f.engine['_area'],'previewAreaTransform'),paste=vi.spyOn(f.engine['_area'],'previewAreaPaste'),transform=vi.spyOn(f.engine['_area'],'previewLayerTransform'),shape=vi.spyOn(f.engine['_shapes'],'preview'),filter=vi.spyOn(f.engine['_filters'],'preview')
 const matrix:[number,number,number,number,number,number]=[1,0,0,1,0,0]
 try{
  for(const action of [()=>f.engine.clearLayerTransformPreview(),()=>f.engine.previewLayerTransform([{layerId:INITIAL_LAYER_ID,matrix}]),()=>f.engine.previewAreaTransform(INITIAL_LAYER_ID,rectangleSelection(0,0,4,4),matrix),()=>f.engine.previewAreaPaste(INITIAL_LAYER_ID,'data:image/png;base64,AA==',{x:0,y:0,width:4,height:4},matrix),()=>f.engine.previewShape(INITIAL_LAYER_ID,{kind:'rectangle',cornerRadius:0},{x:0,y:0,width:4,height:4,angle:0},null,{color:[0,0,0]}),()=>f.engine.previewLayerFilter(INITIAL_LAYER_ID,null)])expect(action).toThrow()
  for(const delegate of [area,paste,transform,shape,filter])expect(delegate).not.toHaveBeenCalled();f.unchanged()
 }finally{f.engine.destroy()}
})
it('rejects snapshots and history before installation or merge and never bakes unsupported snapshots',async()=>{
 const f=await fixture(),restore=vi.spyOn(f.engine['_snapshotIO'],'restore'),absorb=vi.spyOn(f.engine['_snapshotIO'],'absorbHistorical'),bake=vi.spyOn(f.engine['_snapshotIO'],'bake'),fullBake=vi.spyOn(f.engine['_snapshotIO'],'bakeByFullReplay')
 try{
  expect(()=>f.engine.restoreLayerFromSnapshot(INITIAL_LAYER_ID,[],0,'straight-rgba8')).toThrow()
  expect(()=>f.engine.absorbHistoricalOperations([f.stroke])).toThrow()
  await expect(f.engine.restoreHistoricalOperations([f.stroke])).rejects.toThrow()
  expect(f.engine.bakeNetworkSnapshot(INITIAL_LAYER_ID)).toBeNull();expect(f.engine.bakeLayerByFullReplay(INITIAL_LAYER_ID)).toBeNull()
  expect(restore).not.toHaveBeenCalled();expect(absorb).not.toHaveBeenCalled();expect(bake).not.toHaveBeenCalled();expect(fullBake).not.toHaveBeenCalled();f.unchanged()
 }finally{f.engine.destroy()}
})
it('keeps empty peer cleanup inert without invoking legacy pixel delegates',async()=>{
 const f=await fixture(),finish=vi.spyOn(f.engine['_smudge'],'finishSecondary')
 try{
  for(const action of [()=>f.engine.dropPendingPreview('missing'),()=>f.engine.flushPeerPreview('peer'),()=>f.engine.endPeerLiveStroke('peer','s'),()=>f.engine.resetPeerLiveStrokes()]){try{action()}catch(error){expect(error).toBeInstanceOf(Error)}}
  expect(finish).not.toHaveBeenCalled();f.unchanged()
 }finally{f.engine.destroy()}
})

it('the identical ready pointer harness really writes and emits on an ordinary PM engine',async()=>{
 const local=vi.fn(),{engine}=createTestEngine({userId:'reader',paper:'flat',pageWidth:8,pageHeight:8,onLocalOperation:local})
 engine.initLayer(INITIAL_LAYER_ID);engine.setActiveLayer(INITIAL_LAYER_ID)
 try{
  await engine.paperReady();engine.setLocked(false)
  const draw=vi.spyOn(engine['gl'],'drawArrays')
  simulateStrokeStart(engine,2,2);simulateStrokeMove(engine,4,4);simulatePredictedSamples(engine,[{x:5,y:5}]);simulateStrokeEnd(engine,4,4)
  expect(draw).toHaveBeenCalled();expect(local).toHaveBeenCalledTimes(1)
  expect(engine.getOperations()).toHaveLength(1);expect(engine.getOperations()[0].type).toBe('stroke')
 }finally{engine.destroy()}
})
