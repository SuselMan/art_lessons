import { expect, it, vi } from 'vitest'
import type { BrushDescriptor } from '@grafetto/shared'
import { installBrushLibrary, installBrushPixels } from './brushLibrary'
import { digitalBrushFromPreset } from './src/presets/digitalBrushPresets'
import { createTestEngine, makeLayerAdd, makeStroke, paperReady, dab, brushDraws } from './testing/engineTestUtils'

let serial = 50
function fixture(size = 256, count = 3, model: 'stamp' | 'mixer' = 'stamp') {
  const ids = Array.from({ length: count }, () => `asset:${(++serial).toString(16).padStart(64, '0')}` as const)
  const descriptor: BrushDescriptor = { ...digitalBrushFromPreset('hard-round'),
    id: `imported-${(++serial).toString(16).padStart(24, '0')}`, version: 109, model,
    tip: { kind: 'bitmap', mask: ids[0], animation: { mode: 'incremental', frames: ids }, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed' },
    ...(model === 'mixer' ? { mixer: { load: 1, pickup: 0, strength: 1 } } : {}),
    behavior: { version: 2, ...(model === 'mixer' ? { wetMix: { charge: 1, dilution: 0, attack: 1, pull: 0, grade: 0, blur: 0, blurJitter: 0, wetnessJitter: 0 } } : {}) },
  }
  installBrushLibrary({ schemaVersion: 1, brushes: [{ name: 'Own preparation fixture', source: 'qa', warnings: [], descriptor }], assets: ids.map(id => ({ id, size, file: `${id.slice(6)}.bin` })), skipped: [] })
  ids.forEach(id => installBrushPixels(id, new Uint8Array(size * size).fill(180)))
  return `brush:${descriptor.id}@109`
}

it.each(['stamp', 'mixer'] as const)('prepares %s frames without recording/drawing and reuses them on the first stroke', async model => {
  const preset = fixture(256, 3, model), { engine } = createTestEngine({}, { width: 32, height: 32 })
  try {
    await paperReady(engine)
    engine.appendOperation(makeLayerAdd('peer', 'ink'))
    await new Promise(resolve => setTimeout(resolve, 5))
    const gl = engine['gl'], uploads = vi.spyOn(gl, 'texImage2D'), draw = vi.spyOn(gl, 'drawArrays')
    const format = model === 'stamp' ? gl.LUMINANCE : gl.ALPHA
    const count = () => uploads.mock.calls.filter(call => call[1] === 0 && call[2] === format && call[3] === 256).length
    const history = engine.getOperations()
    await expect(engine.prepareBrush(preset)).resolves.toEqual({ status: 'ready' })
    expect(engine.getOperations()).toEqual(history); expect(draw).not.toHaveBeenCalled()
    const prepared = count(); expect(prepared).toBe(model === 'stamp' ? 5 : 3)
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame')
    await engine.prepareBrush(preset); expect(count()).toBe(prepared); expect(frame).not.toHaveBeenCalled()
    frame.mockRestore()
    engine.appendOperation(makeStroke('peer', 'ink', Array.from({ length: 9 }, (_, i) => ({ ...dab(8 + i, 16), size: 8, t: i * 8 })), { tool: 'digitalBrush', preset, strokeId: 'first', strokeEnd: true }), 'remote')
    expect(count()).toBe(prepared)
  } finally { engine.destroy() }
})

it('skips an oversized frame set before any upload instead of evicting/reuploading it', async () => {
  const preset = fixture(2048, 2), { engine } = createTestEngine({}, { width: 16, height: 16 })
  try {
    await paperReady(engine)
    const uploads = vi.spyOn(engine['gl'], 'texImage2D')
    await expect(engine.prepareBrush(preset)).resolves.toEqual({ status: 'skipped' })
    expect(uploads).not.toHaveBeenCalled()
  } finally { engine.destroy() }
})

it.each(['destroy', 'context loss'] as const)('cancels preparation on %s with no late uploads', async reason => {
  const preset = fixture(), { engine } = createTestEngine({}, { width: 16, height: 16 })
  await paperReady(engine)
  const uploads = vi.spyOn(engine['gl'], 'texImage2D')
  const pending = engine.prepareBrush(preset), joined=engine.prepareBrush(preset)
  if (reason === 'destroy') engine.destroy()
  else engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
  try {
    await expect(Promise.all([pending,joined])).resolves.toEqual([{status:'cancelled'},{status:'cancelled'}])
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(uploads).not.toHaveBeenCalled()
  } finally { if (reason !== 'destroy') engine.destroy() }
})

it('preparation preserves the stamp inputs and animation order of the same recorded operation', async () => {
  const preset = fixture(), cold = createTestEngine({}, { width: 32, height: 32 }).engine, warm = createTestEngine({}, { width: 32, height: 32 }).engine
  try {
    await Promise.all([paperReady(cold), paperReady(warm)])
    for (const engine of [cold, warm]) engine.appendOperation(makeLayerAdd('peer', 'ink'))
    const operation = makeStroke('peer', 'ink', Array.from({ length: 9 }, (_, i) => ({ ...dab(8 + i, 16), size: 8, t: i * 8 })), { tool: 'digitalBrush', preset, strokeId: 'same-operation', strokeEnd: true })
    await warm.prepareBrush(preset)
    for (const engine of [cold, warm]) engine.appendOperation(operation, 'remote')
    const inputs = (engine: typeof cold) => brushDraws(engine).filter(draw => draw.kind === 'stamp').map(draw => draw.uniforms)
    expect(inputs(cold).length).toBeGreaterThan(0)
    expect(inputs(warm)).toEqual(inputs(cold))
  } finally { cold.destroy(); warm.destroy() }
})

it('shares warm same-preset readiness but cancels it after a distinct selection or destroy', async () => {
  const preset = fixture(), { engine } = createTestEngine({}, { width: 16, height: 16 })
  try {
    await paperReady(engine); await engine.prepareBrush(preset)
    const same = engine.prepareBrush(preset), joined = engine.prepareBrush(preset)
    await expect(Promise.all([same,joined])).resolves.toEqual([{status:'ready'},{status:'ready'}])
    const stale = engine.prepareBrush(preset), current = engine.prepareBrush(fixture(32,1))
    await expect(stale).resolves.toEqual({ status: 'cancelled' })
    await expect(current).resolves.toEqual({ status: 'ready' })
    const pending = engine.prepareBrush(preset); engine.destroy()
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
  } finally { if (!engine['_destroyed']) engine.destroy() }
})

it('keeps UI preparation ready when a second same-preset caller joins during partial uploads',async()=>{
  const preset=fixture(32,5),{engine}=createTestEngine()
  try{
    await paperReady(engine)
    const secondProgress=vi.fn();let second:ReturnType<typeof engine.prepareBrush>|undefined
    const first=engine.prepareBrush(preset,{onProgress:done=>{if(done===1)second=engine.prepareBrush(preset,{onProgress:secondProgress})}})
    const firstResult=await first;expect(second).toBeDefined();const secondResult=await second!
    expect(firstResult).toEqual({status:'ready'});expect(secondResult).toEqual({status:'ready'})
    expect(secondProgress.mock.calls.at(-1)).toEqual([7,7])
  }finally{engine.destroy()}
})
it.each([0,1])('independently aborts engine same-preset subscriber%s',async aborted=>{
  const preset=fixture(32,3),{engine}=createTestEngine()
  try{
    await paperReady(engine);const controllers=[new AbortController(),new AbortController()]
    const pending=controllers.map(c=>engine.prepareBrush(preset,{signal:c.signal}));controllers[aborted].abort()
    expect(await Promise.all(pending)).toEqual(aborted===0?[{status:'cancelled'},{status:'ready'}]:[{status:'ready'},{status:'cancelled'}])
  }finally{engine.destroy()}
})
it('does not cancel valid preparation for an invalid or already-aborted second request',async()=>{
  const preset=fixture(32,3),{engine}=createTestEngine()
  try{
    await paperReady(engine)
    const valid=engine.prepareBrush(preset)
    await expect(engine.prepareBrush('brush:imported-deadbeef@999')).rejects.toThrow('unavailable')
    const aborted=new AbortController();aborted.abort()
    await expect(engine.prepareBrush(fixture(32,1),{signal:aborted.signal})).resolves.toEqual({status:'cancelled'})
    await expect(valid).resolves.toEqual({status:'ready'})
  }finally{engine.destroy()}
})

it('rechecks texture residency after a shared run completes instead of caching ready forever',async()=>{
  const preset=fixture(32,3),{engine}=createTestEngine()
  try{
    await paperReady(engine)
    const uploads=vi.spyOn(engine['gl'],'texImage2D')
    await engine.prepareBrush(preset);const count=uploads.mock.calls.length
    expect(count).toBeGreaterThan(0)
    engine['_brush']['textures'].clear()
    await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'})
    expect(uploads.mock.calls.length).toBeGreaterThan(count)
  }finally{engine.destroy()}
})
it('stops all pending engine subscribers after their last abort without any late upload',async()=>{
  const preset=fixture(32,3),{engine}=createTestEngine()
  try{
    await paperReady(engine)
    const uploads=vi.spyOn(engine['gl'],'texImage2D'),a=new AbortController(),b=new AbortController()
    const pending=[engine.prepareBrush(preset,{signal:a.signal}),engine.prepareBrush(preset,{signal:b.signal})]
    a.abort();b.abort()
    expect(await Promise.all(pending)).toEqual([{status:'cancelled'},{status:'cancelled'}])
    await new Promise(resolve=>setTimeout(resolve,5));expect(uploads).not.toHaveBeenCalled()
  }finally{engine.destroy()}
})
it('keeps an admitted pending preset alive when a different oversized bank is skipped',async()=>{
  const preset=fixture(32,3),oversized=fixture(2048,2),{engine}=createTestEngine()
  try{
    await paperReady(engine)
    const first=engine.prepareBrush(preset)
    await expect(engine.prepareBrush(oversized)).resolves.toEqual({status:'skipped'})
    await expect(first).resolves.toEqual({status:'ready'})
  }finally{engine.destroy()}
})
