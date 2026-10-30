import gaussianStock from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native'
import { sourceGaussianDab } from '../presets/sourceGaussianDab'
import { canonicalGaussianAutoSourceBinding, type CanonicalAutoSource, type CanonicalGaussianAutoRecipe } from '@grafetto/shared'
import { CanonicalWashLayerCoordinator } from './CanonicalWashLayerCoordinator'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import { compositeSourceAlphaDarken32 } from '../presets/sourceAlphaDarken32'
import { compositeSourceOver32Scalar } from '../presets/sourceOver32Scalar'
import type { Rgba8 } from '../presets/mixWeightedRgba8'
import { saveBrushGlState } from './BrushGlState'
import { runBrushGlTurn } from './BrushGlBatch'
import { prepareSourceDefaultAutoDab } from '../presets/sourceDefaultAutoDab'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import { sourceStrokeAuthorDescriptor } from '../presets/sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket } from '../presets/sourceStrokeAuthor'
import { describe, expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, CANONICAL_STROKE_RASTER_PROFILE, packCanonicalMaterial, unpackCanonicalMaterial, canonicalDefaultAutoSourceBinding, buildCanonicalMaterial, type BrushDescriptor, type CanonicalDefaultAutoSource, type CanonicalDefaultAutoRecipe, type CanonicalMaterialContextV2, type BrushTip, type CanonicalMaterialFrame, type CanonicalMaterialRecipe, type TipMaskId } from '@grafetto/shared'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import { sourceBlendAverageOpacity } from '../presets/brushWash'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { CanonicalMaskSourceBank } from './CanonicalMaskSourceBank'
import { TransformedMaskPrepass } from './TransformedMaskPrepass'
import { CanonicalRgba8CompositePass } from './CanonicalRgba8CompositePass'
import { CanonicalFrameExecutor, type CanonicalFrameSubmission, type CanonicalExecutorRasterProfile } from './CanonicalFrameExecutor'
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
function setup(mode: 'wash' | 'buildup' = 'buildup', tileSize = 4, capacity = 4, tileBudget?: number, rasterProfile: CanonicalExecutorRasterProfile = 'reference-scalar-f32-rne-v1', autoSource?: CanonicalAutoSource, compositeCapacity = capacity, washMode?: 'exclusive' | 'deposition-only') {
  const { gl, snapshot } = recordingGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache()
  gl.TEXTURE1 = gl.TEXTURE0 + 1; gl.STATIC_DRAW = 9001; gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 9002
  gl.LINEAR = 9010; gl.REPEAT = 9011
  gl.texSubImage2D = vi.fn();
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
  const bank = autoSource ? undefined : new CanonicalMaskSourceBank(gl, cache, cpu, [{ id: id as TipMaskId, tip, assetSide: 1, readOriginalCoverage: () => new Uint8Array([255]) }], { gpuBytes: 0, cpuBytes: 0 })
  bank?.jobs.forEach((_, i) => bank.prepareJob(i))
  const bankResources = bank?.preparedResources() ?? []
  const prepass = new TransformedMaskPrepass(gl, cache, cpu, 'executor-test')
  prepass.prepare({ width: capacity, height: capacity, slots: 1 }, bankResources)
  const composite = new CanonicalRgba8CompositePass(gl, cache, cpu, 'executor-composite-test')
  composite.prepare({ width: compositeCapacity, height: compositeCapacity, operations: rasterProfile === CANONICAL_STROKE_RASTER_PROFILE ? ['alphaDarken32FusedScalar', 'over32FusedScalar'] : ['alphaDarken32', 'over32'] }, [...bankResources, ...prepass.preparedResources()])
  const rebuild = vi.fn(() => ({ readPixels: () => null, destroy: vi.fn() }))
  const scratch = new RibbonScratchPool(gl), layer = new TiledLayerBuffer(gl, tileSize, tileSize, tileBudget ? rebuild : undefined, tileBudget ? tileBudget * tileSize * tileSize * 4 : undefined, undefined, 'straight-rgba8')
  let epoch = 0
  const releases: ReturnType<typeof vi.fn>[] = [], reserveTransient = vi.fn(() => { const r = vi.fn(); releases.push(r); return r })
  const changed = vi.fn(), poison = vi.fn()
  const executor = new CanonicalFrameExecutor({ washMode, rasterProfile, autoSource, bank, prepass, composite, scratch,
    layer: () => ({ buffer: layer, epoch }), reserveTransient, changed, poison })
  const submit = (frame = decoded(1), ordinal = 0): CanonicalFrameSubmission => ({ gestureId: 'gesture', layerId: 'layer', layerEpoch: 0, ordinal,
    frame, assets: [asset], rgb: [200, 20, 50], composition: { mode, alphaDarken: 'creamy', outerResourceOpacity: .8, outerBlend: 'over' } })
  const drain = () => { let n = 0; while (executor.pending && n++ < 200) executor.advance(); expect(n).toBeLessThan(200) }
  const close = () => { executor.cancel(); layer.destroy(); scratch.destroy(); prepass.reset(); composite.reset(); bank?.reset() }
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
      expect(s.reserveTransient.mock.calls).toEqual([[4 * 4 * 4], [4 * 4 * 8]])
      s.executor.enqueue(s.submit(decoded(1, 2, true, { phase: 'primary', group: 0 }), 1)); s.drain()
      expect(calls.mock.calls.filter(([r]) => r.readDestination).every(([r]) => r.readDestination!.texture === base!.texture)).toBe(true)
      expect(s.reserveTransient).toHaveBeenCalledTimes(3)
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
      expect(s.reserveTransient.mock.calls).toEqual([[4 * 4 * 4 * 4], [4 * 4 * 4 * 8]])
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

  it('attempts every wash release when a callback throws and retains the primary draw error', () => {
    const s = setup('wash'), primary = new Error('primary draw'), notify = new Error('poison callback'), budget = new Error('budget release'), pool = new Error('pool release')
    const baseline = s.cpu.reservedBytes, actualRelease = s.scratch.release.bind(s.scratch)
    const returned = vi.spyOn(s.scratch, 'release').mockImplementation(buffer => { actualRelease(buffer); if (returned.mock.calls.length === 1) throw pool })
    s.poison.mockImplementation(() => { throw notify })
    s.executor.enqueue(s.submit(decoded(1, 0, false)))
    s.executor.enqueue(s.submit(decoded(1, 8, true, { phase: 'primary', group: 0 }), 1))
    s.releases[1].mockImplementation(() => { throw budget })
    vi.spyOn(s.composite, 'drawSource').mockImplementation(() => { throw primary })
    try {
      expect(() => s.executor.advance()).toThrow(primary)
      expect(s.executor.cleanupFailures).toEqual([notify, pool, budget])
      expect(returned).toHaveBeenCalledTimes(2)
      for (const release of s.releases) expect(release).toHaveBeenCalledTimes(1)
      expect(s.scratch.bytes.live).toBe(0); expect(s.cpu.reservedBytes).toBe(baseline)
      expect(s.executor.pending).toBe(false); expect(s.executor.checkpointReady).toBe(false)
      expect(() => s.layer.clear()).not.toThrow()
      s.executor.cancel(); expect(returned).toHaveBeenCalledTimes(2)
    } finally { s.close() }
  })
  it('completes cancellation cleanup before reporting a callback failure', () => {
    const s = setup('wash'), callback = new Error('release callback')
    const baseline = s.cpu.reservedBytes
    try {
      s.executor.enqueue(s.submit(decoded(1, 0, false)))
      s.executor.enqueue(s.submit(decoded(1, 8, true, { phase: 'primary', group: 0 }), 1))
      s.releases[0].mockImplementation(() => { throw callback })
      expect(() => s.executor.cancel()).toThrow(callback)
      expect(s.releases[1]).toHaveBeenCalledTimes(1)
      expect(s.cpu.reservedBytes).toBe(baseline)
      expect(s.executor.poisoned).toBe(true); expect(s.executor.pending).toBe(false)
      s.executor.cancel(); expect(s.releases[1]).toHaveBeenCalledTimes(1)
    } finally { s.close() }
  })

})

