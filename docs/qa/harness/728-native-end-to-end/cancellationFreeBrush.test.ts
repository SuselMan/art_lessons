import {it,expect} from 'vitest'
import {CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/brush'
import {cancellationFreeBrushShader,cancellationFreeFractionReference as reference} from './cancellationFreeBrush'
it('changes fraction capacity algebra ONLY, never raw/sampling/floor/store',()=>{
 const shader=cancellationFreeBrushShader(),start=CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.indexOf('fn fraction('),end=CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.indexOf('@compute @workgroup_size')
 expect(shader.slice(0,start)).toBe(CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.slice(0,start))
 expect(shader.slice(shader.indexOf('@compute @workgroup_size'))).toBe(CANONICAL_SINGLE_TEXTURE_BRUSH_WGSL.slice(end))
 expect(shader).toContain('roomP[k]/P[k]');expect(shader).toContain('roomC[k]/C[k]')
})
it('real finite Q8 constraints equivalent including dry/zero/capacity boundaries',()=>{
 let maxDifference=0,invalidBounds=0
 for(let q=0;q<=255;q++)for(let cap=0;cap<=63;cap++)for(const raw of[0,1e-8,.02,.09668440371751785,.23]){
  const a=reference(raw,Array(8).fill(q),Array(8).fill(cap));maxDifference=Math.max(maxDifference,Math.abs(a.old-a.cancellationFree))
  if(a.cancellationFree<0||a.cancellationFree>raw||q&&q*a.cancellationFree>cap+1e-13)invalidBounds++
 }
 expect(maxDifference).toBeLessThan(1e-15);expect(invalidBounds).toBe(0)
 expect(()=>reference(NaN,Array(8).fill(1),Array(8).fill(1))).toThrow('Finite')
})
