import { expect, it } from 'vitest'
import { isBrushSpray } from './brushSpray.js'
const lut=Array.from({length:257},(_,i)=>Math.round(i/256*65535).toString(16).padStart(4,'0')).join('')
const spray={version:1,diameter:100,scale:1,aspect:1,angle:0,count:12,jitter:0,radial:{maximum:1,samples:lut},angular:lut,particle:{shape:'ellipse',width:3,height:2,proportional:false},dynamics:{randomSize:true,fixedAngle:0,randomAngle:0,radialAngle:0,pathAngle:0},color:{perParticle:true,hue:0,saturation:0,value:0,randomOpacity:false}}
it('admits the complete bounded spray contract',()=>expect(isBrushSpray(spray)).toBe(true))
it('rejects unordered, truncated and nonhex CDF resources',()=>{for(const angular of ['f'.repeat(4)+lut.slice(4),lut.slice(4),'x'.repeat(1028)])expect(isBrushSpray({...spray,angular})).toBe(false)})
it('rejects unbounded population and nonfinite geometry',()=>{for(const value of [{...spray,count:100000},{...spray,diameter:Infinity},{...spray,radial:{maximum:100,samples:lut}}])expect(isBrushSpray(value)).toBe(false)})
it('rejects unrecognised nested particle semantics',()=>expect(isBrushSpray({...spray,particle:{...spray.particle,unknown:true}})).toBe(false))