it('requires an explicit prepared profile before any layer allocation or reservation', () => {
  const s = setup()
  try {
    const options = { ...s.executor['options'] }, baseline = s.snapshot(), uploads = s.gl.texImage2D.mock.calls.length
    for (const rasterProfile of [undefined, 'unknown', CANONICAL_STROKE_RASTER_PROFILE]) {
      expect(() => new CanonicalFrameExecutor({ ...options, rasterProfile } as never)).toThrow()
    }
    expect(s.reserveTransient).not.toHaveBeenCalled()
    expect(s.layer.allResident()).toEqual([])
    expect(s.gl.texImage2D.mock.calls.length).toBe(uploads)
    expect(s.snapshot()).toEqual(baseline)
  } finally { s.close() }
})
it.each(['wash', 'buildup'] as const)('keeps the installed fused profile through %s local and outer commands across yields', mode => {
  const s = setup(mode, 4, 2, undefined, CANONICAL_STROKE_RASTER_PROFILE), calls = vi.spyOn(s.composite, 'drawSource')
  try {
    s.executor.enqueue(s.submit(decoded(2, 0, false))); s.drain()
    expect(s.executor.checkpointReady).toBe(false)
    s.executor.enqueue(s.submit(decoded(1, 2, true, { phase: 'primary', group: 0 }), 1)); s.drain()
    const requests = calls.mock.calls.map(([request]) => request)
    expect(requests.length).toBeGreaterThanOrEqual(3)
    expect(requests.every(r => r.operation.control.profile === CANONICAL_STROKE_RASTER_PROFILE)).toBe(true)
    if (mode === 'wash') {
      const local = requests.filter(r => r.operation.kind === 'alphaDarken32FusedScalar')
      expect(local).toHaveLength(3)
      expect(local.every(r => r.operation.kind === 'alphaDarken32FusedScalar' && r.operation.control.averageOpacity === Math.fround(.4))).toBe(true)
      const outer = requests.filter(r => r.readDestination)
      expect(outer.length).toBeGreaterThan(0)
      expect(outer.every(r => r.operation.kind === 'over32FusedScalar')).toBe(true)
      expect(new Set(outer.map(r => r.readDestination!.texture)).size).toBe(1)
    } else expect(requests.every(r => r.operation.kind === 'over32FusedScalar')).toBe(true)
    expect(s.executor.checkpointReady).toBe(true)
    expect(s.poison).not.toHaveBeenCalled()
  } finally { s.close() }
})

it.each(['wash', 'buildup'] as const)('reserves the complete %s target union before allocating any layer tiles', mode => {
  const s = setup(mode), allocate = vi.spyOn(s.layer, 'resolveForPaint')
  const baseline = s.cpu.reservedBytes
  try {
    s.reserveTransient.mockImplementationOnce(() => { throw new Error('target allocation fence') })
    expect(() => s.executor.enqueue(s.submit(decoded(9)))).toThrow('target allocation fence')
    expect(allocate).not.toHaveBeenCalled(); expect(s.layer.tileCount).toBe(0)
    expect(s.cpu.reservedBytes).toBe(baseline); expect(s.executor.checkpointReady).toBe(true)
    s.executor.enqueue(s.submit(decoded(9)))
    expect(s.reserveTransient.mock.calls[1]).toEqual([3 * 4 * 4 * 4])
    expect(allocate).not.toHaveBeenCalled()
    expect(s.releases[0]).not.toHaveBeenCalled()
    s.drain()
    for (const release of s.releases) expect(release).toHaveBeenCalledTimes(1)
    expect(s.executor.checkpointReady).toBe(true)
  } finally { s.close() }
})
it('holds wash-pair headroom across chunks but releases target headroom after each frame', () => {
  const s = setup('wash')
  try {
    s.executor.enqueue(s.submit(decoded(1, 0, false))); s.drain()
    expect(s.releases[0]).toHaveBeenCalledTimes(1)
    expect(s.releases[1]).not.toHaveBeenCalled()
    s.executor.enqueue(s.submit(decoded(1, 0, true, { phase: 'primary', group: 0 }), 1))
    expect(s.reserveTransient.mock.calls).toEqual([[64], [128], [64]])
    s.drain()
    for (const release of s.releases) expect(release).toHaveBeenCalledTimes(1)
  } finally { s.close() }
})
it('rejects a new material profile before inspecting image assets or preparing targets', () => {
  const s = setup(), input = s.submit()
  try {
    Object.assign(input.frame, { profile: 'default-auto-future-profile' })
    Object.defineProperty(input, 'assets', { get: () => { throw new Error('image asset access forbidden') } })
    expect(() => s.executor.enqueue(input)).toThrow('requires accepted material profile')
    expect(s.reserveTransient).not.toHaveBeenCalled(); expect(s.layer.tileCount).toBe(0)
  } finally { s.close() }
})
it('rejects an excessive frame target union before reserving or creating tiles', () => {
  const s = setup('buildup'), input = s.submit(decoded(65))
  try {
    input.frame.draws.forEach((draw, i) => Object.assign(draw, { x: i * 4 }))
    expect(() => s.executor.enqueue(input)).toThrow('bounded target union')
    expect(s.reserveTransient).not.toHaveBeenCalled(); expect(s.layer.tileCount).toBe(0)
    expect(s.executor.checkpointReady).toBe(true)
  } finally { s.close() }
})
it('does not limit a buildup gesture to the target count of one frame', () => {
  const s = setup('buildup'), first = s.submit(decoded(64, 0, false))
  try {
    first.frame.draws.forEach((draw, i) => Object.assign(draw, { x: i * 4 }))
    s.executor.enqueue(first); s.drain()
    expect(s.executor.checkpointReady).toBe(false)
    s.executor.enqueue(s.submit(decoded(1, 256, true, { phase: 'primary', group: 0 }), 1)); s.drain()
    expect(s.layer.tileCount).toBe(65)
    expect(s.executor.checkpointReady).toBe(true)
    expect(s.reserveTransient.mock.calls).toEqual([[4096], [64]])
  } finally { s.close() }
})
it('reserves all accumulated wash targets for an empty commit tail', () => {
  const s = setup('wash')
  try {
    s.executor.enqueue(s.submit(decoded(1, 0, false))); s.drain()
    s.executor.enqueue(s.submit(decoded(1, 8, false, { phase: 'primary', group: 0 }), 1)); s.drain()
    expect(s.reserveTransient.mock.calls).toEqual([[64], [128], [128], [128]])
    s.executor.enqueue(s.submit(decoded(0, 0, true, { phase: 'primary', group: 0 }), 2))
    expect(s.reserveTransient).toHaveBeenLastCalledWith(128)
    s.drain()
    expect(s.executor.checkpointReady).toBe(true)
    for (const release of s.releases) expect(release).toHaveBeenCalledTimes(1)
  } finally { s.close() }
})


