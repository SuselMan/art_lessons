import { describe, expect, it } from 'vitest'
import vectors from './fixtures/nativeRandom.vectors.json'
import { KritaPerStrokeRandomSource, KritaRandomSource, qt5QStringHash } from './nativeRandom'

const next = (source: KritaRandomSource, count: number): number[] => Array.from({ length: count }, () => source.generate())
describe('isolated native Taus88 CPU oracle', () => {
  for (const row of vectors.cases) {
    it(`matches Boost raw, normalized and integer draws for seed bits ${row.seed}`, () => {
      const source = new KritaRandomSource(row.seed)
      expect(source.snapshot().state).toEqual(row.initialState)
      expect(next(source, row.raw.length)).toEqual(row.raw)
      expect(source.snapshot()).toEqual({ version: 1, state: row.stateAfter16, draws: 16 })
      const normalized = new KritaRandomSource(row.seed)
      expect(row.normalized.map(() => normalized.generateNormalized())).toEqual(row.normalized)
      const bounded = new KritaRandomSource(row.seed)
      expect(row.bounded.map(v => bounded.generate(v.min, v.max))).toEqual(row.bounded.map(v => v.value))
      expect(bounded.snapshot()).toEqual({ version: 1, state: row.stateAfterBounded, draws: row.bounded.length })
    })
    it(`continues across cloned and JSON-restored state for seed bits ${row.seed}`, () => {
      const source = new KritaRandomSource(row.seed)
      next(source, 5)
      expect(source.snapshot().state).toEqual(row.cloneState)
      const copy = source.clone()
      const restored = KritaRandomSource.restore(JSON.parse(JSON.stringify(source.snapshot())))
      expect(next(source, 8)).toEqual(row.cloneNext)
      expect(next(copy, 8)).toEqual(row.cloneNext)
      expect(next(restored, 8)).toEqual(row.cloneNext)
      expect(copy.snapshot()).toEqual(source.snapshot())
    })
  }
  it('preserves normalized endpoints including one, and consumes a draw for a singleton integer range', () => {
    for (const endpoint of vectors.endpoints) {
      const state: [number, number, number] = [endpoint.state[0], endpoint.state[1], endpoint.state[2]]
      const source = KritaRandomSource.restore({ version: 1, state, draws: 0 })
      expect(source.clone().generate()).toBe(endpoint.raw)
      expect(source.generateNormalized()).toBe(endpoint.normalized)
    }
    expect(vectors.endpoints.map(v => v.normalized)).toEqual([0, 1])
    const singleton = new KritaRandomSource(341)
    expect(singleton.generate(7, 7)).toBe(7)
    expect(singleton.snapshot().draws).toBe(1)
    const zero = KritaRandomSource.restore({ version: 1, state: [0, 0, 0], draws: 0 })
    expect(zero.generateNormalized()).toBe(0)
  })
  it('rejects invalid bounds without advancing and returns owned snapshot arrays', () => {
    const source = new KritaRandomSource(42), saved = source.snapshot()
    for (const bounds of [[2, 1], [0.5, 2], [-0x80000001, 0], [0, 0x80000000], [0, NaN]]) {
      expect(() => source.generate(bounds[0], bounds[1])).toThrow(RangeError)
      expect(source.snapshot()).toEqual(saved)
    }
    const snapshot = JSON.parse(JSON.stringify(saved))
    const restored = KritaRandomSource.restore(snapshot)
    snapshot.state[0] = 0
    expect(restored.snapshot()).toEqual(saved)
    expect(() => new KritaRandomSource(-1)).toThrow(RangeError)
    expect(() => new KritaRandomSource(0x100000000)).toThrow(RangeError)
    expect(() => KritaRandomSource.restore({ version: 1, state: [0, 0, NaN], draws: 0 })).toThrow(RangeError)
  })
})

describe('isolated Qt5 keyed per-stroke source', () => {
  for (const row of vectors.cases) {
    it(`matches actual Qt5 QString hashes and per-key values for seed bits ${row.seed}`, () => {
      const keyed = new KritaPerStrokeRandomSource(row.seed)
      for (const item of row.keyed) {
        expect(qt5QStringHash(item.key)).toBe(item.hash)
        expect(keyed.generateNormalized(item.key)).toBe(item.normalized)
        expect(keyed.generate(item.key, -3, 5)).toBe(item.boundedMinus3To5Exclusive)
        expect(keyed.generateNormalized(item.key)).toBe(item.raw / 0xffffffff)
      }
      expect(keyed.snapshot().cache.length).toBe(row.keyed.length)
      const copy = keyed.clone()
      const restored = KritaPerStrokeRandomSource.restore(JSON.parse(JSON.stringify(keyed.snapshot())))
      expect(copy.snapshot()).toEqual(keyed.snapshot())
      expect(restored.snapshot()).toEqual(keyed.snapshot())
      const reversed = new KritaPerStrokeRandomSource(row.seed)
      for (const item of row.keyed.toReversed()) expect(reversed.generateNormalized(item.key)).toBe(item.normalized)
    })
  }
  it('preserves UTF-16 units and does not normalize distinct Unicode strings', () => {
    expect(qt5QStringHash('é')).not.toBe(qt5QStringHash('e\u0301'))
    expect(qt5QStringHash('🎨')).toBe((0xd83c * 31 + 0xdfa8) >>> 0)
    expect(qt5QStringHash('a\0b')).toBe((97 * 31 * 31 + 98) >>> 0)
  })
  it('rejects invalid exclusive ranges and forged cache values', () => {
    const source = new KritaPerStrokeRandomSource(42)
    expect(() => source.generate('key', 4, 4)).toThrow(RangeError)
    expect(source.snapshot().cache).toEqual([])
    source.generateNormalized('key')
    const corrupted = JSON.parse(JSON.stringify(source.snapshot()))
    corrupted.cache[0][1] ^= 1
    expect(() => KritaPerStrokeRandomSource.restore(corrupted)).toThrow(RangeError)
    const duplicate = JSON.parse(JSON.stringify(source.snapshot()))
    duplicate.cache.push(duplicate.cache[0])
    expect(() => KritaPerStrokeRandomSource.restore(duplicate)).toThrow(RangeError)
  })
})
