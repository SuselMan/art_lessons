import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Dab, StrokeOperation } from '@grafetto/shared'
import type { PencilEngine } from './index'
import { createTestEngine, dab, makeStroke, readLayerPixels } from './testing/engineTestUtils'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
function fixture(tool: 'marker' | 'smudge', grouped = true, commit = true) {
  const applied: StrokeOperation[] = []
  let engine!: PencilEngine
  engine = createTestEngine({ userId: 'local', onPreviewApplied: op => {
    applied.push(op)
    if (commit) engine.appendOperation(op, 'remote')
  } }, { width: 16, height: 16 }).engine
  engine.setBaseLayers(['L', 'other']); engine.setActiveLayer('L')
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  const base = makeStroke('local', 'L', [dab(8, 8, { size: 10 })], { id: 'base', seq: 1 })
  engine.appendOperation(base, 'remote')
  const op = makeStroke('peer', 'L', [dab(6, 8, { size: 6, t: 0 }), dab(11, 8, { size: 6, t: 500 })], {
    id: 'preview', seq: 2, tool, preset: tool === 'marker' ? 'bullet:6' : 'normal', ...(grouped ? { strokeId: 'gesture' } : {}),
  })
  return { engine, op, applied }
}

for (const tool of ['marker', 'smudge'] as const) for (const grouped of [false, true]) {
  it(`${tool}, grouped=${grouped}: paints the true source and commits without painting twice`, () => {
    const { engine, op, applied } = fixture(tool, grouped)
    const seam = engine as unknown as { _paintDabs(...args: unknown[]): unknown }
    const paint = vi.spyOn(seam, '_paintDabs')
    try {
      engine.previewOperation(op)
      vi.advanceTimersByTime(32)
      expect(paint.mock.calls[0][0]).toBe(engine['_layers'].get('L'))
      expect(engine['_hasUnrecordedInk']('L')).toBe(true)
      expect(engine.bakeNetworkSnapshot('L')).toBeNull()
      expect(engine.getOperations().some(item => item.id === op.id)).toBe(false)
      vi.advanceTimersByTime(1000)
      expect(applied.map(item => item.id)).toEqual([op.id])
      expect(paint.mock.calls.filter(args => args[5] === 'peer').reduce((n, args) => n + (args[1] as Dab[]).length, 0)).toBe(2)
      expect(engine.getOperations().filter(item => item.id === op.id)).toHaveLength(1)
      expect(engine['_hasUnrecordedInk']('L')).toBe(false)
      expect(engine.bakeNetworkSnapshot('L')).not.toBeNull()
      if (!grouped) expect(engine['_replayRibbonChunks'].has(op.id)).toBe(false)
    } finally { paint.mockRestore(); engine.destroy() }
  })
}

it.each(['drop', 'flush'] as const)('retires provisional ink on %s and lets the caller commit the full operation', mode => {
  const { engine, op, applied } = fixture('marker')
  try {
    const base = readLayerPixels(engine, 'L')!.slice()
    engine.previewOperation(op); vi.advanceTimersByTime(32)
    const removed = mode === 'drop' ? [engine.dropPendingPreview(op.id)!] : engine.flushPeerPreview('peer')
    expect(removed.map(item => item.id)).toEqual([op.id])
    expect(engine['_hasUnrecordedInk']('L')).toBe(false)
    expect(readLayerPixels(engine, 'L')).toEqual(base)
    expect(applied).toEqual([])
    engine.appendOperation(removed[0], 'remote')
    expect(engine.getOperations().filter(item => item.id === op.id)).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(applied).toEqual([])
  } finally { engine.destroy() }
})

it('does not retain unlogged ink when a preview-only consumer does not commit', () => {
  const { engine, op } = fixture('marker', true, false)
  try {
    const base = readLayerPixels(engine, 'L')!.slice()
    engine.previewOperation(op); vi.advanceTimersByTime(1000)
    expect(engine['_hasUnrecordedInk']('L')).toBe(false)
    expect(readLayerPixels(engine, 'L')).toEqual(base)
    expect(engine.getOperations().some(item => item.id === op.id)).toBe(false)
  } finally { engine.destroy() }
})

it('keeps a peer smudge carrier during replay of an unrelated layer', () => {
  const { engine, op } = fixture('smudge')
  try {
    engine.appendOperation({ ...op, id: 'old-other', layerId: 'other', strokeId: 'old-gesture', seq: 3 }, 'remote')
    engine.previewOperation(op); vi.advanceTimersByTime(32)
    const painter = engine['_smudge'] as unknown as { carried: Map<unknown, { replayChunks: Map<string, { strokeId: string }> }> }
    const carried = painter.carried.get(engine['_layers'].get('L'))!
    const before = carried.replayChunks.get('peer')
    expect(before?.strokeId).toBe('gesture')
    engine['_rebuildLayer']('other')
    expect(carried.replayChunks.get('peer')).toBe(before)
    vi.advanceTimersByTime(1000)
  } finally { engine.destroy() }
})