it('executes actual seven imported auto sources through pressure30 author, decoded V2 and one incremental executor without a PNG bank', () => {
  let totalDraws=0;
  for(const row of stock.rows){
    const descriptor=row.descriptor as unknown as BrushDescriptor, profile='neon64-f32-fma-v1' as const;
    const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'black',lodScale:1,coverageProfile:profile});
    if(!compiled.supported)throw Error(compiled.reasons.join(','));
    const pin=canonicalDefaultAutoSourceBinding(descriptor,'a'.repeat(64),profile);
    const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}};
    const s=setup('buildup',512,512,undefined,'reference-scalar-f32-rne-v1',pin);
    try{
      expect(s.bank).toBeUndefined();
      const author=new SourceStrokeAuthor(compiled.program);let state=author.createState(4321,7654,.3);
      for(let i=0;i<30;i++){
        const packet:SourceAuthorPacket={x:20+i*.8,y:20+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,
          tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,
          mirroredH:i>=12&&i<22,mirroredV:false,tiltDirectionOffset:0,hover:false};
        const iterator=author.plan(state,packet), draws: {recipe:CanonicalDefaultAutoRecipe;role:'primary';x:number;y:number;opacity:number;flow:number}[]=[];
        while(true){const n=iterator.next();if(n.done){state=n.value;break}
          const m=n.value.result?.material;if(!m)continue;
          const saved=m.resolvedSource,g=saved.geometry;
          if(g?.kind!=='defaultAuto')throw Error('Expected auto strategy');
          const {opacity,flow}=n.value.result!;if(typeof opacity!=='number'||typeof flow!=='number')throw Error('Missing source strengths');
          draws.push({recipe:{kind:'defaultAuto',source:g.source,coverageProfile:g.coverageProfile,
            brushScale:saved.brush.scale,brushAngle:saved.brush.angle,scale:saved.shape.scale,ratio:saved.shape.ratio,rotation:saved.shape.rotation,
            subX:saved.key.subPixelX,subY:saved.key.subPixelY,width:saved.width,height:saved.height,
            mirrorH:saved.mirror.horizontal,mirrorV:saved.mirror.vertical},role:'primary',x:m.resolvedRect.x,y:m.resolvedRect.y,opacity,flow});
        }
        const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws,
          fences:[{kind:'segmentBegin',at:0,group:i},{kind:'primaryEnd',at:draws.length,group:i},{kind:'segmentEnd',at:draws.length,group:i},...(i===29?[{kind:'gestureEnd' as const,at:draws.length}]:[])]},context).packed;
        const frame=unpackCanonicalMaterial(packed,context), input={...s.submit(undefined,i),frame,assets:[]};
        s.executor.enqueue(input);s.drain();totalDraws+=draws.length;
      }
      expect(s.executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled();
      expect(s.gl.texSubImage2D.mock.calls.length).toBeGreaterThan(0);
      expect(s.cpu.reservedBytes).toBeLessThan(s.cpu.budgetBytes);
    } finally{s.close();expect(s.cpu.reservedBytes).toBe(0)}
  }
  expect(totalDraws).toBeGreaterThan(210);
});


for (const mode of ['wash','buildup'] as const) it(`clips ${mode} to trusted page before tile resolution while retaining original mask offsets`, () => {
  const s=setup(mode,4,64), bounds={minX:1,minY:1,maxX:2,maxY:2};
  const executor=new CanonicalFrameExecutor({...s.executor['options'],pageBounds:bounds});
  const calls=vi.spyOn(s.composite,'drawSource'), resolve=vi.spyOn(s.layer,'resolveForPaint');
  try {
    const f=decoded(1,-20); Object.assign(f,{definitions:[{...recipe,scale:40,width:40,height:40}],draws:[{...f.draws[0],y:-20}]});
    executor.enqueue({...s.submit(),frame:f});
    let n=0;while(executor.pending&&n++<50)executor.advance();
    expect(executor.checkpointReady).toBe(true);
    expect(resolve.mock.calls.every(([r])=>r.minX===0&&r.minY===0&&r.maxX===4&&r.maxY===4)).toBe(true);
    expect(calls.mock.calls[0][0].source.view.rect).toEqual({x:-20,y:-20,width:40,height:40});
    for(const [r] of calls.mock.calls)expect(r.writeBounds).toEqual(bounds);
  }finally{executor.cancel();s.close()}
});

