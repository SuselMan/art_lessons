import { ownedBrushFixture } from '../../testing/ownedBrushFixture'
import { describe, expect, it, vi } from 'vitest'
import type { BrushTip, TipMaskId } from '@grafetto/shared'
import levels from '../raster/fixtures/nativeImageLevel.qt51513.json'
import transforms from '../presets/fixtures/sourceImageTransform.native.json'
import { CanonicalMaskSourceBank, type CanonicalMaskSourceInput } from './CanonicalMaskSourceBank'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'

function mockGL() {
  let id = 0, bound: any = null, unpack = 8
  const images = new Map<object, Uint8Array>(), filters = new Map<object, Map<number, number>>()
  const gl: any = { MAX_TEXTURE_SIZE: 1, TEXTURE_2D: 2, TEXTURE_BINDING_2D: 3, ACTIVE_TEXTURE: 4,
    UNPACK_ALIGNMENT: 5, RGBA: 6, LUMINANCE_ALPHA: 7, UNSIGNED_BYTE: 8, CLAMP_TO_EDGE: 9,
    NEAREST: 10, LINEAR: 11, TEXTURE_MIN_FILTER: 12, TEXTURE_MAG_FILTER: 13, TEXTURE_WRAP_S: 14, TEXTURE_WRAP_T: 15 }
  gl.NO_ERROR=0;gl.getError=()=>0;gl.isContextLost=()=>false
  gl.createTexture = vi.fn(() => ({ id: ++id }))
  gl.deleteTexture = vi.fn((texture: object) => images.delete(texture))
  gl.getParameter = (name: number) => name === gl.MAX_TEXTURE_SIZE ? 16384 : name === gl.TEXTURE_BINDING_2D ? bound : name === gl.UNPACK_ALIGNMENT ? unpack : 100
  gl.activeTexture = vi.fn()
  gl.bindTexture = (_: number, texture: object | null) => { bound = texture }
  gl.pixelStorei = (_: number, value: number) => { unpack = value }
  gl.texParameteri = (_: number, name: number, value: number) => { let values = filters.get(bound); if (!values) { values = new Map(); filters.set(bound, values) }; values.set(name, value) }
  gl.texImage2D = vi.fn((...args: any[]) => { images.set(bound, new Uint8Array(args[8])) })
  return { gl, images, filters }
}
function input(width = 3, height = 5, gray?: readonly number[]): CanonicalMaskSourceInput {
  const assetSide = Math.max(width, height) + 2, bytes = new Uint8Array(assetSide * assetSide)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes[(y + 1) * assetSide + x + 1] = 255 - (gray?.[y * width + x] ?? ((x * 83 + y * 54) % 256))
  const id = 'chalk' as TipMaskId
  const tip: BrushTip = { kind: 'bitmap', mask: id, hardness: 1, aspect: 1, angle: 0, rotation: 'fixed', imageSampling: { kind: 'integer-pyramid', signal: 'inverse-gray', sourceRect: { x: 1, y: 1, width, height } } }
  return { id, tip, assetSide, readOriginalCoverage: vi.fn(() => bytes) }
}
function setup(source = input(), gpu = 16 * 1024 * 1024, cpuBytes = 4 * 1024 * 1024) {
  const state = mockGL(), cache = new BrushTextureCache(state.gl, gpu), cpu = new BrushMipCache(cpuBytes)
  const bank = new CanonicalMaskSourceBank(state.gl, cache, cpu, [source], { gpuBytes: 0, cpuBytes: 0 })
  return { ...state, cache, cpu, bank, source }
}

