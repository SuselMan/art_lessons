import {CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE} from '@grafetto/shared'
import {compositeSourceFused32} from '../presets/sourceFused32'
import {compositeRgba8,SOURCE_RGBA8_GENERIC_SC_PROFILE} from '../presets/sourceColorRgba8'
import gaussianStock from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native'
import { sourceGaussianDab } from '../presets/sourceGaussianDab'
import { canonicalGaussianAutoSourceBinding, type CanonicalAutoSource, type CanonicalGaussianAutoRecipe } from '@grafetto/shared'
import { CanonicalWashLayerCoordinator } from './CanonicalWashLayerCoordinator'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import {attachContextStorage,snapshotContextStorage} from '../buffers/ContextStorageOwner'
import { compositeSourceAlphaDarken32 } from '../presets/sourceAlphaDarken32'
import { compositeSourceOver32Scalar } from '../presets/sourceOver32Scalar'
import type { Rgba8 } from '../presets/mixWeightedRgba8'
import { saveBrushGlState } from './BrushGlState'
import { runBrushGlTurn, runBrushGlBatch } from './BrushGlBatch'
import { prepareSourceDefaultAutoDab, sourceDefaultAutoDab } from '../presets/sourceDefaultAutoDab'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import { sourceStrokeAuthorDescriptor } from '../presets/sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket } from '../presets/sourceStrokeAuthor'
import { describe, expect, it, vi } from 'vitest'
import { CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE, CANONICAL_MATERIAL_PROFILE, CANONICAL_STROKE_RASTER_PROFILE, CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE, packCanonicalMaterial, unpackCanonicalMaterial, canonicalDefaultAutoSourceBinding, buildCanonicalMaterial, type BrushDescriptor, type CanonicalDefaultAutoSource, type CanonicalDefaultAutoRecipe, type CanonicalMaterialContextV2, type BrushTip, type CanonicalMaterialFrame, type CanonicalMaterialRecipe, type TipMaskId } from '@grafetto/shared'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES } from './TransformedMaskPrepass'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { RibbonScratchPool } from '../buffers/RibbonScratchPool'
import { sourceBlendAverageOpacity } from '../presets/brushWash'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { CanonicalMaskSourceBank } from './CanonicalMaskSourceBank'
import { TransformedMaskPrepass } from './TransformedMaskPrepass'
import { CanonicalRgba8CompositePass } from './CanonicalRgba8CompositePass'
import { canonicalWashOuterOperation, canonicalExecutorOperations, CanonicalFrameExecutor, type CanonicalFrameSubmission, type CanonicalExecutorRasterProfile } from './CanonicalFrameExecutor'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
import { canonicalSoftAutoSourcePin, type CanonicalSoftAutoSource, type CanonicalSoftAutoRecipe } from '@grafetto/shared'
import softTables from '../presets/fixtures/sourceSoftCircle/tables.native.json'
import softMasks from '../presets/fixtures/sourceSoftCircle/whole.native.json'
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
function setup(mode: 'wash' | 'buildup' = 'buildup', tileSize = 4, capacity = 4, tileBudget?: number, rasterProfile: CanonicalExecutorRasterProfile = 'reference-scalar-f32-rne-v1', autoSource?: CanonicalAutoSource|CanonicalSoftAutoSource, compositeCapacity = capacity, washMode?: 'exclusive' | 'deposition-only', sourceMaterial?:CanonicalMaterialContextV2) {
  const { gl, snapshot } = recordingGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache()
  gl.TEXTURE1 = gl.TEXTURE0 + 1; gl.STATIC_DRAW = 9001; gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 9002
  gl.LINEAR = 9010; gl.REPEAT = 9011
  gl.UNPACK_FLIP_Y_WEBGL=9201;gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL=9202
  const originalPixelStore=gl.pixelStorei,originalParameter=gl.getParameter,uploadFlags=new Map([[9201,true],[9202,true]])
  gl.pixelStorei=(key:number,value:number|boolean)=>uploadFlags.has(key)?uploadFlags.set(key,!!value):originalPixelStore(key,value)
  gl.getParameter=(key:number)=>uploadFlags.has(key)?uploadFlags.get(key):originalParameter(key)
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
  const image2=sourceMaterial?.primarySource.kind==='image'
  const bank = autoSource ? undefined : image2?new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency'):new CanonicalMaskSourceBank(gl, cache, cpu, [{ id: id as TipMaskId, tip, assetSide: 1, readOriginalCoverage: () => new Uint8Array([255]) }], { gpuBytes: 0, cpuBytes: 0 })
  const preparation=image2?bank!.prepareRoot([{asset,frameIndex:0,sourceSlot:0,readOriginalCoverage:()=>new Uint8Array([255])}],{gpuBytes:0,cpuBytes:0},[{asset,indexes:[canonicalTransformedMaskMetadata(recipe,asset).index]}]):undefined
  preparation?.jobs.forEach((_,i)=>preparation.prepareJob(i))
  preparation?.assertPreparedPublication()
  const root=preparation?.publish();preparation?.finalizeCleanup()
  if(!image2)bank?.jobs.forEach((_, i) => bank.prepareJob(i))
  const bankResources = root?.preparedResources()??bank?.preparedResources() ?? []
  const prepass = new TransformedMaskPrepass(gl, cache, cpu, 'executor-test')
  prepass.prepare({ width: capacity, height: capacity, slots: 1 }, bankResources)
  const composite = new CanonicalRgba8CompositePass(gl, cache, cpu, 'executor-composite-test')
  composite.prepare({ width: compositeCapacity, height: compositeCapacity, operations: canonicalExecutorOperations(rasterProfile,{masked:!!sourceMaterial?.maskSource}) }, [...bankResources, ...prepass.preparedResources()])
  const rebuild = vi.fn(() => ({ readPixels: () => null, destroy: vi.fn() }))
  const scratch = new RibbonScratchPool(gl), layer = new TiledLayerBuffer(gl, tileSize, tileSize, tileBudget ? rebuild : undefined, tileBudget ? tileBudget * tileSize * tileSize * 4 : undefined, undefined, 'straight-rgba8')
  let epoch = 0
  const releases: ReturnType<typeof vi.fn>[] = [], reserveTransient = vi.fn(() => { const r = vi.fn(); releases.push(r); return r })
  const changed = vi.fn(), poison = vi.fn()
  const executor = new CanonicalFrameExecutor({ washMode, rasterProfile, autoSource, sourceMaterial, bank:root??bank,sourceLease:root, prepass, composite, scratch,
    layer: () => ({ buffer: layer, epoch }), reserveTransient, changed, poison })
  const submit = (frame = decoded(1), ordinal = 0): CanonicalFrameSubmission => ({ gestureId: 'gesture', layerId: 'layer', layerEpoch: 0, ordinal,
    frame, assets: [asset], rgb: [200, 20, 50], composition: { mode, alphaDarken: 'creamy', outerResourceOpacity: .8, outerBlend: 'over' } })
  const prepareStorage=()=>{
    // Preparation-only fixtures spend the physical-stage budget before pixel
    // work. Actual admission/allocation/copy/clear and leases still execute.
    const physical=executor['preparePhysical']
    executor['preparePhysical']=(work,target)=>physical.call(executor,work,target,performance.now()-4)
    try{let n=0;while(executor.pending){const w=executor['queue'][0],p=w.physical;if(p&&w.targetCursor===p.targetCount&&w.scratchCursor===p.scratchCount&&w.washCursor===w.newTiles.length)break;executor.advance();expect(++n).toBeLessThan(400)}}
    finally{executor['preparePhysical']=physical}
  }
  const drain = () => { let n = 0; while (executor.pending && n++ < 200) executor.advance(); expect(n).toBeLessThan(200) }
  const close = () => { executor.cancel();root?.release(); layer.destroy(); scratch.destroy(); prepass.reset(); composite.reset(); bank?.reset();if(image2)cache.clear() }
  return { gl, snapshot, cache, cpu, bank, prepass, composite, scratch, layer, executor, submit, prepareStorage, drain, close, releases, reserveTransient, changed, poison, setEpoch: () => { epoch++ } }
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
      s.prepareStorage()
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
      expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
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
      s.prepareStorage()
      expect(() => s.executor.advance()).toThrow(primary)
      expect(s.executor.cleanupFailures).toEqual([notify, pool, budget])
      expect(returned).toHaveBeenCalledTimes(2)
      for (const release of s.releases) expect(release).toHaveBeenCalledTimes(1)
      expect(s.scratch.bytes.live).toBe(0); expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
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
      expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
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
for(const rasterProfile of [CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE] as const)it.each(['wash', 'buildup'] as const)(`keeps the installed fused Over law through %s commands under ${rasterProfile}`, mode => {
  const s = setup(mode, 4, 2, undefined, rasterProfile), calls = vi.spyOn(s.composite, 'drawSource')
  try {
    s.executor.enqueue(s.submit(decoded(2, 0, false))); s.drain()
    expect(s.executor.checkpointReady).toBe(false)
    s.executor.enqueue(s.submit(decoded(1, 2, true, { phase: 'primary', group: 0 }), 1)); s.drain()
    const requests = calls.mock.calls.map(([request]) => request)
    expect(requests.length).toBeGreaterThanOrEqual(3)
    expect(requests.every(r => 'profile'in r.operation.control&&r.operation.control.profile === CANONICAL_STROKE_RASTER_PROFILE)).toBe(true)
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
  const coverageProfile=pin.coverageProfile;if(coverageProfile!=='scalar-f64-fma-v1'&&coverageProfile!=='neon64-f32-fma-v1')throw Error('Native fixture coverage required');
  const r=prepareSourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip:{...pin.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},
    storedScale:pin.brushScale,storedAngle:pin.brushAngle,shape:{scale:1,ratio:1,rotation:0},subpixelX:0,subpixelY:0,
    coverageProfile,maxPixels:1048576,maxWorkSamples:16*1048576});
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
    s.executor.cancel();expect(s.poison).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES);
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
    s.executor.enqueue({...s.submit(),frame:f});expect(s.executor['planned']!.drawCount).toBe(1);s.prepareStorage();
    s.executor.advance();expect(s.executor['queue'][0].draw).toBe(0);expect(s.executor['queue'][0].paintPart).toBe(1);expect(calls).toHaveBeenCalledTimes(1);
    s.executor.advance();expect(s.executor['queue'][0].draw).toBe(0);expect(s.executor['queue'][0].paintPart).toBe(2);expect(calls).toHaveBeenCalledTimes(2);
    const a=calls.mock.calls[0][0].writeBounds!,b=calls.mock.calls[1][0].writeBounds!;expect(a.maxX).toBe(b.minX);
    s.executor.cancel();expect(s.executor.poisoned).toBe(true);expect(s.poison).toHaveBeenCalledTimes(1);
    expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES);for(const release of s.releases)expect(release).toHaveBeenCalledTimes(1);
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
    s.executor.enqueue(s.submit());s.prepareStorage();query.mockClear();const before=s.snapshot();s.drain();
    // This mock implements getTexParameter/FBO attachment queries through
    // getParameter(binding); those identity checks are not extra full captures.
    expect(captureOnly(query.mock.calls)).toEqual(expected);expect(s.snapshot()).toEqual(before);
  }finally{s.close()}
});
it('fails closed when target preparation reenters canonical state ownership, before pixels or escaped leases',()=>{
  const s=setup(),before=s.snapshot(),draw=vi.spyOn(s.composite,'drawSource'),baseline=s.cpu.reservedBytes;
  s.executor.enqueue(s.submit());s.prepareStorage()
  const resolve=vi.spyOn(s.layer,'resolveForPaint').mockImplementation(()=>{
    s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer());
    runBrushGlTurn({participants:[s.prepass,s.composite]},()=>{});return [];
  });
  try{
    expect(()=>s.executor.advance()).toThrow('Nested');
    expect(resolve).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled();expect(s.executor.poisoned).toBe(true);
    expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES);
    expect(s.prepass['defaultRecord']!.leases.size).toBe(0);expect(s.cache['leases'].size).toBe(1);for(const release of s.releases)expect(release).toHaveBeenCalledOnce();
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
  it('refuses a raw borrow from a retired storage generation even with the same WebGL handles',()=>{
    const s=raw();let release:(()=>void)|undefined
    try{
      s.executor.enqueue(s.submit());s.drain()
      const view=s.executor.rawWashTiles()[0].view,owner=view.residency
      if(owner.kind!=='external')throw Error('Expected raw owner')
      const local=s.scratch.gpuAllocationSnapshot().find(item=>item.state==='live')!.buffer,texture=local.texture
      expect(local.storageOwnerCurrent).toBe(true)
      // Isolated recording GL only: retire its ledger generation without
      // changing mock WebGL names, so rawOwner.alive alone cannot authorize it.
      AccumulationBuffer.forgetContextStorage(s.gl)
      expect(s.gl.isContextLost()).toBe(false);expect(local.texture).toBe(texture)
      expect(local.storageOwnerCurrent).toBe(false);expect(s.executor['rawOwner'].alive).toBe(true)
      expect(()=>{release=owner.lease()}).toThrow(/Stale/)
      expect(s.executor['rawOwner'].leases).toBe(0)
      const before=s.cpu.reservedBytes;expect(()=>s.executor.cancel()).toThrow(/stale/);expect(s.cpu.reservedBytes).toBeLessThan(before);expect(s.executor['maskLease']).toBeUndefined()
    }finally{release?.();s.close()}
  })
  it('declares only the actual live nearest pool local as a lifetime-owned point sampler',()=>{
    const s=raw()
    try{
      s.executor.enqueue(s.submit());s.drain()
      const view=s.executor.rawWashTiles()[0].view,owner=view.residency
      if(owner.kind!=='external')throw Error('Expected raw owner')
      const fixed=owner.ownedFramebufferLayouts!
      expect(fixed).toHaveLength(1);expect(Object.isFrozen(fixed)).toBe(true)
      expect(fixed[0].certificate.texture).toBe(view.texture);expect(fixed[0].source.verifiedFramebufferLayout).toBe(fixed[0].certificate)
      expect(fixed[0].originX).toBe(view.rect.x);expect(fixed[0].originY).toBe(view.rect.y)
      const sampler=owner.ownedPointSampler!
      expect(Object.isFrozen(sampler)).toBe(true);expect(sampler.texture).toBe(view.texture)
      expect(sampler.source.texture).toBe(view.texture);expect(sampler.epoch).toBe(owner.owner);expect(sampler.epoch.alive).toBe(true)
      const query=vi.spyOn(s.gl,'getTexParameter')
      runBrushGlBatch({participants:[s.prepass,s.composite],owners:[owner]},frame=>{s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,view.texture);frame.pointSampling(view.texture)})
      expect(query).not.toHaveBeenCalled();s.executor.cancel();expect(sampler.epoch.alive).toBe(false)
      expect(()=>runBrushGlBatch({participants:[s.prepass,s.composite],owners:[owner]},()=>{})).toThrow(/owned sampler/)
      expect(s.scratch.bytes.live).toBe(0)
    }finally{s.close()}
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
  function lane(tileSize=1,capacity=1,rasterProfile:CanonicalExecutorRasterProfile='reference-scalar-f32-rne-v1') {
    const s=setup('wash',tileSize,capacity,undefined,rasterProfile), derived=new TiledLayerBuffer(s.gl,tileSize,tileSize,undefined,undefined,undefined,'straight-rgba8')
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
      else if(request.operation.kind==='alphaDarkenBrowserFloat')pixels.set(request.target.texture,compositeSourceAlphaDarken32(src,dst,{...request.operation.control,profile:'optimized32-scalar-f32-rne-v1'}))
      else if(request.operation.kind==='overBrowserFloat')pixels.set(request.target.texture,compositeSourceOver32Scalar(src,dst,{...request.operation.control,profile:'portable-f32-division-rne-v1'}))
      else if(request.operation.kind==='genericSCU8')pixels.set(request.target.texture,compositeRgba8(src,dst,request.operation.control))
      else if(request.operation.kind==='alphaDarken32FusedScalar'||request.operation.kind==='over32FusedScalar'){
        const c=request.operation.control,operator=request.operation.kind==='over32FusedScalar'?'over':'variant' in c&&c.variant==='hard'?'alphaDarkenHard':'alphaDarkenCreamy'
        const out=compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator,source:Uint8Array.from(src),destination:Uint8Array.from(dst),cols:1,rows:1,sourceStride:4,destinationStride:4,maskStride:0,sourceAlignment:0,destinationAlignment:0,opacity:c.opacity,averageOpacity:'averageOpacity' in c?c.averageOpacity:c.opacity,flow:'flow'in c?c.flow:1}).pixels
        pixels.set(request.target.texture,[out[0],out[1],out[2],out[3]])
      }else throw new Error('unsupported numerical profile')
      return result
    })
    const source=vi.fn(()=>({bank:s.bank}))
    const coordinator=new CanonicalWashLayerCoordinator({rasterProfile,layerId:'layer',layerEpoch:0,maxGestures:4,
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
  it('browser profile folds open preview and stable close using ordinary CPU composition over a nontransparent target',()=>{
    const s=lane(1,1,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE)
    try{
      const base:Rgba8=[17,81,133,151],tile=s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0]
      s.pixels.set(tile.buffer.texture,base)
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.drain()
      const local=compositeSourceAlphaDarken32([255,0,0,255],[0,0,0,0],{profile:'optimized32-scalar-f32-rne-v1',variant:'creamy',opacity:.5,averageOpacity:.5,flow:1})
      const expected=compositeSourceOver32Scalar(local,base,{profile:'portable-f32-division-rne-v1',opacity:1})
      expect(s.pixel(s.derived)).toEqual(expected);expect(s.pixel(s.layer)).toEqual(base)
      expect(s.calls.mock.calls.some(([r])=>r.operation.kind==='alphaDarkenBrowserFloat')).toBe(true)
      expect(s.calls.mock.calls.some(([r])=>r.operation.kind==='overBrowserFloat')).toBe(true)
      expect(s.calls.mock.calls.some(([r])=>r.operation.kind==='alphaDarken32FusedScalar'||r.operation.kind==='over32FusedScalar')).toBe(false)
      s.coordinator.enqueueRecordedClose('A',1,2);s.drain();expect(s.pixel(s.layer)).toEqual(expected);expect(s.coordinator.checkpointReady).toBe(true)
    }finally{s.close()}
  })
  for(const drained of [false,true])it(`closes recorded peers in first-recorded order without a tail frame (drained=${drained})`,()=>{
    const s=lane()
    try{
      s.coordinator.enqueue(s.frame('A',128/255,false),1)
      s.coordinator.enqueue(s.frame('B',128/255,false),2)
      if(drained)s.drain()
      const calls=s.calls.mock.calls.length
      s.coordinator.enqueueRecordedClose('B',1,3)
      expect(s.calls).toHaveBeenCalledTimes(calls)
      if(drained){s.drain();expect(s.pixel(s.layer)).toEqual([0,0,0,0]);expect(s.coordinator.checkpointReady).toBe(false)}
      s.coordinator.enqueueRecordedClose('A',1,4);s.drain()
      expect(s.pixel(s.layer)).toEqual([85,0,170,192]);expect(s.pixel(s.derived)).toEqual(s.pixel(s.layer))
      expect(s.coordinator.checkpointReady).toBe(true);expect(s.scratch.bytes.live).toBe(0)
      expect(s.source).toHaveBeenCalledTimes(2)
      expect(()=>s.coordinator.enqueueRecordedClose('A',1,5)).toThrow()
      expect(()=>s.coordinator.enqueue(s.frame('A',1,true,1),5)).toThrow()
    }finally{s.close()}
  })
  it('rejects a close with missing target, stale sequence or wrong prefix without sealing existing peers',()=>{
    const s=lane()
    try{
      s.coordinator.enqueue(s.frame('A',.5,false),1)
      for(const args of [['missing',1,2],['A',1,1],['A',0,2],['A',2,2]] as const)
        expect(()=>s.coordinator.enqueueRecordedClose(args[0],args[1],args[2])).toThrow()
      expect(s.coordinator['lastSequence']).toBe(1);expect(s.coordinator.poisoned).toBe(false)
      s.coordinator.enqueueRecordedClose('A',1,2);s.drain();expect(s.coordinator.checkpointReady).toBe(true)
      expect(s.source).toHaveBeenCalledTimes(1)
    }finally{s.close()}
  })
  it('retires the whole lane if draining recorded closure cleanup fails after acceptance',()=>{
    const s=lane(),primary=new Error('close cleanup failed')
    try{
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.drain()
      const executor=s.coordinator['entries'][0].executor,captured=executor['maskParticipant']
      executor['maskLease']={...captured,isReady:()=>captured.isReady(),preparedCapacity:()=>captured.preparedCapacity(),releaseOwner:()=>{throw primary},release:()=>captured.release()}
      expect(()=>s.coordinator.enqueueRecordedClose('A',1,2)).toThrow(primary)
      expect(s.coordinator.poisoned).toBe(true);expect(s.coordinator.pending).toBe(false)
      expect(s.scratch.bytes.live).toBe(0);expect(s.layer['retainedTargets'].size).toBe(0)
      expect(s.poison).toHaveBeenCalledWith('layer',primary)
    }finally{s.close()}
  })
  for(const [outerBlend,peerBlend] of [['multiply','lighten'],['lighten','overlay'],['colorDodge','multiply'],['overlay','colorDodge']] as const)it(`uses ${outerBlend}/${peerBlend} identically for ordered previews and stable commits over existing pixels`,()=>{
    const s=lane(1,1,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE), original:Rgba8=[27,143,209,177]
    const blend=(src:Rgba8,dst:Rgba8,mode:'multiply'|'lighten'|'colorDodge'|'overlay')=>compositeRgba8(src,dst,{mode,profile:SOURCE_RGBA8_GENERIC_SC_PROFILE,opacity:.63})
    const input=(id:string,opacity:number,end:boolean,ordinal:number,outerBlend:'multiply'|'lighten'|'colorDodge'|'overlay')=>{const f=s.frame(id,opacity,end,ordinal);return{...f,composition:{...f.composition,outerBlend,outerResourceOpacity:.63}}}
    try{
      const target=s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0];s.pixels.set(target.buffer.texture,original)
      const a=input('A',128/255,false,0,outerBlend);s.coordinator.enqueue(a,1);Reflect.set(a.composition,'outerBlend','over');s.drain()
      expect(s.pixel(s.layer)).toEqual(original);expect(s.pixel(s.derived)).toEqual(blend([255,0,0,128],original,outerBlend))
      s.coordinator.enqueue(input('B',128/255,true,0,peerBlend),2);s.drain()
      expect(s.pixel(s.layer)).toEqual(original)
      expect(s.pixel(s.derived)).toEqual(blend([0,0,255,128],blend([255,0,0,128],original,outerBlend),peerBlend))
      s.coordinator.enqueue(input('A',192/255,true,1,outerBlend),3);s.drain()
      const expected=blend([0,0,255,128],blend([255,0,0,192],original,outerBlend),peerBlend)
      expect(s.pixel(s.layer)).toEqual(expected);expect(s.pixel(s.derived)).toEqual(expected);expect(s.coordinator.checkpointReady).toBe(true)
      const requests=s.calls.mock.calls.map(([r])=>r)
      expect(requests.filter(r=>r.source.kind==='maskRgb').every(r=>r.operation.kind==='alphaDarken32FusedScalar')).toBe(true)
      expect(requests.filter(r=>r.source.kind==='straightRgba8').every(r=>r.operation.kind==='genericSCU8'&&r.operation.control.profile===SOURCE_RGBA8_GENERIC_SC_PROFILE&&!('mask'in r.operation.control))).toBe(true)
      expect(s.scratch.bytes.live).toBe(0);expect(s.poison).not.toHaveBeenCalled();s.coordinator.cancel();expect(s.releases.every(r=>r.mock.calls.length===1)).toBe(true)
    }finally{s.close()}
  })
  it('rejects legacy-profile GenericSC before layer resolution, source binding or transient reservations',()=>{
    const s=lane(),resolve=vi.spyOn(s.layer,'resolveForPaint'),baseline=s.cpu.reservedBytes
    try{
      const f=s.frame('A',.5,true);const input={...f,composition:{...f.composition,outerBlend:'multiply' as const}}
      expect(()=>s.coordinator.enqueue(input,1)).toThrow(/pinned raster profile/)
      expect(resolve).not.toHaveBeenCalled();expect(s.source).not.toHaveBeenCalled();expect(s.reserveTransient).not.toHaveBeenCalled()
      expect(s.cpu.reservedBytes).toBe(baseline);expect(s.coordinator.pending).toBe(false)
      s.coordinator.enqueue(f,1);s.drain();expect(s.coordinator.checkpointReady).toBe(true)
    }finally{s.close()}
  })
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
  for(const overlap of [false,true])it(`rebases only dirty pixels while preserving independently folded overlapping=${overlap} gestures`,()=>{
    const s=setup('wash',4,1),derived=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8')
    const rgba=(p:Uint8Array,at:number):Rgba8=>[p[at],p[at+1],p[at+2],p[at+3]]
    const images=new Map<WebGLTexture,Uint8Array>(),blank=()=>new Uint8Array(64),pixels=(texture:WebGLTexture)=>{let p=images.get(texture);if(!p){p=blank();images.set(texture,p)}return p}
    const original=Uint8Array.from({length:64},(_,i)=>i%4===0?17+3*(i/4|0)%4:i%4===1?81+5*(i/16|0):i%4===2?133:151+(i/4|0))
    const copy=AccumulationBuffer.prototype.copyTo,region=AccumulationBuffer.prototype.copyRegionInto,clear=AccumulationBuffer.prototype.clear
    const copySpy=vi.spyOn(AccumulationBuffer.prototype,'copyTo').mockImplementation(function(this:AccumulationBuffer,to:AccumulationBuffer){copy.call(this,to);images.set(to.texture,pixels(this.texture).slice())})
    const regionSpy=vi.spyOn(AccumulationBuffer.prototype,'copyRegionInto').mockImplementation(function(this:AccumulationBuffer,to:AccumulationBuffer,sx:number,sy:number,dx:number,dy:number,w:number,h:number){
      region.call(this,to,sx,sy,dx,dy,w,h)
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels(to.texture).set(pixels(this.texture).subarray(((3-sy-y)*4+sx+x)*4,((3-sy-y)*4+sx+x)*4+4),((3-dy-y)*4+dx+x)*4)
    })
    const clearSpy=vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer){clear.call(this);images.set(this.texture,blank())})
    const draw=s.composite.drawSource.bind(s.composite),requests=vi.spyOn(s.composite,'drawSource').mockImplementation((r,frame)=>{
      const status=draw(r,frame);if(status==='empty')return status
      const v=r.source.view,b=r.writeBounds??{minX:v.rect.x,minY:v.rect.y,maxX:v.rect.x+v.rect.width,maxY:v.rect.y+v.rect.height}
      for(let y=Math.max(0,v.rect.y,b.minY);y<Math.min(4,v.rect.y+v.rect.height,b.maxY);y++)for(let x=Math.max(0,v.rect.x,b.minX);x<Math.min(4,v.rect.x+v.rect.width,b.maxX);x++){
        const at=(y*4+x)*4,dst=rgba(pixels(r.target.texture),at)
        let src:Rgba8
        if(r.source.kind==='maskRgb')src=[...r.source.rgb,255]
        else{if(r.source.kind!=='straightRgba8')throw Error('Unexpected textured source in legacy oracle');const raw=r.source.view,sx=Math.round(raw.bounds.x*raw.textureWidth)+x-raw.rect.x,sy=Math.round((1-raw.bounds.y-raw.bounds.height)*raw.textureHeight)+y-raw.rect.y;src=rgba(pixels(raw.texture),(sy*4+sx)*4)}
        if(r.operation.kind==='alphaDarken32')pixels(r.target.texture).set(compositeSourceAlphaDarken32(src,dst,r.operation.control),at)
        else if(r.operation.kind==='over32')pixels(r.target.texture).set(compositeSourceOver32Scalar(src,dst,r.operation.control),at)
        else throw Error('Unexpected test profile')
      }
      return status
    })
    const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:'reference-scalar-f32-rne-v1',layerId:'layer',layerEpoch:0,maxGestures:2,prepass:s.prepass,composite:s.composite,scratch:s.scratch,layer:()=>({buffer:s.layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),source:()=>({bank:s.bank}),reserveTransient:s.reserveTransient,changed:s.changed,poison:s.poison})
    const locals={A:blank(),B:blank()},colors={A:[255,0,0] as const,B:[0,0,255] as const},ordinals={A:0,B:0}
    const expected=()=>{const out=original.slice();for(let at=0;at<64;at+=4)for(const id of ['A','B'] as const)out.set(compositeSourceOver32Scalar(rgba(locals[id],at),rgba(out,at),{profile:'portable-f32-division-rne-v1',opacity:.63}),at);return out}
    try{
      const target=s.layer.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4})[0];images.set(target.buffer.texture,original.slice())
      // A foreign/stale derived pixel cannot be trusted on first materialization.
      let stale=derived.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4})[0];images.set(stale.buffer.texture,new Uint8Array(64).fill(231))
      const schedule:readonly(readonly['A'|'B',number,number,boolean])[]=[['A',0,0,false],['B',overlap?0:3,overlap?0:3,false],['A',2,1,false],['A',0,0,false],['B',0,0,true],['A',0,0,true]]
      let seq=0
      for(const [id,x,y,end]of schedule){
        const ordinal=ordinals[id]++,f=decoded(end?0:1,0,end,ordinal?{phase:'primary',group:0}:{phase:'between'})
        const frame={...f,draws:f.draws.map(d=>({...d,x,y,opacity:.5,flow:1}))}
        if(!end){const at=(y*4+x)*4;locals[id].set(compositeSourceAlphaDarken32([...colors[id],255],rgba(locals[id],at),{profile:'optimized32-scalar-f32-rne-v1',variant:'creamy',opacity:.5,averageOpacity:.5,flow:1}),at)}
        coordinator.enqueue({...s.submit(frame,ordinal),gestureId:id,rgb:colors[id],composition:{mode:'wash',outerBlend:'over',outerResourceOpacity:.63,alphaDarken:'creamy'}},++seq)
        let turns=0;while(coordinator.pending){coordinator.advance();expect(++turns).toBeLessThan(500)}
        expect(pixels(stale.buffer.texture)).toEqual(expected())
        expect(pixels(target.buffer.texture)).toEqual(seq<schedule.length?original:expected())
        if(overlap&&seq===3){derived.clear();stale=derived.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4})[0];images.set(stale.buffer.texture,new Uint8Array(64).fill(231))}
      }
      expect(regionSpy).toHaveBeenCalled();expect(coordinator.checkpointReady).toBe(true)
      const outer=requests.mock.calls.filter(([r])=>r.source.kind==='straightRgba8')
      expect(outer.some(([r])=>r.source.view.rect.width===1&&r.source.view.rect.height===1)).toBe(true)
      expect(s.poison).not.toHaveBeenCalled()
    }finally{coordinator.cancel();requests.mockRestore();copySpy.mockRestore();regionSpy.mockRestore();clearSpy.mockRestore();derived.destroy();s.close()}
  })
  it('validates dirty geometry before metadata mutation and unions only the existing cropped tile',()=>{
    const s=lane(4,1)
    try{
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.drain()
      const revision=s.coordinator['revision'],dirty=s.coordinator['dirty']
      for(const bounds of [null,{minX:NaN,minY:0,maxX:1,maxY:1},{minX:.5,minY:0,maxX:1,maxY:1},{minX:0,minY:0,maxX:Infinity,maxY:1},{minX:2,minY:0,maxX:1,maxY:1},{minX:0,minY:0,maxX:Number.MAX_SAFE_INTEGER+1,maxY:1}]){
        expect(()=>s.coordinator['invalidate'](bounds!)).toThrow(/dirty bounds/)
        expect(s.coordinator['revision']).toBe(revision);expect(dirty.size).toBe(0)
      }
      s.coordinator['invalidate']({minX:-4,minY:-4,maxX:1,maxY:1})
      expect([...dirty.values()]).toEqual([{minX:0,minY:0,maxX:1,maxY:1}])
      s.coordinator['invalidate']({minX:3,minY:3,maxX:9,maxY:9})
      expect([...dirty.values()]).toEqual([{minX:0,minY:0,maxX:4,maxY:4}])
      expect(s.coordinator['positions'].size).toBe(1);s.drain()
    }finally{s.close()}
  })
  it('presents two resident targets in one guarded pixel turn with no warm preparation-only turns',()=>{
    const s=lane(4,4),clock=vi.spyOn(performance,'now').mockReturnValue(0)
    try{
      const box={minX:0,minY:0,maxX:4,maxY:4},stable=s.layer.resolveForPaint(box)[0],derived=s.derived.resolveForPaint(box)[0]
      s.pixels.set(stable.buffer.texture,[31,42,53,199]);s.pixels.set(derived.buffer.texture,[1,2,3,4])
      s.coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});s.coordinator['invalidate']()
      const uploads=s.gl.texImage2D.mock.calls.length,before=s.snapshot(),copy=vi.spyOn(stable.buffer,'copyTo')
      s.coordinator.advance()
      expect(copy).toHaveBeenCalledOnce();expect(s.coordinator.presentationReady).toBe(true)
      expect(s.pixel(s.derived)).toEqual([31,42,53,199]);expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads)
      expect(s.snapshot()).toEqual(before);expect(s.layer['retainedTargets'].size+s.derived['retainedTargets'].size).toBe(0)
    }finally{clock.mockRestore();s.close()}
  })
  it('materializes cold stable and preview targets in separate turns before copying authoritative pixels',()=>{
    const s=lane(4,4),clock=vi.spyOn(performance,'now').mockReturnValue(0)
    try{
      s.coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});s.coordinator['invalidate']()
      const before=s.snapshot(),uploads=s.gl.texImage2D.mock.calls.length
      s.coordinator.advance();expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads+1);expect(s.calls).not.toHaveBeenCalled();expect(s.snapshot()).toEqual(before)
      const target=s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0];s.pixels.set(target.buffer.texture,[31,42,53,199])
      s.coordinator.advance();expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads+2);expect(s.calls).not.toHaveBeenCalled();expect(s.coordinator.presentationReady).toBe(false)
      s.drain();expect(s.pixel(s.derived)).toEqual([31,42,53,199]);expect(s.coordinator.presentationReady).toBe(true)
      expect(s.layer['retainedTargets'].size).toBe(0);expect(s.derived['retainedTargets'].size).toBe(0)
    }finally{clock.mockRestore();s.close()}
  })
  it('releases nested executor storage pins before external poison can undo either coordinator layer',()=>{
    const s=lane(4,4),clock=vi.spyOn(performance,'now').mockReturnValue(0)
    try{
      s.coordinator.enqueue(s.frame('A',.5,false),1);s.coordinator.advance()
      expect(s.layer['retainedTargets'].size).toBe(1)
      s.poison.mockImplementation(()=>{s.layer.clear();s.derived.clear()})
      s.coordinator.cancel()
      expect(s.layer.tileCount).toBe(0);expect(s.derived.tileCount).toBe(0);expect(s.coordinator.cleanupFailures).toEqual([])
      expect(s.scratch.bytes.live).toBe(0)
    }finally{clock.mockRestore();s.close()}
  })
  it('admits only missing preview bytes at a finite physical cap while keeping logical fences separate',()=>{
    const s=lane(4,4),clock=vi.spyOn(performance,'now').mockReturnValue(0)
    try{
      const baseline=snapshotContextStorage(s.gl).residentBytes;attachContextStorage(s.gl,{limitBytes:baseline+128})
      s.coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});s.coordinator['invalidate']()
      s.coordinator.advance();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:baseline+64,reservedBytes:64})
      s.coordinator.advance();expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:baseline+128,reservedBytes:0})
      s.drain();const uploads=s.gl.texImage2D.mock.calls.length
      s.coordinator['invalidate']();s.drain();expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads)
      expect(snapshotContextStorage(s.gl)).toMatchObject({residentBytes:baseline+128,reservedBytes:0})
    }finally{clock.mockRestore();s.close()}
  })
  it('closes both preview plans before poisoning after the second target take fails',()=>{
    const s=lane(4,4),clock=vi.spyOn(performance,'now').mockReturnValue(0),primary=new Error('derived allocation failed')
    const prepare=s.derived.preparePaintTargetRects.bind(s.derived)
    vi.spyOn(s.derived,'preparePaintTargetRects').mockImplementation(rects=>{const plan=prepare(rects);return{...plan,take:()=>{throw primary}}})
    try{
      s.coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});s.coordinator['invalidate']()
      s.coordinator.advance();s.poison.mockImplementation(()=>{s.layer.clear();s.derived.clear()})
      expect(()=>s.coordinator.advance()).toThrow(primary)
      expect(s.poison).toHaveBeenCalledTimes(1);expect(s.coordinator.cleanupFailures).toEqual([]);expect(s.layer.tileCount).toBe(0)
      expect(s.layer['retainedTargets'].size+s.derived['retainedTargets'].size).toBe(0)
      expect(snapshotContextStorage(s.gl).reservedBytes).toBe(0)
    }finally{clock.mockRestore();s.close()}
  })
  it('closes prior preview pins on mid-rebase invalidation while preserving the whole dirty union',()=>{
    const s=lane(4,4);let time=0
    const clock=vi.spyOn(performance,'now').mockImplementation(()=>time),numerical=s.calls.getMockImplementation()!
    try{
      s.coordinator.enqueue(s.frame('A',128/255,false),1);s.drain()
      s.coordinator.enqueue(s.frame('B',128/255,false),2)
      s.calls.mockImplementation((request,frame)=>{const result=numerical(request,frame);if(request.source.kind==='straightRgba8')time+=5;return result})
      let n=0
      while(!s.coordinator['work']||s.coordinator['work'].stage<1){s.coordinator.advance();expect(++n).toBeLessThan(100)}
      expect(s.layer['retainedTargets'].size).toBe(1);expect(s.derived['retainedTargets'].size).toBe(1)
      s.coordinator['invalidate']({minX:3,minY:3,maxX:4,maxY:4})
      expect(s.coordinator['work']).toBeUndefined();expect(s.layer['retainedTargets'].size+s.derived['retainedTargets'].size).toBe(0)
      expect([...s.coordinator['dirty'].values()]).toEqual([{minX:0,minY:0,maxX:4,maxY:4}]);expect(s.coordinator.presentationReady).toBe(false)
      s.drain();expect(s.pixel(s.derived)).toEqual([85,0,170,192]);expect(s.coordinator.presentationReady).toBe(true)
    }finally{clock.mockRestore();s.close()}
  })
  it('preserves a primary preview-copy error while attempting both plan closes before external poison',()=>{
    const s=lane(4,4),primary=new Error('preview copy failed'),secondary=new Error('stable pin close failed'),clock=vi.spyOn(performance,'now').mockReturnValue(0)
    const stable=s.layer.preparePaintTargetRects.bind(s.layer),derived=s.derived.preparePaintTargetRects.bind(s.derived),derivedClosed=vi.fn()
    vi.spyOn(s.layer,'preparePaintTargetRects').mockImplementation(rects=>{const p=stable(rects);return{...p,close:()=>{p.close();throw secondary}}})
    vi.spyOn(s.derived,'preparePaintTargetRects').mockImplementation(rects=>{const p=derived(rects);return{...p,close:()=>{p.close();derivedClosed()}}})
    try{
      s.coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});s.coordinator['invalidate']()
      s.coordinator.advance();s.coordinator.advance()
      vi.spyOn(AccumulationBuffer.prototype,'copyTo').mockImplementationOnce(()=>{throw primary})
      s.poison.mockImplementation(()=>{s.layer.clear();s.derived.clear()})
      expect(()=>s.coordinator.advance()).toThrow(primary);expect(derivedClosed).toHaveBeenCalledOnce()
      expect(s.coordinator.cleanupFailures).toEqual([secondary]);expect(s.coordinator.presentationReady).toBe(false)
      expect(s.layer['retainedTargets'].size+s.derived['retainedTargets'].size).toBe(0)
    }finally{clock.mockRestore();s.close()}
  })
  it('refuses actual evicted preview history without replay, GL allocation or escaped stable pins',()=>{
    const s=lane(4,4),rebuild=vi.fn(()=>({readPixels:()=>null,destroy:()=>{}})),historical=new TiledLayerBuffer(s.gl,4,4,rebuild,512,undefined,'straight-rgba8')
    const coordinator=new CanonicalWashLayerCoordinator({...s.coordinator['options'],presentation:()=>({buffer:historical,epoch:0})})
    try{
      for(let i=0;i<9;i++)historical.resolveForPaint({minX:i*4,minY:0,maxX:i*4+1,maxY:1})
      expect(historical.evictedTileCount).toBe(1)
      coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});coordinator['invalidate']()
      const uploads=s.gl.texImage2D.mock.calls.length
      expect(()=>coordinator.advance()).toThrow('recovery required');expect(rebuild).not.toHaveBeenCalled()
      expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);expect(s.layer['retainedTargets'].size).toBe(0)
    }finally{coordinator.cancel();historical.destroy();s.close()}
  })
  it('keeps a published lane and its partial storage plan valid when an unpublished candidate fails admission',()=>{
    const s=lane(1,1),clock=vi.spyOn(performance,'now').mockReturnValue(0),primary=new Error('candidate admission failed')
    try{
      s.coordinator.enqueue(s.frame('A',128/255,false),1);s.coordinator.advance()
      const original=s.coordinator['entries'][0],pins=s.layer['retainedTargets'].size,admit=CanonicalFrameExecutor.prototype.enqueue
      expect(pins).toBe(1)
      // Inject failure at the post-admission/pre-publication boundary: the new
      // candidate has accepted metadata, but has never executed pixel work.
      const enqueue=vi.spyOn(CanonicalFrameExecutor.prototype,'enqueue').mockImplementationOnce(function(this:CanonicalFrameExecutor,input){admit.call(this,input);throw primary})
      expect(()=>s.coordinator.enqueue(s.frame('B',.5,false),2)).toThrow(primary);enqueue.mockRestore()
      expect(s.coordinator.poisoned).toBe(false);expect(s.poison).not.toHaveBeenCalled()
      expect(s.coordinator['entries']).toEqual([original]);expect(s.layer['retainedTargets'].size).toBe(pins)
      s.drain();expect(s.pixel(s.derived)).toEqual([255,0,0,128]);expect(s.coordinator.presentationReady).toBe(true)
      s.coordinator.enqueue(s.frame('B',128/255,false),2);s.drain();expect(s.pixel(s.derived)).toEqual([85,0,170,192])
    }finally{clock.mockRestore();s.close()}
  })
  for(const failure of ['copy','cancel'] as const)it(`retires both preview plans when cleanup status throws during ${failure}`,()=>{
    const s=lane(4,4),clock=vi.spyOn(performance,'now').mockReturnValue(0),primary=new Error('copy primary'),status=new Error('lost query failed'),getLost=s.gl.isContextLost
    try{
      s.coordinator['positions'].set('0:0',{x:0,y:0,width:4,height:4,presentation:{}});s.coordinator['invalidate']()
      s.coordinator.advance()
      if(failure==='copy'){
        s.coordinator.advance()
        vi.spyOn(AccumulationBuffer.prototype,'copyTo').mockImplementationOnce(()=>{s.gl.isContextLost=()=>{throw status};throw primary})
        expect(()=>s.coordinator.advance()).toThrow(primary)
      }else{
        s.gl.isContextLost=()=>{throw status};expect(()=>s.coordinator.cancel()).not.toThrow()
      }
      expect(s.coordinator.cleanupFailures).toContain(status)
      expect(s.layer['retainedTargets'].size+s.derived['retainedTargets'].size).toBe(0)
      expect(snapshotContextStorage(s.gl).reservedBytes).toBe(0);expect(s.coordinator.presentationReady).toBe(false)
    }finally{s.gl.isContextLost=getLost;clock.mockRestore();s.close()}
  })
  for(const phase of ['preview','commit'] as const)it(`separates cold ${phase} physical preparation from pixel work`,()=>{
    const s=lane(4,1),now=vi.spyOn(performance,'now');let clock=0,takes=0
    now.mockImplementation(()=>clock)
    try{
      s.coordinator.enqueue(s.frame('A',.5,phase==='commit'),1)
      let turns=0
      while(phase==='commit'?!s.coordinator['entries'][0].ownership:!s.coordinator['dirty'].size){s.coordinator.advance();expect(++turns).toBeLessThan(100)}
      if(phase==='commit')s.layer.clear() // raw ownership sealed, no target pin remains; force a genuinely new stable commit target
      const layer=phase==='commit'?s.layer:s.derived,prepare=layer.preparePaintTargetRects.bind(layer)
      const cold=vi.spyOn(layer,'preparePaintTargetRects').mockImplementation(rects=>{
        const plan=prepare(rects)
        return {...plan,take:(index:number)=>{const target=plan.take(index);clock+=5;takes++;return target}}
      })
      s.calls.mockClear()
      while(!takes){s.coordinator.advance();expect(++turns).toBeLessThan(100)}
      expect(s.calls.mock.calls.filter(([r])=>r.source.kind==='straightRgba8')).toHaveLength(0)
      expect(s.coordinator.pending).toBe(true);expect(s.coordinator.presentationReady).toBe(false)
      cold.mockRestore();s.drain()
      expect(s.coordinator.poisoned).toBe(false)
      expect(s.calls.mock.calls.filter(([r])=>r.source.kind==='straightRgba8').length).toBeGreaterThanOrEqual(16)
      expect(s.releases.every(r=>r.mock.calls.length<=1)).toBe(true)
    }finally{now.mockRestore();s.close()}
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
      // Freeze the turn clock so the injected pixel failure is reached in this
      // call even when concurrent typechecking/JIT work exhausted wall time.
      const now=vi.spyOn(performance,'now').mockReturnValue(0)
      try{expect(()=>{for(let n=0;n<100;n++)s.coordinator.advance()}).toThrow('pixel failed')}finally{now.mockRestore()}
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
  for (const profile of ['scalar-bionic-f64-fma-v1','neon64-f32-fma-v1'] as const) it(`executes six actual Gaussian paint sources without an image bank under ${profile}`, () => {
    for (const index of [5,6,7,10,11,22]) {
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
        expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
        expect(s.scratch.bytes.live).toBe(0)
      } finally {s.close()}
    }
  })
})

