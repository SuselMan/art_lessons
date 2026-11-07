import {expect,it} from 'vitest'
import {textureAlphaApplicationCode,textureAlphaExtended,TEXTURE_ALPHA_EXTENDED_GLSL,type TextureAlphaExtendedMode} from './textureAlphaModes'
const modes:TextureAlphaExtendedMode[]=['darken','overlay','linearDodge','linearBurn']
it('preserves old mode codes and appends four native alpha operators, rejecting unknown IDs',()=>{
 expect(['multiply','subtract',...modes].map(textureAlphaApplicationCode)).toEqual([1,2,3,4,5,6]);expect(()=>textureAlphaApplicationCode('screen')).toThrow('Unsupported')
})
it('keeps native operand direction and hard versus soft strength placement',()=>{
 expect(textureAlphaExtended('darken',.8,.6,.5,false)).toBeCloseTo(.4)
 expect(textureAlphaExtended('darken',.8,.6,.5,true)).toBeCloseTo(.8)
 expect(textureAlphaExtended('overlay',.8,.2,.5,false)).toBeCloseTo(.16)
 expect(textureAlphaExtended('overlay',.8,.2,.5,true)).toBeCloseTo(.84)
 expect(textureAlphaExtended('linearDodge',.8,.2,.5,false)).toBeCloseTo(.6)
 expect(textureAlphaExtended('linearDodge',.8,.2,.5,true)).toBeCloseTo(.9)
 expect(textureAlphaExtended('linearBurn',.8,.6,.5,false)).toBeCloseTo(0)
 expect(textureAlphaExtended('linearBurn',.8,.6,.5,true)).toBeCloseTo(.6)
})
it('does not resurrect fully transparent brush pixels and preserves overlay non-neutral zero-strength law',()=>{
 for(const mode of modes)for(const soft of [false,true])for(const strength of [0,.5,1])expect(textureAlphaExtended(mode,0,1,strength,soft)).toBe(0)
 expect(textureAlphaExtended('overlay',.3,.8,0,true)).toBeCloseTo(.6)
 expect(textureAlphaExtended('linearDodge',.3,.8,0,false)).toBeCloseTo(.8)
 expect(textureAlphaExtended('linearBurn',.3,.8,0,true)).toBeCloseTo(.3)
})
it('matches independent normalized native source-role formulas across a bounded full U8 grid',()=>{
 for(const mode of modes)for(const soft of [false,true])for(const strength of [0,.5,1])for(let a=0;a<256;a++)for(let t=0;t<256;t++){
  const A=a/255,T=t/255,S=strength,src=soft?T+(1-T)*(1-S):T,dst=soft?A:A*S
  const expected=mode==='darken'?Math.min(src,dst):mode==='overlay'?(dst<.5?2*dst*src:1-2*(1-dst)*(1-src)):mode==='linearBurn'?Math.max(0,src+dst-1):A===0?0:Math.min(1,A*(soft?1:S)+T*(soft?S:1))
  if(Math.abs(textureAlphaExtended(mode,A,T,S,soft)-expected)>1e-14)throw Error(`${mode}/${soft}/${S}/${a}/${t}`)
 }
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).toContain('if(a<=0.0)return 0.0;')
 expect(TEXTURE_ALPHA_EXTENDED_GLSL).not.toContain('texture2D')
})
it('fails closed on invalid operands before applying a mode',()=>{
 for(const n of [-1,2,NaN,Infinity])expect(()=>textureAlphaExtended('darken',n,.5,.5,false)).toThrow('operands')
})
