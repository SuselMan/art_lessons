import {BRUSH_LIGHTNESS_GLSL} from './brushBehaviorShaders'

/** The projection never feeds back into the unshaded colour field. Height
 * alpha attenuates the gray displacement; transparent height leaves RGB alone. */
export const COLOR_SMUDGE_MATERIAL_FRAG=`
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_height;
uniform vec2 u_resolution;
${BRUSH_LIGHTNESS_GLSL}
void main(){
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec4 color=texture2D(u_color,uv),height=texture2D(u_height,uv);
 vec3 rgb=brushMaterialColor(color.rgb/max(color.a,0.000001),height.r/max(height.a,0.000001),height.a);
 gl_FragColor=vec4(rgb*color.a,color.a);
}`
