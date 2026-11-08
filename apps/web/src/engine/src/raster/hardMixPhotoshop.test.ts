import {it,expect} from 'vitest'
import {BRUSH_BLEND_GLSL,BRUSH_COMPOSITE_FRAG,createBrushCompositeFragment} from './brushBehaviorShaders'
import {brushPreparationPlan} from '../dabs/BrushPreparation'
import {DIGITAL_BRUSHES} from '../presets/digitalBrushPresets'
it('preserves all legacy shader bytes and opts in to strict source-plus-destination threshold',()=>{
 expect(createBrushCompositeFragment()).toBe(BRUSH_COMPOSITE_FRAG);expect(createBrushCompositeFragment(false)).toBe(BRUSH_COMPOSITE_FRAG)
 expect(BRUSH_BLEND_GLSL).not.toContain('mode>25.5')
 const shader=createBrushCompositeFragment(true);expect(shader).toContain('if(mode>25.5)');expect(shader).toContain('b.r+s.r>1.0?1.0:0.0')
 expect(shader.indexOf('if(mode>25.5)')).toBeLessThan(shader.indexOf('  return brushSetLum(b,brushLum(s));'))
 // Independent U8 native law: equality is black, unlike >= threshold.
 for(const [s,d,want] of [[0,255,0],[127,128,0],[128,128,255],[255,1,255],[0,0,0]])expect(s+d>255?255:0).toBe(want)
})
it('plans one extended composite capability and no additional texture resources',()=>{
 const brush=structuredClone(DIGITAL_BRUSHES[0]);brush.behavior={version:2,rendering:{mode:'buildUp',blendMode:'hardMixPhotoshop',wetEdges:0,burntEdges:0,burntEdgesMode:'multiply'}}
 const extended=brushPreparationPlan(brush);brush.behavior.rendering!.blendMode='hardMix';const old=brushPreparationPlan(brush)
 expect(extended.capabilities.filter(c=>c==='compositeEffects')).toHaveLength(1);expect(old.capabilities).not.toContain('compositeEffects');expect(extended.resources).toEqual(old.resources)
})
