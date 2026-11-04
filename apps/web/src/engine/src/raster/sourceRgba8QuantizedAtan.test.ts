import {it,expect} from 'vitest'
import {sourceRgba8QuantizedAtan as q,ATAN_BYTE_THRESHOLDS,SOURCE_RGBA8_QUANTIZED_ATAN_GLSL} from './sourceRgba8QuantizedAtan'
import {sourceRgba8SeparableChannel} from '../presets/sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL} from './sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL} from './sourceRgba8CompositeShader'
it('matches independent executed pinned native fullgrid FNV and exact axes/diagonal/symmetry',()=>{
 let hash=14695981039346656037n
 for(let s=0;s<256;s++)for(let d=0;d<256;d++){const out=q(s,d);expect(sourceRgba8SeparableChannel('arcTangent',s,d)).toBe(out);hash=BigInt.asUintN(64,(hash^BigInt(out))*1099511628211n);if(s&&d&&s!==d)expect(out+q(d,s)).toBe(255)}
 expect(hash.toString(16)).toBe('1dce4458872ecb6f');expect(q(0,0)).toBe(0);for(let n=1;n<256;n++){expect(q(n,n)).toBe(128);expect(q(0,n)).toBe(0);expect(q(n,0)).toBe(255)}
})
it('has strict separating mediants and seven bounded comparisons, no runtime transcendental shader',()=>{
 expect(ATAN_BYTE_THRESHOLDS).toHaveLength(127)
 for(const[n,d]of ATAN_BYTE_THRESHOLDS){expect(n).toBeGreaterThan(0);expect(n).toBeLessThanOrEqual(510);expect(d).toBeLessThanOrEqual(510);for(let b=1;b<256;b++)for(let a=0;a<b;a++)if(a*d===b*n)throw Error('Non-strict separator')}
 expect(SOURCE_RGBA8_QUANTIZED_ATAN_GLSL).not.toMatch(/\batan\s*\(/)
 expect(SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL).toContain('if(mode==30.0)return sourceRgba8QuantizedAtan(source,destination)')
 expect(SOURCE_RGBA8_COMPOSITE_GLSL).toContain('if(mode==30u)return uint(sourceRgba8QuantizedAtan(sx,dx))')
})
