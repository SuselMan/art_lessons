import type { BrushDescriptor, Dab } from '@grafetto/shared'
import { brushDabRandom, type BrushStamp } from './digitalBrushPresets'
/** Bounded expansion of one recorded spray centre. Independent of frame/chunk/tile. */
const lookups=new Map<string,Float64Array>()
function decode(samples:string):Float64Array{const known=lookups.get(samples);if(known)return known;const result=Float64Array.from({length:257},(_,i)=>parseInt(samples.slice(i*4,i*4+4),16)/65535);if(lookups.size>=32)lookups.delete(lookups.keys().next().value!);lookups.set(samples,result);return result}
export function sprayStamps(brush:BrushDescriptor,dab:Dab,seed:number,ordinal:number,direction:number):BrushStamp[] {
  const s=brush.spray!
  const random=(i:number):number=>brushDabRandom((seed^Math.imul(ordinal+1,0x9e3779b9))>>>0,i)
  const lookup=(lut:Float64Array,u:number):number=>{const x=u*256,i=Math.min(255,Math.floor(x));return lut[i]+(lut[i+1]-lut[i])*(x-i)}
  const radial=decode(s.radial.samples),angular=decode(s.angular)
  const radius=dab.size*.5*s.scale
  const count=Math.min(4096,s.density===undefined?s.count:Math.floor(s.density*Math.PI*radius*radius))
  const cx=dab.x+(random(0)*2-1)*radius*s.jitter,cy=dab.y+(random(1)*2-1)*radius*s.jitter
  const areaAngle=s.angle-dab.angle,cos=Math.cos(areaAngle),sin=Math.sin(areaAngle)
  const result:BrushStamp[]=[]
  for(let i=0;i<count;i++){
    const r=(j:number):number=>random(16+i*16+j)
    const theta=lookup(angular,r(0))*2*Math.PI,dist=lookup(radial,r(1))*s.radial.maximum*radius*s.scale
    const x=Math.cos(theta)*dist,y=Math.sin(theta)*dist*s.aspect
    let angle=s.dynamics.fixedAngle*(1-s.dynamics.randomAngle)+2*Math.PI*r(2)*s.dynamics.randomAngle
    angle=angle*(1-s.dynamics.radialAngle)+theta*s.dynamics.radialAngle
    angle=angle*(1-s.dynamics.pathAngle)+direction*s.dynamics.pathAngle
    const particleScale=s.dynamics.randomSize?r(3):1
    const proportional=s.particle.proportional?s.diameter*s.scale/100:1
    const width=Math.max(1,s.particle.width*proportional*particleScale),height=Math.max(1,s.particle.height*proportional*particleScale)
    result.push({x:cx+cos*x-sin*y,y:cy+sin*x+cos*y,size:height,aspect:width/height,angle,flowScale:s.color.randomOpacity?Math.pow(random(16+(s.color.perParticle?i:0)*16+7),2):1})
  }
  return result
}
