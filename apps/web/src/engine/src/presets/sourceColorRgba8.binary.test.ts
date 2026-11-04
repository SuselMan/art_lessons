import {it,expect} from 'vitest'
import {compositeRgba8,sourceRgba8SeparableChannel,sourceRgba8CompositeModeId,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import {SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL} from '../raster/sourceRgba8CompositeWebGL1'
import {SOURCE_RGBA8_COMPOSITE_GLSL} from '../raster/sourceRgba8CompositeShader'
// Independent boolean truth tables indexed Sbit*2+Dbit; no production bitwise formula used.
const cases=[['binaryXor',[0,1,1,0],128,160,128],['binaryOr',[0,1,1,1],192,192,149],['binaryAnd',[0,0,0,1],64,128,106],['binaryNand',[1,1,1,0],191,192,149],['binaryNor',[1,0,0,0],63,127,106],['binaryXnor',[1,0,0,1],127,159,128],['binaryImplication',[1,0,1,1],127,159,128],['binaryNotImplication',[0,1,0,0],128,160,128],['binaryConverse',[1,1,0,1],255,224,170],['binaryNotConverse',[0,0,1,0],0,96,85]] as const
it('appends53..62 and includes every real ES1 bounded truth branch and ES3 byte operation',()=>{
 for(const [i,[mode]]of cases.entries()){
  expect(sourceRgba8CompositeModeId(mode)).toBe(53+i)
  expect(SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL).toMatch(new RegExp('mode\\s*==\\s*'+(53+i)+'\\.0'))
  expect(SOURCE_RGBA8_COMPOSITE_GLSL).toMatch(new RegExp('mode\\s*==\\s*'+(53+i)+'u'))
 }
 expect(SOURCE_RGBA8_COMPOSITE_WEBGL1_GLSL).toContain('bit<8')
})
for(const [mode,truth,opaque,masked,partial]of cases)it(mode+' follows defined functional truth on every U8 pair and preserves GenericSC controls',()=>{
 let mismatch:unknown
 for(let s=0;s<256&&!mismatch;s++)for(let d=0;d<256;d++){
  let expected=0,weight=1
  for(let bit=0;bit<8;bit++){const a=Math.floor(s/weight)%2,b=Math.floor(d/weight)%2;const value=truth[a*2+b];if(value===undefined)throw Error('Truth index out of domain');expected+=value*weight;weight*=2}
  const actual=sourceRgba8SeparableChannel(mode,s,d);if(actual!==expected){mismatch={s,d,expected,actual};break}
 }
 expect(mismatch).toBeUndefined()
 expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:1,mask:128})).toEqual([masked,masked,masked,255])
 expect(compositeRgba8([64,64,64,128],[192,192,192,128],{mode,profile,opacity:1})).toEqual([partial,partial,partial,192])
 expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:1})).toEqual([opaque,opaque,opaque,255])
 expect(compositeRgba8([64,64,64,255],[192,192,192,255],{mode,profile,opacity:0})).toEqual([192,192,192,255])
 expect(compositeRgba8([64,64,64,0],[192,192,192,97],{mode,profile,opacity:1})).toEqual([192,192,192,97])
 expect(compositeRgba8([64,64,64,255],[192,192,192,0],{mode,profile,opacity:1,mask:128})).toEqual([64,64,64,128])
})
it('retains implication and converse directions rather than guessing textbook names',()=>{
 expect(sourceRgba8SeparableChannel('binaryImplication',0,255)).toBe(0)
 expect(sourceRgba8SeparableChannel('binaryConverse',0,255)).toBe(255)
 expect(sourceRgba8SeparableChannel('binaryNotImplication',0,255)).toBe(255)
 expect(sourceRgba8SeparableChannel('binaryNotConverse',0,255)).toBe(0)
})
