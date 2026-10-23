import { BRUSH_STAMP_FRAG } from './shaders'

/** Shared separable blend equations; used by grain, dual tips and final paint. */
const BLEND = `
vec3 brushBlend(vec3 b, vec3 s, float mode) {
  if (mode < 0.5) return s;
  if (mode < 1.5) return b*s;
  if (mode < 2.5) return b+s-b*s;
  if (mode < 3.5) return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(0.5),b));
  if (mode < 4.5) return min(b,s);
  if (mode < 5.5) return max(b,s);
  if (mode < 6.5) return 1.0-min(vec3(1.0),(1.0-b)/max(s,vec3(0.00392157)));
  if (mode < 7.5) return max(vec3(0.0),b+s-1.0);
  if (mode < 8.5) return min(vec3(1.0),b/max(1.0-s,vec3(0.00392157)));
  if (mode < 9.5) return min(vec3(1.0),b+s);
  if (mode < 10.5) return max(vec3(0.0),b-s);
  if (mode < 11.5) return abs(b-s);
  return b+s-2.0*b*s;
}
`
export const BRUSH_V2_STAMP_FRAG = BRUSH_STAMP_FRAG
  .replace('  void main() {', `
  uniform float u_ceilingPass;
  uniform vec3 u_color;
  uniform vec2 u_flip;
  uniform vec4 u_grainTransform;
  uniform vec2 u_grainTone;
  uniform float u_grainBlend;
  uniform sampler2D u_dual;
  uniform float u_dualKind;
  uniform float u_dualBlend;
  uniform float u_dualHardness;
  uniform float u_dualStrength;
  uniform sampler2D u_dualTexture;
  uniform vec2 u_dualTexOrigin;
  uniform float u_dualTexPeriod;
  uniform float u_dualTexStrength;
  uniform vec4 u_dualTransform;
  ${BLEND}
  void main() {`)
  .replace('texture2D(u_tip, v_localUV * 0.5 + 0.5)', 'texture2D(u_tip, v_localUV * u_flip * 0.5 + 0.5)')
  .replace('    if (shape <= 0.0) discard;', `
    if (u_dualKind > 0.5) {
      vec2 dualUV = v_localUV * u_dualTransform.xy;
      dualUV = mat2(u_dualTransform.z,-u_dualTransform.w,u_dualTransform.w,u_dualTransform.z)*dualUV;
      float secondary = u_dualKind > 1.5 ? texture2D(u_dual,dualUV*0.5+0.5).r : 1.0-smoothstep(min(u_dualHardness,0.99),1.0,length(dualUV));
      if (abs(dualUV.x)>1.0 || abs(dualUV.y)>1.0) secondary=0.0;
      secondary *= u_dualStrength;
      if(u_dualTexStrength>0.0) {
        vec2 dw=u_dualTexOrigin+vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
        secondary *= mix(1.0,texture2D(u_dualTexture,dw/u_dualTexPeriod).r,u_dualTexStrength);
      }
      shape = brushBlend(vec3(shape),vec3(secondary),u_dualBlend).r;
    }
    if (shape <= 0.0) discard;`)
  .replace('float g = texture2D(u_texture, w / u_texPeriod).r;', `
      w += u_grainTransform.xy;
      w = mat2(u_grainTransform.z,-u_grainTransform.w,u_grainTransform.w,u_grainTransform.z)*w;
      float g = texture2D(u_texture, w / u_texPeriod).r;
      g = clamp((g-0.5)*(1.0+u_grainTone.y*2.0)+0.5+u_grainTone.x,0.0,1.0);`)
  .replace('amount *= mix(1.0, smoothstep(reach - 0.1, reach + 0.14, g), u_texStrength);', `
      float tooth=smoothstep(reach-0.1,reach+0.14,g);
      amount = mix(amount,brushBlend(vec3(amount),vec3(tooth),u_grainBlend).r,u_texStrength);`)
  .replace('gl_FragColor = vec4(vec3(amount), ceiling);','gl_FragColor = u_ceilingPass > 0.5 ? vec4(ceiling) : vec4(u_color * amount, amount);')

/** V2 coverage holds premultiplied pigment and flow, keeping colour dynamics
 * independent from the original layer and from the user's stroke opacity. */
export const BRUSH_V2_COMPOSITE_FRAG = `
precision highp float;
uniform sampler2D u_original;
uniform sampler2D u_strokeCoverage;
uniform sampler2D u_ceiling;
uniform float u_useCeiling;
uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_blend;
uniform float u_mode;
uniform float u_wetEdge;
uniform float u_burntEdge;
uniform float u_burntBlend;
uniform float u_edgePx;
uniform float u_luminance;
${BLEND}
void main() {
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec4 ink=texture2D(u_strokeCoverage,uv);

 vec4 base=texture2D(u_original,uv);
 vec3 pigment=ink.rgb/max(ink.a,0.00392157);
 float coverage=ink.a;
 // Modes differ in optical density / accumulation, not in frame count.
 if(u_mode<0.5) coverage=1.0-pow(1.0-coverage,0.5);
 else if(u_mode<1.5) coverage=min(coverage,0.5)*2.0;
 else if(u_mode<2.5) coverage=1.0-pow(1.0-coverage,1.5);
 else if(u_mode<3.5) coverage=1.0-pow(1.0-coverage,2.5);
 else if(u_mode<4.5) coverage=smoothstep(0.0,0.8,coverage);
 else if(u_mode<5.5) coverage=1.0-pow(1.0-coverage,2.0);
 float edge=0.0;
 if(u_wetEdge+u_burntEdge>0.0) {
   vec2 e=vec2(u_edgePx)/u_resolution;
   float ring=texture2D(u_strokeCoverage,uv+vec2(e.x,0.0)).a+texture2D(u_strokeCoverage,uv-vec2(e.x,0.0)).a
     +texture2D(u_strokeCoverage,uv+vec2(0.0,e.y)).a+texture2D(u_strokeCoverage,uv-vec2(0.0,e.y)).a;
   edge=clamp((ink.a-ring*0.25)*3.0,0.0,1.0);
   pigment*=1.0-u_wetEdge*edge*0.55;
   pigment=mix(pigment,brushBlend(pigment,pigment*0.5,u_burntBlend),u_burntEdge*edge);
 }
 if(u_luminance>0.5) coverage*=1.0-dot(pigment,vec3(0.2126,0.7152,0.0722));
 float ceiling=u_useCeiling>0.5 ? texture2D(u_ceiling,uv).r : 1.0;
 float alpha=clamp(coverage*u_opacity*ceiling,0.0,1.0);
 vec3 b=base.rgb/max(base.a,0.00392157);
 vec3 blend=brushBlend(b,pigment,u_blend);
 vec3 source=mix(pigment,blend,base.a);
 gl_FragColor=vec4(source*alpha+base.rgb*(1.0-alpha),alpha+base.a*(1.0-alpha));
}
`
