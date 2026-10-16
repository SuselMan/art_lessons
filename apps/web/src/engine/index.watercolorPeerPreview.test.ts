import { expect, it, vi } from 'vitest'
import type { PeerLivePacket } from './index'
import { createTestEngine, dab, makeLayerAdd, makeStroke, readLayerPixels } from './testing/engineTestUtils'

const preset='normal:100:50:PB29:round:wc@m70-r2-v1'
const packet: PeerLivePacket={strokeId:'held',layerId:'L',tool:'watercolor',preset,color:[0,0,1],packetSeq:0,dabs:[dab(16,16,{size:12})]}
async function setup(){
 const {engine}=createTestEngine({watercolorModel:'m70-r2-v1'},{width:32,height:32})
 await engine.paperReady();engine.appendOperation(makeLayerAdd('me','L'));engine.setActiveLayer('L')
 return engine
}
it('remote watercolor has a live film before UP without writing canonical pigment or claiming recorded dabs',async()=>{
 const engine=await setup()
 try{
  const before=readLayerPixels(engine,'L')!.slice(),ops=engine.getOperations().length
  engine.appendPeerLiveDabs('peer',packet)
  expect(engine['_watercolorLivePreview']!.tiles().get('L')).toHaveLength(1)
  expect(engine['_peerLiveStrokes'].values().next().value!.paintedTotal).toBe(0)
  expect(readLayerPixels(engine,'L')).toEqual(before)
  expect(engine.getOperations()).toHaveLength(ops)
  engine.endPeerLiveStroke('peer','held')
  expect(engine['_watercolorLivePreview']!.tiles().get('L')).toHaveLength(1)
  engine['_paintDabs']=vi.fn(()=>undefined)
  engine.appendOperation(makeStroke('peer','L',packet.dabs,{tool:'watercolor',preset,strokeId:'held',washId:'m70:L'}))
  expect(engine['_watercolorLivePreview']!.tiles().size).toBe(0)
  expect(vi.mocked(engine['_paintDabs']).mock.calls[0][1]).toEqual(packet.dabs)
 }finally{engine.destroy()}
})
it('cancellation and disconnect clear a live film without leaving orphan material',async()=>{
 const engine=await setup()
 try{
  engine.appendPeerLiveDabs('peer',packet)
  expect(engine.endPeerLiveStroke('peer','held',true)).toBe(0)
  expect(engine['_watercolorLivePreview']!.tiles().size).toBe(0)
  engine.appendPeerLiveDabs('peer',{...packet,strokeId:'next'})
  expect(engine.endPeerLiveStroke('peer')).toBe(0)
  expect(engine['_watercolorLivePreview']!.tiles().size).toBe(0)
  engine.appendPeerLiveDabs('peer',{...packet,strokeId:'third'})
  engine.resetPeerLiveStrokes()
  expect(engine['_watercolorLivePreview']!.tiles().size).toBe(0)
 }finally{engine.destroy()}
})
it('gapped live packets stop extending the decorative film, while the operation still arrives whole',async()=>{
 const engine=await setup()
 try{
  engine.appendPeerLiveDabs('peer',packet)
  engine.appendPeerLiveDabs('peer',{...packet,packetSeq:2,dabs:[dab(24,24)]})
  expect([...engine['_watercolorLivePreview']!.visible()][0].dabs).toHaveLength(1)
  engine['_paintDabs']=vi.fn(()=>undefined)
  engine.appendOperation(makeStroke('peer','L',packet.dabs,{tool:'watercolor',preset,strokeId:'held',washId:'m70:L'}))
  expect(engine['_watercolorLivePreview']!.tiles().size).toBe(0)
  expect(vi.mocked(engine['_paintDabs']).mock.calls[0][1]).toEqual(packet.dabs)
 }finally{engine.destroy()}
})
