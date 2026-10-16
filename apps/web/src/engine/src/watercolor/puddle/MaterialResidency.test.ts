import {describe, expect, it} from 'vitest'
import {MaterialResidency} from './MaterialResidency'
describe('logical material residency', () => {
  it('cycles eight wet layers with bounded owned bytes and journal markers after eviction', () => {
    const cache = new MaterialResidency<string, {bytes: number; pixels: Uint8Array}>(2, 12)
    const journal = new Map<string, Uint8Array>()
    for (let i = 0; i < 8; i++) {
      const key = `layer-${i}`, pixels = Uint8Array.of(i, 255-i, i*2, 99)
      journal.set(key, pixels.slice())
      cache.store(key, {bytes: pixels.byteLength, pixels})
      expect(cache.bytes).toBeLessThanOrEqual(12)
    }
    expect(cache.size).toBe(8)
    expect(cache.take('layer-0')).toBeUndefined()
    expect(cache.has('layer-0')).toBe(true)
    for (const [key, original] of journal) {
      const restored = cache.take(key)?.pixels ?? journal.get(key)!.slice()
      expect(restored).toEqual(original)
      cache.store(key, {bytes: restored.byteLength, pixels: restored})
      expect(cache.bytes).toBeLessThanOrEqual(12)
    }
  })
  it('pins unfinished work until its finally lease releases, never evicting either generator', () => {
    const cache = new MaterialResidency<string, {bytes:number}>()
    const a=cache.acquire('A'), b=cache.acquire('B')
    expect(cache.victim(['A','B'], 'C')).toBeUndefined()
    expect(()=>cache.store('A',{bytes:4})).toThrow('executing')
    expect(()=>cache.forget('B')).toThrow('executing')
    function* work() { const release=cache.acquire('A'); try { yield 1 } finally { release() } }
    const pending=work();pending.next();a()
    expect(cache.pinned('A')).toBe(true)
    pending.return(undefined)
    expect(cache.victim(['A','B'], 'C')).toBe('A')
    b();b()
    expect(cache.pinned('B')).toBe(false)
  })
  it('does not charge transferred snapshots or resurrect their bytes', () => {
    const cache=new MaterialResidency<string,{bytes:number}>(2,4)
    cache.store('A',{bytes:4});expect(cache.take('A')).toEqual({bytes:4})
    expect(cache.bytes).toBe(0);expect(cache.take('A')).toBeUndefined()
    cache.store('A',{bytes:5});expect(cache.bytes).toBe(0)
    expect(cache.has('A')).toBe(true);cache.forget('A');expect(cache.size).toBe(0)
  })
})
