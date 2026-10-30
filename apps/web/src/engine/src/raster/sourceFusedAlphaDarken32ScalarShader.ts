import {SOURCE_RGB_FMA_BYTE_GLSL} from './sourceRgbFmaByteShader'
import {normalizeSourcePainterOpacity,type SourcePainterOpacityInput} from '../presets/sourcePainterOpacity'
import {sourceFiniteF32Components} from './sourceFmaF32Model'
import {SOURCE_FMA_F32_GLSL} from './sourceFmaF32Shader'
import {SOURCE_FMA_F32_NUMERIC_GLSL,SOURCE_FMA_F32_COMPOSE_GLSL} from './sourceFmaF32NumericShader'
import {SOURCE_ALPHA_DARKEN32_GLSL} from './sourceAlphaDarken32Shader'
export type SourceScalarAlphaVariant='creamy'|'hard'
/** Local-only upload prep: native ParameterInfo alias BEFORE hardfloatfold.
 * Shader consumes folded O/A and MUST NOT apply hard flow multiplication again. */
export function prepareSourceFusedAlphaDarken32ScalarControls(variant:SourceScalarAlphaVariant,input:SourcePainterOpacityInput,mask?:number):{readonly values:readonly[number,number,number,number];readonly selection:readonly[number,number];readonly opacityParts:readonly[number,number,number];readonly averageParts:readonly[number,number,number];readonly flowParts:readonly[number,number,number];readonly averageAliased:boolean}{
 if(variant!=='creamy'&&variant!=='hard')throw new RangeError('Expected scalar AlphaDarken variant')
 if(mask!==undefined&&(!Number.isInteger(mask)||mask<0||mask>255))throw new RangeError('Expected selection byte')
 const normalized=normalizeSourcePainterOpacity(input),hard=variant==='hard',O=hard?Math.fround(normalized.flow*normalized.opacity):normalized.opacity,A=hard?Math.fround(normalized.flow*normalized.averageOpacity):normalized.averageOpacity
 const parts=(n:number):readonly[number,number,number]=>{const view=new DataView(new ArrayBuffer(4));view.setFloat32(0,n,true);const p=sourceFiniteF32Components(view.getUint32(0,true));return[Number(p.negative),p.significand,p.exponent]}
 return {values:[O,A,normalized.flow,mask??0],selection:[Number(hard),Number(mask!==undefined)],opacityParts:parts(O),averageParts:parts(A),flowParts:parts(normalized.flow),averageAliased:normalized.averageAliased}
}
/** Explicit diagnostic SCALAR point graph. O/A already hard-folded ONCE onCPU.
 * No vectorpacket/alignment/tile/GUI/renderer activation claim. */
export const SOURCE_FUSED_ALPHA_DARKEN32_SCALAR_GLSL=SOURCE_FMA_F32_GLSL+SOURCE_FMA_F32_NUMERIC_GLSL+SOURCE_FMA_F32_COMPOSE_GLSL+SOURCE_ALPHA_DARKEN32_GLSL+SOURCE_RGB_FMA_BYTE_GLSL+/* glsl */`
vec4 sourceCompositeFusedAlphaDarken32Scalar(vec4 source,vec4 destination,highp vec4 values,vec2 selection,vec3 opacityParts,vec3 flowParts){
 const float reciprocalByte=0.003921568859368563;
 const float reciprocalByteSquared=0.00001537870048196055;
 float O=values.x;float A=values.y;float F=values.z;bool hard=selection.x!=0.0;
 // Exact power2 domain partition, not approximate-output tolerance.
 if(opacityParts.z< -123.0)return destination.a==0.0?vec4(source.rgb,0.0):destination;
 float D=destination.a==0.0?0.0:destination.a*reciprocalByte;
 float M;
 if(selection.y!=0.0){float q=values.w*reciprocalByteSquared;M=q*source.a;}else M=source.a*reciprocalByte;
 float S=O*M;
 vec3 color;
 // Byte endpoints are exact FMA identities. Hoist BEFORE coefficient
 // decomposition; alpha and the native D0 hidden-RGB rule are unchanged.
 if(destination.a==0.0||S==1.0)color=source.rgb;
 else if(all(equal(source.rgb,destination.rgb)))color=destination.rgb;
 else color=sourceRgbFmaBytes(S,sourceF32Decompose(S,0.0).xyz,source.rgb,destination.rgb);
 // Creamy tinyflow only freezes alpha; opacity-driven RGB ABOVE remains.
 if(!hard&&flowParts.z< -123.0)return vec4(mod(color,256.0),destination.a);
 float full;
 if(A>O){if(A>D){float fraction=D/A;float gap=A-S;full=sourceFmaFiniteNumbers(fraction,gap,S);}else full=D;}
 else {if(O>D){float gap=O-D;full=sourceFmaFiniteNumbers(gap,M,D);}else full=D;}
 float alpha;
 if(F==1.0)alpha=full*255.0;
 else {float zero=D;if(hard){float sum=D+S;zero=sourceFmaFiniteNumbers(-D,S,sum);}float gap=full-zero;alpha=sourceFmaFiniteNumbers(F,gap,zero)*255.0;}
 return vec4(mod(color,256.0),mod(sourceAlphaDarken32RoundEven(alpha),256.0));
}
`;
