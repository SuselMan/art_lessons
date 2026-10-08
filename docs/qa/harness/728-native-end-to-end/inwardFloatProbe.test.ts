import {describe,it,expect} from 'vitest'
import {WC_WATER_FRONT_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {CANONICAL_WATER_FRONT_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/kernels'
import {inwardFloatProbeShader,inwardGlFloatProbeShader,decodeInwardFloatProbe,INWARD_PROBE_BYTES} from './inwardFloatProbe'
describe('bounded actual-cell float capture contract',()=>{
 it('keeps original min/store and injects unique three-cell records',()=>{const s=inwardFloatProbeShader(CANONICAL_WATER_FRONT_WGSL);expect(s).toContain('best=min(best,ci*u.coefficients.z+edge)');expect(s).toContain('textureStore(output,vec2i(q),vec4f(min(best,u.coefficients.z)/u.coefficients.z,hj,source.b,1))');expect(s).toContain('binding(9)');expect(s).toContain('vec2u(683,346)');expect(INWARD_PROBE_BYTES).toBe(192)})
 it('GL probe retains OFF output and paired16float layout',()=>{const s=inwardGlFloatProbeShader(WC_WATER_FRONT_FRAG);expect(s).toContain('uniform float u_probeView;');expect(s).toContain('best = min(best, ci * u_costMax + edge);');expect(s).toContain('if(u_probeView> -0.5)');expect(s).toContain('vec4(debugInitial,best,hj,climb)');expect(()=>inwardGlFloatProbeShader('no kernel')).toThrow()})
 it('rejects incompatible kernel and malformed readback',()=>{expect(()=>inwardFloatProbeShader('not a kernel')).toThrow();expect(()=>decodeInwardFloatProbe(new ArrayBuffer(16))).toThrow();const b=new ArrayBuffer(INWARD_PROBE_BYTES);new Float32Array(b)[0]=NaN;expect(()=>decodeInwardFloatProbe(b)).toThrow()})
 it('decodes ordered float fields without claiming byte equality',()=>{const b=new ArrayBuffer(INWARD_PROBE_BYTES),v=new Float32Array(b);v[0]=12;v[1]=10;v[16+3]=15;const rows=decodeInwardFloatProbe(b);expect(rows[0]).toMatchObject({x:683,y:346,values:{initialCost:12,finalCost:10}});expect(rows[1].values.climb).toBe(15);expect(JSON.parse(JSON.stringify(rows))).toEqual(rows)})
})
