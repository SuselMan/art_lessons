import {it,expect} from 'vitest'
import {rimCornerQaRecipe,rimCornerQaShaders} from './rimCornerTextureQa'
import {WC_FIELD_OP_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {CANONICAL_FIELD_OPS_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/fieldOps'
import {sampleRimHashCorner} from './rimHashCornerTable'
it('changes ONLY hash lookup; original noise interpolation and complete remaining shader unchanged',()=>{
 const t=rimCornerQaRecipe(),s=rimCornerQaShaders(t)
 expect(s.gl.slice(s.gl.indexOf('  float wcRimNoise('))).toBe(WC_FIELD_OP_FRAG.slice(WC_FIELD_OP_FRAG.indexOf('  float wcRimNoise(')))
 expect(s.native.slice(s.native.indexOf('fn rimNoise('))).toBe(CANONICAL_FIELD_OPS_WGSL.slice(CANONICAL_FIELD_OPS_WGSL.indexOf('fn rimNoise(')))
 expect(t.seed).toBe(728);expect(t.bytes).toBeLessThan(20000)
 expect(s.gl).toContain('u_qaRimCorners');expect(s.native).toContain('@binding(9)')
})
it('all actual first/second octave corners remain within identical noise-row table',()=>{
 const t=rimCornerQaRecipe(),f=Math.fround
 for(let y=0;y<1536;y++)for(const x of[0,324,326,327,1535]){
 const wp=[f(f(x+.5)*f(.012)),f(f(1536-y-.5-1576)*f(.012))]
 for(const [a,b]of[wp,[f(f(wp[0]*f(2.7))+f(31.4)),f(f(wp[1]*f(2.7))+f(17.9))]])for(const dy of[0,1])for(const dx of[0,1])expect(Number.isFinite(sampleRimHashCorner(t,Math.floor(a)+dx,Math.floor(b)+dy))).toBe(true)
 }
 expect(()=>rimCornerQaShaders({...t,seed:1})).toThrow();expect(()=>rimCornerQaShaders({...t,origin:[0,-35]})).toThrow();const altered=t.values.slice();altered[0]=.5;expect(()=>rimCornerQaShaders({...t,values:altered})).toThrow()
})

import {seededRimPatternDifferences} from './firstBandOracle'
it('actual report uses valid balanced32cap for seeded-vs-legacy pattern metrics',()=>{
 const r=seededRimPatternDifferences(new Uint8Array([1,2,3,4,5,6,7,8]),new Uint8Array(8),2)
 expect(r.channels.map(c=>c.changed)).toEqual([2,2,2,2]);expect(r.differences).toHaveLength(8)
})
