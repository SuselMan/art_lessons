import {sourceFiniteF32Components} from './sourceFmaF32Model'
import {SOURCE_FMA_F32_GLSL} from './sourceFmaF32Shader'
import {SOURCE_FMA_F32_NUMERIC_GLSL,SOURCE_FMA_F32_COMPOSE_GLSL} from './sourceFmaF32NumericShader'
import {SOURCE_OVER32_SCALAR_GLSL} from './sourceOver32ScalarShader'
/** Named diagnostic SCALAR graph only. Flat values=(opacityF32,maskByte),
 * hasMask explicit, opacityParts=(sign0,sig24,exp) from validated SAME opacity.
 * Tiny branch preserves exact native source-alpha zero/nonzero and hiddenRGB.
 * No packet/alignment/tile64/installed GUI or renderer activation is implied. */
export const SOURCE_FUSED_OVER32_SCALAR_GLSL=SOURCE_FMA_F32_GLSL+SOURCE_FMA_F32_NUMERIC_GLSL+SOURCE_FMA_F32_COMPOSE_GLSL+SOURCE_OVER32_SCALAR_GLSL+/* glsl */`
vec4 sourceCompositeFusedOver32Scalar(vec4 source,vec4 destination,highp vec2 values,float hasMask,vec3 opacityParts){
 const float reciprocalByte=0.003921568859368563;
 // Exact power2 domain split: opacity<2^-100, NOT an error tolerance.
 // For tiny S>0,D0 native copies hidden sourceRGB even though roundedA0.
 if(opacityParts.z< -123.0){
  vec4 sp=sourceFmaF32(sourceF32Decompose(source.a,0.0).xyz,opacityParts,vec3(0.0,0.0,-149.0));
  if(hasMask!=0.0){float normalized=values.y*reciprocalByte;sp=sourceFmaF32(sp.xyz,sourceF32Decompose(normalized,0.0).xyz,vec3(0.0,0.0,-149.0));}
  if(sp.y==0.0)return destination;
  return destination.a==0.0?vec4(source.rgb,0.0):destination;
 }
 float S=source.a*values.x;
 if(hasMask!=0.0){float normalized=values.y*reciprocalByte;S=S*normalized;}
 if(S==0.0)return destination;
 float alpha=destination.a;float blend;
 if(alpha==255.0)blend=S*reciprocalByte;
 else if(alpha==0.0){alpha=S;blend=1.0;}
 else {float t=S*(255.0-alpha);alpha=sourceFmaFiniteNumbers(t,reciprocalByte,alpha);blend=S*sourceOver32ReciprocalEstimate(alpha);}
 vec3 color;
 if(blend==1.0)color=source.rgb;
 else if(blend==0.0)color=destination.rgb;
 else color=vec3(sourceOver32RoundEven(sourceFmaFiniteNumbers(blend,source.r-destination.r,destination.r)),sourceOver32RoundEven(sourceFmaFiniteNumbers(blend,source.g-destination.g,destination.g)),sourceOver32RoundEven(sourceFmaFiniteNumbers(blend,source.b-destination.b,destination.b)));
 // Native RNE byte pack keeps the low8 bits, rather than framebuffer clamp.
 return vec4(mod(color,256.0),mod(sourceOver32RoundEven(alpha),256.0));
}
`;

/** Local diagnostic upload adapter. Narrow ONCE before deriving components;
 * neither a network field nor independent opacity normalization/aliasing. */
export function prepareSourceFusedOver32ScalarControls(opacity:number,mask?:number):{readonly values:readonly[number,number];readonly hasMask:number;readonly opacityParts:readonly[number,number,number]} {
 if(typeof opacity!=='number'||!Number.isFinite(opacity)||opacity<0||opacity>1)throw new RangeError('Expected opacity in [0,1]')
 if(mask!==undefined&&(!Number.isInteger(mask)||mask<0||mask>255))throw new RangeError('Expected selection byte')
 const view=new DataView(new ArrayBuffer(4));view.setFloat32(0,opacity,true);const narrowed=view.getFloat32(0,true),parts=sourceFiniteF32Components(view.getUint32(0,true))
 return {values:[narrowed,mask??0],hasMask:Number(mask!==undefined),opacityParts:[Number(parts.negative),parts.significand,parts.exponent]}
}
