import { expect, it, vi } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { createTestEngine, dab, makeLayerAdd, makeStroke, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'
import { OperationLog } from './src/oplog/OperationLog'

// MockGL cannot validate watercolor pixels. These integration regressions
// check history and snapshot eligibility, which must not depend on a GPU.
it('layer dry and its undo/redo leave another participant layer wet', async () => {
  const {engine} = createTestEngine({userId: 'A'})
  const internal = engine as unknown as {_log: OperationLog; _snapshotQuiet(id: string): boolean}
  const now = Date.now()
  try {
    engine.appendOperation(makeLayerAdd('A', 'L'), 'remote')
    engine.appendOperation(makeLayerAdd('A', 'B'), 'remote')
    for (const layerId of ['L', 'B']) internal._log.append(makeStroke('B', layerId, [], {
      id: 'water-' + layerId, tool: 'watercolor', preset: 'normal:100:0', timestamp: now,
    }))
    const dry: Operation = {id: 'dry-L', type: 'paper_dry', layerId: 'L', userId: 'A', timestamp: now}
    engine.appendOperation(dry, 'remote')
    expect(internal._snapshotQuiet('L')).toBe(true)
    expect(internal._snapshotQuiet('B')).toBe(false)
    engine.appendOperation({id: 'undo-dry', type: 'operation_undo', targetOpId: dry.id, userId: 'A', timestamp: now}, 'remote')
    expect(internal._snapshotQuiet('L')).toBe(false)
    expect(internal._snapshotQuiet('B')).toBe(false)
    engine.appendOperation({id: 'redo-dry', type: 'operation_redo', targetOpId: dry.id, userId: 'A', timestamp: now}, 'remote')
    await vi.waitFor(() => expect(internal._snapshotQuiet('L')).toBe(true))
    expect(internal._snapshotQuiet('B')).toBe(false)
  } finally {engine.destroy()}
})

it('dry is a selectable own undo action even after a later foreign mark', () => {
  const {engine} = createTestEngine({userId: 'A'})
  const internal = engine as unknown as {_log: OperationLog}
  try {
    engine.appendOperation(makeLayerAdd('A', 'L'), 'remote')
    const dry: Operation = {id: 'dry-L', type: 'paper_dry', layerId: 'L', userId: 'A', timestamp: 1000}
    engine.appendOperation(dry, 'remote')
    engine.appendOperation(makeStroke('B', 'L', [], {id: 'foreign', timestamp: 2000}), 'remote')
    expect(engine.undo()?.id).toBe(dry.id)
    expect(internal._log.entries.find(e => e.op.id === 'foreign')?.state).toBe('done')
    expect(engine.redo()?.id).toBe(dry.id)
  } finally {engine.destroy()}
})

const m70Preset = 'normal:100:100:PB29:round:wc@m70-r2-v1'
async function localWatercolor() {
  const {engine} = createTestEngine({userId: 'A', watercolorModel: 'm70-r2-v1'}, {width: 64, height: 64})
  await engine.paperReady()
  // MockGL does not rasterize or model channel masks; presentation sets all
  // channels writable, so a no-op is sufficient for lifecycle assertions.
  Object.defineProperty(engine['gl'], 'colorMask', {value: vi.fn(), configurable: true})
  engine.appendOperation(makeLayerAdd('A','L','L',{seq:1}), 'remote')
  engine.appendOperation(makeLayerAdd('A','other','other',{seq:2}), 'remote')
  engine.setActiveLayer('L')
  engine.setCompositeOrder([{id:'L',opacity:1},{id:'other',opacity:1}])
  engine.setTool('watercolor'); engine.setPencil(m70Preset); engine.setSize(6)
  return engine
}

it('rebuilds the active layer only after pen-up when dry splits one physical gesture', async () => {
  const engine = await localWatercolor()
  const rebuild = vi.spyOn(engine as unknown as {_rebuildLayerOrDefer(id: string): void}, '_rebuildLayerOrDefer').mockImplementation(() => {})
  try {
    simulateStrokeStart(engine,8,24)
    simulateStrokeMove(engine,20,24); simulateStrokeMove(engine,28,24)
    engine['_flushStrokeChunk']()
    const prefix=engine.getOperations().filter(op=>op.type==='stroke').at(-1)!
    engine.confirmOperation(prefix.id,3)
    const dry: Operation={seq:4,id:'mid-dry',type:'paper_dry',layerId:'L',userId:'B',timestamp:Date.now()}
    engine.appendOperation(dry,'remote')
    expect(rebuild).not.toHaveBeenCalled()
    simulateStrokeMove(engine,36,24); simulateStrokeMove(engine,44,24)
    expect(rebuild).not.toHaveBeenCalled()
    simulateStrokeEnd(engine,48,24)
    expect(rebuild).toHaveBeenCalledExactlyOnceWith('L')
    const ops=engine.getOperations(), boundary=ops.findIndex(op=>op.id===dry.id)
    const before=ops.findIndex(op=>op.id===prefix.id)
    const remainder=ops.find((op,i)=>i>boundary&&op.type==='stroke')
    expect(before).toBeLessThan(boundary)
    expect(remainder?.type).toBe('stroke')
    if(prefix.type==='stroke'&&remainder?.type==='stroke')expect(remainder.strokeId).toBe(prefix.strokeId)
  } finally {rebuild.mockRestore();engine.destroy()}
})

it('dry on another layer during the local gesture does not rebuild the active layer', async () => {
  const engine=await localWatercolor()
  const rebuild=vi.spyOn(engine as unknown as {_rebuildLayerOrDefer(id: string): void}, '_rebuildLayerOrDefer').mockImplementation(()=>{})
  try {
    simulateStrokeStart(engine,8,24)
    simulateStrokeMove(engine,24,24); simulateStrokeMove(engine,32,24)
    engine['_flushStrokeChunk']()
    engine.appendOperation({id:'other-dry',type:'paper_dry',layerId:'other',userId:'B',timestamp:Date.now()},'remote')
    simulateStrokeMove(engine,40,24);simulateStrokeEnd(engine,48,24)
    expect(rebuild).not.toHaveBeenCalled()
  }finally{rebuild.mockRestore();engine.destroy()}
})

it('sliced replay passes the current chunk timestamp and preceding dry identity to the puddle source', async () => {
  const engine=await localWatercolor()
  try {
    const prefix=makeStroke('A','L',[dab(8,24)],{id:'first',tool:'watercolor',preset:m70Preset,strokeId:'gesture',timestamp:1000})
    const dry: Operation={id:'dry-between',type:'paper_dry',layerId:'L',userId:'B',timestamp:1500}
    const current=makeStroke('A','L',[dab(32,24)],{id:'second',tool:'watercolor',preset:m70Preset,strokeId:'gesture',timestamp:2000})
    for(const op of [prefix,dry,current])engine['_log'].append(op)
    const puddle=engine['_puddleFor']()
    const stop=new Error('source arguments captured')
    const source=vi.spyOn(puddle,'source').mockImplementation(()=>{throw stop})
    const target=engine['_layers'].get('L')!
    const work=engine['_ribbonDabsWork'](target,[dab(32,24)],'watercolor',m70Preset,[0,0,1],undefined,undefined,'gesture',undefined,undefined,undefined,false,6,current)
    expect(()=>work.next()).toThrow(stop)
    expect(source).toHaveBeenCalledWith(target,'gesture',expect.anything(),2000,'dry-between',{pin:true,beforeRecordedOpId:'second'})
    source.mockRestore()
  }finally{engine.destroy()}
})
