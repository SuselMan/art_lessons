import {expect,it} from 'vitest'
import {colorSmudgeForegroundChannel as channel,colorSmudgeLegacyStages as legacy} from './colorSmudgeStrategies'
it('retains biased grain identities and negation endpoints for every U8 channel',()=>{
  for(let value=0;value<256;value++){
    expect(channel('grainMerge',127,value)).toBe(value)
    expect(channel('grainExtract',127,value)).toBe(value)
    expect(channel('negation',0,value)).toBe(value)
    expect(channel('negation',255,value)).toBe(255-value)
  }
  expect(channel('grainMerge',64,192)).toBe(129)
  expect(channel('grainExtract',64,192)).toBe(255)
  expect(channel('grainExtract',192,64)).toBe(0)
  expect(channel('negation',64,192)).toBe(254)
})
it('uses the foreground operator before alpha composition, not on canvas feedback',()=>{
  // Fully opaque source canvas/background stays unchanged when foreground alpha=0.
  // Independently project one partial foreground OVER (mask/final stage separate).
  const background=192,foreground=64,alpha=.25
  for(const mode of ['grainMerge','grainExtract','negation']as const){
    const blended=channel(mode,foreground,background)
    expect(background*(1-alpha)+blended*alpha).not.toBe(channel(mode,foreground,Math.round(background*(1-alpha))))
  }
})
it('separates legacy pickup/final opacity from linear compensated colour, never modern square',()=>{
  expect(legacy(.5,.6,.8,.9)).toEqual({background:1,foreground:.08000000000000002,final:.3})
  expect(legacy(.5,.1,.8,.2)).toEqual({background:1,foreground:.32000000000000006,final:.05})
  expect(legacy(0,1,1,0)).toEqual({background:1,foreground:0,final:0})
  expect(legacy(1,0,1,0)).toEqual({background:1,foreground:1,final:0})
  expect(legacy(1,1,0,1)).toEqual({background:1,foreground:0,final:1})
})
it('rejects invalid channel and option values before computing stages',()=>{
  expect(()=>channel('grainMerge',.5,0)).toThrow(RangeError)
  expect(()=>channel('negation',255,256)).toThrow(RangeError)
  expect(()=>legacy(1,NaN,1,1)).toThrow(RangeError)
  expect(()=>legacy(1,1,1,2)).toThrow(RangeError)
})
