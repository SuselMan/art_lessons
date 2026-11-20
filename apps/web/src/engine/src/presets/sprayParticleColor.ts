import type{BrushSpray}from'@grafetto/shared'
import{brushDabRandom}from'./digitalBrushPresets'
import{hsvAdjustColor}from'./brushBehavior'
import{mixWeightedRgba8,type Rgba8}from'./mixWeightedRgba8'
export interface SprayParticleColorControl{readonly sourceIndex:number;readonly hsv:readonly[number,number,number];readonly randomAlpha:number|undefined}
/** Same named RNG lanes as current Spray geometry/colour. Caller prepares once
 * before physical tile iteration; per-request source always means particle 0. */
export function sprayParticleColorControls(color:BrushSpray['color'],seed:number,ordinal:number,index:number):SprayParticleColorControl{
 if(!Number.isSafeInteger(ordinal)||ordinal<0||!Number.isInteger(index)||index<0||index>=4096)throw new RangeError('Invalid Spray particle identity')
 const sourceIndex=color.perParticle?index:0,s=(seed^Math.imul(ordinal+1,0x9e3779b9))>>>0,base=16+sourceIndex*16
 return{sourceIndex,hsv:[color.hue*brushDabRandom(s,base+4),color.saturation*brushDabRandom(s,base+5),color.value*brushDabRandom(s,base+6)],randomAlpha:color.randomOpacity?brushDabRandom(s,base+7):undefined}
}
function rgba(value:Rgba8):void{if(!Array.isArray(value)||value.length!==4||value.some(n=>!Number.isInteger(n)||n<0||n>255))throw new RangeError('Spray requires captured RGBA8')}
export interface SprayParticleSourceOptions{sampleInput?:true;mixBackground?:true}
/** Native order witness spray_brush.cpp261..298,337..405. This is a browser
 * functional reference, not a native ICC/RNG/ISA identity claim. Images retain
 * their own RGB: sampled/mixed ink is never used to tint an image stamp. */
export function sprayParticleRgba8(application:'painted-shape'|'direct-pixel'|'image',foreground:Rgba8,control:SprayParticleColorControl,options:SprayParticleSourceOptions={},sampled?:Rgba8,background?:Rgba8,pressure=1):Rgba8{
 rgba(foreground)
 if(!Number.isFinite(pressure)||pressure<0||pressure>1||control.hsv.some(n=>!Number.isFinite(n)||n< -1||n>1)||control.randomAlpha!==undefined&&(!Number.isFinite(control.randomAlpha)||control.randomAlpha<0||control.randomAlpha>1))throw new RangeError('Invalid Spray colour controls')
 let result=foreground
 if(application!=='image'){
  if(options.sampleInput){if(!sampled)throw new Error('Spray requires an original source colour');rgba(sampled);result=sampled}
  if(options.mixBackground){if(!background)throw new Error('Spray requires a captured background');rgba(background);result=mixWeightedRgba8([result,background],[Math.trunc(pressure*255),Math.trunc((1-pressure)*255)],255)}
 }
 const adjusted=hsvAdjustColor([result[0]/255,result[1]/255,result[2]/255],...control.hsv),byte=(n:number)=>Math.max(0,Math.min(255,Math.floor(n*255+.5)))
 let alpha=result[3]/255
 if(control.randomAlpha!==undefined){const r=control.randomAlpha;alpha=application==='image'?alpha*r:application==='direct-pixel'?r:r*r}
 return[byte(adjusted[0]),byte(adjusted[1]),byte(adjusted[2]),byte(alpha)]
}
