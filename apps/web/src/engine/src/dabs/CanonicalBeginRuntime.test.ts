import{expect,it}from'vitest'
import{firstBristleLine139,canonicalBeginRenderable139}from'./CanonicalBeginRuntime'
import{dab139}from'../../../../../../packages/shared/src/bristleSoak139.testFixture'
it('first positive anchor is not a Bristle line; stationary second positive is a real native paintLine',()=>{
 const a=dab139(),b={...a,pressure:.25}
 expect(firstBristleLine139([a])).toBeUndefined()
 expect(canonicalBeginRenderable139('grid137',[a])).toBe(true)
 expect(canonicalBeginRenderable139('bristleSoak139',[a])).toBe(false)
 expect(firstBristleLine139([a,b])).toEqual({previous:a,current:b})
})
it('chunked first line keeps the original negative-world anchor and ignores zero-size metadata',()=>{
 const a={...dab139(),x:-10.5,y:-2.5},b={...dab139(),x:7,y:3},zero={...a,size:0}
 expect(firstBristleLine139([zero])).toBeUndefined()
 expect(firstBristleLine139([zero,b],a)).toEqual({previous:a,current:b})
 expect(firstBristleLine139([] ,a)).toBeUndefined()
})

it('Deform, Spray and Filter capture on first positive logical dab, independently of the Soak first-line rule',()=>{
 const positive=dab139(),zero={...positive,size:0}
 for(const cap of ['deformOld145','spray146','filterSmudge147'] as const){expect(canonicalBeginRenderable139(cap,[zero])).toBe(false);expect(canonicalBeginRenderable139(cap,[zero,positive])).toBe(true);expect(canonicalBeginRenderable139(cap,[],positive)).toBe(false)}
})