function nativeSoftFrame() {
  const sample=softMasks.cases.find(r=>r.index===72&&r.variant===3&&r.mode==='neon64-auto-dispatch')!,row=softTables.constructors.find(r=>r.index===72)!,g=row.generator
  const softnessCurve={text:g.softness_curve,points:row.points}
  const pin=canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,descriptorId:'native-soft-72',descriptorVersion:1,descriptorSha256:'a'.repeat(64),
    source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:+g.diameter,ratio:+g.ratio,horizontalFade:+g.hfade,verticalFade:+g.vfade,
      antialias:false,spikes:2,randomness:0,density:1,softnessCurve},
    brushScale:sample.storedScale,brushAngle:sample.storedAngle,coverageProfile:'neon64-f32-fma-v1',reader:'krita-bd6e8d0-v1',
    compilerProfile:'eigen-5.0.1-mapped-arm64-f64-v3',buildId:'b'.repeat(64),
    radialCurve:{source:softnessCurve,coefficients:row.coefficients.map(c=>[c[0],c[1],c[2],c[3]] as const)}})
  const recipe:CanonicalSoftAutoRecipe={kind:'softAuto',sourceSlot:0,source:pin.source,coverageProfile:pin.coverageProfile,
    brushScale:pin.brushScale,brushAngle:pin.brushAngle,...sample.shape,subX:sample.subpixelX,subY:sample.subpixelY,
    width:sample.width,height:sample.height,mirrorH:true,mirrorV:true}
  const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:1048576,outputBytes:4*1048576,drawPixels:1048576}}
  const built=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:-3,y:-5,opacity:.5,flow:.7}],
    fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},context)
  return {pin,sample,frame:unpackCanonicalMaterial(built.packed,context)}
}
for(const mode of ['wash','buildup'] as const)it(`executes a decoded native soft mask through the SAME ${mode} queue and bounded prepass`,()=>{
  const {pin,sample,frame}=nativeSoftFrame(),s=setup(mode,64,64,undefined,'reference-scalar-f32-rne-v1',pin),uploads:Uint8Array[]=[]
  s.gl.texSubImage2D.mockImplementation((...args:unknown[])=>uploads.push(new Uint8Array(args[8] as Uint8Array)))
  const baseline=s.cpu.reservedBytes
  try {
    const resolve=vi.spyOn(s.layer,'resolveForPaint'),table=s.executor['softProgram']!,advance=vi.spyOn(table,'advance')
    s.executor.enqueue({...s.submit(),frame,assets:[]})
    let clock=0;const now=vi.spyOn(performance,'now').mockImplementation(()=>clock+=5)
    try{expect(s.executor.advance().pending).toBe(true)}finally{now.mockRestore()}
    expect(resolve).not.toHaveBeenCalled();expect(uploads).toHaveLength(0)
    expect(advance).toHaveBeenCalledWith(64)
    s.drain()
    const rgba=Uint8Array.from(uploads.flatMap(a=>Array.from(a))),expected=Uint8Array.from(atob(sample.coverageBase64),c=>c.charCodeAt(0))
    expect(rgba.length).toBe(expected.length*4)
    for(let i=0;i<expected.length;i++)expect(Array.from(rgba.subarray(i*4,i*4+4))).toEqual([expected[i],expected[i],expected[i],expected[i]])
    expect(s.executor.checkpointReady).toBe(true);expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
    const preparedCalls=advance.mock.calls.length
    s.executor.enqueue({...s.submit(),gestureId:'second-soft-gesture',frame,assets:[]});s.drain()
    expect(advance.mock.calls.length).toBe(preparedCalls)
    s.executor.cancel();expect(s.cpu.reservedBytes).toBe(baseline-table.estimatedCpuBytes-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
  }finally{s.close()}
})
it('rejects untrusted soft frames before target access and releases a never-used source on cancellation',()=>{
  const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin)
  const own=s.executor['softProgram']!,before=s.cpu.reservedBytes,resolve=vi.spyOn(s.layer,'resolveForPaint')
  try {
    const noPin=new CanonicalFrameExecutor({...s.executor['options'],autoSource:undefined})
    expect(()=>noPin.enqueue({...s.submit(),frame,assets:[]})).toThrow('trusted');noPin.cancel()
    const r=frame.definitions[0];if(r.kind!=='softAuto')throw Error('Expected soft recipe')
    expect(()=>s.executor.enqueue({...s.submit(),frame:{...frame,definitions:[{...r,sourceSlot:1}]},assets:[]})).toThrow()
    expect(s.cpu.reservedBytes).toBe(before);expect(resolve).not.toHaveBeenCalled();expect(s.reserveTransient).not.toHaveBeenCalled()
    s.executor.cancel();s.executor.cancel();expect(s.cpu.reservedBytes).toBe(before-own.estimatedCpuBytes-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
    expect(()=>s.executor.enqueue({...s.submit(),frame,assets:[]})).toThrow('poisoned')
  }finally{s.close()}
})

it('charges target preparation to the SAME turn budget before planning more tiles',()=>{
  const s=setup('buildup',4,16),resolve=s.layer.resolveForPaint.bind(s.layer)
  let clock=0
  const now=vi.spyOn(performance,'now').mockImplementation(()=>clock)
  const prepare=vi.spyOn(s.layer,'resolveForPaint').mockImplementation(rect=>{const targets=resolve(rect);clock+=5;return targets})
  const composite=vi.spyOn(s.composite,'drawSource')
  try {
    const input=decoded(1)
    const frame={...input,definitions:[{...recipe,width:9,height:9,scale:9,ratio:1}]}
    s.executor.enqueue({...s.submit(),frame});s.prepareStorage()
    expect(s.executor.advance().pending).toBe(true)
    expect(prepare).toHaveBeenCalledTimes(1);expect(composite).toHaveBeenCalledTimes(1)
    expect(s.executor['queue'][0].tile).toBe(1)
    while(s.executor.pending){prepare.mockClear();s.executor.advance();expect(prepare.mock.calls.length).toBeLessThanOrEqual(1)}
    expect(composite).toHaveBeenCalledTimes(9);expect(s.executor.checkpointReady).toBe(true)
  }finally{now.mockRestore();s.close()}
})

it('borrows one fixed source across gesture executors without retiring the caller owner',()=>{
  const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin)
  const owner=s.executor['softProgram']!,baseline=s.cpu.reservedBytes,advance=vi.spyOn(owner,'advance')
  const a=new CanonicalFrameExecutor({...s.executor['options'],softProgramOwner:owner})
  const b=new CanonicalFrameExecutor({...s.executor['options'],softProgramOwner:owner})
  try {
    expect(s.cpu.reservedBytes).toBe(baseline+2*CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
    a.enqueue({...s.submit(),frame,assets:[]});while(a.pending)a.advance()
    const calls=advance.mock.calls.length;expect(calls).toBeGreaterThan(0)
    a.cancel();expect(owner.done).toBe(true);expect(s.cpu.reservedBytes).toBe(baseline+CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
    b.enqueue({...s.submit(),gestureId:'shared-soft-second',frame,assets:[]});while(b.pending)b.advance()
    expect(advance.mock.calls.length).toBe(calls)
    b.cancel();expect(s.cpu.reservedBytes).toBe(baseline)
  }finally{a.cancel();b.cancel();s.close()}
})

it('retires unpublished soft coordinator executors on rejection and preserves accepted entries',()=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('wash',64,64,undefined,'reference-scalar-f32-rne-v1',pin)
 const derived=new TiledLayerBuffer(s.gl,64,64,undefined,undefined,undefined,'straight-rgba8')
 const source=vi.fn(()=>({autoSource:pin})),baseline=s.cpu.reservedBytes
 const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:'reference-scalar-f32-rne-v1',layerId:'layer',layerEpoch:0,maxGestures:4,
  prepass:s.prepass,composite:s.composite,scratch:s.scratch,layer:()=>({buffer:s.layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),
  source,reserveTransient:s.reserveTransient,changed:s.changed,poison:s.poison})
 const emptyBaseline=s.cpu.reservedBytes,r=frame.definitions[0];if(r.kind!=='softAuto')throw Error('Expected soft')
 const input={...s.submit(),frame,assets:[]}
 try {
  const forged={...input,frame:{...frame,definitions:[{...r,sourceSlot:1 as const}]}}
  for(let i=0;i<3;i++){expect(()=>coordinator.enqueue(forged,1)).toThrow();expect(s.cpu.reservedBytes).toBe(emptyBaseline);expect(coordinator.poisoned).toBe(false)}
  const cleanupFailure=new Error('candidate cleanup failed'),cancel=CanonicalFrameExecutor.prototype.cancel
  const cancelSpy=vi.spyOn(CanonicalFrameExecutor.prototype,'cancel').mockImplementationOnce(function(this:CanonicalFrameExecutor,...args){cancel.apply(this,args);throw cleanupFailure})
  try{expect(()=>coordinator.enqueue(forged,1)).not.toThrow(cleanupFailure)}finally{cancelSpy.mockRestore()}
  expect(coordinator.cleanupFailures).toContain(cleanupFailure);expect(s.cpu.reservedBytes).toBe(emptyBaseline)
  const failure=new Error('source binding failed');source.mockImplementationOnce(()=>{throw failure})
  expect(()=>coordinator.enqueue(input,1)).toThrow(failure);expect(s.cpu.reservedBytes).toBe(emptyBaseline)
  coordinator.enqueue(input,1);const acceptedBaseline=s.cpu.reservedBytes
  expect(()=>coordinator.enqueue({...forged,ordinal:1},2)).toThrow();expect(s.cpu.reservedBytes).toBe(acceptedBaseline);expect(coordinator.poisoned).toBe(false)
  let n=0;while(coordinator.pending&&n++<300)coordinator.advance();expect(n).toBeLessThan(300);expect(coordinator.checkpointReady).toBe(true)
  coordinator.cancel();expect(s.cpu.reservedBytes).toBe(baseline)
 }finally{coordinator.cancel();derived.destroy();s.close()}
});

