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
  const pending = engine.prepareBrush(preset)
  if (reason === 'destroy') engine.destroy()
  else engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
  try {
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
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

it('does not report a warm generation ready after a synchronous switch or destroy', async () => {
  const preset = fixture(), { engine } = createTestEngine({}, { width: 16, height: 16 })
  try {
    await paperReady(engine); await engine.prepareBrush(preset)
    const stale = engine.prepareBrush(preset), current = engine.prepareBrush(preset)
    await expect(stale).resolves.toEqual({ status: 'cancelled' })
    await expect(current).resolves.toEqual({ status: 'ready' })
    const pending = engine.prepareBrush(preset); engine.destroy()
    await expect(pending).resolves.toEqual({ status: 'cancelled' })
  } finally { if (!engine['_destroyed']) engine.destroy() }
})
