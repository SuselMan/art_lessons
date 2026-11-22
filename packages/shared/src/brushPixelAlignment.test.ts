import{expect,it}from'vitest'
import{hasPixelAlignment211Scope}from'./brushes.js'
it('restricts alignment metadata to the admitted bitmap GIH scope',()=>{
 const d={version:211,model:'stamp',paperInteraction:0,tip:{kind:'bitmap',aspect:1,rotation:'fixed',alphaThreshold:{value:.47,softness:.6,alignment:{width:1,height:124/180}},animation:{mode:'random',frames:['a','b']}},behavior:{version:2,rendering:{mode:'buildUp',blendMode:'normal',accumulation:'alphaDarken'},dynamics:{angle:{}}}}
 expect(hasPixelAlignment211Scope(d)).toBe(true);expect(hasPixelAlignment211Scope({...d,version:27})).toBe(false);expect(hasPixelAlignment211Scope({...d,scatter:{}})).toBe(false)
})
