import {describe,it,expect,vi} from 'vitest'
import {BrushMipCache} from './BrushMipCache'
import {lightnessMaterialMips} from '../presets/lightnessMaterial'
describe('bounded paired material derivatives',()=>{
  it('reuses exact immutable mips across GPU evictions and separates alpha/gray keys',()=>{
    const cache=new BrushMipCache(100),alpha=new Uint8Array([255,128,64,0]),gray=new Uint8Array([64,128,192,255])
    const create=vi.fn(()=>lightnessMaterialMips(alpha,gray)),expected=lightnessMaterialMips(alpha,gray)
    const first=cache.get('alpha:gray',create)
    expect(first).toEqual(expected);expect(cache.get('alpha:gray',create)).toBe(first);expect(create).toHaveBeenCalledTimes(1)
    cache.get('alpha:othergray',create);expect(create).toHaveBeenCalledTimes(2)
    expect(cache.bytes).toBe(20);cache.clear();expect(cache.bytes).toBe(0)
  })
  it('bounds bytes by LRU and bypasses an oversized result without displacing the working set',()=>{
    const cache=new BrushMipCache(10),make=(n:number)=>[new Uint8Array(n)]
    const a=cache.get('a',()=>make(4));cache.get('b',()=>make(4));expect(cache.get('a',()=>make(4))).toBe(a)
    cache.get('c',()=>make(4));expect(cache.bytes).toBe(8)
    const rebuild=vi.fn(()=>make(4));cache.get('b',rebuild);expect(rebuild).toHaveBeenCalledTimes(1)
    cache.get('huge',()=>make(11));expect(cache.bytes).toBe(8)
  })
})

describe('retained prepass workspace shares the derivative budget',()=>{
  it('reserves before allocation, evicts derivatives and releases idempotently',()=>{
    const cache=new BrushMipCache(100),make=vi.fn(()=>[new Uint8Array(60)])
    cache.get('old',make);const release=cache.reserve(50)
    expect(cache.bytes).toBe(0);expect(cache.reservedBytes).toBe(50)
    cache.get('tooLargeToRetain',make);expect(cache.bytes).toBe(0)
    expect(()=>cache.reserve(51)).toThrow('budget')
    expect(cache.reservedBytes).toBe(50)
    release();release();expect(cache.reservedBytes).toBe(0)
    cache.get('new',make);expect(cache.bytes).toBe(60)
  })
})

// Instrument a PURE public observation, never private maps/reflection/globals.
class CountedMipCache extends BrushMipCache {
  reads=0
  override get reservedBytes():number {this.reads++;return super.reservedBytes}
}
it('scans the live reservation ledger once while preserving exact capacity eviction and idempotent releases',()=>{
 const cache=new CountedMipCache(512),held=Array.from({length:128},()=>cache.reserve(1))
 cache.get('old',()=>[new Uint8Array(256)]);expect(cache.bytes).toBe(256)
 cache.reads=0;const release=cache.reserve(129);expect(cache.reads).toBe(1)
 expect(cache.bytes).toBe(0);expect(cache.reservedBytes).toBe(257)
 expect(()=>cache.reserve(256)).toThrow('budget');expect(cache.reservedBytes).toBe(257)
 const rest=cache.reserve(255);expect(cache.reservedBytes).toBe(512);expect(()=>cache.reserve(1)).toThrow('budget')
 release();release();rest();held.forEach(done=>{done();done()});expect(cache.reservedBytes).toBe(0)
 cache.get('after',()=>[new Uint8Array(512)]);expect(cache.bytes).toBe(512);cache.clear();expect(cache.bytes).toBe(0)
})
it('rescans after optional reclaim callbacks release ownership before checking the unchanged cap',()=>{
 const cache=new CountedMipCache(10),old=cache.reserve(8),events:string[]=[]
 const unregister=cache.registerOptionalReclaim(()=>{events.push('reclaim');old();expect(()=>cache.reserve(1)).toThrow('reclaim');expect(()=>cache.registerOptionalReclaim(()=>{})).toThrow('busy')})
 cache.reads=0;const release=cache.reserve(6);expect(cache.reads).toBe(2);expect(events).toEqual(['reclaim']);expect(cache.reservedBytes).toBe(6)
 unregister();expect(()=>cache.reserve(5)).toThrow('budget');expect(cache.reservedBytes).toBe(6);release();old();expect(cache.reservedBytes).toBe(0)
})
it('attempts all optional releases and preserves throw undefined without admitting the failed reservation',()=>{
 const cache=new BrushMipCache(10),a=cache.reserve(4),b=cache.reserve(4),events:string[]=[]
 cache.registerOptionalReclaim(()=>{events.push('a');a();throw undefined});cache.registerOptionalReclaim(()=>{events.push('b');b()})
 let failed=false;try{cache.reserve(7)}catch(error){failed=true;expect(error).toBeUndefined()}
 expect(failed).toBe(true);expect(events).toEqual(['a','b']);expect(cache.reservedBytes).toBe(0)
 const release=cache.reserve(10);expect(cache.reservedBytes).toBe(10);release();expect(cache.reservedBytes).toBe(0)
})
it('rechecks the post-reclaim total when callbacks free too little and keeps derivative availability exact',()=>{
 const cache=new BrushMipCache(10),a=cache.reserve(3),b=cache.reserve(5);cache.registerOptionalReclaim(a)
 expect(()=>cache.reserve(6)).toThrow('budget');expect(cache.reservedBytes).toBe(5)
 cache.get('fits',()=>[new Uint8Array(5)]);expect(cache.bytes).toBe(5)
 cache.get('notRetained',()=>[new Uint8Array(6)]);expect(cache.bytes).toBe(5)
 b();expect(cache.reservedBytes).toBe(0);cache.clear();expect(cache.bytes).toBe(0)
})