it('skips fully clipped pixel work without allocating targets, changing source history or inventing endpoint dabs', () => {
  const s=setup('wash'), executor=new CanonicalFrameExecutor({...s.executor['options'],pageBounds:{minX:1,minY:1,maxX:2,maxY:2}});
  const resolve=vi.spyOn(s.layer,'resolveForPaint'), calls=vi.spyOn(s.composite,'drawSource'), getters=vi.spyOn(s.gl,'getParameter'), lease=vi.spyOn(s.cache,'lease');
  try {
    getters.mockClear();lease.mockClear();
    executor.enqueue(s.submit(decoded(1,999)));
    while(executor.pending)executor.advance();
    expect(executor.checkpointReady).toBe(true);expect(resolve).not.toHaveBeenCalled();expect(calls).not.toHaveBeenCalled();
    expect(s.reserveTransient).not.toHaveBeenCalled();expect(s.changed).not.toHaveBeenCalled();
    expect(getters).not.toHaveBeenCalled();expect(lease).not.toHaveBeenCalled();
  }finally{executor.cancel();s.close()}
});


function closedAutoFrame(pin:CanonicalDefaultAutoSource){
  const r=prepareSourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip:{...pin.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},
    storedScale:pin.brushScale,storedAngle:pin.brushAngle,shape:{scale:1,ratio:1,rotation:0},subpixelX:0,subpixelY:0,
    coverageProfile:pin.coverageProfile,maxPixels:1048576,maxWorkSamples:16*1048576});
  const [width,height]=r.geometry.maskSize;
  const def:CanonicalDefaultAutoRecipe={kind:'defaultAuto',source:pin.source,coverageProfile:pin.coverageProfile,
    brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width,height,mirrorH:false,mirrorV:false};
  const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}};
  return unpackCanonicalMaterial(buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:def,role:'primary',x:0,y:0,opacity:.5,flow:.7}],
    fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},context).packed,context);
}
it('yields mid-generation before all GL/target work, then cancellation owns every reservation',()=>{
  const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1');
  const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin), resolve=vi.spyOn(s.layer,'resolveForPaint');
  try{
    const baseline=s.cpu.reservedBytes;s.executor.enqueue({...s.submit(),frame:closedAutoFrame(pin),assets:[]});
    const getters=vi.spyOn(s.gl,'getParameter');getters.mockClear();
    let clock=0;const now=vi.spyOn(performance,'now').mockImplementation(()=>clock+=5);
    try{expect(s.executor.advance().pending).toBe(true)}finally{now.mockRestore()}
    expect(getters).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();expect(s.gl.texSubImage2D).not.toHaveBeenCalled();
    expect(s.cpu.reservedBytes).toBeGreaterThan(baseline);
    s.executor.cancel();expect(s.poison).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBe(baseline);
  }finally{s.close()}
});
it('rejects a forged auto definition before reservations and never grants execution from frame metadata',()=>{
  const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1');
  const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);
  try{
    const frame=closedAutoFrame(pin), first=frame.definitions[0];
    if(first.kind!=='defaultAuto')throw Error('Expected auto fixture');
    const forged={...frame,definitions:[{...first,source:{...first.source,diameter:first.source.diameter+1}}]};
    const baseline=s.cpu.reservedBytes;
    expect(()=>s.executor.enqueue({...s.submit(),frame:forged,assets:[]})).toThrow('mismatch');
    expect(s.cpu.reservedBytes).toBe(baseline);expect(s.reserveTransient).not.toHaveBeenCalled();expect(s.executor.checkpointReady).toBe(true);
    const noPin=new CanonicalFrameExecutor({...s.executor['options'],autoSource:undefined});
    expect(()=>noPin.enqueue({...s.submit(),frame,assets:[]})).toThrow('trusted');
    expect(s.reserveTransient).not.toHaveBeenCalled();noPin.cancel();
  }finally{s.close()}
});


it('yields after completed upload consumes the budget, without stacking target/GL work onto that CPU turn',()=>{
  const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1');
  const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin), resolve=vi.spyOn(s.layer,'resolveForPaint');
  let clock=0;const now=vi.spyOn(performance,'now').mockImplementation(()=>clock);
  s.gl.texSubImage2D.mockImplementation(()=>{clock=5});
  try{
    s.executor.enqueue({...s.submit(),frame:closedAutoFrame(pin),assets:[]});
    expect(s.executor.advance().pending).toBe(true);
    expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(1);expect(resolve).not.toHaveBeenCalled();
    const uploads=s.gl.texSubImage2D.mock.calls.length;
    s.drain();expect(s.executor.checkpointReady).toBe(true);expect(resolve).toHaveBeenCalled();
    expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(uploads);
  }finally{now.mockRestore();s.close()}
});
it('bounds a long fully clipped frame scan and resumes its exact draw cursor',()=>{
  const s=setup(),executor=new CanonicalFrameExecutor({...s.executor['options'],pageBounds:{minX:0,minY:0,maxX:1,maxY:1}});
  const resolve=vi.spyOn(s.layer,'resolveForPaint');let clock=0;
  try{
    executor.enqueue(s.submit(decoded(100,100)));
    const now=vi.spyOn(performance,'now').mockImplementation(()=>clock+=5);
    try{expect(executor.advance().pending).toBe(true)}finally{now.mockRestore()}
    expect(executor['queue'][0].draw).toBe(16);expect(resolve).not.toHaveBeenCalled();
    while(executor.pending)executor.advance();expect(executor.checkpointReady).toBe(true);expect(resolve).not.toHaveBeenCalled();
  }finally{executor.cancel();s.close()}
});

it('finishes empty source framing without GL queries, target leases or batches while preserving the gesture and ordinal',()=>{
  const s=setup('wash'), getters=vi.spyOn(s.gl,'getParameter'), lease=vi.spyOn(s.cache,'lease'), resolve=vi.spyOn(s.layer,'resolveForPaint'), draw=vi.spyOn(s.composite,'drawSource');
  const frames:CanonicalMaterialFrame[]=[
    {profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[{kind:'segmentBegin',at:0,group:0}]},
    {profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'primary',group:0},definitions:[],draws:[],fences:[{kind:'primaryEnd',at:0,group:0}]},
    {profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'mask',group:0},definitions:[],draws:[],fences:[{kind:'segmentEnd',at:0,group:0}]},
    {profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[{kind:'gestureEnd',at:0}]},
  ];
  try{
    getters.mockClear();lease.mockClear();
    for(const [ordinal,frame] of frames.entries()){
      s.executor.enqueue({...s.submit(),frame,ordinal});
      expect(s.executor.advance()).toEqual({pending:false,checkpointReady:ordinal===3});
      if(ordinal<3)expect(s.executor['planned']!.nextFrameOrdinal).toBe(ordinal+1);
    }
    expect(getters).not.toHaveBeenCalled();expect(lease).not.toHaveBeenCalled();expect(resolve).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();
    expect(s.poison).not.toHaveBeenCalled();expect(s.releases).toHaveLength(0);
  }finally{s.close()}
});