it('rejects a source reservation from another CPU owner before accepting frames',()=>{
  const {pin}=nativeSoftFrame(),a=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin)
  const b=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin)
  try {
    const beforeA=a.cpu.reservedBytes,beforeB=b.cpu.reservedBytes
    expect(()=>new CanonicalFrameExecutor({...a.executor['options'],softProgramOwner:b.executor['softProgram']})).toThrow('share the CPU owner')
    expect(a.cpu.reservedBytes).toBe(beforeA);expect(b.cpu.reservedBytes).toBe(beforeB)
  }finally{a.close();b.close()}
})

for(const outerBlend of ['multiply','lighten','colorDodge','overlay'] as const)it(`executes exclusive V2 ${outerBlend} wash across clipped tiled/yielded parts without changing local deposition`,()=>{
 const s=setup('wash',8,32,undefined,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,undefined,2)
 const executor=new CanonicalFrameExecutor({...s.executor['options'],pageBounds:{minX:-2,minY:0,maxX:5,maxY:2}}),actual=s.composite.drawSource.bind(s.composite),calls=vi.spyOn(s.composite,'drawSource')
 let clock=0;const now=vi.spyOn(performance,'now').mockImplementation(()=>clock)
 calls.mockImplementation((r,frame)=>{const result=actual(r,frame);clock+=5;return result})
 try{
  const f=decoded(1,-3,false);Object.assign(f,{definitions:[{...recipe,scale:9,ratio:1/3,width:9,height:3}]})
  const composition={...s.submit().composition,outerBlend}
  executor.enqueue({...s.submit(f),composition});Reflect.set(composition,'outerBlend','over')
  let n=0;while(executor.pending&&n++<200)executor.advance();expect(n).toBeLessThan(200)
  const preview=calls.mock.calls.map(([r])=>r).filter(r=>r.readDestination)
  expect(preview.length).toBeGreaterThan(1);expect(preview.every(r=>r.operation.kind==='genericSCU8'&&r.operation.control.mode===outerBlend&&r.operation.control.opacity===.8)).toBe(true)
  expect(calls.mock.calls.filter(([r])=>r.source.kind==='maskRgb').every(([r])=>r.operation.kind==='alphaDarken32FusedScalar')).toBe(true)
  const before=calls.mock.calls.length
  executor.enqueue({...s.submit(decoded(0,0,true,{phase:'primary',group:0}),1),composition:{...s.submit().composition,outerBlend}})
  n=0;while(executor.pending&&n++<200)executor.advance();expect(n).toBeLessThan(200)
  const commit=calls.mock.calls.slice(before).map(([r])=>r)
  expect(commit.every(r=>r.operation.kind==='genericSCU8'&&r.operation.control.mode===outerBlend)).toBe(true)
  expect(commit.map(r=>r.operation)).toEqual(preview.map(r=>r.operation))
  expect(executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{now.mockRestore();executor.cancel();s.close()}
})
it('requires prepared V2 operations and rejects non-over buildup without its captured law before services or target mutation',()=>{
 const legacy=setup('wash'),s=setup('buildup',4,4,undefined,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)
 try{
  expect(()=>new CanonicalFrameExecutor({...legacy.executor['options'],rasterProfile:CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE})).toThrow(/not prepared/)
  const layer=vi.fn(()=>{throw Error('layer must not be touched')}),executor=new CanonicalFrameExecutor({...s.executor['options'],layer}),cpu=s.cpu.reservedBytes
  try{
   expect(()=>executor.enqueue({...s.submit(),composition:{...s.submit().composition,outerBlend:'multiply'}})).toThrow(/outer composition law differs/)
   expect(layer).not.toHaveBeenCalled();expect(s.reserveTransient).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(cpu);expect(executor.pending).toBe(false)
  }finally{executor.cancel()}
 }finally{legacy.close();s.close()}
})

it('refuses the actual Gaussian2 eraser as a paint source without normalizing its normal blend into paint',()=>{
 const row=gaussianStock.rows.find(r=>r.index===2)!,descriptor=row.descriptor as unknown as BrushDescriptor
 expect(descriptor.behavior?.erase).toBe(true);expect(descriptor.behavior?.rendering?.blendMode).toBe('normal')
 expect(()=>canonicalGaussianAutoSourceBinding(descriptor,row.descriptorSHA256,'scalar-bionic-f64-fma-v1')).toThrow('outer composition')
 expect(()=>canonicalGaussianAutoSourceBinding(descriptor,row.descriptorSHA256,'scalar-bionic-f64-fma-v1',CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE)).toThrow('outer composition')
})

it('materializes a 64-tile frame one allocation per advance without pixel commands or escaped GL state during preparation',()=>{
 const s=setup('buildup'),draw=vi.spyOn(s.composite,'drawSource'),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const frame=decoded(64);frame.draws.forEach((d,i)=>Object.assign(d,{x:i*4}))
  const before=s.snapshot(),initial=s.gl.texImage2D.mock.calls.length
  s.executor.enqueue(s.submit(frame));expect(s.gl.texImage2D).toHaveBeenCalledTimes(initial)
  for(let i=0;i<64;i++){
   const uploads=s.gl.texImage2D.mock.calls.length
   expect(s.executor.advance().pending).toBe(true)
   expect(s.gl.texImage2D.mock.calls.length-uploads).toBe(1)
   expect(draw).not.toHaveBeenCalled();expect(s.snapshot()).toEqual(before)
   expect(s.layer['retainedTargets'].size).toBe(64)
   expect([...s.layer['retainedTargets'].values()].every(e=>e.count===0&&e.storagePins===1)).toBe(true)
  }
  s.drain();expect(draw).toHaveBeenCalledTimes(64);expect(s.layer['retainedTargets'].size).toBe(0)
 }finally{clock.mockRestore();s.close()}
})
it('cancels partially taken scratch before poison can undo the layer and releases every physical ticket',()=>{
 const s=setup('wash'),baseline=s.cpu.reservedBytes,release=vi.spyOn(s.scratch,'release')
 try{
  s.executor.enqueue(s.submit());s.executor.advance();s.executor.advance() // target then original; local still reserved
  expect(s.scratch.bytes.live).toBe(64);expect(s.layer['retainedTargets'].size).toBe(1)
  s.poison.mockImplementation(()=>{expect(()=>s.layer.clear()).not.toThrow()})
  s.executor.cancel();expect(release).toHaveBeenCalledOnce();expect(s.scratch.bytes.live).toBe(0)
  expect(s.cpu.reservedBytes).toBe(baseline-CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES);expect(s.layer['retainedTargets'].size).toBe(0)
  s.executor.cancel();expect(release).toHaveBeenCalledOnce()
 }finally{s.close()}
})
it('rejects a replaced layer epoch between storage steps before another allocation or pixel',()=>{
 const s=setup('wash'),draw=vi.spyOn(s.composite,'drawSource')
 try{
  s.executor.enqueue(s.submit());s.executor.advance();const uploads=s.gl.texImage2D.mock.calls.length
  s.setEpoch();expect(()=>s.executor.advance()).toThrow('changed')
  expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);expect(draw).not.toHaveBeenCalled()
  expect(s.layer['retainedTargets'].size).toBe(0);expect(s.scratch.bytes.live).toBe(0);expect(s.poison).toHaveBeenCalledOnce()
 }finally{s.close()}
})
it('refuses evicted cooperative targets before invoking historical recovery or allocating scratch',()=>{
 const s=setup('wash',4,4,8),draw=vi.spyOn(s.composite,'drawSource')
 try{
  for(let i=0;i<9;i++)s.layer.resolveForPaint({minX:i*4,minY:0,maxX:i*4+1,maxY:1})
  expect(s.layer.evictedTileCount).toBe(1)
  const acquire=vi.spyOn(s.scratch,'prepareAcquisition'),uploads=s.gl.texImage2D.mock.calls.length
  s.executor.enqueue(s.submit());expect(()=>s.executor.advance()).toThrow('recovery required')
  expect(acquire).not.toHaveBeenCalled();expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);expect(draw).not.toHaveBeenCalled();expect(s.executor.poisoned).toBe(true)
 }finally{s.close()}
})
it('restores an undeclared active texture unit through every cold allocation and original-copy preparation turn',()=>{
 const s=setup('wash'),foreign=s.gl.createTexture(),clock=vi.spyOn(performance,'now').mockReturnValue(0),copy=vi.spyOn(AccumulationBuffer.prototype,'copyTo')
 try{
  s.gl.activeTexture(s.gl.TEXTURE0+5);s.gl.bindTexture(s.gl.TEXTURE_2D,foreign)
  const before=s.snapshot();s.executor.enqueue(s.submit())
  for(let i=0;i<4;i++){s.executor.advance();expect(s.snapshot()).toEqual(before)}
  expect(copy).toHaveBeenCalledOnce();s.drain();expect(s.snapshot()).toEqual(before)
 }finally{copy.mockRestore();clock.mockRestore();s.close();s.gl.deleteTexture(foreign)}
})
it('forgets partially taken plan scratch through the one global pool owner after actual context loss',()=>{
 const s=setup('wash'),release=vi.spyOn(s.scratch,'release'),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.executor.enqueue(s.submit());s.executor.advance();s.executor.advance()
  expect(s.scratch.bytes.live).toBe(64)
  const deleted=s.gl.deleteTexture.mock.calls.length
  s.gl.isContextLost=()=>true;s.executor.cancel('lost',{lost:true})
  expect(release).not.toHaveBeenCalled();expect(s.gl.deleteTexture).toHaveBeenCalledTimes(deleted)
  expect(s.executor['queue']).toHaveLength(0);expect(s.layer['retainedTargets'].size).toBe(0)
  s.scratch.forget();AccumulationBuffer.forgetContextStorage(s.gl) // isolated recording GL: global context owner retires this generation
  expect(s.scratch.bytes).toEqual({live:0,free:0});s.scratch.destroy();expect(s.gl.deleteTexture).toHaveBeenCalledTimes(deleted)
 }finally{clock.mockRestore();s.close()}
})

