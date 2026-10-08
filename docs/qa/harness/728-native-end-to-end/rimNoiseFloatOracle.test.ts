import {it,expect} from 'vitest'
import {rimNoiseFloatShaders,RIM_PROBE_CELLS} from './rimNoiseFloatOracle'
it('extracts original helpers and pairs four actual G-cell points without varied texture inputs',()=>{const s=rimNoiseFloatShaders();expect(s.gl).toContain('p = 17.0 * fract(p * 0.3183099');expect(s.native).toContain('let q=17.0*fract(p*0.3183099');expect(s.gl).toContain('gl_FragColor=vec4(first,second,n,patch)');expect(s.native).toContain('texture_storage_2d<rgba32float,write>');expect(RIM_PROBE_CELLS).toEqual([[324,267],[326,267],[327,267],[327,271]])})
