import type { Operation, StrokeOperation } from '@grafetto/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PencilEngine } from './index'
import { createTestEngine, dab, makeLayerAdd, makeStroke } from './testing/engineTestUtils'

const engines: PencilEngine[] = []
afterEach(() => { for (const engine of engines.splice(0)) engine.destroy() })
function setup() {
  let engine: PencilEngine
  const committed = vi.fn((op: StrokeOperation) => engine.appendOperation(op, 'remote'))
  const local = vi.fn()
  const result = createTestEngine({ userId: 'author', onPreviewApplied: committed, onLocalOperation: local }, { width: 64, height: 64 })
  engine = result.engine
  engines.push(engine)
  return { engine, committed, local, gl: engine['gl'] }
}
function stroke(id: string, seq: number): StrokeOperation {
  return { ...makeStroke('peer', 'L', [dab(16, 20), dab(36, 20)], { tool: 'watercolor', preset: 'normal:100:40:PB29:round' }), id, seq }
}
function history(type: 'operation_undo' | 'operation_redo' | 'operation_revoke', id: string, targetOpId: string): Operation {
  return { type, id, userId: 'peer', targetOpId, timestamp: Date.now() }
}

describe('confirmed journal while WebGL is lost', () => {
  it('keeps structure, stroke and history order without creating or painting GL resources', () => {
    const { engine, gl, local } = setup()
    const lost = vi.spyOn(gl, 'isContextLost').mockReturnValue(true)
    const create = vi.spyOn(gl, 'createTexture')
    const draw = vi.spyOn(gl, 'drawArrays')
    engine.appendOperation({ ...makeLayerAdd('peer', 'L'), seq: 1 }, 'remote')
    const op = stroke('remote', 2)
    engine.appendOperation(op, 'remote')
    engine.appendOperation(history('operation_undo', 'undo', op.id), 'remote')
    expect(engine['_log'].entries.find(e => e.op.id === op.id)?.state).toBe('undone')
    engine.appendOperation(history('operation_redo', 'redo', op.id), 'remote')
    expect(engine['_log'].entries.find(e => e.op.id === op.id)?.state).toBe('done')
    engine.appendOperation(history('operation_revoke', 'revoke', op.id), 'remote')
    expect(engine['_log'].entries.find(e => e.op.id === op.id)?.state).toBe('gone')
    const pending = makeLayerAdd('author', 'local')
    engine.appendOperation(pending, 'local')
    expect(local).toHaveBeenCalledWith(pending)
    expect(engine.confirmOperation(pending.id, 3)).toBe(true)
    expect(engine.discardOperation(pending.id)).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
    expect(engine['_layers'].size).toBe(0)
    lost.mockRestore()
  })

  it('commits confirmed preview callbacks but ignores ephemeral live packets', () => {
    const { engine, gl, committed } = setup()
    const queued = stroke('queued-preview', 1)
    engine.previewOperation(queued)
    const create = vi.spyOn(gl, 'createTexture')
    const draw = vi.spyOn(gl, 'drawArrays')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    engine['_stepPeerPreview']('peer')
    const incoming = stroke('incoming-preview', 2)
    engine.previewOperation(incoming)
    engine.appendPeerLiveDabs('peer', { strokeId: 'live', layerId: 'L', tool: 'watercolor', preset: incoming.preset, color: incoming.color, packetSeq: 0, dabs: [dab(20, 20)] })
    expect(committed.mock.calls.map(([op]) => op.id)).toEqual(['queued-preview', 'incoming-preview'])
    expect(engine['_log'].entries.map(e => e.op.id)).toEqual(['queued-preview', 'incoming-preview'])
    expect(engine['_peerPreviews'].size).toBe(0)
    expect(engine['_peerLiveStrokes'].size).toBe(0)
    expect(create).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
  })

  it('marks loss before draining operations that were already queued', () => {
    const { engine, gl } = setup()
    const op = stroke('queued-operation', 1)
    engine['_opQueue'].push({ op, source: 'remote' })
    const create = vi.spyOn(gl, 'createTexture')
    const draw = vi.spyOn(gl, 'drawArrays')
    engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    expect(engine['_contextLost']).toBe(true)
    expect(engine['_opQueue']).toHaveLength(0)
    expect(engine['_log'].entries.map(e => e.op.id)).toEqual([op.id])
    expect(create).not.toHaveBeenCalled()
    expect(draw).not.toHaveBeenCalled()
  })
  it('applies CPU dry and layer-clear metadata while lost without GL work', () => {
    const { engine, gl } = setup()
    const wet = engine['_paperWet']; const now = performance.now()
    wet.deposit('L', 16, 20, 8, 1, now)
    wet.deposit('B', 40, 40, 8, 1, now)
    const lost = vi.spyOn(gl, 'isContextLost').mockReturnValue(true)
    const create = vi.spyOn(gl, 'createTexture'); const draw = vi.spyOn(gl, 'drawArrays')
    engine.appendOperation({ type: 'layer_clear', id: 'clear', layerId: 'L', userId: 'peer', timestamp: Date.now() }, 'remote')
    expect(wet.sample('L', 16, 20, now)).toBe(0)
    expect(wet.sample('B', 40, 40, now)).toBeGreaterThan(0)
    engine.appendOperation({ type: 'paper_dry', id: 'dry', userId: 'peer', timestamp: Date.now() }, 'remote')
    expect(wet.peak(now)).toBe(0)
    expect(create).not.toHaveBeenCalled(); expect(draw).not.toHaveBeenCalled()
    lost.mockRestore()
  })

  it('keeps positive standing contact water on a recorded dry-pigment stroke', () => {
    const { engine } = setup(); const d = dab(16, 20)
    const op = { ...stroke('dry-pigment', 1), preset: 'normal:0:100:PB29:round', dabs: [d] }
    engine['_log'].append(op)
    engine['_wetFromForeignStroke']('L', 'watercolor', op.preset, [d], Date.now(), new Map([[d, 0.7]]), op.id)
    expect(engine['_paperWet'].sample('L', 16, 20, performance.now())).toBeGreaterThan(0)
    engine['_log'].append({ type: 'paper_dry', id: 'barrier', userId: 'peer', timestamp: Date.now() })
    engine['_paperWet'].clear()
    engine['_wetFromForeignStroke']('L', 'watercolor', op.preset, [d], Date.now(), new Map([[d, 0.7]]), op.id)
    expect(engine['_paperWet'].peak(performance.now())).toBe(0)
  })

})
