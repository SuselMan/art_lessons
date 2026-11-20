import{it,expect,vi}from'vitest'
import{textureAlphaExtended}from'../raster/textureAlphaModes'
import{BrushPainter}from'./BrushPainter'
import{BrushBehaviorPainter}from'./BrushBehaviorPainter'
import{SmudgePainter}from'./SmudgePainter'
import{pair170}from'../../../../../../packages/shared/src/dualMask170.testFixture'
import{dab157}from'../../../../../../packages/shared/src/particleTimer157.testFixture'
it('independent rational threshold oracle distinguishes multiply and strict unit boundary',()=>{
 for(const[d,s,expected]of[[204,77,255],[51,77,0],[128,127,0],[128,128,255],[0,255,0],[255,0,0],[255,255,255]]){
  const exact=BigInt(d)+BigInt(s)>255n?255:0;expect(exact).toBe(expected)
  expect(255*textureAlphaExtended('hardMixPhotoshop',d/255,s/255,1,false)).toBe(expected)
 }
 // Accumulation must precede the operator: two 1/2 alpha components each
 // have coverage3/4, threshold produces1; per-dab strict(1/2+1/2) stays0.
 const accumulated=1-(1-.5)**2;expect(accumulated).toBe(.75)
 expect(textureAlphaExtended('hardMixPhotoshop',accumulated,accumulated,1,false)).toBe(1)
 expect(textureAlphaExtended('hardMixPhotoshop',.5,.5,1,false)).toBe(0)
})
it('actual recorded/public-owner boundaries reject malformed170 before any state/resource access',()=>{
 for(const entry of['recorded','paint','erase']){
  const b=pair170();if(entry!=='erase')Reflect.set(b.behavior!.dual!,'sampling',undefined)
  const touched=vi.fn(),state=new Proxy({},{get(){touched();throw Error('owner touched')}})
  if(entry==='recorded'){const painter=Object.create(BrushPainter.prototype)as BrushPainter;expect(()=>painter.prepareRecordedStampResources(b)).toThrow('dual170')}
  else{const painter=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter;expect(()=>painter.paint(state as never,[dab157()],{sizeMultiplier:1}as never,b,{size:true,opacity:true},[1,0,0],state as never,false,undefined,undefined,entry==='erase')).toThrow('dual170')}
  expect(touched).not.toHaveBeenCalled()
 }
})
it('170 cannot enter legacy Smudge per-dab blend path',()=>{
 const painter=Object.create(SmudgePainter.prototype)as SmudgePainter,touched=vi.fn(),target=new Proxy({},{get(){touched();throw Error('owner touched')}})
 expect(()=>painter.paint(target as never,[dab157()],'u',undefined,'s',{brush:pair170()}as never)).toThrow('ordinary BrushPainter');expect(touched).not.toHaveBeenCalled()
})
