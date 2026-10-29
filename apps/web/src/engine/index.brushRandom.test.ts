import { installBrushLibrary } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { expect, it, vi } from 'vitest'
import { createBrushRandomStrokeId, type StrokeOperation, type BrushRandomSeeds, type BrushDescriptor } from '@grafetto/shared'
import { brushDraws, createTestEngine, dab, makeLayerAdd, makeStroke, paperReady, pointerSample } from './testing/engineTestUtils'
import { assertBrushRandomContext, brushRandomMetadata, createBrushRandomContext } from './src/oplog/brushRandomContext'

const seeds: BrushRandomSeeds = { version: 1, sequentialSeed: 0, strokeSeed: 0xffffffff }
it('generates exactly two crypto words only for digital brush and isolates every emitted copy', () => {
 const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => { (array as Uint32Array).set([0, 0xffffffff]); return array })
 try {
  expect(createBrushRandomContext('pencil')).toBeUndefined()
  const context = createBrushRandomContext('digitalBrush')!
  const first = brushRandomMetadata(context); Object.assign(first.brushRandom!, { sequentialSeed: 20 })
  expect(brushRandomMetadata(context).brushRandom).toEqual(seeds)
  expect(random).toHaveBeenCalledTimes(1)
 } finally { random.mockRestore() }
})
it('accepts legacy missing metadata and binds each canonical identity to exactly its pair', () => {
 const packet={tool:'digitalBrush' as const,strokeId:createBrushRandomStrokeId('nonce00000',seeds),brushRandom:seeds}
 expect(()=>assertBrushRandomContext({tool:'digitalBrush',strokeId:'legacy'})).not.toThrow()
 expect(()=>assertBrushRandomContext(packet)).not.toThrow()
 expect(()=>assertBrushRandomContext({...packet,brushRandom:undefined})).toThrow()
 expect(()=>assertBrushRandomContext({...packet,brushRandom:{...seeds,strokeSeed:1}})).toThrow()
 expect(()=>assertBrushRandomContext({...packet,strokeId:'legacy'})).toThrow()
})
it('retains one author pair across live, flush, metadata-only endpoint and fresh gestures', async () => {
 const packets: BrushRandomSeeds[] = [], operations: StrokeOperation[] = []
 const nativeRandom = crypto.getRandomValues.bind(crypto); let seedCalls = 0
 const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
  if (array instanceof Uint32Array && array.length === 2) { array.set(seedCalls++ === 0 ? [0,0xffffffff] : [1,2]); return array }
  return nativeRandom(array)
 })
 const { engine } = createTestEngine({ userId: 'owner', onLiveStrokeDabs: p => { packets.push({ ...p.brushRandom! }); if(p.brushRandom) Object.assign(p.brushRandom, { sequentialSeed: 17 }) }, onLocalOperation: op => { if(op.type === 'stroke') operations.push(op) } }, { width:32, height:32 })
 try {
  const child: BrushDescriptor = { ...digitalBrushFromPreset('hard-round'), behavior: { version: 2, spacing: { mode: 'diameter', coefficient: 1 } } }
  const descriptor: BrushDescriptor = { ...child, id: `imported-${'d'.repeat(24)}`, version: 40, behavior: { version: 2 as const, spacing: { mode: 'diameter' as const, coefficient: 1 }, dual: { brush: child, blendMode: 'multiply', sampling: 'independent' } } }
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Random metadata', source: 'qa', warnings: [], descriptor }], assets: [], skipped: [] })
  await paperReady(engine); engine.initLayer('ink'); engine.setActiveLayer('ink'); engine.setTool('digitalBrush'); engine.setPencil(`brush:${descriptor.id}@40`); engine.setSize(1)
  engine['_onStart'](pointerSample(8,16,{ pressure:1, timeStamp:0 }))
  const original = { ...engine['_strokeBrushRandom']! }
  engine['_flushStrokeChunk']()
  Object.assign(operations[0].brushRandom!, { strokeSeed: operations[0].brushRandom!.strokeSeed ^ 1 })
  engine['_onEnd'](pointerSample(8,16,{ pressure:0, timeStamp:20 }))
  expect(operations).toHaveLength(2); expect(operations[1].dabsPacked).toBeDefined()
  expect(operations[1].brushRandom).toEqual(original); expect(packets.length).toBeGreaterThan(0)
  expect(packets.every(p => p.sequentialSeed === original.sequentialSeed && p.strokeSeed === original.strokeSeed)).toBe(true)
  expect(engine['_strokeBrushRandom']).toBeUndefined()
  engine['_onStart'](pointerSample(12,16,{ pressure:1,timeStamp:30 }))
  expect(engine['_strokeBrushRandom']).not.toBeUndefined()
  expect(engine['_strokeBrushRandom']).toEqual({version:1,sequentialSeed:1,strokeSeed:2})
  engine['_onEnd'](pointerSample(12,16,{ pressure:0,timeStamp:40 }))
  expect(seedCalls).toBe(2)
 } finally { engine.destroy(); random.mockRestore() }
})
it('metadata survives remote/history JSON without switching raster policy, rejects changed chunks before painting', () => {
 const a=createTestEngine({userId:'observer'}), b=createTestEngine({userId:'observer'})
 try {
  for(const {engine} of [a,b]) engine.appendOperation(makeLayerAdd('peer','ink'))
  const base=makeStroke('peer','ink',[dab(8,8)],{tool:'digitalBrush',preset:'hard-round',strokeId:createBrushRandomStrokeId('nonce00000',seeds)})
  a.engine.appendOperation({...base,strokeId:'legacy'},'remote')
  b.engine.appendOperation(JSON.parse(JSON.stringify({...base,brushRandom:seeds})),'remote')
  expect(brushDraws(b.engine)).toEqual(brushDraws(a.engine))
  expect(b.engine.getOperations().find(op=>op.id===base.id)).toMatchObject({brushRandom:seeds})
  const before=brushDraws(b.engine).length
  expect(()=>b.engine.appendOperation({...base,id:'bad',brushRandom:{...seeds,strokeSeed:1}},'remote')).toThrow('Invalid brush random context')
  expect(brushDraws(b.engine)).toHaveLength(before)
  expect(()=>b.engine.appendPeerLiveDabs('peer',{strokeId:createBrushRandomStrokeId('nonce00000',seeds),layerId:'other',tool:'digitalBrush',preset:'hard-round',color:[0,0,0],packetSeq:0,dabs:[],brushRandom:{...seeds,strokeSeed:1}})).toThrow('Invalid brush random context')
 } finally {a.engine.destroy();b.engine.destroy()}
})
it('retires an interrupted async gesture context on canvas resize and creates a new one', async () => {
 const ended = vi.fn(), {engine} = createTestEngine({userId:'owner',asyncFinish:true,onLiveStrokeEnd:ended},{width:32,height:32})
 try {
  await paperReady(engine); engine.initLayer('ink');engine.setActiveLayer('ink');engine.setTool('digitalBrush');engine.setPencil('hard-round')
  engine['_onStart'](pointerSample(8,16,{pressure:1,timeStamp:0}))
  const id=engine['_strokeId']
  expect(engine['_strokeBrushRandom']).toBeDefined()
  engine.resizeCanvas(40,32)
  expect(ended).toHaveBeenCalledWith(id,true)
  expect(engine['_strokeBrushRandom']).toBeUndefined()
  engine['_onStart'](pointerSample(12,16,{pressure:1,timeStamp:30}))
  expect(engine['_strokeId']).not.toBe(id)
  expect(engine['_strokeBrushRandom']).toBeDefined()
  engine['_onEnd'](pointerSample(12,16,{pressure:0,timeStamp:40}))
 } finally {engine.destroy()}
})
