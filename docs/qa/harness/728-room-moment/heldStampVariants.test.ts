import{it,expect}from 'vitest'
import{heldStampFactorShader}from './heldStampFactors'
import{tipVariantShader}from './heldStampVariants'
it('literal shader stays byte-for-byte unchanged',()=>{for(const g of ['amount','coverage','contact']as const){const s=heldStampFactorShader(g);expect(tipVariantShader(s,'literal')).toBe(s)}})
it('A changes only high-pressure threshold endpoint',()=>{const s=heldStampFactorShader('coverage');expect(tipVariantShader(s,'A')).toBe(s.replace('mix(mix(0.34, 0.39, light), 0.62, release)','mix(mix(0.28, 0.39, light), 0.62, release)'))})
it('B uses pressure interpolation; pressure/release fade and nib stay literal',()=>{const s=heldStampFactorShader('amount'),b=tipVariantShader(s,'B');expect(b).toContain('mix(0.65, 0.55, light)');expect(b).toContain('mix(0.82, 0.72, light)');expect(b).toContain('return contact * smoothstep(0.0, 0.012, pressure)');expect(b.slice(b.indexOf('struct V'))).toBe(s.slice(s.indexOf('struct V')))})
it('all actual raster phases carry the same specialized contact definition',()=>{for(const v of ['A','B']as const){const extract=(g:'amount'|'coverage')=>tipVariantShader(heldStampFactorShader(g),v).split('fn wcTipContact')[1]!.split('struct V')[0];expect(extract('amount')).toBe(extract('coverage'))}})
