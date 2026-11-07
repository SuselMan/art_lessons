import {expect,it} from'vitest'
import {colorSmudgeEraseReference as erase}from'./colorSmudgeErase'
import {wetTransferFragment,WET_TRANSFER_FRAG}from'../raster/wetMixShaders'
import {colorSmudgeCompositeCode,colorSmudgeForegroundFragment,colorSmudgeLegacyFragment}from'../raster/colorSmudgeStrategyShader'
it('attenuates alpha and PM colour together without adding foreground pigment',()=>{
 expect(erase([.4,.2,.1,.5],.25)).toEqual([.30000000000000004,.15000000000000002,.07500000000000001,.375])
 expect(erase([.4,.2,.1,.5],0)).toEqual([.4,.2,.1,.5])
 expect(erase([.4,.2,.1,.5],1)).toEqual([0,0,0,0])
 expect(()=>erase([.6,0,0,.5],.2)).toThrow(RangeError)
})
it('independent PM oracle preserves feedback before foreground erase and final COPY or OVER',()=>{
 const actual=[.2,.1,.05,.5],picked=[.1,.2,.3,.6],foreground=.16*.5,finalAmount=.6*.5*.75
 const mixed=picked.map(v=>v*(1-foreground))
 // Native legacy: background COPY, linear compensated ColorRate erase, final pickup*opacity*mask.
 const copy=actual.map((v,i)=>v*(1-finalAmount)+mixed[i]*finalAmount)
 ;[.1757,.1189,.10085,.5117].forEach((v,i)=>expect(copy[i]).toBeCloseTo(v,12))
 const over=actual.map((v,i)=>mixed[i]*finalAmount+v*(1-mixed[3]*finalAmount))
 expect(over[3]).toBeGreaterThanOrEqual(actual[3])
 // smearAlpha=false final OVER cannot destructively erase actual target alpha.
 expect(over[3]).not.toBeCloseTo(actual[3]*(1-foreground*finalAmount),4)
 expect(erase(picked as[number,number,number,number],0)).toEqual(picked)
})
it('selects alpha attenuation only in opt-in foreground programs, old ordinary shaders unchanged',()=>{
 expect(colorSmudgeCompositeCode('erase')).toBe(6)
 const modern=colorSmudgeForegroundFragment(wetTransferFragment(true,true,true,true))
 const legacy=colorSmudgeLegacyFragment(wetTransferFragment(true,true,true))
 expect(modern).toContain('if(u_colorSmudgeComposite>5.5)return destination*(1.0-pigment.a)')
 expect(legacy).toContain('if(u_colorSmudgeComposite>5.5){source*=1.0-b;}else{')
 expect(legacy).toContain('gl_FragColor=u_previousCanvas<1.5 ? mix(destination,source,amount) : source*amount+destination*(1.0-source.a*amount)')
 expect(wetTransferFragment()).toBe(WET_TRANSFER_FRAG)
 expect(wetTransferFragment(true,true,true,true)).not.toContain('u_colorSmudgeComposite')
})