describe('finite opaque grayscale canonical source bank', () => {
  it('recovers all104 pinned native prepared RGBA levels, preserving opaque white interior and zero border', () => {
    let count = 0
    for (const row of levels.cases) {
      const s = setup(input(row.sourceWidth, row.sourceHeight, row.sourceGrayBytes))
      const index = s.bank.jobs.findIndex(job => job.resource.scale === row.selectedScale)
      expect(index).toBeGreaterThanOrEqual(0); s.bank.prepareJob(index)
      expect([...s.images.get(s.cache.get(s.bank.jobs[index].key)!)!]).toEqual(row.borderedBytesRGBA)
      s.bank.reset(); count++
    }
    for (const row of transforms.cases) {
      if (row.preparation !== 'opaque-gray') continue
      const s = setup(input(row.width, row.height, row.input.filter((_, i) => i % 4 === 0)))
      const index = s.bank.jobs.findIndex(job => job.resource.scale === row.expected.baseScale)
      expect(index).toBeGreaterThanOrEqual(0); s.bank.prepareJob(index)
      expect([...s.images.get(s.cache.get(s.bank.jobs[index].key)!)!]).toEqual(row.expected.levelRGBA)
      s.bank.reset(); count++
    }
    expect(count).toBe(104)
  })
  it('prepares one level per job, baseRGBA NEAREST only, with zero work on repeats', () => {
    const s = setup(), external = s.gl.createTexture(); s.gl.bindTexture(s.gl.TEXTURE_2D, external)
    s.bank.jobs.forEach((job, index) => {
      s.bank.prepareJob(index)
      const texture = s.cache.get(job.key)!
      expect(s.filters.get(texture)?.get(s.gl.TEXTURE_MIN_FILTER)).toBe(s.gl.NEAREST)
      expect(s.filters.get(texture)?.get(s.gl.TEXTURE_MAG_FILTER)).toBe(s.gl.NEAREST)
      expect(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)).toBe(external)
    })
    expect(s.bank.isReady()).toBe(true); expect(s.bank.resources()).toHaveLength(s.bank.jobs.length)
    const calls = s.gl.texImage2D.mock.calls.length
    s.bank.jobs.forEach((_, index) => s.bank.prepareJob(index))
    expect(s.gl.texImage2D).toHaveBeenCalledTimes(calls)
    expect(s.source.readOriginalCoverage).toHaveBeenCalledTimes(calls)
    expect(s.cache.bytes).toBe(s.bank.gpuBytes)
    expect(s.cpu.bytes + s.cpu.reservedBytes).toBeLessThanOrEqual(s.cpu.budgetBytes)
    s.bank.reset(); expect(s.cpu.reservedBytes).toBe(0)
  })
  it('rejects aggregate GPU and companion CPU peaks before asset reads, allocations or cache changes', () => {
    const source = input(), { gl } = mockGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache()
    expect(() => new CanonicalMaskSourceBank(gl, cache, cpu, [source], { gpuBytes: cache.budgetBytes, cpuBytes: 0 })).toThrow('budgets')
    expect(() => new CanonicalMaskSourceBank(gl, cache, cpu, [source], { gpuBytes: 0, cpuBytes: cpu.budgetBytes })).toThrow('budgets')
    expect(source.readOriginalCoverage).not.toHaveBeenCalled(); expect(gl.createTexture).not.toHaveBeenCalled()
    const bank = new CanonicalMaskSourceBank(gl, cache, cpu, [source], { gpuBytes: 0, cpuBytes: 0 })
    const release = cpu.reserve(cpu.budgetBytes - bank.metadataCpuBytes)
    expect(() => bank.prepareJob(0)).toThrow('budget')
    expect(source.readOriginalCoverage).not.toHaveBeenCalled(); expect(gl.createTexture).not.toHaveBeenCalled(); expect(cpu.reservedBytes).toBe(cpu.budgetBytes - bank.metadataCpuBytes); release(); bank.reset()
  })
  it('requires explicit unchanged opaque-gray provenance and validates asset layout before image work', () => {
    const source = input(), { gl } = mockGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache()
    expect(() => new CanonicalMaskSourceBank(gl, cache, cpu, [{ ...source, tip: { ...source.tip, imageSampling: undefined } }], { gpuBytes: 0, cpuBytes: 0 })).toThrow('provenance')
    const bank = new CanonicalMaskSourceBank(gl, cache, cpu, [{ ...source, readOriginalCoverage: () => new Uint8Array(2) }], { gpuBytes: 0, cpuBytes: 0 })
    expect(() => bank.prepareJob(0)).toThrow('layout'); expect(gl.createTexture).not.toHaveBeenCalled(); bank.reset()
  })
  it('handles cancellation before and after allocation without publishing a partial ready bank', () => {
    const s = setup(), abort = new AbortController(); abort.abort()
    expect(s.bank.prepareJob(0, abort.signal)).toBe('cancelled'); expect(s.gl.createTexture).not.toHaveBeenCalled()
    const mid = new AbortController(), upload = s.gl.texImage2D.getMockImplementation()
    s.gl.texImage2D.mockImplementation((...args: any[]) => { upload(...args); mid.abort() })
    expect(s.bank.prepareJob(0, mid.signal)).toBe('cancelled')
    expect(s.gl.deleteTexture).toHaveBeenCalledTimes(1); expect(s.bank.isReady()).toBe(false)
    expect(s.cpu.reservedBytes).toBe(s.bank.metadataCpuBytes); s.bank.reset()
  })
  it('protects the whole bank with a lease, reports eviction and distinguishes reset from context loss', () => {
    for (const lost of [false, true]) {
      const s = setup(); s.bank.jobs.forEach((_, index) => s.bank.prepareJob(index))
      const release = s.bank.lease(), originalBytes = s.cache.bytes
      s.cache.protect([])
      expect(s.bank.isReady()).toBe(true); release()
      const textures = s.bank.resources().map(resource => resource.texture)
      s.bank.reset(lost); s.bank.reset(lost)
      expect(s.gl.deleteTexture).toHaveBeenCalledTimes(lost ? 0 : textures.length)
      expect(s.cache.bytes).toBe(0); expect(originalBytes).toBeGreaterThan(0)
      expect(s.bank.isReady()).toBe(false); expect(() => s.bank.resources()).toThrow('prepared')
    }
    const s = setup(); s.bank.jobs.forEach((_, index) => s.bank.prepareJob(index))
    s.cache.clear(true); expect(s.bank.isReady()).toBe(false); s.bank.reset(true)
    expect(s.gl.deleteTexture).not.toHaveBeenCalled()
  })
  it('rejects a wide enlarged bank before allocation and preserves borrowed textures on reset', () => {
    const wide = input(200, 64), state = mockGL(), cache = new BrushTextureCache(state.gl), cpu = new BrushMipCache()
    expect(() => new CanonicalMaskSourceBank(state.gl, cache, cpu, [wide], { gpuBytes: 692224, cpuBytes: 692224 })).toThrow('budgets')
    expect(wide.readOriginalCoverage).not.toHaveBeenCalled(); expect(state.gl.createTexture).not.toHaveBeenCalled()
    const tooWideForScaler = input(520, 1)
    expect(() => new CanonicalMaskSourceBank(state.gl, cache, cpu, [tooWideForScaler], { gpuBytes: 0, cpuBytes: 0 })).toThrow('budgets')
    expect(tooWideForScaler.readOriginalCoverage).not.toHaveBeenCalled()
    const s = setup(); s.bank.jobs.forEach((_, index) => s.bank.prepareJob(index))
    const borrowed = new CanonicalMaskSourceBank(s.gl, s.cache, s.cpu, [s.source], { gpuBytes: 0, cpuBytes: 0 })
    const uploads = s.gl.texImage2D.mock.calls.length
    borrowed.jobs.forEach((_, index) => borrowed.prepareJob(index))
    expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads); borrowed.reset()
    expect(s.gl.deleteTexture).not.toHaveBeenCalled(); expect(s.bank.isReady()).toBe(true)
    s.bank.reset()
  })
  it('cleans a failed upload, leaves other entries intact and permits an explicit retry', () => {
    const s = setup(), otherOwned=ownedBrushFixture(s.gl,4),other=otherOwned.texture
    s.cache.protect(['other']);s.cache.putOwned('other',otherOwned)
    s.gl.texImage2D.mockImplementationOnce(() => { throw new Error('authored upload failure') })
    expect(() => s.bank.prepareJob(0)).toThrow('upload failure')
    expect(s.gl.deleteTexture).toHaveBeenCalledTimes(1); expect(s.cache.get('other')).toBe(other)
    expect(s.bank.isReady()).toBe(false); expect(s.cpu.reservedBytes).toBe(s.bank.metadataCpuBytes)
    expect(s.bank.prepareJob(0)).toBe('ready'); s.bank.reset()
    expect(s.cache.get('other')).toBe(other)
  })

  it('admits the153x64 finite bank by nonoverlapping reachable phases without retaining its large L8 beside RGBA', () => {
    const source = input(153, 64), state = mockGL(), cache = new BrushTextureCache(state.gl), cpu = new BrushMipCache()
    const bank = new CanonicalMaskSourceBank(state.gl, cache, cpu, [source], { gpuBytes: 692224, cpuBytes: 692224 })
    expect(bank.maximumTransientCpuBytes).toBe(3150820)
    const index = bank.jobs.findIndex(job => job.resource.scale === 8)
    expect(index).toBeGreaterThanOrEqual(0)
    const upload = state.gl.texImage2D.getMockImplementation()
    state.gl.texImage2D.mockImplementation((...args: any[]) => {
      expect(cpu.reservedBytes + cpu.bytes).toBeLessThanOrEqual(cpu.budgetBytes)
      upload(...args)
    })
    expect(bank.prepareJob(index)).toBe('ready')
    // The large L8 result exceeds remaining derivative capacity while expansion
    // is reserved: BrushMipCache returns it uncached instead of retaining twice.
    expect(cpu.bytes).toBe(0)
    expect(cache.resourceBytes(bank.jobs[index].key)).toBe(2520656)
    bank.reset(); expect(cpu.reservedBytes).toBe(0)
  })

})

