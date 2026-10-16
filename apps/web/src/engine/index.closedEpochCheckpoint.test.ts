import {expect,it,vi} from 'vitest'
import type {Operation} from '@grafetto/shared'
import {createTestEngine,fillStroke,makeLayerAdd,readLayerPixels,takeCheckpointNow} from './testing/engineTestUtils'
import type {CheckpointStore} from './src/oplog/checkpointStore'

it('undo after a proved dry checkpoint skips the old paint without changing pixels',()=>{
  const {engine}=createTestEngine({userId:'A'},{width:32,height:32})
  engine.appendOperation(makeLayerAdd('A','L'),'remote')
  engine.appendOperation(fillStroke('A','L',8,8,4),'remote')
  // Empty M70 operation exercises its recorded epoch policy. MockGL cannot
  // rasterize fluid; actual pigment is pencil so pixel equality is meaningful.
  const wet:Operation={id:'wet',type:'stroke',userId:'B',layerId:'L',timestamp:1,strokeId:'wet',washId:'m70:L',
    tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],dabs:[]}
  engine.appendOperation(wet,'remote')
  engine.appendOperation({id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:2},'remote')
  const expected=readLayerPixels(engine,'L')!
  expect(expected.some(value=>value!==0)).toBe(true)
  takeCheckpointNow(engine,'L')
  const internal=engine as unknown as {_checkpoints:CheckpointStore;_applyPixelOp(...args:unknown[]):void}
  const checkpoint=internal._checkpoints.all().find(cp=>cp.canonicalValid)
  expect(checkpoint).toBeDefined()
  engine.appendOperation(fillStroke('A','L',24,24,4),'remote')
  const replay=vi.spyOn(internal,'_applyPixelOp')
  expect(engine.undo()).not.toBeNull()
  expect(readLayerPixels(engine,'L')).toEqual(expected)
  expect(internal._checkpoints.all()).toContain(checkpoint)
  expect(replay).not.toHaveBeenCalled()
})
