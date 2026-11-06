import { describe, expect, it } from 'vitest'
import type { BrushDescriptor, BrushSpray, Dab } from '@grafetto/shared'
import { sprayStamps } from './brushSpray'
import { beginBrushBehavior, behaviorStampsForDab } from './brushBehavior'
const encode=(f:(x:number)=>number)=>Array.from({length:257},(_,i)=>Math.round(f(i/256)*65535).toString(16).padStart(4,'0')).join('')
const lut=encode(x=>x)
const spray:BrushSpray={version:1,diameter:100,scale:1,aspect:1,angle:0,count:1000,jitter:0,radial:{maximum:1,samples:lut},angular:lut,particle:{shape:'ellipse',width:4,height:2,proportional:false},dynamics:{randomSize:false,fixedAngle:0,randomAngle:0,radialAngle:0,pathAngle:0},color:{perParticle:true,hue:0,saturation:0,value:0,randomOpacity:false}}
const brush:BrushDescriptor={id:'test',version:42,model:'stamp',category:'scatter',tip:{kind:'round',hardness:1,aspect:1,rotation:'fixed',angle:0},paperInteraction:0,spacing:.25,flow:1,flowPer:'stamp',sizeByPressure:[[0,1],[1,1]],flowByPressure:[[0,1],[1,1]],opacityByPressure:[[0,1],[1,1]],pressureSmoothingPx:0,opacity:1,spray,behavior:{version:2}}
const dab:Dab={x:0,y:0,size:100,angle:0,aspectRatio:1,pressure:.5,tiltX:0,tiltY:0,opacity:1,t:0}
describe('Spray population',()=>{
 it('keeps physical particle size independent of area size',()=>{const a=sprayStamps(brush,dab,12,0,0),b=sprayStamps(brush,{...dab,size:200},12,0,0);expect(a).toHaveLength(1000);expect(a[0].size).toBe(2);expect(a[0].aspect).toBe(2);expect(b[0].size).toBe(a[0].size);expect(b[0].x).toBe(a[0].x*2)})
 it('area-correct uniform radius has mean squared radius one half',()=>{const b={...brush,spray:{...spray,radial:{maximum:1,samples:encode(Math.sqrt)}}};const a=sprayStamps(b,dab,9,0,0);expect(a.reduce((v,p)=>v+(p.x*p.x+p.y*p.y)/2500,0)/a.length).toBeCloseTo(.5,1)})
 it('density scales with area and stays bounded for large input',()=>{const b={...brush,spray:{...spray,density:.01}};expect(sprayStamps(b,dab,1,0,0)).toHaveLength(78);expect(sprayStamps(b,{...dab,size:200},1,0,0)).toHaveLength(314);expect(sprayStamps(b,{...dab,size:10000},1,0,0)).toHaveLength(4096)})
 it('repeated stationary dabs differ, but chunked replay is identical',()=>{const b={...brush,spray:{...spray,count:3,randomSize:true}};const inputs=[dab,{...dab,t:10},{...dab,t:20}];const run=(chunks:Dab[][])=>{const s=beginBrushBehavior(dab);return chunks.flatMap(chunk=>chunk.flatMap(d=>behaviorStampsForDab(b,d,s,[.2,.3,.4])))};const a=run([inputs]),c=run([[inputs[0]],inputs.slice(1)]);expect(a).toEqual(c);expect(a[0].x).not.toBe(a[3].x)})
 it('does not mutate lookup tables or descriptor during expansion',()=>{const before=structuredClone(brush);sprayStamps(brush,dab,4,5,2);expect(brush).toEqual(before)})
})