it('executor cleanup status preserves the exact primary draw error and retires all plans if loss probing throws',()=>{
 const s=setup('wash'),primary=new Error('primary draw failed'),status=new Error('cleanup loss query failed'),getLost=s.gl.isContextLost
 try{
  s.executor.enqueue(s.submit());s.prepareStorage()
  vi.spyOn(s.composite,'drawSource').mockImplementationOnce(()=>{s.gl.isContextLost=()=>{throw status};throw primary})
  expect(()=>s.executor.advance()).toThrow(primary)
  expect(s.executor.cleanupFailures).toContain(status);expect(s.executor.poisoned).toBe(true)
  expect(s.layer['retainedTargets'].size).toBe(0);expect(s.scratch.bytes.live).toBe(0)
  expect(snapshotContextStorage(s.gl).reservedBytes).toBe(0)
 }finally{s.gl.isContextLost=getLost;s.close()}
})
it('executor cleanup status still closes partial plan storage before reporting a default-cancel status failure',()=>{
 const s=setup('wash'),status=new Error('cancel loss query failed'),getLost=s.gl.isContextLost,clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.executor.enqueue(s.submit());s.executor.advance();s.executor.advance();expect(s.scratch.bytes.live).toBe(64)
  s.gl.isContextLost=()=>{throw status}
  expect(()=>s.executor.cancel()).toThrow(status)
  expect(s.executor.cleanupFailures).toContain(status);expect(s.executor.poisoned).toBe(true)
  expect(s.layer['retainedTargets'].size).toBe(0);expect(s.scratch.bytes.live).toBe(0)
  expect(snapshotContextStorage(s.gl).reservedBytes).toBe(0)
 }finally{s.gl.isContextLost=getLost;clock.mockRestore();s.close()}
})
it('executor cleanup status releases transferred raw ownership exactly once despite a failed default loss probe',()=>{
 const s=setup('wash',4,4,undefined,'reference-scalar-f32-rne-v1',undefined,4,'deposition-only'),status=new Error('raw release loss query failed'),getLost=s.gl.isContextLost,release=vi.spyOn(s.scratch,'release')
 let ownership:ReturnType<CanonicalFrameExecutor['takeRawWash']>|undefined
 try{
  s.executor.enqueue(s.submit());s.drain();ownership=s.executor.takeRawWash();expect(s.scratch.bytes.live).toBe(64)
  s.gl.isContextLost=()=>{throw status};expect(()=>ownership!.release()).not.toThrow()
  expect(s.executor.cleanupFailures).toContain(status);expect(s.scratch.bytes.live).toBe(0);expect(release).toHaveBeenCalledOnce()
  ownership.release();expect(release).toHaveBeenCalledOnce()
 }finally{s.gl.isContextLost=getLost;ownership?.release();s.close()}
})

