import{it,expect}from'vitest'
import{colorSmudgeCompositeCode,colorSmudgeLegacyFragment}from'./colorSmudgeStrategyShader'
import{wetTransferFragment}from'./wetMixShaders'
it('extends foregroundchannel only in explicit legacy154 variant without changing old compiler defaults',()=>{const base=wetTransferFragment(true,true,true),old=colorSmudgeLegacyFragment(base),extended=colorSmudgeLegacyFragment(base,true);expect(colorSmudgeLegacyFragment(base,false)).toBe(old);expect(old).not.toContain('u_colorSmudgeComposite>6.5');expect(extended).toContain('u_colorSmudgeComposite>6.5');expect(extended).toContain('u_colorSmudgeComposite>5.5&&u_colorSmudgeComposite<6.5');expect(colorSmudgeCompositeCode('overlay')).toBe(7)})
