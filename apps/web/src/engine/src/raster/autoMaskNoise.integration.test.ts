import{expect,it}from'vitest'
import{createBrushStampFragment}from'./brushBehaviorShaders'
import{brushPreparationPlan}from'../dabs/BrushPreparation'
import{digitalBrushFromPreset}from'../presets/digitalBrushPresets'
it('selects only the opt-in private capability and retains the historical shader paths',()=>{
 const brush=structuredClone(digitalBrushFromPreset('hard-round'))
 brush.tip={...brush.tip,kind:'procedural',profile:{kind:'standard',shape:'ellipse',horizontalFade:1,verticalFade:1,antialias:false}}
 expect(brushPreparationPlan(brush).capabilities).not.toContain('stampEffects')
 brush.tip.autoNoise={version:1,density:.5,randomness:.2}
 const caps=brushPreparationPlan(brush).capabilities
 expect(caps).toContain('stampEffects');expect(caps).not.toContain('stampCurve')
 brush.behavior={version:2,dual:{brush:structuredClone(brush),blendMode:'multiply'}}
 expect(()=>brushPreparationPlan(brush)).toThrow('Child Auto-mask noise')
 for(const args of [[false,false,false],[true,false,false],[true,true,false],[true,true,true]]as const){
  const old=createBrushStampFragment(...args)
  expect(createBrushStampFragment(...args,false)).toBe(old)
  expect(old).not.toContain('brushAutoMaskNoiseU8')
  expect(old).not.toContain('u_autoNoiseConfig')
 }
 expect(()=>createBrushStampFragment(true,false,false,true)).toThrow('full procedural capability')
})
it('applies noise to primary U8 stencil coverage before sharpness, dual and texture without a sampler',()=>{
 const shader=createBrushStampFragment(true,true,true,true)
 const noise=shader.indexOf('shape=brushAutoMaskNoiseU8')
 expect(noise).toBeGreaterThan(0)
 expect(noise).toBeLessThan(shader.indexOf('shape=brushAlphaThreshold'))
 expect(noise).toBeLessThan(shader.indexOf('shape = brushBlend(vec3(shape),vec3(secondary)'))
 expect(noise).toBeLessThan(shader.indexOf('shape=brushTextureAlpha'))
 expect(shader).toContain('floor(gl_FragCoord.y)*u_autoNoiseConfig.w')
 const old=createBrushStampFragment(true,true,true)
 expect((shader.match(/uniform sampler2D/g)??[]).length).toBe((old.match(/uniform sampler2D/g)??[]).length)
})

it('extended primary and inline-child texture share one effects program, old texture source stays absent',()=>{
 const brush=structuredClone(digitalBrushFromPreset('hard-round'))
 const texture={id:'paper',periodPx:32,strength:1,application:{mode:'overlay',soft:true}}as unknown as NonNullable<typeof brush.texture>
 brush.texture=texture
 expect(brushPreparationPlan(brush).capabilities).toContain('stampEffects')
 delete brush.texture
 brush.behavior={version:2,dual:{brush:{...structuredClone(brush),texture},blendMode:'multiply'}}
 expect(brushPreparationPlan(brush).capabilities).toContain('stampEffects')
 expect(createBrushStampFragment()).not.toContain('brushTextureAlphaExtended')
 expect(createBrushStampFragment(true,true,true)).not.toContain('brushTextureAlphaExtended')
 expect(createBrushStampFragment(true,true,true,true)).toContain('brushTextureAlphaExtended')
})