it('exclusive wash publishes both real framebuffer certificates and skips only owned local sampler/FBO queries after cold preparation',()=>{
 const s=setup('wash'),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.executor.enqueue(s.submit(decoded(1,0,false)));s.prepareStorage()
  const tile=[...s.executor['washes'].values()][0],owner=tile.lifetime
  expect(owner.ownedFramebufferLayouts?.map(p=>p.certificate)).toEqual([tile.local.verifiedFramebufferLayout,tile.original!.verifiedFramebufferLayout])
  expect(owner.ownedPointSampler?.source).toBe(tile.local)
  const query=vi.spyOn(s.gl,'getTexParameter'),status=vi.spyOn(s.gl,'checkFramebufferStatus'),attachment=vi.spyOn(s.gl,'getFramebufferAttachmentParameter')
  s.drain();expect(query).not.toHaveBeenCalled();expect(status).not.toHaveBeenCalled();expect(attachment).not.toHaveBeenCalled()
  const partial={...owner,ownedFramebufferLayouts:Object.freeze([owner.ownedFramebufferLayouts![0]])},charges:number[]=[]
  for(const lifetime of [partial,owner])runBrushGlBatch({participants:[s.prepass,s.composite],owners:[lifetime]},()=>{charges.push(s.cpu.reservedBytes)})
  expect(charges[1]-charges[0]).toBe(96) // the second actual certificate uses the existing frame CPU owner
  const release=owner.lease();expect(s.executor['rawOwner'].leases).toBe(1);expect(()=>s.executor.cancel()).toThrow('batch');release();release();expect(s.executor['rawOwner'].leases).toBe(0)
 }finally{clock.mockRestore();s.close()}
})
for(const role of ['local','original'] as const)it(`exclusive wash refuses a replaced ${role} handle before borrowing or issuing GL queries`,()=>{
 const s=setup('wash'),foreign=s.gl.createTexture()!,clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let restore:(()=>void)|undefined
 try{
  s.executor.enqueue(s.submit(decoded(1,0,false)));s.prepareStorage()
  const tile=[...s.executor['washes'].values()][0],buffer=tile[role]!,texture=buffer._texture
  buffer._texture=foreign;restore=()=>{buffer._texture=texture}
  const query=vi.spyOn(s.gl,'getParameter');query.mockClear()
  expect(()=>tile.lifetime.lease()).toThrow('Stale');expect(s.executor['rawOwner'].leases).toBe(0);expect(query).not.toHaveBeenCalled()
 }finally{restore?.();clock.mockRestore();s.close();s.gl.deleteTexture(foreign)}
})
it('exclusive wash reuses exact pool handles with a fresh accepted gesture epoch while rejected admission never revives the old binding',()=>{
 const s=setup('wash'),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.executor.enqueue(s.submit());s.prepareStorage();const first=[...s.executor['washes'].values()][0],old=first.lifetime,epoch=s.executor['rawOwner']
  s.drain();expect(epoch.alive).toBe(false)
  const rejected={...s.submit(),gestureId:'second',composition:{...s.submit().composition,outerBlend:'multiply' as const}}
  expect(()=>s.executor.enqueue(rejected)).toThrow('pinned raster profile');expect(s.executor['rawOwner']).toBe(epoch)
  s.executor.enqueue({...s.submit(),gestureId:'second'});s.prepareStorage();const next=[...s.executor['washes'].values()][0]
  expect(next.local.texture).toBe(first.local.texture);expect(next.original!.texture).toBe(first.original!.texture)
  expect(s.executor['rawOwner']).not.toBe(epoch);expect(s.executor['rawOwner'].alive).toBe(true)
  expect(()=>old.lease()).toThrow('Stale');const release=next.lifetime.lease();release();s.drain()
 }finally{clock.mockRestore();s.close()}
})

it('exclusive wash revalidates the original after owner acquisition and rejects callback drift before any draw',()=>{
 const s=setup('wash'),foreign=s.gl.createTexture()!,clock=vi.spyOn(performance,'now').mockReturnValue(0)
 let original:AccumulationBuffer|undefined,texture:WebGLTexture|undefined
 try{
  s.executor.enqueue(s.submit(decoded(1,0,false)));s.prepareStorage();const tile=[...s.executor['washes'].values()][0]
  original=tile.original!;texture=original.texture
  const body=vi.fn(),other={owner:{},lease:()=>{original!._texture=foreign;return()=>{}}}
  expect(()=>runBrushGlBatch({participants:[s.prepass,s.composite],owners:[tile.lifetime,other]},body)).toThrow('certificate')
  expect(body).not.toHaveBeenCalled();expect(s.executor['rawOwner'].leases).toBe(0)
 }finally{if(original&&texture)original._texture=texture;clock.mockRestore();s.close();s.gl.deleteTexture(foreign)}
})
it('exclusive wash rechecks original identity after the strict context-status lease probe',()=>{
 const s=setup('wash'),foreign=s.gl.createTexture()!,clock=vi.spyOn(performance,'now').mockReturnValue(0),getLost=s.gl.isContextLost
 let original:AccumulationBuffer|undefined,texture:WebGLTexture|undefined
 try{
  s.executor.enqueue(s.submit(decoded(1,0,false)));s.prepareStorage();const tile=[...s.executor['washes'].values()][0]
  original=tile.original!;texture=original.texture;s.gl.isContextLost=()=>{original!._texture=foreign;return false}
  expect(()=>tile.lifetime.lease()).toThrow('Stale');expect(s.executor['rawOwner'].leases).toBe(0)
 }finally{if(original&&texture)original._texture=texture;s.gl.isContextLost=getLost;clock.mockRestore();s.close();s.gl.deleteTexture(foreign)}
})

for(const mode of ['buildup','exclusive','deposition-only'] as const)for(const drained of [false,true])it(`seals recorded ${mode} prefix ${drained?'after':'before'} drain without authoring a tail frame`,()=>{
 const s=setup(mode==='buildup'?'buildup':'wash',4,4,undefined,'reference-scalar-f32-rne-v1',undefined,4,mode==='buildup'?undefined:mode)
 try{
  s.executor.enqueue(s.submit(decoded(2,0,false)))
  if(drained)s.drain()
  const calls=s.gl.drawArrays.mock.calls.length,count=s.executor.pendingFrameCount,planned=s.executor['planned']!
  const work=s.executor['queue'].at(-1),draws=work?.result.draws
  s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:1})
  expect(s.gl.drawArrays).toHaveBeenCalledTimes(calls);expect(s.executor.pendingFrameCount).toBe(count)
  if(work){expect(work.result.draws).toBe(draws);expect(work.input.ordinal).toBe(0);expect(work.result.state.nextFrameOrdinal).toBe(1);expect(work.result.state.drawCount).toBe(planned.drawCount)}
  expect(()=>s.executor.enqueue(s.submit(decoded(1,2,true,{phase:'primary',group:0}),1))).toThrow()
  s.drain()
  expect(s.executor.rawWashSealed).toBe(mode==='deposition-only')
  expect(s.executor.checkpointReady).toBe(mode!=='deposition-only')
  expect(()=>s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:1})).toThrow()
 }finally{s.close()}
})
it('rejects wrong recorded prefix identity/count before changing its actual queued work',()=>{
 const s=setup('wash')
 try{
  expect(()=>s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:0})).toThrow()
  s.executor.enqueue(s.submit(decoded(1,0,false)))
  const work=s.executor['queue'][0],result=work.result,planned=s.executor['planned']
  const valid={gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:1}
  for(const patch of [{gestureId:'other'},{layerId:'other'},{layerEpoch:1},{recordedNext:0},{recordedNext:2}]){
   expect(()=>s.executor.sealRecordedPrefix({...valid,...patch})).toThrow()
   expect(work.result).toBe(result);expect(s.executor['planned']).toBe(planned);expect(s.executor.poisoned).toBe(false)
  }
 }finally{s.close()}
})
it('preserves partially painted recorded work and rejects closure while its raw view is leased',()=>{
 const s=setup('wash',4,4,undefined,'reference-scalar-f32-rne-v1',undefined,4,'deposition-only'),clock=vi.spyOn(performance,'now').mockReturnValue(0),draw=vi.spyOn(s.composite,'drawSource')
 try{
  s.executor.enqueue(s.submit(decoded(16,0,false)));s.prepareStorage();s.executor.advance()
  const work=s.executor['queue'][0],result=work.result
  expect(work.draw).toBeGreaterThan(0);expect(work.draw).toBeLessThan(16)
  const view=s.executor.rawWashTiles()[0].view
  if(view.residency.kind!=='external')throw Error('Expected raw owner')
  const release=view.residency.lease()
  try{expect(()=>s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:1})).toThrow('busy');expect(work.result).toBe(result)}finally{release()}
  const calls=draw.mock.calls.length
  s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:1})
  expect(draw).toHaveBeenCalledTimes(calls);s.drain()
  expect(draw.mock.calls.filter(([request])=>request.operation.kind==='alphaDarken32')).toHaveLength(16)
  expect(s.executor.rawWashSealed).toBe(true);const owned=s.executor.takeRawWash();owned.release()
  expect(s.executor.checkpointReady).toBe(true);expect(s.scratch.bytes.live).toBe(0)
 }finally{clock.mockRestore();s.close()}
})
it('seals an empty open tail without adding unadmitted presentation after target eviction',()=>{
 const s=setup('wash',4,4,1),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.executor.enqueue(s.submit(decoded(1,0,false)));s.drain()
  s.executor.enqueue(s.submit(decoded(0,0,false,{phase:'primary',group:0}),1))
  const tail=s.executor['queue'][0]
  expect(tail.frameTargets).toEqual([]);expect(tail.result.commands).toEqual([])
  s.layer.resolveForPaint({minX:8,minY:0,maxX:40,maxY:1})
  expect(s.layer.evictedTileCount).toBeGreaterThan(0)
  const uploads=s.gl.texImage2D.mock.calls.length,draws=s.gl.drawArrays.mock.calls.length,reservations=s.reserveTransient.mock.calls.length
  s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:2})
  expect(tail.result.commands).toEqual([]);s.drain()
  expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);expect(s.gl.drawArrays).toHaveBeenCalledTimes(draws)
  expect(s.reserveTransient).toHaveBeenCalledTimes(reservations);expect(s.layer.evictedTileCount).toBeGreaterThan(0)
  expect(s.executor.checkpointReady).toBe(true);expect(s.executor.poisoned).toBe(false)
 }finally{clock.mockRestore();s.close()}
})


it('paints an already resident buildup target in its first ordinary guarded turn',()=>{
 const s=setup('buildup'),clock=vi.spyOn(performance,'now').mockReturnValue(0),draw=vi.spyOn(s.composite,'drawSource')
 try{
  s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1});const uploads=s.gl.texImage2D.mock.calls.length,before=s.snapshot()
  s.executor.enqueue(s.submit());expect(s.executor.advance().pending).toBe(false)
  expect(draw).toHaveBeenCalledOnce();expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);expect(s.snapshot()).toEqual(before)
 }finally{clock.mockRestore();s.close()}
})
it('takes resident target and idle original/local before the same guarded initialization copy',()=>{
 const s=setup('wash'),clock=vi.spyOn(performance,'now').mockReturnValue(0),copy=vi.spyOn(AccumulationBuffer.prototype,'copyTo')
 try{
  s.layer.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})
  const a=s.scratch.acquire(4,4,'straight-rgba8'),b=s.scratch.acquire(4,4,'straight-rgba8');s.scratch.release(a);s.scratch.release(b)
  const uploads=s.gl.texImage2D.mock.calls.length,before=s.snapshot();s.executor.enqueue(s.submit())
  s.executor.advance();expect(copy).toHaveBeenCalledOnce();expect(s.scratch.bytes.live).toBe(128)
  expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);expect(s.snapshot()).toEqual(before)
  s.drain()
 }finally{clock.mockRestore();copy.mockRestore();s.close()}
})
it('charges resident metadata progress to the same advance clock before any GL capsule',()=>{
 const s=setup('buildup');let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),prepare=s.layer.preparePaintTargetRects.bind(s.layer)
 try{
  s.layer.resolveForPaint({minX:0,minY:0,maxX:12,maxY:4})
  const takes=vi.fn(),spy=vi.spyOn(s.layer,'preparePaintTargetRects').mockImplementation(rects=>{const plan=prepare(rects);return{...plan,takeResident:(i:number)=>{const target=plan.takeResident(i);takes(i);now+=2;return target}}})
  const frame=decoded(3);frame.draws.forEach((d,i)=>Object.assign(d,{x:i*4}));s.executor.enqueue(s.submit(frame))
  const queries=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource');queries.mockClear()
  expect(s.executor.advance().pending).toBe(true);expect(takes.mock.calls.map(c=>c[0])).toEqual([0,1])
  expect(queries).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled()
  spy.mockRestore();s.drain()
 }finally{clock.mockRestore();s.close()}
})

function warmDeposition(count=1,drawsPerTile=1){
 const s=setup('wash',4,4,undefined,'reference-scalar-f32-rne-v1',undefined,4,'deposition-only')
 s.layer.resolveForPaint({minX:0,minY:0,maxX:count*4,maxY:4})
 const idle=Array.from({length:count},()=>s.scratch.acquire(4,4,'straight-rgba8'));for(const buffer of idle)s.scratch.release(buffer)
 const frame=decoded(count*drawsPerTile);frame.draws.forEach((d,i)=>Object.assign(d,{x:Math.floor(i/drawsPerTile)*4}));s.executor.enqueue(s.submit(frame))
 return s
}
it('shares the last warm initialization capture with first paint and returns actual completed frame state',()=>{
 const s=warmDeposition(),clock=vi.spyOn(performance,'now').mockReturnValue(0),draw=vi.spyOn(s.composite,'drawSource'),query=vi.spyOn(s.gl,'getParameter')
 try{
  query.mockClear();const result=s.executor.advance()
  expect(draw).toHaveBeenCalledOnce();expect(result).toEqual({pending:false,checkpointReady:false})
  expect(s.executor.rawWashSealed).toBe(true)
  expect(query.mock.calls.filter(c=>c[0]===s.gl.CURRENT_PROGRAM)).toHaveLength(1)
  const ownership=s.executor.takeRawWash();ownership.release();expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close()}
})
it('does not paint after initialization consumes exactly the shared 4ms budget',()=>{
 const s=warmDeposition(),clear=AccumulationBuffer.prototype.clear;let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),draw=vi.spyOn(s.composite,'drawSource')
 const cleared=vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer){clear.call(this);now+=4})
 try{
  expect(s.executor.advance().pending).toBe(true);expect(cleared).toHaveBeenCalledOnce();expect(draw).not.toHaveBeenCalled()
  expect(s.executor.advance().pending).toBe(false);expect(draw).toHaveBeenCalledOnce()
 }finally{cleared.mockRestore();clock.mockRestore();s.close()}
})
it('keeps every multi-tile initialization before pixels while joining only the final initialization turn',()=>{
 const s=warmDeposition(2),clock=vi.spyOn(performance,'now').mockReturnValue(0),events:string[]=[],clear=AccumulationBuffer.prototype.clear,draw=s.composite.drawSource.bind(s.composite)
 const cleared=vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer){clear.call(this);events.push('clear')})
 vi.spyOn(s.composite,'drawSource').mockImplementation((r,frame)=>{events.push('draw');return draw(r,frame)})
 try{
  expect(s.executor.advance().pending).toBe(true);expect(events).toEqual(['clear'])
  expect(s.executor.advance().pending).toBe(false);expect(events).toEqual(['clear','clear','draw','draw'])
 }finally{cleared.mockRestore();clock.mockRestore();s.close()}
})
it('retires partial initialization and joined paint before external poison while preserving its exact error',()=>{
 const s=warmDeposition(2),clock=vi.spyOn(performance,'now').mockReturnValue(0),primary=new Error('joined second paint failed'),draw=s.composite.drawSource.bind(s.composite);let paints=0
 try{
  s.executor.advance();expect(s.scratch.bytes.live).toBe(128)
  vi.spyOn(s.composite,'drawSource').mockImplementation((r,frame)=>{if(++paints===2)throw primary;return draw(r,frame)})
  s.poison.mockImplementation(()=>{expect(s.layer['retainedTargets'].size).toBe(0);expect(s.scratch.bytes.live).toBe(0);s.layer.clear()})
  expect(()=>s.executor.advance()).toThrow(primary);expect(paints).toBe(2);expect(s.poison).toHaveBeenCalledOnce()
  expect(s.executor.pending).toBe(false);expect(s.executor.poisoned).toBe(true);expect(snapshotContextStorage(s.gl).reservedBytes).toBe(0)
 }finally{clock.mockRestore();s.close()}
})

