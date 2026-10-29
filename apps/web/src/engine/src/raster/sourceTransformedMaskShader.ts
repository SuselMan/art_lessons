import { SOURCE_AFFINE_GRAY16_GLSL } from './sourceAffineGray16Shader'
import { SOURCE_RGBA64_STRAIGHT_GLSL } from './sourceRgba64StraightShader'

/** One-pass material shader. Source decode, PM16 interpolation and integer64
 * store remain shared functions, not a third numerical implementation.
 * Pixel-space vertices represent COMPLETE covered native rows. Every row
 * repeats its integer seed attributes; fragment rounding removes interpolation
 * noise from transport of integers, not from the source mathematical plan.
 */
export const SOURCE_TRANSFORMED_MASK_VERT = `
precision highp float;
attribute vec2 a_position;
attribute vec4 a_origin;
attribute vec4 a_step;
attribute vec2 a_span;
uniform vec2 u_targetSize;
varying highp vec4 v_origin;
varying highp vec4 v_step;
varying highp vec2 v_span;
void main() {
 gl_Position=vec4(a_position/u_targetSize*2.0-1.0,0.0,1.0);
 v_origin=a_origin;
 v_step=a_step;
 v_span=a_span;
}
`
export function sourceTransformedMaskFragment(proof = false): string {
  return `precision highp float;
precision highp sampler2D;
${SOURCE_AFFINE_GRAY16_GLSL}
${SOURCE_RGBA64_STRAIGHT_GLSL}
uniform sampler2D u_source;
uniform sampler2D u_factorLow;
uniform sampler2D u_factorHigh;
uniform vec2 u_sourceSize;
uniform float u_decode;
uniform float u_summed;
uniform float u_directCopy;
varying highp vec4 v_origin;
varying highp vec4 v_step;
varying highp vec2 v_span;
void main() {
 vec4 result;
 if(u_directCopy>0.5) {
  vec4 pixel=floor(texture2D(u_source,(floor(gl_FragCoord.xy)+1.5)/u_sourceSize)*255.0+0.5);
  result=vec4(pixel.r,pixel.a,rgba64MaskByte(pixel.r,pixel.a),255.0)/255.0;
 } else {
  vec4 origin=floor(v_origin+0.5),step=floor(v_step+0.5);
  vec2 span=floor(v_span+0.5);
  vec4 pm=sourceAffineGray16Packed(u_source,u_sourceSize,origin,step,span.y,floor(gl_FragCoord.x)-span.x,u_decode,u_summed);
  result=sourceRgba64StraightGrayPacked(u_factorLow,u_factorHigh,pm);
 }
 ${proof ? 'gl_FragColor=result;' : 'gl_FragColor=vec4(result.b);'}
}
`
}
