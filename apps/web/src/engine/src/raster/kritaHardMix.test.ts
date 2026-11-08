import {it,expect} from 'vitest'
import {KRITA_HARD_MIX_GLSL} from './kritaHardMix'
import {BRUSH_BLEND_GLSL,BRUSH_COMPOSITE_FRAG,createBrushCompositeFragment} from './brushBehaviorShaders'
it('extends the existing102 family while leaving all oldliteral programs unchanged',()=>{
 expect(createBrushCompositeFragment()).toBe(BRUSH_COMPOSITE_FRAG);expect(BRUSH_BLEND_GLSL).not.toContain('brushKritaHardMix')
 const shader=createBrushCompositeFragment(true);expect(shader).toContain(KRITA_HARD_MIX_GLSL);expect(shader).toContain('if(mode>26.5) return vec3(brushKritaHardMix(b.r,s.r)');expect(shader).toContain('if(mode>25.5) return vec3(b.r+s.r>1.0?1.0:0.0')
 expect(KRITA_HARD_MIX_GLSL).not.toContain('0.00392157');expect(KRITA_HARD_MIX_GLSL.indexOf('if(s==1.0)')).toBeLessThan(KRITA_HARD_MIX_GLSL.indexOf('b/(1.0-s)'))
})
