/** Native texture ALPHA application, not RGB layer blending. New modes only;
 * historical multiply/subtract shader branches remain at their old call site. */
export type TextureAlphaExtendedMode='darken'|'overlay'|'linearDodge'|'linearBurn'
const modes:Readonly<Record<TextureAlphaExtendedMode,number>>=Object.freeze({darken:3,overlay:4,linearDodge:5,linearBurn:6})
export function textureAlphaApplicationCode(mode:string):number{
 if(mode==='multiply')return 1
 if(mode==='subtract')return 2
 if(Object.prototype.hasOwnProperty.call(modes,mode))return modes[mode as TextureAlphaExtendedMode]
 throw RangeError('Unsupported texture alpha mode')
}
/** Normalized continuous counterpart of the native masking operators. Native
 * U8 multiply/overlay staging may differ by a byte; semantic roles are exact. */
export function textureAlphaExtended(mode:TextureAlphaExtendedMode,alpha:number,texture:number,strength:number,soft:boolean):number{
 if(![alpha,texture,strength].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||typeof soft!=='boolean')throw RangeError('Invalid texture alpha operands')
 if(!Object.prototype.hasOwnProperty.call(modes,mode))throw RangeError('Unsupported extended texture alpha mode')
 if(mode==='linearDodge')return alpha===0?0:Math.min(1,soft?texture*strength+alpha:texture+alpha*strength)
 const source=soft?1-strength+texture*strength:texture,destination=soft?alpha:alpha*strength
 if(mode==='darken')return Math.min(source,destination)
 if(mode==='linearBurn')return Math.max(0,source+destination-1)
 return destination<=.5?2*source*destination:1-2*(1-source)*(1-destination)
}
/** Uses the existing single pattern sample. IDs3..6 append to old1/2. */
export const TEXTURE_ALPHA_EXTENDED_GLSL=`
float brushTextureAlphaExtended(float a,float t,float s,vec4 application){
 float mode=application.x;
 bool soft=application.y>0.5;
 if(mode<5.5&&mode>4.5){
  if(a<=0.0)return 0.0;
  return min(1.0,soft?t*s+a:t+a*s);
 }
 float source=soft?1.0-s+t*s:t;
 float destination=soft?a:a*s;
 if(mode<3.5)return min(source,destination);
 if(mode>5.5)return max(0.0,source+destination-1.0);
 return destination<=0.5?2.0*source*destination:1.0-2.0*(1.0-source)*(1.0-destination);
}
`