it('keeps the same eight-command bound when last initialization shares its paint turn',()=>{
 const s=warmDeposition(1,9),clock=vi.spyOn(performance,'now').mockReturnValue(0),draw=vi.spyOn(s.composite,'drawSource')
 try{
  expect(s.executor.advance().pending).toBe(true);expect(draw).toHaveBeenCalledTimes(8)
  expect(s.executor.rawWashSealed).toBe(false)
  expect(s.executor.advance().pending).toBe(false);expect(draw).toHaveBeenCalledTimes(9)
 }finally{clock.mockRestore();s.close()}
})

it('flushes a final computed source stripe and paints without rereading upload alignment',()=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
  frame.draws.forEach(d=>Object.assign(d,{x:0,y:0}));s.layer.resolveForPaint({minX:0,minY:0,maxX:64,maxY:64})
  s.executor.enqueue({...s.submit(),frame,assets:[]});const work=s.executor['queue'][0],request=s.executor['maskRequest'](work,0)
  s.executor['maskParticipant'].beginAutoGeneration(request);s.gl.texSubImage2D.mockClear()
  const step=s.prepass.advanceAutoGeneration(65536,{deferFinalUpload:true});expect(step.finalUploadPending).toBe(true);expect(s.gl.texSubImage2D).not.toHaveBeenCalled()
  const query=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource');query.mockClear()
  expect(s.executor.advance().pending).toBe(false);expect(draw).toHaveBeenCalledOnce();expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
  expect(query.mock.calls.filter(c=>c[0]===s.gl.UNPACK_ALIGNMENT)).toHaveLength(1)
 }finally{clock.mockRestore();s.close()}
})

it.each([false,true])('pairs the first resident paint after final upload but preserves the physical allocation budget exit (resident=%s)',resident=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
  frame.draws.forEach(d=>Object.assign(d,{x:0,y:0}));if(resident)s.layer.resolveForPaint({minX:0,minY:0,maxX:64,maxY:64})
  s.executor.enqueue({...s.submit(),frame,assets:[]});const work=s.executor['queue'][0],request=s.executor['maskRequest'](work,0)
  s.executor['maskParticipant'].beginAutoGeneration(request);s.prepass.advanceAutoGeneration(65536,{deferFinalUpload:true})
  s.gl.texSubImage2D.mockClear();s.gl.texImage2D.mockClear();const draw=vi.spyOn(s.composite,'drawSource')
  s.gl.texSubImage2D.mockImplementationOnce(()=>{now=4})
  expect(s.executor.advance().pending).toBe(!resident)
  expect(s.gl.texSubImage2D).toHaveBeenCalledOnce();expect(s.gl.texImage2D).not.toHaveBeenCalled();expect(draw).toHaveBeenCalledTimes(resident?1:0)
  if(!resident)expect(s.executor['maskParticipant'].finalAutoUploadPending(request)).toBe(false)
  now=0;let turns=0;while(s.executor.pending&&turns++<100)s.executor.advance()
  expect(turns).toBeLessThan(100);expect(draw).toHaveBeenCalledOnce();expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
 }finally{clock.mockRestore();s.close()}
})

it('keeps the final CPU stripe charged without capturing GL when computation exhausts the advance budget',()=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
  frame.draws.forEach(d=>Object.assign(d,{x:0,y:0}));s.layer.resolveForPaint({minX:0,minY:0,maxX:64,maxY:64})
  s.executor.enqueue({...s.submit(),frame,assets:[]});const work=s.executor['queue'][0],request=s.executor['maskRequest'](work,0)
  s.executor['maskParticipant'].beginAutoGeneration(request);s.prepass.advanceAutoGeneration(65536,{deferFinalUpload:true})
  const advance=s.prepass.advanceAutoGeneration.bind(s.prepass);let expire=true
  vi.spyOn(s.prepass,'advanceAutoGeneration').mockImplementation((samples,options)=>{const result=advance(samples,options);if(expire&&result.finalUploadPending){expire=false;now=4}return result})
  const query=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource');query.mockClear();s.gl.texSubImage2D.mockClear()
  const charged=s.cpu.reservedBytes
  expect(s.executor.advance().pending).toBe(true);expect(query).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();expect(s.gl.texSubImage2D).not.toHaveBeenCalled()
  expect(s.cpu.reservedBytes).toBe(charged);expect(s.executor['maskParticipant'].finalAutoUploadPending(request)).toBe(true)
  now=0;expect(s.executor.advance().pending).toBe(false);expect(draw).toHaveBeenCalledOnce();expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
 }finally{clock.mockRestore();s.close()}
})

it('captures real capacity before work and charges/releases an unused executor token',()=>{
 const s=setup(),before=s.cpu.reservedBytes
 try{
  const acquire=vi.spyOn(s.prepass,'retainPreparedCapacity')
  const e=new CanonicalFrameExecutor(s.executor['options'])
  expect(acquire).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes-before).toBe(2048)
  e.cancel();expect(s.cpu.reservedBytes).toBe(before);e.cancel();expect(s.cpu.reservedBytes).toBe(before)
 }finally{s.close()}
})
it('retains sealed deposition capacity through actual raw holds, then releases without whole lane cancellation',()=>{
 const s=setup('wash',4,4,undefined,'reference-scalar-f32-rne-v1',undefined,4,'deposition-only')
 let owned:ReturnType<CanonicalFrameExecutor['takeRawWash']>|undefined
 try{
  s.executor.enqueue(s.submit());s.drain();const tiles=s.executor.rawWashTiles(),residency=tiles[0].view.residency
  if(residency.kind!=='external')throw new Error('Expected actual raw owner')
  const held=residency.lease()
  expect(()=>s.executor.takeRawWash()).toThrow(/leased/);held();const captured=s.executor['maskParticipant'];owned=s.executor.takeRawWash()
  const before=s.cpu.reservedBytes
  // The actual captured participant is detached; resetting the default does not release transferred raw ownership.
  expect(s.executor['maskLease']).toBeUndefined();s.executor.cancel();expect(captured.isReady()).toBe(true)
  const raw=owned.tiles[0].view.residency;if(raw.kind!=='external')throw new Error('Expected actual raw owner');const releaseRaw=raw.lease()
  expect(()=>owned!.release()).toThrow(/leased/);expect(captured.isReady()).toBe(true);releaseRaw()
  owned.release();expect(()=>captured.isReady()).toThrow(/Closed/);expect(s.cpu.reservedBytes).toBeLessThan(before);owned.release()
 }finally{owned?.release();s.close()}
})

function addExecutorCapacity(s:ReturnType<typeof setup>,side:number){
 const sources=s.bank?.preparedResources()??[],update=s.prepass.prepareCapacityAddition({width:side,height:side,slots:1},sources,s.composite.preparedResources())
 let companions:ReturnType<CanonicalRgba8CompositePass['prepareCompanionUpdate']>|undefined
 try{companions=s.composite.prepareCompanionUpdate([...sources,...update.preparedResources()]);update.assertPreparedPublication();companions.assertCurrent();update.publish();companions.publish();update.finalizeCleanup();companions.finalizeCleanup()}
 catch(error){try{update.cancel()}finally{companions?.cancel()}throw error}
}
it.each([false,true])('keeps the exact captured auto cursor and UV across genuine capacity addition (computed final=%s)',final=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
  frame.draws.forEach(d=>Object.assign(d,{x:0,y:0}));s.executor.enqueue({...s.submit(),frame,assets:[]})
  const work=s.executor['queue'][0];s.executor['preparePhysicalPlan'](work,s.layer)
  const request=s.executor['maskRequest'](work,0),lease=s.executor['maskParticipant'],old=lease.preparedCapacity()
  lease.beginAutoGeneration(request);lease.advanceAutoGeneration(final?65536:1,{deferFinalUpload:true})
  const pending=s.prepass['pendingAuto']!;expect(pending.participant).toBe(lease);expect(pending.computedFinal).toBe(final)
  expect(s.executor.hasPendingLayerTargetPreparation).toBe(true)
  addExecutorCapacity(s,96)
  expect(s.prepass.preparedCapacity().epoch).not.toBe(old.epoch);expect(lease.preparedCapacity()).toEqual(old)
  expect(s.prepass['pendingAuto']).toBe(pending);expect(pending.participant).toBe(lease)
  const draw=vi.spyOn(s.composite,'drawSource');s.drain();expect(draw).toHaveBeenCalled();expect(s.executor.poisoned).toBe(false)
  expect(s.prepass['pendingAuto']).toBeUndefined();expect(s.executor['maskLease']).toBeUndefined()
  expect(()=>lease.isReady()).toThrow(/Closed/)
 }finally{clock.mockRestore();s.close()}
})
it('exclusive reuse captures the new default after the ended gesture released its old record',()=>{
 const s=setup(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const old=s.executor['maskParticipant'];s.executor.enqueue(s.submit());s.drain();expect(()=>old.isReady()).toThrow(/Closed/)
  addExecutorCapacity(s,8);const current=s.prepass.preparedCapacity()
  s.executor.enqueue({...s.submit(),gestureId:'next'});expect(s.executor['maskParticipant'].preparedCapacity()).toEqual(current)
  s.drain();expect(s.executor.checkpointReady).toBe(true);expect(s.executor['maskLease']).toBeUndefined()
 }finally{clock.mockRestore();s.close()}
})
it('rolls back capture when later owned soft-program construction fails',()=>{
 const {pin}=nativeSoftFrame(),s=setup('buildup',64,64),before=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu),primary=new Error('program CPU admission failed');let calls=0
 const allocation=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{if(++calls===2)throw primary;return reserve(bytes)})
 try{expect(()=>new CanonicalFrameExecutor({...s.executor['options'],autoSource:pin})).toThrow(primary);expect(s.cpu.reservedBytes).toBe(before);expect(s.prepass['defaultRecord']!.leases.size).toBe(1)}
 finally{allocation.mockRestore();s.close()}
})

it('transfers the same retained token even when a genuine ended gesture produced no raw tiles',()=>{
 const s=setup('wash',4,4,undefined,'reference-scalar-f32-rne-v1',undefined,4,'deposition-only');let owned:ReturnType<CanonicalFrameExecutor['takeRawWash']>|undefined
 try{
  const captured=s.executor['maskParticipant'],frame:CanonicalMaterialFrame={profile:CANONICAL_MATERIAL_PROFILE,masked:false,entry:{phase:'between'},definitions:[],draws:[],fences:[{kind:'gestureEnd',at:0}]}
  s.executor.enqueue({...s.submit(),frame});s.drain();owned=s.executor.takeRawWash();expect(owned.tiles).toEqual([])
  expect(s.executor['maskLease']).toBeUndefined();s.executor.cancel();expect(captured.isReady()).toBe(true)
  owned.release();expect(()=>captured.isReady()).toThrow(/Closed/)
 }finally{owned?.release();s.close()}
})
it('attempts stale token cleanup after reset without touching the newly prepared default resources',()=>{
 const s=setup()
 try{
  const captured=s.executor['maskParticipant'];s.prepass.reset();s.prepass.prepare({width:8,height:8,slots:1},s.bank!.preparedResources())
  const current=s.prepass.preparedCapacity(),resources=s.prepass.preparedResources(),cpu=s.cpu.reservedBytes;const deletes=vi.spyOn(s.gl,'deleteTexture');deletes.mockClear()
  expect(()=>s.executor.cancel()).toThrow(/stale/);expect(s.executor['maskLease']).toBeUndefined();expect(()=>captured.isReady()).toThrow(/Closed/)
  expect(s.prepass.preparedCapacity()).toEqual(current);expect(s.prepass.preparedResources()).toEqual(resources);expect(s.cpu.reservedBytes).toBe(cpu);expect(deletes).not.toHaveBeenCalled()
 }finally{s.close()}
})
it('keeps the captured old image bindings after addition and additive source publication',()=>{
 const s=setup(),nextId=`asset:${'8'.repeat(64)}`,tip:BrushTip={kind:'bitmap',mask:nextId as TipMaskId,hardness:1,aspect:1,angle:0,rotation:'fixed',imageSampling:{kind:'integer-pyramid',signal:'inverse-gray',sourceRect:{x:0,y:0,width:1,height:1}}}
 const bank=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[{id:nextId as TipMaskId,tip,assetSide:1,readOriginalCoverage:()=>new Uint8Array([77])}],{gpuBytes:0,cpuBytes:0})
 try{
  const lease=s.executor['maskParticipant'],epoch=lease.preparedCapacity().epoch,record=[...s.prepass['records']].find(r=>r.workspace===epoch)!,bindings=record.bindings,sources=record.sources
  addExecutorCapacity(s,8);bank.jobs.forEach((_,i)=>bank.prepareJob(i))
  const update=s.prepass.prepareSourceUpdate([...s.bank!.preparedResources(),...bank.preparedResources()],{additive:true});update.assertCurrent();update.publish();update.finalizeCleanup()
  expect(lease.isReady()).toBe(true);expect(record.bindings).toBe(bindings);expect(record.sources).toBe(sources)
  const draw=vi.spyOn(s.composite,'drawSource');s.executor.enqueue(s.submit());s.drain();expect(draw).toHaveBeenCalled();expect(s.executor.poisoned).toBe(false)
 }finally{s.close();bank.reset()}
})
it('retires exclusive capture after a metadata-only recorded seal with no following advance',()=>{
 const s=setup(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const lease=s.executor['maskParticipant'];s.executor.enqueue(s.submit(decoded(1,0,false)));s.drain();expect(lease.isReady()).toBe(true)
  s.executor.sealRecordedPrefix({gestureId:'gesture',layerId:'layer',layerEpoch:0,recordedNext:1})
  expect(s.executor.checkpointReady).toBe(true);expect(s.executor['maskLease']).toBeUndefined();expect(()=>lease.isReady()).toThrow(/Closed/)
 }finally{clock.mockRestore();s.close()}
})
it('blocks reentrant enqueue during detached capacity token retirement',()=>{
 const s=setup(),reserve=s.cpu.reserve.bind(s.cpu);let e:CanonicalFrameExecutor|undefined,observed:unknown
 const allocation=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{const release=reserve(bytes);return bytes===CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES?()=>{release();if(e)try{e.enqueue(s.submit())}catch(error){observed=error}}:release})
 try{e=new CanonicalFrameExecutor(s.executor['options']);e.cancel();expect(String(observed)).toContain('busy');expect(e.pending).toBe(false);expect(e['maskLease']).toBeUndefined()}
 finally{allocation.mockRestore();e?.cancel();s.close()}
})

