import { describe, expect, it, vi } from 'vitest'
import tables from '../presets/fixtures/sourceSoftCircle/tables.native.json'
import { BrushMipCache } from './BrushMipCache'
import { CanonicalSoftCircleProgramOwner } from './CanonicalSoftCircleProgramOwner'

function basis(row = tables.constructors[0]) {
  const g = row.generator
  return {
    tip: { kind: 'auto', generator: 'soft', shape: 'circle', diameter: +g.diameter, ratio: +g.ratio,
      horizontalFade: +g.hfade, verticalFade: +g.vfade, spikes: 2, softness: 1, randomness: 0, density: 1, antialias: false } as const,
    curve: { points: row.points.map(p => ({ ...p })), coefficients: row.coefficients.map(c => [c[0], c[1], c[2], c[3]] as const) },
  }
}

describe('bound soft-circle CPU ownership', () => {
  it('shares the existing cap and refuses admission before staging allocation', () => {
    const cpu = new BrushMipCache(4096), held = cpu.reserve(4096), b = basis()
    let allocations = 0
    const Original = Float64Array
    vi.stubGlobal('Float64Array', class extends Original { constructor(n: number) { super(n); allocations++ } })
    try { expect(() => new CanonicalSoftCircleProgramOwner(cpu, b.tip, b.curve, 2402)).toThrow(RangeError) }
    finally { vi.unstubAllGlobals(); held() }
    expect(allocations).toBe(0); expect(cpu.reservedBytes).toBe(0)
  })

  it('prepares all five original native tables once with bounded cuts and immutable snapshots', () => {
    for (const row of tables.constructors) {
      const cpu = new BrushMipCache(), reserve = vi.spyOn(cpu, 'reserve'), b = basis(row)
      const owner = new CanonicalSoftCircleProgramOwner(cpu, b.tip, b.curve, row.values.length)
      b.curve.points[0].y = .123
      expect(() => owner.acquire()).toThrow('incomplete')
      let i = 0
      while (!owner.done) {
        const limit = [1, 7, 64, 3, 129][i++ % 5]
        expect(owner.advance(limit).written).toBeLessThanOrEqual(limit)
      }
      const a = owner.acquire(), second = owner.acquire()
      expect(a.program).toBe(second.program)
      expect(a.program.table).toEqual(row.values)
      expect(reserve).toHaveBeenCalledTimes(1)
      expect(cpu.reservedBytes).toBe(owner.estimatedCpuBytes)
      owner.retire(); owner.retire()
      expect(() => owner.acquire()).toThrow('retired')
      expect(() => owner.advance(1)).toThrow('retired')
      expect(cpu.reservedBytes).toBe(owner.estimatedCpuBytes)
      expect(a.program.table).toEqual(row.values)
      a.release(); a.release()
      expect(cpu.reservedBytes).toBe(owner.estimatedCpuBytes)
      second.release(); second.release(); owner.retire()
      expect(cpu.reservedBytes).toBe(0)
    }
  })

  it('returns reservations after unfinished retirement, prepare failure and advance failure', () => {
    const cpu = new BrushMipCache(), b = basis()
    const cancelled = new CanonicalSoftCircleProgramOwner(cpu, b.tip, b.curve, 2402)
    cancelled.advance(3); cancelled.retire(); cancelled.retire()
    expect(cpu.reservedBytes).toBe(0)
    expect(() => new CanonicalSoftCircleProgramOwner(cpu, { ...b.tip, ratio: 2 }, b.curve, 2402)).toThrow(RangeError)
    expect(cpu.reservedBytes).toBe(0)
    const failed = new CanonicalSoftCircleProgramOwner(cpu, b.tip, b.curve, 2402)
    expect(() => failed.advance(0)).toThrow('Invalid soft-circle preparation budget')
    expect(cpu.reservedBytes).toBe(0)
    expect(() => failed.acquire()).toThrow('retired')
  })

  it('preserves the preparation error if reservation cleanup throws after releasing', () => {
    const cpu = new BrushMipCache(), reserve = cpu.reserve.bind(cpu), b = basis()
    vi.spyOn(cpu, 'reserve').mockImplementation(bytes => {
      const release = reserve(bytes)
      return () => { release(); throw new Error('cleanup failure') }
    })
    expect(() => new CanonicalSoftCircleProgramOwner(cpu, { ...b.tip, ratio: 2 }, b.curve, 2402)).toThrow('Unsupported source soft-circle program')
    expect(cpu.reservedBytes).toBe(0)
  })

  it('keeps companion reservations and trims mip storage under the exact estimated charge', () => {
    const b = basis(), values = 2402
    const charge = 16 * values + 512 + 1024 + 128 * (b.curve.points.length + b.curve.coefficients.length)
    const cpu = new BrushMipCache(charge + 128), companion = cpu.reserve(128)
    cpu.get('old mip', () => [new Uint8Array(1024)])
    const owner = new CanonicalSoftCircleProgramOwner(cpu, b.tip, b.curve, values)
    expect(owner.estimatedCpuBytes).toBe(charge)
    expect(cpu.bytes).toBe(0)
    expect(cpu.reservedBytes).toBe(cpu.budgetBytes)
    expect(() => cpu.reserve(1)).toThrow(RangeError)
    owner.retire()
    expect(cpu.reservedBytes).toBe(128)
    companion(); expect(cpu.reservedBytes).toBe(0)
  })

  it('detaches the last lease and reservation before a throwing cleanup callback', () => {
    const cpu = new BrushMipCache(), reserve = cpu.reserve.bind(cpu), b = basis(), cleanup = vi.fn()
    vi.spyOn(cpu, 'reserve').mockImplementation(bytes => {
      const release = reserve(bytes)
      return () => { cleanup(); release(); throw new Error('release notification') }
    })
    const owner = new CanonicalSoftCircleProgramOwner(cpu, b.tip, b.curve, 2402)
    owner.advance(2402)
    const lease = owner.acquire()
    owner.retire(); expect(cleanup).not.toHaveBeenCalled()
    expect(() => lease.release()).toThrow('release notification')
    lease.release(); owner.retire()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(cpu.reservedBytes).toBe(0)
  })
})
