import {expect,it,vi} from 'vitest'
import {CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as browser,type ServerToClientEvents} from '@grafetto/shared'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {PencilEngine} from './index'

it('rejects an original empty browser-profile read before canvas access while its renderer is unavailable',()=>{
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2,allowedRasterProfiles:[browser]},canonicalAuthorRasterProfile:browser,canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 const p=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true})
 expect(p.canonicalRead.authorRasterProfile).toBe(browser)
 expect(p.canonicalRead.assertCurrent()).toBe(p.canonicalRead.scope)
 expect(p.canonicalRead.assertEmptyHistoryBase(p.tailOperations).throughSeq).toBe(0)
 const get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Canonical runtime raster profile unavailable')
 expect(get).not.toHaveBeenCalled()
})
