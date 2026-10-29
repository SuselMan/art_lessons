import { expect,it } from 'vitest'
import nativeText from './fixtures/sourceAlphaDarken32/param-info.native.json?raw'
import type nativeShape from './fixtures/sourceAlphaDarken32/param-info.native.json'
// JSON.parse preserves -0; the bundler's JSON-to-JS optimizer need not.
const native=JSON.parse(nativeText) as typeof nativeShape
import { normalizeSourcePainterOpacity } from './sourcePainterOpacity'
const bits=(v:number)=>{const view=new DataView(new ArrayBuffer(4));view.setFloat32(0,v,true);return view.getUint32(0,true)}
it('matches unchanged native ParameterInfo setter and exact Qt float comparator on all raw qreal controls',()=>{
 expect(native.cases.length).toBeGreaterThan(64)
 for(const [index,c]of native.cases.entries()){
  const before={...c.raw},actual=normalizeSourcePainterOpacity(Object.freeze({...c.raw}))
  expect(actual,`native parameter${index}/${c.label}`).toEqual(c.expected)
  expect({opacity:bits(actual.opacity),averageOpacity:bits(actual.averageOpacity),flow:bits(actual.flow)}).toEqual(c.bits)
  expect(c.raw).toEqual(before)
 }
})
it('narrows before comparing instead of comparing the qreal inputs',()=>{
 const c=native.cases.find(c=>(Math.abs(c.raw.opacity-c.raw.averageOpacity)*100000<=Math.min(Math.abs(c.raw.opacity),Math.abs(c.raw.averageOpacity)))!==c.expected.averageAliased)!
 expect(c).toBeDefined();expect(normalizeSourcePainterOpacity(c.raw)).toEqual(c.expected)
})
it('uses min-relative Qt source law rather than a max-relative epsilon substitute',()=>{
 const c=native.cases.find(c=>{const a=Math.fround(c.raw.opacity),b=Math.fround(c.raw.averageOpacity);return(Math.abs(a-b)<=1e-5*Math.max(Math.abs(a),Math.abs(b)))!==c.expected.averageAliased})!
 expect(c).toBeDefined();expect(normalizeSourcePainterOpacity(c.raw)).toEqual(c.expected)
})
it('selects the opacity storage including signed zero, and retains independent float flow',()=>{
 const actual=normalizeSourcePainterOpacity({opacity:-0,averageOpacity:0,flow:-0})
 expect(actual.averageAliased).toBe(true);expect(Object.is(actual.opacity,-0)).toBe(true);expect(Object.is(actual.averageOpacity,-0)).toBe(true);expect(Object.is(actual.flow,-0)).toBe(true)
 const distinct=normalizeSourcePainterOpacity({opacity:0,averageOpacity:Math.fround(2**-149),flow:.4})
 expect(distinct.averageAliased).toBe(false);expect(distinct.averageOpacity).toBe(2**-149);expect(distinct.flow).toBe(Math.fround(.4))
})
it('does not update history or fold creamy/hard flow into opacity',()=>{
 const actual=normalizeSourcePainterOpacity({opacity:.2,averageOpacity:.8,flow:.4})
 expect(actual).toEqual({opacity:Math.fround(.2),averageOpacity:Math.fround(.8),flow:Math.fround(.4),averageAliased:false})
})
it('rejects malformed/nonfinite/out-of-unit controls',()=>{
 for(const field of ['opacity','averageOpacity','flow']as const)for(const value of [NaN,Infinity,-Infinity,-.001,1.000001])expect(()=>normalizeSourcePainterOpacity({opacity:1,averageOpacity:1,flow:1,[field]:value})).toThrow()
 expect(()=>normalizeSourcePainterOpacity(null as unknown as Parameters<typeof normalizeSourcePainterOpacity>[0])).toThrow()
})
