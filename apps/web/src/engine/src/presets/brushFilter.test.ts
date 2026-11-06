import{expect,it}from'vitest'
import{filterKernel,filterReach}from'./brushFilter'
import{isFilterDescriptor}from'../../../../../../packages/shared/src/brushFilter'
it('matches native finite support and normalized symmetric Gaussian',()=>{expect(filterReach(5)).toBe(6);const w=filterKernel(5);expect([...w].reduce((a,b)=>a+b,0)).toBeCloseTo(1,6);for(let i=0;i<18;i++)expect(w[i]).toBe(w[36-i]);expect(w[11]).toBe(0);expect(w[12]).toBeGreaterThan(0);expect(w[18]).toBeGreaterThan(w[17])})
it('zero radius preserves the image, maximum supported radius fits the shader',()=>{expect([...filterKernel(0)].filter(x=>x!==0)).toEqual([1]);expect(filterReach(16)).toBe(18);expect(filterKernel(16)[0]).toBeGreaterThan(0)})
it('rejects filter configs without canvas source and ordinary rendering',()=>{const filter={version:1,kind:'gaussian',radiusX:5,radiusY:5,amount:.5,threshold:0,lightnessOnly:true};expect(isFilterDescriptor({filter})).toBe(false);expect(isFilterDescriptor({})).toBe(true)})