it.each([false, true])('hands a real stream over without duplication, preview already painted=%s', painted => {
  const { engine, op, applied } = fixture('marker')
  const seam = engine as unknown as { _paintDabs(...args: unknown[]): unknown }
  const paint = vi.spyOn(seam, '_paintDabs')
  try {
    engine.previewOperation(op); if (painted) vi.advanceTimersByTime(32)
    engine.appendPeerLiveDabs('peer', { strokeId: 'gesture', layerId: 'L', tool: 'marker', preset: op.preset, color: op.color, packetSeq: 0, dabs: op.dabs! })
    expect(applied.map(item => item.id)).toEqual([op.id])
    expect(engine.getOperations().filter(item => item.id === op.id)).toHaveLength(1)
    // One provisional dab was rolled back; the accepted full operation paints
    // its two dabs, while late packet zero is entirely already accounted for.
    expect(paint.mock.calls.filter(args => args[5] === 'peer').reduce((n, args) => n + (args[1] as Dab[]).length, 0)).toBe(painted ? 3 : 2)
    vi.advanceTimersByTime(1000)
    expect(applied).toHaveLength(1)
  } finally { paint.mockRestore(); engine.destroy() }
})

it.each(['apply', 'context-loss'] as const)('keeps a delivered claim until queued canonical %s without delivering twice', finish => {
  const applied: string[] = []
  let engine!: PencilEngine
  engine = createTestEngine({ userId: 'local', onPreviewApplied: op => {
    applied.push(op.id)
    engine['_opQueue'].push({ op, source: 'remote' })
  } }, { width: 16, height: 16 }).engine
  engine.setBaseLayers(['L'])
  engine.appendOperation(makeStroke('base-author', 'L', [dab(8, 8, { size: 10 })], { seq: 1 }), 'remote')
  const op = makeStroke('peer', 'L', [dab(6, 8, { size: 6, t: 0 }), dab(11, 8, { size: 6, t: 100 })], { id: 'held-canonical', seq: 2, tool: 'marker', preset: 'bullet:6' })
  try {
    engine.previewOperation(op); vi.advanceTimersByTime(300)
    expect(applied).toEqual([op.id])
    expect(engine['_hasUnrecordedInk']('L')).toBe(true)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
    if (finish === 'context-loss') engine['_handleContextLost'](new Event('webglcontextlost', { cancelable: true }))
    else engine['_flushOpQueue']()
    vi.advanceTimersByTime(100)
    expect(applied).toEqual([op.id])
    expect(engine.getOperations().filter(item => item.id === op.id)).toHaveLength(1)
    expect(engine['_peerPreviews'].size).toBe(0)
  } finally { engine.destroy() }
})

it('retires a legacy preview safely when its layer disappears during reveal', () => {
  const { engine, op, applied } = fixture('marker', false)
  try {
    engine.previewOperation(op); vi.advanceTimersByTime(32)
    engine.appendOperation({ id: 'delete', type: 'layer_delete', layerIds: ['L'], userId: 'owner', timestamp: 3, seq: 3 }, 'remote')
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
    expect(applied.map(item => item.id)).toEqual([op.id])
    expect(engine['_peerPreviews'].size).toBe(0)
    expect(engine['_hasUnrecordedInk']('L')).toBe(false)
    expect(engine['_log'].entries.filter(entry => entry.op.id === op.id)).toHaveLength(1)
  } finally { engine.destroy() }
})

it('does not re-deliver a reveal when its commit callback receives a live packet reentrantly', () => {
  const delivered: string[] = []
  let engine!: PencilEngine
  engine = createTestEngine({ userId: 'local', onPreviewApplied: op => {
    delivered.push(op.id)
    if (delivered.length === 1) engine.appendPeerLiveDabs(op.userId, {
      strokeId: op.strokeId!, layerId: op.layerId, tool: op.tool, preset: op.preset,
      color: op.color, packetSeq: 0, dabs: op.dabs!,
    })
    engine.appendOperation(op, 'remote')
  } }, { width: 16, height: 16 }).engine
  engine.setBaseLayers(['L'])
  const op = makeStroke('peer', 'L', [dab(6, 8, { size: 6, t: 0 }), dab(11, 8, { size: 6, t: 100 })], {
    id: 'reentrant', seq: 1, strokeId: 'gesture', tool: 'marker', preset: 'bullet:6',
  })
  try {
    engine.previewOperation(op); vi.advanceTimersByTime(300)
    expect(delivered).toEqual([op.id])
    expect(engine.getOperations().filter(item => item.id === op.id)).toHaveLength(1)
    expect(engine['_peerPreviews'].size).toBe(0)
    expect(engine['_hasUnrecordedInk']('L')).toBe(false)
  } finally { engine.destroy() }
})

it('releases carried GPU state when a temporary replay buffer is destroyed', () => {
  const { engine, op } = fixture('smudge')
  try {
    const target = engine['_makeLayerBuffer']()
    engine['_paintDabs'](target, op.dabs!, op.tool, op.preset, op.color, op.userId, undefined, undefined, op.strokeId)
    const painter = engine['_smudge'] as unknown as { carried: Map<unknown, unknown> }
    expect(painter.carried.has(target)).toBe(true)
    target.destroy()
    expect(painter.carried.has(target)).toBe(false)
  } finally { engine.destroy() }
})
