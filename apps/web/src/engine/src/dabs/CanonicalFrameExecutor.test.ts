import { describe, expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, packCanonicalMaterial, unpackCanonicalMaterial, type BrushTip, type CanonicalMaterialFrame, type CanonicalMaterialRecipe, type TipMaskId } from '@grafetto/shared'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import { sourceBlendAverageOpacity } from '../presets/brushWash'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { CanonicalMaskSourceBank } from './CanonicalMaskSourceBank'
import { TransformedMaskPrepass } from './TransformedMaskPrepass'
import { CanonicalRgba8CompositePass } from './CanonicalRgba8CompositePass'
import { CanonicalFrameExecutor, type CanonicalFrameSubmission } from './CanonicalFrameExecutor'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
const id = `asset:${'7'.repeat(64)}`
const asset = { id, size: 1, x: 0, y: 0, width: 1, height: 1 }
const recipe: CanonicalMaterialRecipe = { asset: id, brushScale: 1, brushAngle: 0, scale: 1, ratio: 1, rotation: 0, subX: 0, subY: 0,
  width: 1, height: 1, mirrorH: false, mirrorV: false }
function decoded(count: number, x = 0, end = true, entry: CanonicalMaterialFrame['entry'] = { phase: 'between' }): CanonicalMaterialFrame {
  const frame: CanonicalMaterialFrame = { profile: CANONICAL_MATERIAL_PROFILE, masked: false, entry,
    definitions: count ? [recipe] : [], draws: Array.from({ length: count }, (_, i) => ({ definition: 0, role: 'primary', x: x + i, y: 0, opacity: .4, flow: .7 })),
    fences: [ ...(entry.phase === 'between' && count ? [{ kind: 'segmentBegin' as const, at: 0, group: 0 }] : []),
      ...(end ? [{ kind: 'primaryEnd' as const, at: count, group: 0 }, { kind: 'segmentEnd' as const, at: count, group: 0 }, { kind: 'gestureEnd' as const, at: count }] : []) ] }
  const context = { assets: [asset], primaryAsset: id, budget: { workUnits: 100000, outputBytes: 100000, drawPixels: 100000 },
    preflightDefinition: () => ({ workUnits: 1, outputBytes: 1 }) }
  return unpackCanonicalMaterial(packCanonicalMaterial(frame, context), context)
}
function setup(mode: 'wash' | 'buildup' = 'buildup', tileSize = 4, capacity = 4, tileBudget?: number) {
  const { gl, snapshot } = recordingGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache()
  gl.TEXTURE1 = gl.TEXTURE0 + 1; gl.STATIC_DRAW = 9001; gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 9002
  gl.LINEAR = 9010; gl.REPEAT = 9011
  gl.copyTexSubImage2D = vi.fn(); gl.copyTexImage2D = vi.fn(); gl.uniform3f = vi.fn(); gl.uniform4f = vi.fn()
  gl.isContextLost = () => false
  const attrib = gl.getAttribLocation
  gl.getAttribLocation = (p: unknown, n: string) => n === 'position' ? 0 : attrib(p, n)
  const attachments = new Map(), attach = gl.framebufferTexture2D
  gl.framebufferTexture2D = (...args: unknown[]) => { attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING), args[3]); attach(...args) }
  gl.getFramebufferAttachmentParameter = () => attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
  const parameters = new Map(), setParameter = gl.texParameteri
  gl.texParameteri = (target: number, name: number, value: number) => {
    const texture = gl.getParameter(gl.TEXTURE_BINDING_2D)
    if (!parameters.has(texture)) parameters.set(texture, new Map())
    parameters.get(texture).set(name, value); setParameter(target, name, value)
  }
  gl.getTexParameter = (_: number, n: number) => parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n) ?? gl.NEAREST
  const tip: BrushTip = { kind: 'bitmap', mask: id as TipMaskId, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed',
    imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 0, y: 0, width: 1, height: 1 } } }
  const bank = new CanonicalMaskSourceBank(gl, cache, cpu, [{ id: id as TipMaskId, tip, assetSide: 1, readOriginalCoverage: () => new Uint8Array([255]) }], { gpuBytes: 0, cpuBytes: 0 })
  bank.jobs.forEach((_, i) => bank.prepareJob(i))
  const prepass = new TransformedMaskPrepass(gl, cache, cpu, 'executor-test')
  prepass.prepare({ width: capacity, height: capacity, slots: 1 }, bank.preparedResources())
  const composite = new CanonicalRgba8CompositePass(gl, cache, cpu, 'executor-composite-test')
  composite.prepare({ width: capacity, height: capacity, operations: ['alphaDarken32', 'over32'] }, [...bank.preparedResources(), ...prepass.preparedResources()])
  const rebuild = vi.fn(() => ({ readPixels: () => null, destroy: vi.fn() }))
  const scratch = new RibbonScratchPool(gl), layer = new TiledLayerBuffer(gl, tileSize, tileSize, tileBudget ? rebuild : undefined, tileBudget ? tileBudget * tileSize * tileSize * 4 : undefined, undefined, 'straight-rgba8')
  let epoch = 0
  const releases: ReturnType<typeof vi.fn>[] = [], reserveTransient = vi.fn(() => { const r = vi.fn(); releases.push(r); return r })
  const changed = vi.fn(), poison = vi.fn()
  const executor = new CanonicalFrameExecutor({ bank, prepass, composite, scratch, capacity: { width: capacity, height: capacity },
    layer: () => ({ buffer: layer, epoch }), reserveTransient, changed, poison })
  const submit = (frame = decoded(1), ordinal = 0): CanonicalFrameSubmission => ({ gestureId: 'gesture', layerId: 'layer', layerEpoch: 0, ordinal,
    frame, assets: [asset], rgb: [200, 20, 50], composition: { mode, alphaDarken: 'creamy', outerResourceOpacity: .8, outerBlend: 'over' } })
  const drain = () => { let n = 0; while (executor.pending && n++ < 200) executor.advance(); expect(n).toBeLessThan(200) }
  const close = () => { executor.cancel(); layer.destroy(); scratch.destroy(); prepass.reset(); composite.reset(); bank.reset() }
  return { gl, snapshot, cache, cpu, bank, prepass, composite, scratch, layer, executor, submit, drain, close, releases, reserveTransient, changed, poison, setEpoch: () => { epoch++ } }
}

