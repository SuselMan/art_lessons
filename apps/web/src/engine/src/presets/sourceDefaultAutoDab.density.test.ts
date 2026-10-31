import { describe, expect, it, vi } from 'vitest'
import { prepareSourceDefaultAutoDensity } from './sourceDefaultAutoDab'

describe('bounded default auto density after A8 quantization', () => {
  it('samples only visible quantized pixels and keeps equality including zero', () => {
    const mask=new Uint8Array([0,1,255,128,0,42])
    const values=[0,.8,.80001,1],sample=vi.fn(()=>values.shift()!)
    const cursor=prepareSourceDefaultAutoDensity(mask,.8,sample)
    expect(cursor.advance(3)).toBe(false)
    expect(cursor.completedPixels).toBe(3)
    expect([...mask]).toEqual([0,1,255,128,0,42])
    expect(cursor.advance(3)).toBe(true)
    expect([...mask]).toEqual([0,1,255,0,0,0])
    expect(sample).toHaveBeenCalledTimes(4)
    const zero=new Uint8Array([255,255])
    prepareSourceDefaultAutoDensity(zero,0,(()=>{let n=0;return()=>n++===0?0:Number.MIN_VALUE})()).advance(2)
    expect([...zero]).toEqual([255,0])
  })
  it('preserves density one byte for byte without consuming RNG', () => {
    const mask=new Uint8Array([0,1,127,255]),sample=vi.fn(()=>{throw Error('unused')})
    const cursor=prepareSourceDefaultAutoDensity(mask,1,sample)
    expect(cursor.advance(1)).toBe(false)
    expect(cursor.advance(3)).toBe(true)
    expect(cursor.advance(1)).toBe(true)
    expect([...mask]).toEqual([0,1,127,255]);expect(sample).not.toHaveBeenCalled()
  })
  it('is independent of chunk boundaries and retains only the supplied sampler state', () => {
    const run=(chunk:number)=>{
      const mask=new Uint8Array(100).fill(200);let seed=1,draws=0
      const cursor=prepareSourceDefaultAutoDensity(mask,.8,()=>{draws++;seed=(seed*16807)%2147483647;return seed/2147483647})
      while(!cursor.done)cursor.advance(chunk)
      return {mask:[...mask],draws}
    }
    expect(run(1)).toEqual(run(17));expect(run(17)).toEqual(run(100))
    expect(run(7).mask.filter(Boolean).length).toBeGreaterThan(50)
    expect(run(7).mask.filter(Boolean).length).toBeLessThan(100)
  })
  it('rejects sampler reentry even when caught without exceeding the outer bound', () => {
    const mask=new Uint8Array([255,127]);let calls=0
    const cursor=prepareSourceDefaultAutoDensity(mask,.8,()=>{
      calls++;expect(()=>cursor.advance(100)).toThrow('already advancing');return .5
    })
    expect(cursor.advance(1)).toBe(false);expect(calls).toBe(1)
    expect(cursor.completedPixels).toBe(1)
    expect(cursor.advance(1)).toBe(true);expect(calls).toBe(2)
    expect(cursor.advance(100)).toBe(true);expect(calls).toBe(2)
  })
  it('retires uncaught sampler reentry preserving the exact first error', () => {
    let calls=0,caught:unknown
    const cursor=prepareSourceDefaultAutoDensity(new Uint8Array([255]),.8,()=>{
      calls++;try {cursor.advance(1)} catch(error) {caught=error;throw error}
      return .5
    })
    expect(()=>cursor.advance(1)).toThrow('already advancing')
    try {cursor.advance(1)} catch(error) {expect(error).toBe(caught)}
    expect(calls).toBe(1);expect(cursor.completedPixels).toBe(0)
    const unknown=prepareSourceDefaultAutoDensity(new Uint8Array([255]),.8,()=>{throw undefined})
    for(let i=0;i<2;i++) {
      let thrown=false
      try {unknown.advance(1)} catch(error) {thrown=true;expect(error).toBeUndefined()}
      expect(thrown).toBe(true)
    }
  })
  it('rejects invalid bounds before sampling and poisons a failed sampler cursor', () => {
    const sample=vi.fn(()=>.5)
    for(const density of [-1,NaN,Infinity,1.1])expect(()=>prepareSourceDefaultAutoDensity(new Uint8Array(1),density,sample)).toThrow()
    expect(()=>prepareSourceDefaultAutoDensity(new Uint8Array(1024*1024+1),.5,sample)).toThrow()
    const cursor=prepareSourceDefaultAutoDensity(new Uint8Array([255]),.5,sample)
    for(const count of [0,-1,.5,Infinity])expect(()=>cursor.advance(count)).toThrow()
    expect(sample).not.toHaveBeenCalled()
    const failure=Error('sample');const bad=vi.fn(()=>{throw failure})
    const failed=prepareSourceDefaultAutoDensity(new Uint8Array([255]),.5,bad)
    expect(()=>failed.advance(1)).toThrow(failure)
    expect(()=>failed.advance(1)).toThrow(failure)
    expect(bad).toHaveBeenCalledTimes(1)
    for(const value of [NaN,Infinity,-.1,1.1]) {
      const plane=new Uint8Array([127]),invalid=prepareSourceDefaultAutoDensity(plane,.8,()=>value)
      expect(()=>invalid.advance(1)).toThrow('Invalid density sample')
      expect([...plane]).toEqual([127]);expect(invalid.done).toBe(false)
    }
    expect(prepareSourceDefaultAutoDensity(new Uint8Array(),.8,sample).done).toBe(true)
  })
})