it('uses actual composite capacity for presentation independently of a small mask workspace',()=>{
  const s=setup('wash',8,2,undefined,'reference-scalar-f32-rne-v1',undefined,8), calls=vi.spyOn(s.composite,'drawSource');
  try{
    const gets=vi.spyOn(s.gl,'getParameter');gets.mockClear();
    const mask=s.prepass.preparedCapacity(),composite=s.composite.preparedCapacity();
    expect(Object.isFrozen(mask)).toBe(true);expect(Object.isFrozen(composite)).toBe(true);
    expect(mask.width).toBe(2);expect(composite.width).toBe(8);expect(gets).not.toHaveBeenCalled();
    s.executor.enqueue(s.submit());s.drain();
    const presentations=calls.mock.calls.map(([r])=>r).filter(r=>r.source.kind==='straightRgba8');
    expect(presentations).toHaveLength(1);expect(presentations[0].source.view.rect).toEqual({x:0,y:0,width:8,height:8});
  }finally{s.close()}
});

for(const mode of ['wash','buildup'] as const)it(`splits ${mode} local pixels by actual pass capacity with mirrored full mask, negative coordinates and short page edges`,()=>{
  const s=setup(mode,8,32,undefined,'reference-scalar-f32-rne-v1',undefined,4);
  const executor=new CanonicalFrameExecutor({...s.executor['options'],pageBounds:{minX:-6,minY:-5,maxX:7,maxY:3}});
  const calls=vi.spyOn(s.composite,'drawSource');
  try{
    const f=decoded(1,-9);Object.assign(f,{definitions:[{...recipe,scale:17,ratio:11/17,width:17,height:11,mirrorH:true,mirrorV:true}],draws:[{...f.draws[0],y:-7}]});
    executor.enqueue({...s.submit(),frame:f});let n=0;while(executor.pending&&n++<100)executor.advance();expect(n).toBeLessThan(100);
    expect(executor.checkpointReady).toBe(true);
    const requests=calls.mock.calls.map(([r])=>r).filter(r=>r.source.kind==='maskRgb'), coverage=new Map<string,number>();
    expect(requests.length).toBeGreaterThan(4);
    for(const r of requests){
      expect(r.source.view.rect).toEqual({x:-9,y:-7,width:17,height:11});expect(r.source.view.mirror).toEqual({horizontal:true,vertical:true});
      expect(r.target.width).toBe(8);expect(r.target.height).toBe(8);
      const b=r.writeBounds!;expect(b.maxX-b.minX).toBeLessThanOrEqual(4);expect(b.maxY-b.minY).toBeLessThanOrEqual(4);
      for(let y=b.minY;y<b.maxY;y++)for(let x=b.minX;x<b.maxX;x++){const k=`${x},${y}`;coverage.set(k,(coverage.get(k)??0)+1)}
    }
    expect(coverage.size).toBe(13*8);for(let y=-5;y<3;y++)for(let x=-6;x<7;x++)expect(coverage.get(`${x},${y}`)).toBe(1);
    expect(new Set(requests.map(r=>JSON.stringify(r.operation))).size).toBe(1);
    expect(requests.some(r=>r.writeBounds!.maxX-r.writeBounds!.minX<4||r.writeBounds!.maxY-r.writeBounds!.minY<4)).toBe(true);
  }finally{executor.cancel();s.close()}
});

it('retains and cancels one local part cursor without rerunning the logical source draw',()=>{
  const s=setup('wash',32,32,undefined,'reference-scalar-f32-rne-v1',undefined,4), actual=s.composite.drawSource.bind(s.composite);
  let clock=0;const now=vi.spyOn(performance,'now').mockImplementation(()=>clock);
  const calls=vi.spyOn(s.composite,'drawSource').mockImplementation((r,frame)=>{const out=actual(r,frame);clock+=5;return out});
  try{
    const baseline=s.cpu.reservedBytes,f=decoded(1);Object.assign(f,{definitions:[{...recipe,scale:17,ratio:11/17,width:17,height:11}]});
    s.executor.enqueue({...s.submit(),frame:f});expect(s.executor['planned']!.drawCount).toBe(1);
    s.executor.advance();expect(s.executor['queue'][0].draw).toBe(0);expect(s.executor['queue'][0].paintPart).toBe(1);expect(calls).toHaveBeenCalledTimes(1);
    s.executor.advance();expect(s.executor['queue'][0].draw).toBe(0);expect(s.executor['queue'][0].paintPart).toBe(2);expect(calls).toHaveBeenCalledTimes(2);
    const a=calls.mock.calls[0][0].writeBounds!,b=calls.mock.calls[1][0].writeBounds!;expect(a.maxX).toBe(b.minX);
    s.executor.cancel();expect(s.executor.poisoned).toBe(true);expect(s.poison).toHaveBeenCalledTimes(1);
    expect(s.cpu.reservedBytes).toBe(baseline);for(const release of s.releases)expect(release).toHaveBeenCalledTimes(1);
    expect(()=>s.executor.advance()).toThrow('poisoned');expect(calls).toHaveBeenCalledTimes(2);
  }finally{now.mockRestore();s.close()}
});

for(const service of ['mask-new-size','mask-new-epoch','pass-new-size','pass-new-epoch'] as const)it(`rejects changed ${service} before queued pixel work or target resolution`,()=>{
  const s=setup(),resolve=vi.spyOn(s.layer,'resolveForPaint'),draw=vi.spyOn(s.composite,'drawSource');
  try{
    s.executor.enqueue(s.submit());
    if(service.startsWith('mask')){
      s.prepass.reset();const size=service.endsWith('size')?8:4;
      s.prepass.prepare({width:size,height:size,slots:1},s.bank!.preparedResources());
    }else{
      s.composite.reset();const size=service.endsWith('size')?8:4;
      s.composite.prepare({width:size,height:size,operations:['alphaDarken32','over32']},[...s.bank!.preparedResources(),...s.prepass.preparedResources()]);
    }
    const getters=vi.spyOn(s.gl,'getParameter');getters.mockClear();
    expect(()=>s.executor.advance()).toThrow('capacity/epoch');expect(resolve).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();expect(getters).not.toHaveBeenCalled();
    expect(s.executor.poisoned).toBe(true);expect(s.poison).toHaveBeenCalledTimes(1);expect(s.executor.pending).toBe(false);
  }finally{s.close()}
});