it('exports cold immutable CAS/crop/level bindings without new reads, uploads or changes to texture API', () => {
  const s = setup(); expect(() => s.bank.preparedResources()).toThrow('prepared');
  for (let i = 0; i < s.bank.jobs.length; i++) s.bank.prepareJob(i);
  const reads = (s.source.readOriginalCoverage as ReturnType<typeof vi.fn>).mock.calls.length, uploads = s.gl.texImage2D.mock.calls.length;
  const resources = s.bank.resources(), bindings = s.bank.preparedResources();
  expect(bindings).toHaveLength(resources.length);
  bindings.forEach((r, i) => {
    expect(r.key).toBe(resources[i]!.key); expect(r.bytes).toBe(resources[i]!.width * resources[i]!.height * 4);
    expect(r.canonical!.index).toBe(i); expect(r.canonical!.asset).toMatchObject({ id: 'chalk', x: 1, y: 1, width: 3, height: 5 });
    expect(r.canonical!.baseScale).toBe(s.bank.jobs[i]!.resource.scale);
    expect(Object.isFrozen(r.canonical!.asset)).toBe(true);
  });
  expect(s.source.readOriginalCoverage).toHaveBeenCalledTimes(reads); expect(s.gl.texImage2D).toHaveBeenCalledTimes(uploads);
  expect('canonical' in resources[0]!).toBe(false); s.bank.reset();
});