function residentFinalSoft(compositeCapacity=16){
 const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin,compositeCapacity)
 // recordingGL's old pixelStorei models alignment only. Model independent
 // WebGL upload flags here so their real restore cannot alias alignment.
 s.gl.UNPACK_FLIP_Y_WEBGL=9501;s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL=9502
 const flags=new Map<number,boolean>([[9501,true],[9502,true]]),get=s.gl.getParameter,store=s.gl.pixelStorei
 s.gl.getParameter=(p:number)=>flags.has(p)?flags.get(p):get(p)
 s.gl.pixelStorei=(p:number,v:number|boolean)=>{if(flags.has(p))flags.set(p,v as boolean);else store(p,v)}
 while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
 frame.draws.forEach(d=>Object.assign(d,{x:0,y:0}));s.layer.resolveForPaint({minX:0,minY:0,maxX:64,maxY:64})
 s.executor.enqueue({...s.submit(),frame,assets:[]})
 const work=s.executor['queue'][0],request=s.executor['maskRequest'](work,0)
 s.executor['maskParticipant'].beginAutoGeneration(request);s.prepass.advanceAutoGeneration(65536,{deferFinalUpload:true})
 s.gl.texSubImage2D.mockClear();s.gl.texImage2D.mockClear()
 return{...s,work,request,flags}
}
it('pairs one ACTUAL resident paint part with a final upload past deadline, retaining cursors/pins and the original turn clock',()=>{
 const s=residentFinalSoft(),draw=vi.spyOn(s.composite,'drawSource');let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),before=s.snapshot(),storage=snapshotContextStorage(s.gl)
 try{
  s.gl.texSubImage2D.mockImplementationOnce(()=>{
   now=4;expect(s.layer['retainedTargets'].size).toBe(1)
   expect([...s.layer['retainedTargets'].values()][0].storagePins).toBeGreaterThan(0)
   expect(()=>s.layer.clear()).toThrow(/retained/)
  })
  expect(s.executor.advance().pending).toBe(true)
  expect(draw).toHaveBeenCalledOnce();expect(s.work.draw).toBe(0);expect(s.work.paintPart).toBe(1)
  expect(s.gl.texSubImage2D).toHaveBeenCalledOnce();expect(s.gl.texImage2D).not.toHaveBeenCalled();expect(s.snapshot()).toEqual(before)
  expect(snapshotContextStorage(s.gl).residentBytes).toBe(storage.residentBytes)
  expect(s.prepass['pendingAuto']).toBeUndefined();expect(s.layer['retainedTargets'].size).toBe(1);expect([...s.flags.values()]).toEqual([true,true])
  now=0;s.drain();expect(draw).toHaveBeenCalledTimes(4);expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
  expect(s.layer['retainedTargets'].size).toBe(0);expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('preserves actual upload bytes, paint geometry/controls and final composition state versus an unexpired prepared turn',()=>{
 function run(expire:boolean){
  const s=residentFinalSoft(),uploads:number[][]=[],commands:unknown[]=[];let now=0
  const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),draw=s.composite.drawSource.bind(s.composite),planned=s.work.result.state
  try{
   s.gl.texSubImage2D.mockImplementation((...args:unknown[])=>{uploads.push(Array.from(args[8] as Uint8Array));if(expire)now=4})
   vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{commands.push({source:request.source,operation:request.operation,writeBounds:request.writeBounds});return draw(request,frame)})
   s.executor.advance();now=0;s.drain()
   // Resource handles differ between independent real services; compare actual
   // material view placement/control data, never pretend MockGL rasterizes.
   const normalized=commands.map(c=>{const r=c as {source:{kind:string;rgb?:unknown;view:{rect:unknown;bounds:unknown;mirror:unknown;textureWidth:number;textureHeight:number}};operation:unknown;writeBounds:unknown};return{source:{kind:r.source.kind,rgb:r.source.rgb,rect:r.source.view.rect,bounds:r.source.view.bounds,mirror:r.source.view.mirror,width:r.source.view.textureWidth,height:r.source.view.textureHeight},operation:r.operation,writeBounds:r.writeBounds}})
   return{uploads,commands:normalized,planned,ready:s.executor.checkpointReady,parts:normalized.length}
  }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
 }
 expect(run(true)).toEqual(run(false))
})
it.each(['upload','draw','changed']as const)('retires the actual paired upload/first paint on %s failure before poison, preserving the original error',stage=>{
 const s=residentFinalSoft(),primary=Error('paired '+stage),before=s.snapshot();let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  s.gl.texSubImage2D.mockImplementationOnce(()=>{now=4;if(stage==='upload')throw primary})
  if(stage==='draw')vi.spyOn(s.composite,'drawSource').mockImplementationOnce(()=>{throw primary})
  if(stage==='changed')s.changed.mockImplementationOnce(()=>{throw primary})
  s.poison.mockImplementation(()=>{expect(s.layer['retainedTargets'].size).toBe(0);expect(s.prepass['pendingAuto']).toBeUndefined()})
  expect(()=>s.executor.advance()).toThrow(primary);expect(s.poison).toHaveBeenCalledOnce();expect(s.executor.poisoned).toBe(true)
  expect(s.executor.pending).toBe(false);expect(s.snapshot()).toEqual(before);expect(s.releases.every(r=>r.mock.calls.length===1)).toBe(true)
  s.executor.cancel();expect(s.poison).toHaveBeenCalledOnce()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('cancels after one paired part without replaying the upload or releasing the physical plan twice',()=>{
 const s=residentFinalSoft(),draw=vi.spyOn(s.composite,'drawSource');let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  s.gl.texSubImage2D.mockImplementationOnce(()=>{now=4});expect(s.executor.advance().pending).toBe(true);expect(draw).toHaveBeenCalledOnce()
  s.executor.cancel();s.executor.cancel();expect(s.poison).toHaveBeenCalledOnce();expect(s.layer['retainedTargets'].size).toBe(0)
  expect(s.gl.texSubImage2D).toHaveBeenCalledOnce();expect(s.prepass['pendingAuto']).toBeUndefined();expect(s.executor.pending).toBe(false)
  expect(s.releases.every(r=>r.mock.calls.length===1)).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it.each(['scratch','wash-init']as const)('keeps the old final-upload deadline exit for the actual %s physical action',stage=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('wash',64,64,undefined,'reference-scalar-f32-rne-v1',pin,16,'deposition-only');let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
  frame.draws.forEach(d=>Object.assign(d,{x:0,y:0}));s.executor.enqueue({...s.submit(),frame,assets:[]})
  const work=s.executor['queue'][0];s.executor['preparePhysicalPlan'](work,s.layer);const plan=work.physical!
  while(work.targetCursor<plan.targetCount)plan.takeTarget(work.targetCursor++)
  if(stage==='wash-init')while(work.scratchCursor<plan.scratchCount)plan.takeScratch(work.scratchCursor++)
  const request=s.executor['maskRequest'](work,0);s.executor['maskParticipant'].beginAutoGeneration(request);s.prepass.advanceAutoGeneration(65536,{deferFinalUpload:true})
  const draw=vi.spyOn(s.composite,'drawSource'),live=s.scratch.bytes.live;s.gl.texSubImage2D.mockClear();s.gl.texImage2D.mockClear()
  s.gl.texSubImage2D.mockImplementationOnce(()=>{now=4})
  expect(s.executor.advance().pending).toBe(true);expect(draw).not.toHaveBeenCalled();expect(s.executor['washes'].size).toBe(0)
  expect(s.scratch.bytes.live).toBe(live);expect(s.gl.texImage2D).not.toHaveBeenCalled();expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
  if(stage==='scratch')expect(work.scratchCursor).toBe(0);expect(work.washCursor).toBe(0)
  now=0;s.drain();expect(draw).toHaveBeenCalled();expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('publishes the next genuine auto revision after a paired frame without reusing the previous mask or skipping source framing',()=>{
 const {pin,frame}=nativeSoftFrame(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  while(!s.executor['softProgram']!.done)s.executor['softProgram']!.advance(65536)
  s.layer.resolveForPaint({minX:0,minY:0,maxX:64,maxY:64})
  const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:1048576,outputBytes:4*1048576,drawPixels:1048576}},recipe=frame.definitions[0] as CanonicalSoftAutoRecipe
  const first=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:.5,flow:.7}],fences:[{kind:'segmentBegin',at:0,group:0}]},context).frame
  const second=buildCanonicalMaterial({masked:false,entry:{phase:'primary',group:0},draws:[{recipe:{...recipe,mirrorH:!recipe.mirrorH},role:'primary',x:0,y:0,opacity:.5,flow:.7}],fences:[{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},context).frame
  const draw=vi.spyOn(s.composite,'drawSource');s.gl.texSubImage2D.mockClear();s.gl.texSubImage2D.mockImplementation(()=>{now=4})
  s.executor.enqueue({...s.submit(),frame:first,assets:[]});expect(s.executor.advance().pending).toBe(false)
  expect(draw).toHaveBeenCalledOnce();expect(s.executor.checkpointReady).toBe(false);expect(s.gl.texSubImage2D).toHaveBeenCalledOnce()
  now=0;s.executor.enqueue({...s.submit(),ordinal:1,frame:second,assets:[]});expect(s.executor.advance().pending).toBe(false)
  expect(draw).toHaveBeenCalledTimes(2);expect(s.gl.texSubImage2D).toHaveBeenCalledTimes(2);expect(s.executor.checkpointReady).toBe(true)
  expect(draw.mock.calls[0][0].source.kind).toBe('maskRgb');expect(draw.mock.calls[1][0].source.kind).toBe('maskRgb')
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('pairs a genuine native default-auto final stripe with its resident first draw without another capture or allocation',()=>{
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1'),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  s.layer.resolveForPaint({minX:0,minY:0,maxX:64,maxY:64});s.executor.enqueue({...s.submit(),frame:closedAutoFrame(pin),assets:[]})
  const work=s.executor['queue'][0],request=s.executor['maskRequest'](work,0);s.executor['maskParticipant'].beginAutoGeneration(request)
  expect(s.prepass.advanceAutoGeneration(65536,{deferFinalUpload:true}).finalUploadPending).toBe(true)
  const query=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource');query.mockClear();s.gl.texSubImage2D.mockClear();s.gl.texImage2D.mockClear()
  s.gl.texSubImage2D.mockImplementationOnce(()=>{now=4})
  expect(s.executor.advance().pending).toBe(false);expect(draw).toHaveBeenCalledOnce();expect(s.gl.texSubImage2D).toHaveBeenCalledOnce();expect(s.gl.texImage2D).not.toHaveBeenCalled()
  expect(query.mock.calls.filter(c=>c[0]===s.gl.UNPACK_ALIGNMENT)).toHaveLength(1);expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('warm same-definition native draws share one capture without changing order, END or ledgers',()=>{
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const one=closedAutoFrame(pin),recipe=one.definitions[0]
  if(recipe.kind!=='defaultAuto')throw Error('Auto fixture required')
  const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}}
  const frame=unpackCanonicalMaterial(buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[0,1,2].map((x,i)=>({recipe,role:'primary' as const,x,y:0,opacity:(i+1)/4,flow:.7})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]},context).packed,context)
  s.executor.enqueue({...s.submit(),frame,assets:[]});s.prepareStorage()
  const before=s.snapshot(),queries=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource')
  s.drain()
  expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,2])
  expect(queries.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
  expect(s.snapshot()).toEqual(before);expect(s.executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close()}
})

it('warm native first atomic step progresses when its entry capture crosses the soft deadline',()=>{
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  const one=closedAutoFrame(pin),recipe=one.definitions[0]
  if(recipe.kind!=='defaultAuto')throw Error('Auto fixture required')
  const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}}
  const frame=unpackCanonicalMaterial(buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[0,1,2].map(x=>({recipe,role:'primary' as const,x,y:0,opacity:.5,flow:.7})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]},context).packed,context)
  s.executor.enqueue({...s.submit(),frame,assets:[]});s.prepareStorage()
  const original=s.gl.getParameter.bind(s.gl),query=vi.spyOn(s.gl,'getParameter').mockImplementation((name:unknown)=>{if(name===s.gl.VIEWPORT)now+=5;return original(name)})
  const draw=vi.spyOn(s.composite,'drawSource');s.executor.advance()
  expect(draw).toHaveBeenCalledTimes(1)
  expect(query.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
  s.drain();expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,2]);expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close()}
})

it('warm native callback owner release stops continuation without starting cold generation inside the parent',()=>{
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin),clock=vi.spyOn(performance,'now').mockReturnValue(0),lease=s.prepass.retainPreparedCapacity()
 try{
  const one=closedAutoFrame(pin),frame:typeof one={...one,draws:[0,1,2].map(x=>({...one.draws[0],x})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]}
  s.executor.enqueue({...s.submit(),frame,assets:[]});s.prepareStorage()
  const draw=vi.spyOn(s.composite,'drawSource'),uploads=s.gl.texSubImage2D.mock.calls.length
  const enter=s.prepass['enterRecordBatch'];let revoked=false
  s.prepass['enterRecordBatch']=(...args)=>{const release=enter.apply(s.prepass,args);return()=>{release();if(!revoked){revoked=true;lease.releaseOwner(s.executor)}}}
  s.executor.advance();expect(draw).toHaveBeenCalledTimes(1);expect(s.gl.texSubImage2D.mock.calls.length).toBe(uploads)
  s.drain();expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,2]);expect(s.executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();lease.release();s.close()}
})