describe('canonical decoded frames over actual straight tiled layers', () => {
  it('routes decoded local and recorded input through the same bounded queue, no hot uploads and no repeated commands', () => {
    const s = setup(), calls = vi.spyOn(s.composite, 'drawSource')
    try {
      const input = s.submit(decoded(19)), baseline = s.snapshot(), uploads = s.gl.texImage2D.mock.calls.length
      s.executor.enqueue(input)
      expect(s.executor.checkpointReady).toBe(false)
      s.executor.advance()
      expect(calls.mock.calls.length).toBeLessThanOrEqual(8)
      expect(s.executor.pending).toBe(true)
      s.drain()
      expect(calls).toHaveBeenCalledTimes(19)
      expect(calls.mock.calls.map(([r]) => r.source.view.rect.x)).toEqual(Array.from({ length: 19 }, (_, i) => i))
      expect(s.gl.texImage2D.mock.calls.length).toBeGreaterThan(uploads) // actual layer allocation, not prepared source uploads
      expect(s.executor.checkpointReady).toBe(true)
      expect(s.snapshot()).toEqual(baseline)
      calls.mockClear()
      s.executor.enqueue({ ...structuredClone(input), gestureId: 'recorded' }); s.drain()
      expect(calls).toHaveBeenCalledTimes(19)
    } finally { s.close() }
  })
  it('updates wash opacity history once per logical draw across decoded frame chunks and previews immutable original', () => {
    const s = setup('wash', 4, 2), calls = vi.spyOn(s.composite, 'drawSource')
    try {
      s.executor.enqueue(s.submit(decoded(2, 0, false))); s.drain()
      expect(s.executor.checkpointReady).toBe(false)
      const first = calls.mock.calls.map(([r]) => r)
      const locals = first.filter(r => r.operation.kind === 'alphaDarken32')
      expect(locals).toHaveLength(2)
      expect(locals.map(r => r.operation.kind === 'alphaDarken32' && r.operation.control.averageOpacity)).toEqual([Math.fround(.4), Math.fround(.4)])
      const base = first.find(r => r.readDestination)!.readDestination
      expect(s.reserveTransient).toHaveBeenCalledExactlyOnceWith(4 * 4 * 8)
      s.executor.enqueue(s.submit(decoded(1, 2, true, { phase: 'primary', group: 0 }), 1)); s.drain()
      expect(calls.mock.calls.filter(([r]) => r.readDestination).every(([r]) => r.readDestination!.texture === base!.texture)).toBe(true)
      expect(s.reserveTransient).toHaveBeenCalledTimes(1)
      expect(s.releases[0]).toHaveBeenCalledTimes(1)
      expect(s.scratch.bytes.live).toBe(0)
      expect(s.executor.checkpointReady).toBe(true)
      expect(sourceBlendAverageOpacity(.4, .4)).toBe(.4)
    } finally { s.close() }
  })
  it('admits the complete sparse wash union before allocations and leaves state/pixels unchanged on predictable rejection', () => {
    const s = setup('wash'), calls = vi.spyOn(s.composite, 'drawSource'), tiles = vi.spyOn(s.layer, 'resolveForPaint')
    try {
      s.reserveTransient.mockImplementationOnce(() => { throw new RangeError('GPU fence') })
      expect(() => s.executor.enqueue(s.submit(decoded(9)))).toThrow('GPU fence')
      expect(calls).not.toHaveBeenCalled(); expect(tiles).not.toHaveBeenCalled()
      expect(s.executor.checkpointReady).toBe(true); expect(s.poison).not.toHaveBeenCalled()
      s.executor.enqueue(s.submit(decoded(9))); s.drain()
      expect(s.reserveTransient).toHaveBeenLastCalledWith(3 * 4 * 4 * 8)
    } finally { s.close() }
  })
  it('poisons a partially completed command without retry and releases retained targets and scratch on error', () => {
    const s = setup('wash'), original = s.composite.drawSource.bind(s.composite)
    let n = 0
    vi.spyOn(s.composite, 'drawSource').mockImplementation((r, f) => { if (++n === 2) throw new Error('GPU write uncertain'); return original(r, f) })
    try {
      s.executor.enqueue(s.submit(decoded(5)))
      // A real yield may split before the injected second command.
      expect(() => { while (s.executor.pending) s.executor.advance() }).toThrow('GPU write uncertain')
      expect(s.poison).toHaveBeenCalledTimes(1); expect(s.executor.poisoned).toBe(true)
      expect(s.executor.checkpointReady).toBe(false)
      expect(s.scratch.bytes.live).toBe(0)
      expect(() => s.executor.advance()).toThrow('poisoned')
      expect(() => s.layer.clear()).not.toThrow()
    } finally { s.close() }
  })
  it('rejects stale epochs and cancellation blocks checkpoints until the caller rebuilds a new executor', () => {
    const s = setup()
    try {
      s.executor.enqueue(s.submit()); s.setEpoch()
      expect(() => s.executor.advance()).toThrow('changed')
      expect(s.poison).toHaveBeenCalledTimes(1)
      expect(s.executor.checkpointReady).toBe(false)
    } finally { s.close() }
    const t = setup('wash')
    try { t.executor.enqueue(t.submit()); t.executor.cancel(); expect(t.poison).toHaveBeenCalledTimes(1); expect(t.releases[0]).toHaveBeenCalledTimes(1) }
    finally { t.close() }
  })
  it('checks canonical metadata and shared CPU queue budget before side effects', () => {
    const s = setup(), resolve = vi.spyOn(s.layer, 'resolveForPaint')
    try {
      expect(canonicalTransformedMaskMetadata(recipe, asset).width).toBe(1)
      const input = s.submit(); (input.frame.definitions[0] as { width: number }).width = 2
      expect(() => s.executor.enqueue(input)).toThrow('allocation')
      expect(resolve).not.toHaveBeenCalled(); expect(s.executor.checkpointReady).toBe(true)
    } finally { s.close() }
  })
  it('keeps a logical-draw tile cursor across cooperative yields without advancing opacity twice', () => {
    const s = setup('wash'), actual = s.composite.drawSource.bind(s.composite)
    let time = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => time)
    const calls = vi.spyOn(s.composite, 'drawSource').mockImplementation((request, frame) => {
      const result = actual(request, frame); time += 5; return result
    })
    try {
      const input = structuredClone(s.submit())
      Object.assign(input.frame.definitions[0], { scale: 4, width: 4, height: 4 })
      Object.assign(input.frame.draws[0], { x: 3, y: 3 })
      s.executor.enqueue(input)
      Object.assign(input.frame.draws[0], { x: 100 }) // accepted DTO is immutable to its caller
      for (let i = 0; i < 4; i++) {
        s.executor.advance()
        expect(calls.mock.calls.filter(([r]) => r.operation.kind === 'alphaDarken32')).toHaveLength(i + 1)
      }
      s.drain()
      const local = calls.mock.calls.map(([r]) => r).filter(r => r.operation.kind === 'alphaDarken32')
      expect(local.map(r => [r.target.originX, r.target.originY])).toEqual([[0, 0], [4, 0], [0, 4], [4, 4]])
      expect(local.every(r => r.source.view.rect.x === 3)).toBe(true)
      expect(local.every(r => r.operation.kind === 'alphaDarken32' && r.operation.control.averageOpacity === Math.fround(.4))).toBe(true)
      expect(s.reserveTransient).toHaveBeenCalledExactlyOnceWith(4 * 4 * 4 * 8)
      expect(s.executor.checkpointReady).toBe(true)
    } finally { clock.mockRestore(); s.close() }
  })
  it('retains staging targets under a small actual layer budget, then re-resolves after each turn', () => {
    const s = setup('buildup', 1, 4, 8), calls = vi.spyOn(s.composite, 'drawSource')
    try {
      s.executor.enqueue(s.submit(decoded(25))); s.drain()
      expect(calls).toHaveBeenCalledTimes(25)
      expect(calls.mock.calls.map(([r]) => r.target.originX)).toEqual(Array.from({ length: 25 }, (_, i) => i))
      expect(s.executor.checkpointReady).toBe(true)
      expect(s.poison).not.toHaveBeenCalled()
      expect(() => s.layer.clear()).not.toThrow()
    } finally { s.close() }
  })

  it('forgets lost handles only on actual context loss; normal cancel returns the shared pool', () => {
    const s = setup('wash'), release = vi.spyOn(s.scratch, 'release')
    try {
      s.executor.enqueue(s.submit(decoded(1, 0, false))); s.drain()
      expect(() => s.executor.cancel('fake', { lost: true })).toThrow('live context')
      expect(s.executor.poisoned).toBe(false)
      const deleted = s.gl.deleteTexture.mock.calls.length
      s.gl.isContextLost = () => true
      s.executor.cancel('context lost', { lost: true })
      expect(release).not.toHaveBeenCalled()
      expect(s.gl.deleteTexture).toHaveBeenCalledTimes(deleted)
      expect(s.releases[0]).toHaveBeenCalledTimes(1)
      expect(s.executor.checkpointReady).toBe(false)
      s.scratch.forget() // owner of the whole engine pool performs this ONCE
      expect(s.scratch.bytes).toEqual({ live: 0, free: 0 })
    } finally { s.close() }
  })

  it('rejects queue/CPU admission before state changes, and releases accepted frame reservations on cancel', () => {
    const s = setup()
    try {
      const baseline = s.cpu.reservedBytes
      const release = s.cpu.reserve(s.cpu.budgetBytes - baseline - 16)
      expect(() => s.executor.enqueue(s.submit())).toThrow('CPU')
      expect(s.executor.checkpointReady).toBe(true)
      release()
      for (let i = 0; i < 8; i++) s.executor.enqueue(s.submit(decoded(1, i, false, i ? { phase: 'primary', group: 0 } : { phase: 'between' }), i))
      expect(() => s.executor.enqueue(s.submit(decoded(1, 8, false, { phase: 'primary', group: 0 }), 8))).toThrow('queue is full')
      s.executor.cancel()
      expect(s.cpu.reservedBytes).toBe(baseline)
      expect(s.poison).toHaveBeenCalledTimes(1)
    } finally { s.close() }
  })

})
