import { describe, expect, it } from 'vitest'
import { canonicalPrimaryTextureCell, canonicalResolvedTexturePhase, resolveCanonicalTexturePhase } from './canonicalPrimaryTexture.js'
const input = () => ({ width:51,height:51,offsetX:1,offsetY:65,randomX:false,randomY:false })
const forbidden = () : never => { throw new Error('unexpected random') }
describe('resolved texture phase DATA', () => {
  it('uses crop51, replaces random axes and resolves each key once per invocation', () => {
    const calls:unknown[]=[]
    const p=resolveCanonicalTexturePhase({...input(),randomY:true},(key,upper)=>{calls.push([key,upper]);return 7})
    expect(p).toEqual({kind:'resolved-stroke-phase-v1',x:50,y:44})
    expect(calls).toEqual([['texture_offset_y',51]])
    expect(Object.isFrozen(p)).toBe(true)
    expect(canonicalResolvedTexturePhase(p,51,51)).toEqual(p)
    expect(()=>canonicalResolvedTexturePhase({...p,x:51},51,51)).toThrow()
  })
  it('preserves source-minus-offset sampling on an asymmetric tiled pattern including negative world', () => {
    const p=resolveCanonicalTexturePhase(input(),forbidden)
    // Independent world-minus-effective-offset oracle; array cells are asymmetric.
    const pattern=Array.from({length:51*51},(_,i)=>i*13+7)
    const mod=(n:number)=>((n%51)+51)%51
    for(const x of [-104,-52,-1,0,1,50,103])for(const y of [-105,-51,-1,0,2,51,102]) {
      const expected=pattern[mod(y-65)*51+mod(x-1)]
      const actual=pattern[canonicalPrimaryTextureCell(y,51,p.y)*51+canonicalPrimaryTextureCell(x,51,p.x)]
      expect(actual).toBe(expected)
    }
  })
  it('permits random collisions and does not claim per-stroke caching', () => {
    const calls:string[]=[]; const resolve=(key:'texture_offset_x'|'texture_offset_y')=>{calls.push(key);return 0}
    const a=resolveCanonicalTexturePhase({...input(),randomX:true,randomY:true},resolve)
    const b=resolveCanonicalTexturePhase({...input(),randomX:true,randomY:true},resolve)
    expect(a).toEqual(b);expect(a.x).toBe(0);expect(a.y).toBe(0)
    expect(calls).toEqual(['texture_offset_x','texture_offset_y','texture_offset_x','texture_offset_y'])
  })
  it('rejects malformed captured input before callbacks without invoking getters', () => {
    let calls=0; const resolve=()=>{calls++;return 0}
    for(const bad of [{...input(),height:Infinity},{...input(),offsetX:Number.MAX_SAFE_INTEGER+1},{...input(),offsetY:-0},
      {...input(),randomX:1},{...input(),extra:1},Object.create(input())])expect(()=>resolveCanonicalTexturePhase(bad,resolve)).toThrow()
    const bad={...input()};Object.defineProperty(bad,'offsetX',{get(){calls++;return 1}})
    expect(()=>resolveCanonicalTexturePhase(bad,resolve)).toThrow();expect(calls).toBe(0)
    const phase={kind:'resolved-stroke-phase-v1',x:0,y:0};Object.defineProperty(phase,'x',{get(){calls++;return 0}})
    expect(()=>canonicalResolvedTexturePhase(phase,51,51)).toThrow();expect(calls).toBe(0)
  })
  it('rejects exclusive upper, promises, nonfinite and fractional random values', () => {
    for(const value of [51,-1,-0,Infinity,NaN,1.5,Promise.resolve(0)]) {
      let calls=0
      expect(()=>resolveCanonicalTexturePhase({...input(),randomX:true,randomY:true},()=>{calls++;return value as number})).toThrow()
      expect(calls).toBe(1)
    }
  })
  it('normalizes safe integer endpoints without adding overflowing world/offset terms', () => {
    for(const value of [Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,0,-65,65]) {
      const phase=resolveCanonicalTexturePhase({...input(),offsetX:value},forbidden)
      expect(phase.x).toBe((-(value%51)+51)%51)
      expect(phase.x).toBeGreaterThanOrEqual(0);expect(phase.x).toBeLessThan(51)
    }
    expect(()=>canonicalResolvedTexturePhase({kind:'resolved-stroke-phase-v1',x:0,y:0},4096,4096)).toThrow()
  })
})
