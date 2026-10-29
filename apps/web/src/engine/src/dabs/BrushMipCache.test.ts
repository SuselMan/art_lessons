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