it('captures one union state before real target preparation instead of recapturing inside its draw batch',()=>{
  const s=setup(),info=s.prepass.brushGlBatchInfo(),other=s.composite.brushGlBatchInfo(),query=vi.spyOn(s.gl,'getParameter');
  try{
    const restore=saveBrushGlState(s.gl,[...new Set([...info.attributes,...other.attributes])],info.instancing,info.vertexArrays,3);
    const captureOnly=(calls:unknown[][])=>calls.map(c=>c[0]).filter(k=>k!==s.gl.TEXTURE_BINDING_2D&&k!==s.gl.FRAMEBUFFER_BINDING);
    const expected=captureOnly(query.mock.calls);restore();query.mockClear();
    const before=s.snapshot();s.executor.enqueue(s.submit());s.drain();
    // This mock implements getTexParameter/FBO attachment queries through
    // getParameter(binding); those identity checks are not extra full captures.
    expect(captureOnly(query.mock.calls)).toEqual(expected);expect(s.snapshot()).toEqual(before);
  }finally{s.close()}
});
it('fails closed when target preparation reenters canonical state ownership, before pixels or escaped leases',()=>{
  const s=setup(),before=s.snapshot(),draw=vi.spyOn(s.composite,'drawSource'),baseline=s.cpu.reservedBytes;
  const resolve=vi.spyOn(s.layer,'resolveForPaint').mockImplementation(()=>{
    s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer());
    runBrushGlTurn({participants:[s.prepass,s.composite]},()=>{});return [];
  });
  try{
    s.executor.enqueue(s.submit());expect(()=>s.executor.advance()).toThrow('Nested');
    expect(resolve).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled();expect(s.executor.poisoned).toBe(true);
    expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(baseline);
    expect(s.cache['leases'].size).toBe(0);for(const release of s.releases)expect(release).toHaveBeenCalledOnce();
  }finally{s.close()}
});


describe('Gaussian data-only boundary',()=>{
  it('rejects the new Gaussian tag before layer/assets/preparation/reservations',()=>{
    const s=setup(),snapshot=s.snapshot(), target=vi.spyOn(s.layer,'resolveForPaint'), bank=vi.spyOn(s.bank!,'preparedResources'), prepared=vi.spyOn(s.prepass,'preparedCapacity')
    try{
      const f=decoded(1)
      const input={...s.submit(f),frame:{...f,definitions:[{kind:'gaussianAuto'}]} as unknown as CanonicalFrameSubmission['frame']}
      expect(()=>s.executor.enqueue(input)).toThrow(/requires a trusted canonical executor raster grant/)
      expect(target).not.toHaveBeenCalled();expect(bank).not.toHaveBeenCalled();expect(prepared).not.toHaveBeenCalled()
      expect(s.reserveTransient).not.toHaveBeenCalled();expect(s.executor.pending).toBe(false)
      expect(s.snapshot()).toEqual(snapshot)
    }finally{s.close()}
  })
})

describe('deposition-only wash ownership', () => {
  const raw = () => setup('wash', 4, 4, undefined, 'reference-scalar-f32-rne-v1', undefined, 4, 'deposition-only')
  it('keeps raw local separate from stable pixels and transfers sealed ownership once', () => {
    const s = raw(), calls = vi.spyOn(s.composite, 'drawSource')
    let ownership: ReturnType<CanonicalFrameExecutor['takeRawWash']> | undefined
    try {
      s.executor.enqueue(s.submit(decoded(1, 0, false))); s.drain()
      expect(calls.mock.calls.every(([r]) => r.operation.kind === 'alphaDarken32')).toBe(true)
      expect(calls.mock.calls.every(([r]) => r.target.texture !== s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0].buffer.texture)).toBe(true)
      expect(s.executor.rawWashTiles()).toHaveLength(1)
      expect(s.executor.checkpointReady).toBe(false)
      expect(() => s.executor.takeRawWash()).toThrow(/sealed/)
      s.executor.enqueue(s.submit(decoded(0, 0, true, {phase:'primary',group:0}), 1)); s.drain()
      expect(s.executor.rawWashSealed).toBe(true)
      expect(s.scratch.bytes.live).toBe(64) // ONE raw local, no captured original
      ownership = s.executor.takeRawWash()
      expect(ownership.tiles).toHaveLength(1)
      expect(s.executor.checkpointReady).toBe(true)
      expect(() => s.executor.takeRawWash()).toThrow()
      expect(s.releases.every(r => r.mock.calls.length === 0)).toBe(true)
      ownership.release(); ownership.release()
      expect(s.scratch.bytes.live).toBe(0)
      expect(s.releases.every(r => r.mock.calls.length === 1)).toBe(true)
      expect(() => ownership!.tiles[0].view.residency.kind === 'external' && ownership!.tiles[0].view.residency.lease()).toThrow(/Stale/)
    } finally { ownership?.release(); s.close() }
  })
  it('rejects mutations while borrowed and rejects pretend context loss before releasing', () => {
    const s = raw()
    let ownership: ReturnType<CanonicalFrameExecutor['takeRawWash']> | undefined
    try {
      s.executor.enqueue(s.submit()); s.drain()
      const view=s.executor.rawWashTiles()[0].view
      if(view.residency.kind!=='external')throw new Error('expected raw owner')
      const release=view.residency.lease()
      expect(()=>s.executor.cancel()).toThrow(/batch/)
      expect(()=>s.executor.takeRawWash()).toThrow(/leased/)
      release();release();ownership=s.executor.takeRawWash()
      expect(()=>ownership!.release({lost:true})).toThrow(/live/)
      expect(s.scratch.bytes.live).toBe(64)
      ownership.release()
    } finally { ownership?.release();s.close() }
  })
})


