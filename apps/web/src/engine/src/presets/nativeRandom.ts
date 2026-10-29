/** Isolated CPU compatibility primitive. Not selected by any shipped brush.
 * Taus88 equations are defined by Boost.Random (BSL-1.0); see fixture provenance.
 * Explicit seeds only: choosing/transporting a native gesture seed is a separate policy.
 */
export interface KritaRandomSnapshot {
  readonly version: 1
  readonly state: readonly [number, number, number]
  readonly draws: number
}
const UINT32_MAX = 0xffffffff
function uint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= UINT32_MAX
}
function integerRange(min: number, max: number, exclusive = false): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < -0x80000000 || max > 0x7fffffff || (exclusive ? min >= max : min > max)) {
    throw new RangeError('Invalid native int32 range')
  }
}
/** A mutable sequential source. A bounded draw also advances the source for [n,n]. */
export class KritaRandomSource {
  private state: [number, number, number]
  private draws = 0

  constructor(seed: number) {
    if (!uint32(seed)) throw new RangeError('Expected explicit uint32 seed bits')
    this.state = [seed < 2 ? seed + 2 : seed, seed < 8 ? seed + 8 : seed, seed < 16 ? seed + 16 : seed]
  }

  generate(): number
  generate(min: number, max: number): number
  generate(min?: number, max?: number): number {
    if (min !== undefined || max !== undefined) {
      if (min === undefined || max === undefined) throw new RangeError('Both bounds are required')
      integerRange(min, max)
    }
    if (this.draws >= Number.MAX_SAFE_INTEGER) throw new RangeError('Random draw cursor exhausted')
    const [a, b, c] = this.state
    const nextA = (((a & 0xfffffffe) << 12) ^ (((a << 13) ^ a) >>> 19)) >>> 0
    const nextB = (((b & 0xfffffff8) << 4) ^ (((b << 2) ^ b) >>> 25)) >>> 0
    const nextC = (((c & 0xfffffff0) << 17) ^ (((c << 3) ^ c) >>> 11)) >>> 0
    this.state = [nextA, nextB, nextC]
    this.draws++
    const raw = (nextA ^ nextB ^ nextC) >>> 0
    return min === undefined || max === undefined ? raw : min + raw % (max - min + 1)
  }

  generateNormalized(): number { return this.generate() / UINT32_MAX }

  snapshot(): KritaRandomSnapshot { return { version: 1, state: [...this.state], draws: this.draws } }

  static restore(snapshot: KritaRandomSnapshot): KritaRandomSource {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.state) || snapshot.state.length !== 3 || !snapshot.state.every(uint32) || !Number.isSafeInteger(snapshot.draws) || snapshot.draws < 0) {
      throw new RangeError('Invalid native random snapshot')
    }
    const source = new KritaRandomSource(0)
    source.state = [snapshot.state[0], snapshot.state[1], snapshot.state[2]]
    source.draws = snapshot.draws
    return source
  }

  clone(): KritaRandomSource { return KritaRandomSource.restore(this.snapshot()) }
}

/** Qt5 QString qHash(key) with its default seed=0: DJB31XA over UTF-16 units.
 * Verified against Qt5.15.13 runtime and identical upstream 5.15.7/5.15.13 source.
 * This is intentionally not the seeded CRC32 variant or a general Qt6 hash.
 */
export function qt5QStringHash(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0
  return hash
}
export interface KritaPerStrokeRandomSnapshot {
  readonly version: 1
  readonly seed: number
  readonly cache: readonly (readonly [string, number])[]
}
/** Keyed one-time generators, independent from the mutable per-dab source.
 * Callers must supply the exact native key, including the FuzzyStroke suffix.
 */
export class KritaPerStrokeRandomSource {
  private readonly seed: number
  private cache = new Map<string, number>()

  constructor(seed: number) {
    if (!uint32(seed)) throw new RangeError('Expected explicit uint32 seed bits')
    this.seed = seed
  }

  private fetch(key: string): number {
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    const value = new KritaRandomSource((this.seed + qt5QStringHash(key)) >>> 0).generate()
    this.cache.set(key, value)
    return value
  }

  generateNormalized(key: string): number { return this.fetch(key) / UINT32_MAX }

  /** Native keyed source has an exclusive upper bound, unlike generate(min,max). */
  generate(key: string, min: number, max: number): number {
    integerRange(min, max, true)
    return min + this.fetch(key) % (max - min)
  }

  snapshot(): KritaPerStrokeRandomSnapshot {
    return { version: 1, seed: this.seed, cache: [...this.cache].map(([key, value]) => [key, value]) }
  }

  static restore(snapshot: KritaPerStrokeRandomSnapshot): KritaPerStrokeRandomSource {
    if (!snapshot || snapshot.version !== 1 || !uint32(snapshot.seed) || !Array.isArray(snapshot.cache)) throw new RangeError('Invalid keyed random snapshot')
    const source = new KritaPerStrokeRandomSource(snapshot.seed)
    for (const entry of snapshot.cache) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !uint32(entry[1]) || source.cache.has(entry[0])) throw new RangeError('Invalid keyed random cache')
      // A cache is an optimization, not an alternative source of arbitrary random values.
      if (source.fetch(entry[0]) !== entry[1]) throw new RangeError('Keyed random cache does not match its seed')
    }
    return source
  }

  clone(): KritaPerStrokeRandomSource { return KritaPerStrokeRandomSource.restore(this.snapshot()) }
}
