/** Separate opt-in program. No legacy stamp/wet shader template is changed.
 * gl_FragCoord is a pixel centre; native input-.5/integer sampling is equivalent.
 * Coverage is stored as the whole premultiplied pigment pixel in stroke scratch.
 */
export const CIRCLE_BAND_STAMP_FRAG = `
precision highp float;
uniform vec2 u_dabCenter;
uniform float u_dabRadius;
uniform vec2 u_resolution;
uniform vec3 u_color;
uniform highp sampler2D u_previousCeiling;
uniform float u_circleClipped;
uniform vec3 u_circleClip0,u_circleClip1,u_circleClip2,u_circleClip3;
float circlePlane(vec3 plane,vec2 point) { return dot(plane.xy,point)+plane.z; }
void main() {
 vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y)-u_dabCenter;
 if(u_circleClipped>0.5) {
  bool first=circlePlane(u_circleClip0,pixel)>=0.0 && circlePlane(u_circleClip1,pixel)>=0.0;
  bool second=circlePlane(u_circleClip2,pixel)>=0.0 && circlePlane(u_circleClip3,pixel)>=0.0;
  if(!first && !second)discard;
 }
 float r2=u_dabRadius*u_dabRadius;
 float coefficient=1.0/((u_dabRadius+1.0)*(u_dabRadius+1.0)-r2);
 float band=(dot(pixel,pixel)-r2)*coefficient;
 if(band>1.0)discard;
 float alphaByte=band>0.0 ? floor((1.0-band)*255.0) : 255.0;
 vec4 previous=texture2D(u_previousCeiling,gl_FragCoord.xy/u_resolution);
 if(alphaByte<=floor(previous.a*255.0+0.5))discard;
 float alpha=alphaByte/255.0;
 gl_FragColor=vec4(u_color*alpha,alpha);
}
`
