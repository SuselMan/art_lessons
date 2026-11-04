import {expect,it} from 'vitest'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL as kernel} from './sourceRgba8CompositeWebGL1'
import {SOURCE_GREATER_WEIGHT_GLSL,SOURCE_SCALAR4_COS_GLSL} from './sourceCompositeCoefficientTables'
import {SOURCE_TABLE_COMPOSITE_MODES,tableCompositeFragmentVariant} from './sourceCompositeProgramShader'
const apply='SourceRgba8CompositeControl(policy.x,controls.x,'
const fragment=kernel+'\n'+apply
it('keeps exact table kernels in each captured-mode program and removes both from the ordinary program',()=>{
 const ids=[113,114,124]
 for(const [i,mode]of SOURCE_TABLE_COMPOSITE_MODES.entries()){
  const selected=tableCompositeFragmentVariant(fragment,mode)
  expect(selected.replace('SourceRgba8CompositeControl('+ids[i]+'.0,controls.x,',apply)).toBe(fragment)
  expect(selected).toContain(SOURCE_GREATER_WEIGHT_GLSL);expect(selected).toContain(SOURCE_SCALAR4_COS_GLSL)
 }
 const ordinary=tableCompositeFragmentVariant(fragment)
 expect(ordinary).not.toContain(SOURCE_GREATER_WEIGHT_GLSL);expect(ordinary).not.toContain(SOURCE_SCALAR4_COS_GLSL)
 expect(ordinary.replace('float sourceGreaterWeight(float delta){return 0.0;}',SOURCE_GREATER_WEIGHT_GLSL).replace('float sourceScalar4Cos(float v){return 0.0;}',SOURCE_SCALAR4_COS_GLSL)).toBe(fragment)
})
it('rejects missing or duplicated apply sites and coefficient tables before compiling',()=>{
 expect(()=>tableCompositeFragmentVariant(kernel)).toThrow('apply provenance')
 expect(()=>tableCompositeFragmentVariant(fragment+apply)).toThrow('apply provenance')
 expect(()=>tableCompositeFragmentVariant(fragment.replace(SOURCE_GREATER_WEIGHT_GLSL,''))).toThrow('coefficient provenance')
 expect(()=>tableCompositeFragmentVariant(fragment,'unknown' as never)).toThrow('Unknown')
})
