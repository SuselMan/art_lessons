import {afterEach,expect,it,vi} from 'vitest'
import type {PuddleRoomHost} from './src/watercolor/puddle/PuddleRoomController'
import type {CheckpointStore} from './src/oplog/checkpointStore'
import {createTestEngine,makeLayerAdd,fillStroke} from './testing/engineTestUtils'
const captured=vi.hoisted(()=>({host:undefined as PuddleRoomHost|undefined}))
vi.mock('./src/watercolor/puddle/PuddleRoomController',()=>({PuddleRoomController:class{
  constructor(host:PuddleRoomHost){captured.host=host}
  has(){return false}
  presentAll(){}
}}))
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()})

it('takes a dry checkpoint on release, but never from an open epoch or a rebuild in flight',()=>{
  const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
  engine.appendOperation(makeLayerAdd('A','L'),'remote')
  engine.appendOperation(fillStroke('A','L',8,8,4),'remote')
  engine.appendOperation({id:'wet',type:'stroke',userId:'B',layerId:'L',timestamp:1,strokeId:'wet',washId:'m70:L',
    tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[]},'remote')
  const state=engine as unknown as {_puddleFor():unknown;_puddle:unknown;_layers:Map<string,unknown>;_rebuildJobs:Map<string,unknown>;_checkpoints:CheckpointStore}
  state._puddleFor()
  vi.useFakeTimers()
  const release=()=>captured.host!.released({finishContext:{target:state._layers.get('L')}} as Parameters<PuddleRoomHost['released']>[0])
  try{
    release();vi.advanceTimersByTime(0)
    expect(state._checkpoints.all()).toHaveLength(0)
    // Append Dry without the controller double handling its material.
    state._puddle=null
    engine.appendOperation({id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:2},'remote')
    state._rebuildJobs.set('L',{})
    release();vi.advanceTimersByTime(0)
    expect(state._checkpoints.all()).toHaveLength(0)
    state._rebuildJobs.clear()
    release();vi.advanceTimersByTime(0)
    expect(state._checkpoints.all()).toHaveLength(1)
    expect(state._checkpoints.all()[0].canonicalValid?.()).toBe(true)
  }finally{state._rebuildJobs.clear();state._puddle=null}
})
