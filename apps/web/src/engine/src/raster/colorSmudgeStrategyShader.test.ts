import {expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {wetTransferFragment,WET_TRANSFER_FRAG} from './wetMixShaders'
import {colorSmudgeCompositeCode,colorSmudgeForegroundFragment,colorSmudgeLegacyFragment} from './colorSmudgeStrategyShader'
it('adds a foreground-only opt-in program while old wet and modern compiler strings stay unchanged',()=>{
 const old=wetTransferFragment(true,true,true,true),extended=colorSmudgeForegroundFragment(old)
 expect(old).not.toContain('u_colorSmudgeComposite')
 expect(extended).toContain('vec3 blended=u_colorSmudgeComposite>0.5 ? colorSmudgeChannel(dst,src)')
 expect(extended).toContain('u_colorSmudge.z>0.5 && pigment.a>0.0 && u_wetBlend<0.5 && u_colorSmudgeComposite<0.5 && u_colorSmudgePhotoshop<0.5')
 expect(extended).toContain('mixed=u_previousCanvas<1.5 ? mix(destination,source,a) : source*a+destination*(1.0-source.a*a)')
 expect(extended).toContain('gl_FragColor=mix(actualDestination,mixed,clamp(shape,0.0,1.0))')
 expect(extended.match(/void main\(\)/g)).toHaveLength(1)
 expect(createHash('sha256').update(WET_TRANSFER_FRAG).digest('hex')).toBe('8e2762ab38881dc6d04c06ef53cc4edf1c7723ea2be6b0962fe574f758c36de6')
})
it('legacy opt-in replaces only foreground composition, preserving original final and compensation ownership',()=>{
 const old=wetTransferFragment(true,true,true),extended=colorSmudgeLegacyFragment(old)
 expect(old).not.toContain('u_colorSmudgeComposite')
 expect(extended).toContain('source=vec4(source.rgb*(1.0-b)')
 expect(extended).toContain('gl_FragColor=u_previousCanvas<1.5 ? mix(destination,source,amount) : source*amount+destination*(1.0-source.a*amount)')
 expect(extended).not.toContain('colorRate*colorRate')
 expect(extended.match(/void main\(\)/g)).toHaveLength(1)
 expect(['grainMerge','grainExtract','negation','multiply','screen'].map(colorSmudgeCompositeCode)).toEqual([1,2,3,4,5])
 expect(colorSmudgeCompositeCode('hardMixPhotoshop')).toBe(0)
 expect(colorSmudgeCompositeCode(undefined)).toBe(0)
})
