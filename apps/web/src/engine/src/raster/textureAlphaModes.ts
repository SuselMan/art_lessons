/** Native texture ALPHA application, not RGB layer blending. New modes only;
 * historical multiply/subtract shader branches remain at their old call site. */
export type TextureAlphaExtendedMode='darken'|'overlay'|'linearDodge'|'linearBurn'|'colorDodge'|'colorBurn'|'hardMixPhotoshop'|'hardMixSofterPhotoshop'|'height'|'linearHeight'|'heightPhotoshop'|'linearHeightPhotoshop'
const modes:Readonly<Record<TextureAlphaExtendedMode,number>>=Object.freeze({darken:3,overlay:4,linearDodge:5,linearBurn:6,colorDodge:7,colorBurn:8,hardMixPhotoshop:9,hardMixSofterPhotoshop:10,height:11,linearHeight:12,heightPhotoshop:13,linearHeightPhotoshop:14})
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
 if(mode==='height'||mode==='linearHeight'||mode==='heightPhotoshop'||mode==='linearHeightPhotoshop'){
  const photoshop=mode==='heightPhotoshop'||mode==='linearHeightPhotoshop',linear=mode==='linearHeight'||mode==='linearHeightPhotoshop'
  const value=photoshop?alpha*(soft?1+9*strength:10*strength):alpha/(1-.99*strength)-(soft?0:1-.99*strength)
  const pattern=texture*(soft?(photoshop?strength:.99*strength):1)
  return Math.min(1,Math.max(0,linear?Math.max(value*(1-pattern),value-pattern):value-pattern))
 }
 if(mode==='colorDodge'){
  const x=soft?texture*strength:texture,y=soft?alpha:alpha*strength
  return x===1?(y===0?0:1):Math.min(1,y/(1-x))
 }
 if(mode==='colorBurn'){
  const x=soft?1-strength+texture*strength:texture,y=soft?alpha:alpha*strength
  return y===1?1:x===0?0:1-Math.min(1,(1-y)/x)
 }
 if(mode==='hardMixPhotoshop'){
  if(!soft)return texture+alpha*strength>1?1:0
  const x=1-strength+texture*strength
  return (x+alpha>1?1:0)*(alpha+strength-alpha*strength)
 }
 if(mode==='hardMixSofterPhotoshop')return Math.min(1,Math.max(0,soft?3*alpha-2*(1-texture*strength):3*alpha*strength-2*(1-texture)))
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
 if(mode>10.5){
  bool photoshop=mode>12.5;
  bool linear=(mode>11.5&&mode<12.5)||mode>13.5;
  float value=photoshop?a*(soft?1.0+9.0*s:10.0*s):a/(1.0-0.99*s)-(soft?0.0:1.0-0.99*s);
  float pattern=t*(soft?(photoshop?s:0.99*s):1.0);
  return clamp(linear?max(value*(1.0-pattern),value-pattern):value-pattern,0.0,1.0);
 }
 if(mode>6.5){
  if(mode<7.5){
   float x=soft?t*s:t,y=soft?a:a*s;
   if(x==1.0)return y==0.0?0.0:1.0;
   return min(1.0,y/(1.0-x));
  }
  if(mode<8.5){
   float x=soft?1.0-s+t*s:t,y=soft?a:a*s;
   if(y==1.0)return 1.0;
   if(x==0.0)return 0.0;
   return 1.0-min(1.0,(1.0-y)/x);
  }
  if(mode<9.5){
   if(!soft)return t+a*s>1.0?1.0:0.0;
   float x=1.0-s+t*s;
   return (x+a>1.0?1.0:0.0)*(a+s-a*s);
  }
  return clamp(soft?3.0*a-2.0*(1.0-t*s):3.0*a*s-2.0*(1.0-t),0.0,1.0);
 }

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