describe('recorded same-layer concurrent wash lane', () => {
  function lane(tileSize=1,capacity=1) {
    const s=setup('wash',tileSize,capacity), derived=new TiledLayerBuffer(s.gl,tileSize,tileSize,undefined,undefined,undefined,'straight-rgba8')
    const pixels=new Map<WebGLTexture,Rgba8>()
    const copy=AccumulationBuffer.prototype.copyTo, clear=AccumulationBuffer.prototype.clear
    const copySpy=vi.spyOn(AccumulationBuffer.prototype,'copyTo').mockImplementation(function(this:AccumulationBuffer, destination:AccumulationBuffer){
      copy.call(this,destination);pixels.set(destination.texture,[...(pixels.get(this.texture)??[0,0,0,0])] as Rgba8)
    })
    const clearSpy=vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer){
      clear.call(this);pixels.set(this.texture,[0,0,0,0])
    })
    const draw=s.composite.drawSource.bind(s.composite)
    const calls=vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{
      const result=draw(request,frame)
      if(result==='empty')return result
      const dst=pixels.get((request.readDestination??request.target).texture)??[0,0,0,0]
      const src:Rgba8=request.source.kind==='maskRgb'?[...request.source.rgb,255]:pixels.get(request.source.view.texture)??[0,0,0,0]
      if(request.operation.kind==='alphaDarken32')pixels.set(request.target.texture,compositeSourceAlphaDarken32(src,dst,request.operation.control))
      else if(request.operation.kind==='over32')pixels.set(request.target.texture,compositeSourceOver32Scalar(src,dst,request.operation.control))
      else throw new Error('reference numerical profile expected')
      return result
    })
    const source=vi.fn(()=>({bank:s.bank}))
    const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:'reference-scalar-f32-rne-v1',layerId:'layer',layerEpoch:0,maxGestures:4,
      prepass:s.prepass,composite:s.composite,scratch:s.scratch,layer:()=>({buffer:s.layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),
      source,reserveTransient:s.reserveTransient,changed:s.changed,poison:s.poison})
    const frame=(id:string,opacity:number,end:boolean,ordinal=0):CanonicalFrameSubmission=>{
      const f=structuredClone(decoded(1,0,end,ordinal?{phase:'primary',group:0}:{phase:'between'}))
      const frame={...f,draws:f.draws.map(d=>({...d,opacity,flow:1}))}
      return {...s.submit(frame,ordinal),gestureId:id,rgb:id==='A'?[255,0,0]:[0,0,255],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'}}
    }
    const drain=()=>{let n=0;while(coordinator.pending&&n++<300)coordinator.advance();expect(n).toBeLessThan(300)}
    const pixel=(layer:TiledLayerBuffer)=>pixels.get(layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0].buffer.texture)??[0,0,0,0]
    const close=()=>{coordinator.cancel();calls.mockRestore();copySpy.mockRestore();clearSpy.mockRestore();derived.destroy();s.close()}
    return {...s,coordinator,derived,pixels,calls,frame,drain,pixel,close,source}
  }
  it('rebases A0/B0/A1 from stable and commits A then sealed B even when B ends first',()=>{
    const s=lane()
    try{
      s.coordinator.enqueue(s.frame('A',128/255,false),1);s.drain()
      expect(s.pixel(s.layer)).toEqual([0,0,0,0])
      expect(s.pixel(s.derived)).toEqual([255,0,0,128])
      s.coordinator.enqueue(s.frame('B',128/255,true),2);s.drain()
      expect(s.pixel(s.layer)).toEqual([0,0,0,0]) // B is sealed, frontier A is open
      expect(s.pixel(s.derived)).toEqual([85,0,170,192])
      expect(s.coordinator.checkpointReady).toBe(false)
      s.coordinator.enqueue(s.frame('A',192/255,true,1),3);s.drain()
      expect(s.pixel(s.layer)).toEqual([109,0,146,224])
      expect(s.pixel(s.derived)).toEqual(s.pixel(s.layer))
      expect(s.coordinator.checkpointReady).toBe(true)
      expect(s.scratch.bytes.live).toBe(0)
      expect(()=>s.coordinator.enqueue(s.frame('A',1,true),4)).toThrow(/sealed/)
    }finally{s.close()}
  })
  it('queued interleaving produces the same final bytes as incremental recorded replay',()=>{
    const s=lane()
    try{
      s.coordinator.enqueue(s.frame('A',128/255,false),1)
      s.coordinator.enqueue(s.frame('B',128/255,true),2)
      s.coordinator.enqueue(s.frame('A',192/255,true,1),3)
      s.drain()
      expect(s.pixel(s.layer)).toEqual([109,0,146,224])
      expect(s.coordinator.checkpointReady).toBe(true)
      expect(s.poison).not.toHaveBeenCalled()
    }finally{s.close()}
  })
  it('validates monotonic sequence and reservations before changing the lane',()=>{
    const s=lane()
    try{
      s.reserveTransient.mockImplementationOnce(()=>{throw new Error('fence denied')})
      expect(()=>s.coordinator.enqueue(s.frame('A',.5,false),1)).toThrow(/denied/)
      expect(s.coordinator.pending).toBe(false)
      expect(s.layer.gpuAllocationSnapshot()).toHaveLength(0)
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.drain()
      const before=s.pixel(s.derived)
      expect(()=>s.coordinator.enqueue(s.frame('B',.5,true),1)).toThrow(/order/)
      expect(s.pixel(s.derived)).toEqual(before)
    }finally{s.close()}
  })
  it('applies outer opacity once on each fresh rebase, never over its previous preview',()=>{
    const s=lane()
    try{
      const a0=s.frame('A',128/255,false),a={...a0,composition:{...a0.composition,outerResourceOpacity:.5}}
      const b0=s.frame('B',128/255,true),b={...b0,composition:{...b0.composition,outerResourceOpacity:.5}}
      s.coordinator.enqueue(a,1);s.drain();s.coordinator.enqueue(b,2);s.drain()
      const expected=compositeSourceOver32Scalar([0,0,255,128],compositeSourceOver32Scalar([255,0,0,128],[0,0,0,0],{profile:'portable-f32-division-rne-v1',opacity:.5}),{profile:'portable-f32-division-rne-v1',opacity:.5})
      expect(s.pixel(s.derived)).toEqual(expected)
      const before=s.calls.mock.calls.length;s.coordinator.advance();s.coordinator.advance()
      expect(s.calls.mock.calls.length).toBe(before)
      expect(s.pixel(s.derived)).toEqual(expected)
      const last=s.frame('A',192/255,true,1),end={...last,composition:{...last.composition,outerResourceOpacity:.5}}
      s.coordinator.enqueue(end,3);s.drain()
      const final=compositeSourceOver32Scalar([0,0,255,128],compositeSourceOver32Scalar([255,0,0,192],[0,0,0,0],{profile:'portable-f32-division-rne-v1',opacity:.5}),{profile:'portable-f32-division-rne-v1',opacity:.5})
      expect(s.pixel(s.layer)).toEqual(final);expect(s.pixel(s.derived)).toEqual(final)
    }finally{s.close()}
  })
  it('poisons and releases every local/reservation after a partial draw failure even when notification throws',()=>{
    const s=lane()
    try{
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.drain()
      s.coordinator.enqueue(s.frame('B',.5,true),2)
      s.poison.mockImplementation(()=>{throw new Error('notification failed')})
      s.calls.mockImplementationOnce(()=>{throw new Error('pixel failed')})
      expect(()=>s.coordinator.advance()).toThrow('pixel failed')
      expect(s.coordinator.poisoned).toBe(true)
      expect(s.coordinator.checkpointReady).toBe(false)
      expect(s.scratch.bytes.live).toBe(0)
      expect(s.releases.every(r=>r.mock.calls.length===1)).toBe(true)
      expect(s.coordinator.cleanupFailures.length).toBeGreaterThan(0)
      expect(()=>s.coordinator.advance()).toThrow(/poisoned/)
    }finally{s.close()}
  })
  it('does not release lost-context handles to the pool and rejects fake loss before changing ownership',()=>{
    const s=lane()
    try{
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.drain()
      expect(()=>s.coordinator.cancel(undefined,{lost:true})).toThrow(/live/)
      expect(s.coordinator.poisoned).toBe(false)
      const release=vi.spyOn(s.scratch,'release'),deleteTexture=s.gl.deleteTexture.mock.calls.length
      s.gl.isContextLost=()=>true
      s.coordinator.cancel(undefined,{lost:true})
      expect(release).not.toHaveBeenCalled()
      expect(s.gl.deleteTexture.mock.calls.length).toBe(deleteTexture)
      expect(s.releases.every(r=>r.mock.calls.length===1)).toBe(true)
      s.scratch.forget();s.gl.isContextLost=()=>false
    }finally{s.close()}
  })

  it('preserves partial commit/rebase cursors across bounded turns without duplicate tile parts',()=>{
    const s=lane(4,1)
    try{
      const snapshot=s.snapshot()
      s.coordinator.enqueue(s.frame('A',.5,true),1);s.drain()
      const stable=s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0].buffer.texture
      const parts=s.calls.mock.calls.filter(([r])=>r.source.kind==='straightRgba8'&&r.target.texture===stable).map(([r])=>`${r.source.view.rect.x}:${r.source.view.rect.y}`)
      expect(parts).toHaveLength(16);expect(new Set(parts).size).toBe(16)
      expect(s.coordinator.checkpointReady).toBe(true)
      expect(s.snapshot()).toEqual(snapshot)
    }finally{s.close()}
  })
  it('prevents admission reentry from trusted binding callbacks without consuming the sequence',()=>{
    const s=lane()
    try{
      s.source.mockImplementationOnce(()=>{
        expect(()=>s.coordinator.enqueue(s.frame('B',.5,true),1)).toThrow(/busy/)
        return{bank:s.bank}
      })
      s.coordinator.enqueue(s.frame('A',.5,true),1);s.drain()
      expect(s.source).toHaveBeenCalledTimes(1)
      expect(s.coordinator.checkpointReady).toBe(true)
    }finally{s.close()}
  })

})


