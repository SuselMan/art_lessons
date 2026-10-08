import {it,expect} from 'vitest'
import {WC_BRUSH_DRAG_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {CANONICAL_TEXTURE_BRUSH_WGSL} from '../../../../apps/web/src/engine/src/webgpuCanonical/brush'
import {brushFractionGlShader,brushFractionWgslShader,brushFractionRows} from './brushFractionProbe'
it('keeps actual original fraction helpers untouched in both float diagnostics',()=>{
 const gl=WC_BRUSH_DRAG_FRAG.slice(0,WC_BRUSH_DRAG_FRAG.indexOf('  void main() {'))
 expect(brushFractionGlShader().startsWith(gl)).toBe(true)
 const wgsl=CANONICAL_TEXTURE_BRUSH_WGSL.slice(CANONICAL_TEXTURE_BRUSH_WGSL.indexOf('fn sampled'),CANONICAL_TEXTURE_BRUSH_WGSL.indexOf('@compute @workgroup_size'))
 expect(brushFractionWgslShader()).toContain(wgsl)
 expect(brushFractionRows()).toHaveLength(16)
 expect(brushFractionRows()[0]).toEqual({fieldX:349,fieldY:288,take:false,axis:0})
 expect(brushFractionRows()[15]).toEqual({fieldX:350,fieldY:288,take:true,axis:3})
})