function uniqueSingleStripeFixture(){
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const recipes=[0,17,31].map(rotation=>{
  const shape={scale:.5,ratio:.7,rotation}
  const oracle=sourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip:{...pin.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},storedScale:pin.brushScale,storedAngle:pin.brushAngle,shape,subpixelX:0,subpixelY:0,coverageProfile:'neon64-f32-fma-v1',maxPixels:1048576,maxWorkSamples:16*1048576})
  const [width,height]=oracle.geometry.maskSize
  const recipe:CanonicalDefaultAutoRecipe={kind:'defaultAuto',source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,...shape,subX:0,subY:0,width,height,mirrorH:false,mirrorV:false}
  return {recipe,oracle}
 })
 const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}}
 const frame=unpackCanonicalMaterial(buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:recipes.map(({recipe},x)=>({recipe,role:'primary' as const,x,y:0,opacity:(x+1)/4,flow:.7})),fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:3,group:0},{kind:'segmentEnd',at:3,group:0},{kind:'gestureEnd',at:3}]},context).packed,context)
 return {pin,frame,recipes}
}
it.each(['buildup','deposition-only']as const)('unique single-stripe public advance shares captures and independent coverage in %s',mode=>{
 const {pin,frame,recipes}=uniqueSingleStripeFixture(),s=setup(mode==='buildup'?'buildup':'wash',64,64,undefined,'reference-scalar-f32-rne-v1',pin,64,mode==='deposition-only'?'deposition-only':undefined),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  expect(frame.definitions).toHaveLength(3)
  s.executor.enqueue({...s.submit(),frame,assets:[]});s.prepareStorage()
  const before=s.snapshot(),queries=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource'),uploaded:Uint8Array[]=[]
  s.gl.texSubImage2D.mockImplementation((...args:unknown[])=>{uploaded.push(new Uint8Array(args[8] as Uint8Array))})
  s.drain()
  expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,2])
  expect(queries.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
  // Physical preparation uploaded the first recipe; these are the two new,
  // distinct masks, compared against the independent synchronous CPU API.
  expect(uploaded).toHaveLength(2)
  for(let index=0;index<2;index++)expect(uploaded[index]).toEqual(Uint8Array.from(Array.from(recipes[index+1].oracle.mask).flatMap(v=>[v,v,v,v])))
  expect(s.snapshot()).toEqual(before);expect(s.poison).not.toHaveBeenCalled();expect(s.executor.pendingFrameCount).toBe(0)
  if(mode==='deposition-only'){
   expect(draw.mock.calls.every(([request])=>request.operation.kind==='alphaDarken32')).toBe(true)
   expect(s.executor.rawWashSealed).toBe(true);expect(s.executor.checkpointReady).toBe(false)
   const ownership=s.executor.takeRawWash()
   try{expect(ownership.tiles).toHaveLength(1);expect(s.prepass['turnDepth']).toBe(0);expect(s.executor.checkpointReady).toBe(true)}
   finally{ownership.release()}
   expect(s.scratch.bytes.live).toBe(0);expect(s.releases.every(release=>release.mock.calls.length===1)).toBe(true)
  }else expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('unique single-stripe next CPU quantum yields on the original deadline without opening a CPU-only turn',()=>{
 const {pin,frame}=uniqueSingleStripeFixture(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  s.executor.enqueue({...s.submit(),frame,assets:[]});s.prepareStorage()
  const advance=s.prepass.advanceAutoGeneration.bind(s.prepass),samples:number[]=[]
  s.prepass.advanceAutoGeneration=(n,options)=>{samples.push(n);const result=advance(n,options);now+=4;return result}
  const draw=vi.spyOn(s.composite,'drawSource'),queries=vi.spyOn(s.gl,'getParameter')
  s.executor.advance();expect(draw).toHaveBeenCalledTimes(1);expect(samples).toEqual([64]);expect(s.executor.pending).toBe(true)
  const pending=s.prepass['pendingAuto'];expect(pending).toBeDefined();expect(pending!.computedFinal).toBe(false)
  queries.mockClear();s.executor.advance();expect(queries).not.toHaveBeenCalled();expect(s.prepass['pendingAuto']).toBe(pending)
  s.prepass.advanceAutoGeneration=advance;now=0;s.drain();expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,2])
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('unique single-stripe first native paint progresses even when entry capture spends the deadline',()=>{
 const {pin,frame}=uniqueSingleStripeFixture(),s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin);let now=0
 const clock=vi.spyOn(performance,'now').mockImplementation(()=>now)
 try{
  s.executor.enqueue({...s.submit(),frame,assets:[]});s.prepareStorage()
  const original=s.gl.getParameter.bind(s.gl),query=vi.spyOn(s.gl,'getParameter').mockImplementation((name:unknown)=>{if(name===s.gl.VIEWPORT)now+=5;return original(name)})
  const draw=vi.spyOn(s.composite,'drawSource');s.executor.advance()
  expect(draw).toHaveBeenCalledTimes(1);expect(query.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1);expect(s.executor.pending).toBe(true)
  query.mockRestore();now=0;s.drain();expect(draw.mock.calls.map(([request])=>request.source.view.rect.x)).toEqual([0,1,2]);expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('refuses standalone Auto bogus image assets before any paint',()=>{
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const s=setup('buildup',64,64,undefined,'reference-scalar-f32-rne-v1',pin),resolve=vi.spyOn(s.layer,'resolveForPaint')
 try{
  expect(()=>s.executor.enqueue({...s.submit(),frame:closedAutoFrame(pin)})).toThrow('Auto-only frame must not supply image assets')
  expect(resolve).not.toHaveBeenCalled();expect(s.reserveTransient).not.toHaveBeenCalled();expect(s.gl.texSubImage2D).not.toHaveBeenCalled()
 }finally{s.close()}
})


// RAM masked sequencing regressions: real prepared state / real capture queries.
function maskedWarmSequenceFixture(primaryCount=3,warm=true){
 const native=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const pin:CanonicalDefaultAutoSource={...native,coverageProfile:CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE}
 const nativeRecipe=closedAutoFrame(native).definitions[0]
 if(nativeRecipe.kind!=='defaultAuto')throw Error('Auto fixture required')
 const recipe:CanonicalDefaultAutoRecipe={...nativeRecipe,coverageProfile:CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE}
 const context:CanonicalMaterialContextV2={version:2,assets:[],primarySource:pin,maskSource:pin,maskingBlend:'multiply',budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}}
 const s=setup('buildup',64,64,undefined,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,pin,64,undefined,context)
 const frame=buildCanonicalMaterial({masked:true,entry:{phase:'between'},draws:[...Array.from({length:primaryCount},(_,x)=>({recipe,role:'primary' as const,x,y:0,opacity:.5,flow:.7})),{recipe,role:'mask',x:0,y:0,opacity:1,flow:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:primaryCount,group:0},{kind:'segmentEnd',at:primaryCount+1,group:0},{kind:'gestureEnd',at:primaryCount+1}]},context).frame
 s.executor.enqueue({...s.submit(),frame,assets:[]})
 const work=s.executor['queue'][0]
 s.executor['preparePhysicalPlan'](work,s.layer)
 let n=0
 while(!s.executor['preparePhysical'](work,s.layer,performance.now()))expect(++n).toBeLessThan(100)
 while(!s.executor['prepareDualPlanes'](work,performance.now()))expect(++n).toBeLessThan(100)
 if(warm){
  while(!s.executor['prepareAuto'](work,performance.now()))expect(++n).toBeLessThan(100)
  // Upload actual computed bytes through the same owned preparation turn.
  s.executor['runPreparedTurn'](work,performance.now(),'physical',()=>{})
  expect(s.executor['warmAutoReady'](work)).toBe(true)
 }
 return {...s,frame,work,primaryCount}
}

it('masked B resident same-role draws share one real capture and preserve role/fence output order',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=maskedWarmSequenceFixture()
 try{
  const before=s.snapshot(),queries=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource')
  s.executor.advance()
  // The next cold mask role is prepared outside the restored parent.
  expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,2])
  expect(queries.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
  expect(s.work.draw).toBe(3);expect(s.work.segment??0).toBe(0)
  expect(s.executor.pending).toBe(true);expect(s.snapshot()).toEqual(before)
  s.drain()
  expect(draw.mock.calls.filter(([r])=>r.operation.kind==='maskingAlpha')).toHaveLength(1)
  expect(draw.mock.calls.slice(0,3).map(([r])=>[r.source.view.rect.x,r.operation.kind])).toEqual([[0,'overBrowserFloat'],[1,'overBrowserFloat'],[2,'overBrowserFloat']])
  expect(s.executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})

it('masked warm sequence capture exceeding four ms performs only the first indivisible draw',()=>{
 let now=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),s=maskedWarmSequenceFixture()
 try{
  const original=s.gl.getParameter.bind(s.gl),draw=vi.spyOn(s.composite,'drawSource')
  vi.spyOn(s.gl,'getParameter').mockImplementation(name=>{if(name===s.gl.VIEWPORT)now+=5;return original(name)})
  s.executor.advance();expect(draw).toHaveBeenCalledTimes(1);expect(s.work.draw).toBe(1)
  s.drain();expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})

it('masked warm sequence preserves a thrown undefined primary and performs full failure cleanup',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=maskedWarmSequenceFixture()
 try{
  const original=s.composite.drawSource.bind(s.composite);let calls=0
  vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{const result=original(request,frame);if(++calls===2)throw undefined;return result})
  let caught=false,value:unknown='not-thrown'
  try{s.executor.advance()}catch(error){caught=true;value=error}
  expect(caught).toBe(true);expect(value).toBeUndefined();expect(calls).toBe(2)
  expect(s.poison).toHaveBeenCalledTimes(1);expect(s.executor.pending).toBe(false)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})

function mixedColdImageSoftFixture(){
 const original=nativeSoftFrame(),soft=canonicalSoftAutoSourcePin({...original.pin,sourceSlot:1,coverageProfile:CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE})
 const oldRecipe=original.frame.definitions[0];if(oldRecipe.kind!=='softAuto')throw Error('Actual soft recipe required')
 const softRecipe:CanonicalSoftAutoRecipe={...oldRecipe,sourceSlot:1,coverageProfile:CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE}
 const context:CanonicalMaterialContextV2={version:2,assets:[asset],primarySource:{kind:'image',asset:id,frameBounds:[{x:0,y:0,width:1,height:1}],brushScale:1,brushAngle:0},maskSource:soft,maskingBlend:'multiply',imageFrameIndices:'source-image-pipe-frame-v1',budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}}
 const s=setup('buildup',64,64,undefined,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,undefined,64,undefined,context)
 const image={...recipe,kind:'image' as const,imageFrameIndex:0,sourceSlot:0 as const}
 const frame=buildCanonicalMaterial({masked:true,entry:{phase:'between'},draws:[{recipe:image,role:'primary',x:0,y:0,opacity:.5,flow:1},{recipe:{...image,mirrorH:true},role:'primary',x:1,y:0,opacity:.5,flow:1},{recipe:softRecipe,role:'mask',x:0,y:0,opacity:1,flow:1},{recipe:softRecipe,role:'mask',x:1,y:0,opacity:1,flow:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:2,group:0},{kind:'segmentEnd',at:4,group:0},{kind:'gestureEnd',at:4}]},context).frame
 s.executor.enqueue({...s.submit(),frame});const work=s.executor['queue'][0]
 s.executor['preparePhysicalPlan'](work,s.layer)
 let n=0;while(!s.executor['preparePhysical'](work,s.layer,0)||!s.executor['prepareDualPlanes'](work,0))expect(++n).toBeLessThan(100)
 return{...s,work}
}
it('SAME Work IMAGE group restores before cold Soft CPU preparation and final upload paint',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=mixedColdImageSoftFixture()
 try{
  const before=s.snapshot(),queries=vi.spyOn(s.gl,'getParameter'),draw=vi.spyOn(s.composite,'drawSource'),uploads=vi.spyOn(s.gl,'texSubImage2D')
  let turns=0;while(!s.executor['maskedSegmentDue'](s.work)){s.executor.advance();expect(++turns).toBeLessThan(100)}
  expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1,0,1])
  expect(queries.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(2)
  expect(uploads).toHaveBeenCalled();expect(s.work.draw).toBe(4);expect(s.work.segment??0).toBe(0)
  expect(s.snapshot()).toEqual(before);s.drain();expect(draw.mock.calls.filter(([r])=>r.operation.kind==='maskingAlpha')).toHaveLength(1)
  expect(s.executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})
it('mixed cold sequence closes actual scopes when second-role paint throws undefined',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=mixedColdImageSoftFixture()
 try{
  const before=s.snapshot(),original=s.composite.drawSource.bind(s.composite);let calls=0
  vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{if(++calls===3)throw undefined;return original(request,frame)})
  let caught=false,value:unknown='not-thrown';try{let turns=0;while(s.executor.pending){s.executor.advance();expect(++turns).toBeLessThan(100)}}catch(error){caught=true;value=error}
  expect(caught).toBe(true);expect(value).toBeUndefined();expect(calls).toBe(3)
  expect(s.snapshot()).toEqual(before);expect(s.prepass['turnDepth']).toBe(0);expect(s.poison).toHaveBeenCalledOnce()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})

it('mixed parent has hard32 native children even when the original clock does not advance',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=maskedWarmSequenceFixture(40)
 try{
  const original=s.executor['paint'],paint=vi.fn((...args:Parameters<typeof original>)=>Reflect.apply(original,s.executor,args)),query=vi.spyOn(s.gl,'getParameter')
  s.executor['paint']=paint
  s.executor.advance();expect(paint).toHaveBeenCalledTimes(32);expect(s.work.draw).toBeGreaterThan(0);expect(s.work.draw).toBeLessThanOrEqual(32)
  expect(query.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
  expect(s.prepass['turnDepth']).toBe(0);expect(s.work.segment??0).toBe(0)
  s.drain();expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('unfinished Soft table after a mixed role switch resumes CPU64 without another GL capture',()=>{
 let now=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),s=mixedColdImageSoftFixture()
 try{
  const table=s.executor['maskSoftProgram']!,advance=table.advance.bind(table)
  table.advance=(n)=>{const result=advance(n);now+=4;return result}
  const query=vi.spyOn(s.gl,'getParameter')
  s.executor.advance();expect(s.work.draw).toBe(2);expect(table.done).toBe(false)
  expect(query.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
  query.mockClear();s.executor.advance();expect(query).not.toHaveBeenCalled();expect(s.work.draw).toBe(2)
  table.advance=advance;now=0;s.drain();expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('current cold Auto CPU64 continuation yields with zero full GL captures before final upload',()=>{
 let now=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),s=maskedWarmSequenceFixture(1,false)
 try{
  const request=s.executor['maskRequest'](s.work,s.work.draw),participant=s.executor['maskParticipant']
  expect(participant.beginAutoGeneration(request)).toBe(false)
  const pending=s.prepass['pendingAuto']!,advance=pending.evaluator.advance.bind(pending.evaluator),step=vi.spyOn(pending.evaluator,'advance').mockImplementation((...args)=>{const result=advance(...args);now+=4;return result})
  const query=vi.spyOn(s.gl,'getParameter');query.mockClear()
  s.executor.advance();expect(step).toHaveBeenCalled();expect(s.work.draw).toBe(0)
  expect(query).not.toHaveBeenCalled();expect(s.prepass['turnDepth']).toBe(0)
  step.mockRestore();now=0;s.drain();expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('prepared mixed final upload and first paint progress when the parent capture crosses the original deadline',()=>{
 let now=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),s=maskedWarmSequenceFixture(2,false)
 try{
  let turns=0;while(!s.executor['prepareAuto'](s.work,0))expect(++turns).toBeLessThan(100)
  const request=s.executor['maskRequest'](s.work,s.work.draw)
  expect(s.executor['maskParticipant'].finalAutoUploadPending(request)).toBe(true)
  const get=s.gl.getParameter.bind(s.gl),query=vi.spyOn(s.gl,'getParameter').mockImplementation((name)=>{if(name===s.gl.VIEWPORT)now+=5;return get(name)}),draw=vi.spyOn(s.composite,'drawSource')
  s.executor.advance();expect(draw).toHaveBeenCalledTimes(1);expect(s.work.draw).toBe(1)
  expect(query.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1);expect(s.prepass['turnDepth']).toBe(0)
  query.mockRestore();now=0;s.drain();expect(s.executor.checkpointReady).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})


it('closed mixed IMAGE/Soft sequence removes only one outer restore per original parent',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=mixedColdImageSoftFixture()
 try{
  const before=s.snapshot(),viewport=vi.spyOn(s.gl,'viewport'),draw=vi.spyOn(s.composite,'drawSource')
  s.executor.advance()
  // Count only restores of the caller viewport, not actual target setup.
  const saved=before.viewport
  const restores=viewport.mock.calls.filter(args=>args.every((v,i)=>v===saved[i])).length
  expect(draw.mock.calls.map(([r])=>r.source.view.rect.x)).toEqual([0,1])
  expect(restores).toBe(2);expect(s.work.draw).toBe(2);expect(s.snapshot()).toEqual(before)
  s.drain();expect(s.executor.checkpointReady).toBe(true);expect(s.poison).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0);expect(s.cache.bytes).toBe(0)}
})

// Full-DAB native64 domain is independent of source pixels, resource opacity and physical tile size.
it.each(['copy','destinationIn','destinationAtop']as const)('admits and publishes %s native64 domain across sub64 physical tiles at zero opacity',blend=>{
 const context:CanonicalMaterialContextV2={version:2,assets:[asset],primarySource:{kind:'image',asset:id,frameBounds:[{x:0,y:0,width:1,height:1}],brushScale:1,brushAngle:0},imageFrameIndices:'source-image-pipe-frame-v1',outerCompositionLaw:'generic-separable-u8-v1',budget:{workUnits:16*1048576,outputBytes:4*1048576,drawPixels:1048576}}
 const s=setup('wash',32,64,undefined,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,undefined,64,undefined,context)
 const executor=new CanonicalFrameExecutor({...s.executor['options'],pageBounds:{minX:0,minY:0,maxX:65,maxY:32}})
 const observedTiles:(readonly[number,number,boolean])[]=[]
 const draw=s.composite.drawSource.bind(s.composite),calls=vi.spyOn(s.composite,'drawSource')
 calls.mockImplementation((request,frame)=>{if(request.operation.kind==='genericSCU8'&&!observedTiles.length)for(const tile of executor['washes'].values())observedTiles.push([tile.x,tile.y,!!tile.destructive]);return draw(request,frame)})
 try{
  const image={...recipe,kind:'image'as const,imageFrameIndex:0,sourceSlot:0 as const}
  const frame=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe:image,role:'primary',x:63,y:0,opacity:0,flow:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},context).frame
  const submission={...s.submit(),frame,composition:{mode:'wash'as const,alphaDarken:'creamy'as const,outerResourceOpacity:0,outerBlend:blend}}
  const beforeCpu=s.cpu.reservedBytes
  s.reserveTransient.mockImplementationOnce(()=>{throw new RangeError('native64 admission fence')})
  expect(()=>executor.enqueue(submission)).toThrow('native64 admission fence')
  expect(calls).not.toHaveBeenCalled();expect(executor['washes'].size).toBe(0)
  expect(s.cpu.reservedBytes).toBe(beforeCpu);expect(executor.checkpointReady).toBe(true)
  executor.enqueue(submission)
  let turns=0;while(executor.pending){executor.advance();expect(++turns).toBeLessThan(300)}
  expect(executor.checkpointReady).toBe(true)
  // Exclusive END legitimately releases raw ownership; inspect during actual presentation, not after retirement.
  expect(observedTiles).toEqual([[0,0,true],[32,0,true]])
  const presented=calls.mock.calls.map(([r])=>r).filter(r=>r.operation.kind==='genericSCU8')
  expect(presented.length).toBeGreaterThan(0)
  expect(presented.every(r=>r.operation.kind==='genericSCU8'&&r.operation.control.mode===blend&&r.operation.control.opacity===0)).toBe(true)
  expect(presented.every(r=>r.writeBounds?.minX===0&&r.writeBounds.maxX===65&&r.writeBounds.minY===0&&r.writeBounds.maxY===32)).toBe(true)
 }finally{executor.cancel();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it.each(['copy','destinationIn','destinationAtop','rawAlphaDarken','marker','dissolve']as const)('does not grant historical execution for final RGBA %s',blend=>{
 for(const profile of [CANONICAL_STROKE_RASTER_PROFILE,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE,'reference-scalar-f32-rne-v1']as const)expect(()=>canonicalWashOuterOperation(profile,blend,0,{alphaDarken:'hard',seed:0})).toThrow('browser Pixel')
 const operation=canonicalWashOuterOperation(CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,blend,0,{alphaDarken:'hard',seed:0})
 expect(operation.kind).toBe('genericSCU8')
})