describe('Gaussian through the SAME bounded frame executor', () => {
  for (const profile of ['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const) it(`executes ready7 actual sources without an image bank under ${profile}`, () => {
    for (const index of [2,5,6,7,10,11,22]) {
      const row=gaussianStock.rows.find(r=>r.index===index)!
      const pin=canonicalGaussianAutoSourceBinding(row.descriptor as unknown as BrushDescriptor,row.descriptorSHA256,profile)
      // Explicit diagnostic captured shape, not the native UI Size setter law.
      const scale=Math.min(.2,24/pin.source.diameter)
      const expected=sourceGaussianDab({dialect:'krita-gaussian-auto-qt5-arm64-v1',tip:{...pin.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},storedScale:pin.brushScale,storedAngle:pin.brushAngle,shape:{scale,ratio:1,rotation:0},subpixelX:0,subpixelY:0,coverageProfile:profile,maxPixels:1048576,maxWorkSamples:16777216})
      const [width,height]=expected.geometry.maskSize
      const r:CanonicalGaussianAutoRecipe={kind:'gaussianAuto',source:pin.source,coverageProfile:profile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale,ratio:1,rotation:0,subX:0,subY:0,width,height,mirrorH:false,mirrorV:false}
      const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:16777216,outputBytes:4194304,drawPixels:1048576}}
      const frame=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:r,role:'primary',x:0,y:0,opacity:.5,flow:.7}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},context).frame
      const s=setup('wash',64,64,undefined,CANONICAL_STROKE_RASTER_PROFILE,pin,8)
      const uploaded:number[]=[], calls=vi.spyOn(s.composite,'drawSource')
      s.gl.texSubImage2D.mockImplementation((...args:unknown[])=>{const bytes=args[8];if(bytes instanceof Uint8Array)uploaded.push(...bytes)})
      try {
        const baseline=s.cpu.reservedBytes
        expect(s.bank).toBeUndefined()
        s.executor.enqueue({...s.submit(),frame,assets:[]})
        const target=vi.spyOn(s.layer,'resolveForPaint')
        let clock=0
        const now=vi.spyOn(performance,'now').mockImplementation(()=>clock+=5)
        try { expect(s.executor.advance().pending).toBe(true) } finally { now.mockRestore() }
        expect(target).not.toHaveBeenCalled();expect(uploaded).toEqual([])
        let count=0
        while(s.executor.pending&&count++<1000)s.executor.advance()
        expect(count).toBeLessThan(1000)
        expect(s.executor.checkpointReady).toBe(true)
        expect(s.executor.poisoned).toBe(false)
        expect(uploaded).toEqual([...expected.mask].flatMap(alpha=>[alpha,alpha,alpha,alpha]))
        expect(calls.mock.calls.length).toBeGreaterThan(0)
        for(const [call] of calls.mock.calls) {
          const b=call.writeBounds
          // Deposition clips the full original mask; presentation uses a local
          // source view whose rectangle itself is partitioned by pass capacity.
          expect(b ? b.maxX-b.minX : call.source.view.rect.width).toBeLessThanOrEqual(8)
          expect(b ? b.maxY-b.minY : call.source.view.rect.height).toBeLessThanOrEqual(8)
        }
        expect(s.cpu.reservedBytes).toBe(baseline)
        expect(s.scratch.bytes.live).toBe(0)
      } finally {s.close()}
    }
  })
})
