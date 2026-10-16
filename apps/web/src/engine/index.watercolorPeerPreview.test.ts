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
it('replaying a recorded operation does not acknowledge its presentation prefix a second time',async()=>{
 const engine=await setup()
 try{
  engine['_paintDabs']=vi.fn(()=>undefined)
  const op=makeStroke('peer','L',packet.dabs,{tool:'watercolor',preset,strokeId:'held',washId:'m70:L'})
  engine.appendOperation(op)
  const committed=()=>[...engine['_watercolorLivePreview']!.visible()][0].committed
  expect(committed()).toBe(1)
  engine['_applyPixelOp'](engine['_layers'].get('L')!,'L',op)
  expect(committed()).toBe(1)
 }finally{engine.destroy()}
})
it('peer leave requests a real display even when its only ink was a temporary film',async()=>{
 const engine=await setup()
 try{
  engine.appendPeerLiveDabs('peer',packet)
  const display=vi.spyOn(engine as unknown as {_scheduleDisplay():void},'_scheduleDisplay')
  engine.endPeerLiveStroke('peer')
  expect(display).toHaveBeenCalled()
 }finally{engine.destroy()}
})
it('remote film cannot be clipped to an unrelated local damage rectangle',async()=>{
 const engine=await setup()
 try{
  engine['_takePaperPartial']()
  engine['_markPaperDamage']({minX:0,minY:0,maxX:2,maxY:2})
  engine.appendPeerLiveDabs('peer',packet)
  expect(engine['_takePaperPartial']()).toBeNull()
  engine.endPeerLiveStroke('peer')
  // Another local event in the same frame cannot erase the owed full redraw.
  engine['_markPaperDamage']({minX:0,minY:0,maxX:2,maxY:2})
  expect(engine['_takePaperPartial']()).toBeNull()
 }finally{engine.destroy()}
})

it('keeps an unrecorded peer film and its committed cursor through a viewport resize',async()=>{
 const engine=await setup()
 try{
  engine['_layers'].get('L')!.resolveForPaint({minX:0,minY:0,maxX:32,maxY:32})
  engine.appendPeerLiveDabs('peer',{...packet,dabs:[dab(8,16),dab(16,16),dab(24,16)]})
  engine['_watercolorLivePreview']!.confirm('peer','held','L',1)
  const before=readLayerPixels(engine,'L')!.slice()
  engine.resizeCanvas(80,48)
  const states=[...engine['_watercolorLivePreview']!.visible()]
  expect(states).toHaveLength(1)
  expect(states[0].dabs.map(d=>d.x)).toEqual([16,24])
  expect(states[0].received).toBe(3)
  expect(states[0].committed).toBe(1)
  expect(states[0].buf?.width).toBe(80)
  expect(states[0].buf?.height).toBe(48)
  expect(readLayerPixels(engine,'L')).toEqual(before)
  engine['_watercolorLivePreview']!.confirm('peer','held','L',2)
  expect(engine['_watercolorLivePreview']!.tiles().size).toBe(0)
 }finally{engine.destroy()}
})
